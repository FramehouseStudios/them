import SwiftUI

nonisolated struct OnboardingInputAccess: Equatable, Sendable {
    let active: Bool
    let credentialFree: Bool
    let authIntent: Int
    var permitsAccess: Bool { active && credentialFree }
}

@MainActor
final class OnboardingInputRecoveryModel: ObservableObject {
    enum Status: Equatable {
        case checking, notSaved, saving, saved, existing, tooLarge, unconfirmed, accountRestricted
        var message: String {
            switch self {
            case .checking: "Checking protected setup storage…"
            case .notSaved: "Current fields are not saved. Editing starts a protected local copy."
            case .saving: "Saving unfinished setup on this device…"
            case .saved: "Unfinished setup saved on this device."
            case .existing: "A protected unfinished setup is on this device. Resume or discard it before saving new input."
            case .tooLarge: "This input is too large for protected setup storage. Shorten it or copy it before closing."
            case .unconfirmed: "Setup storage could not be confirmed. Keep this screen open or copy your text before closing, then retry."
            case .accountRestricted: "These fields are only in this screen. Protected device-only setup capture requires signing out completely."
            }
        }
    }
    @Published private(set) var status: Status = .checking
    @Published private(set) var hasCapture = false
    private(set) var editGeneration: UInt64 = 0
    private(set) var fields = OnboardingInputFields()
    let custody: OnboardingInputCustody
    private var access: OnboardingInputAccess?
    private var epoch: UInt64 = 0
    private var inspected = false
    private var mayWrite = false
    private var lease: OnboardingInputDescriptor?
    private var writing = false
    private var failed: Write?
    private var verifiedFields: OnboardingInputFields?
    private struct Write: Sendable {
        let fields: OnboardingInputFields
        let expected: OnboardingInputDescriptor?
        let revisionID: String
        let epoch: UInt64
    }

    init(custody: OnboardingInputCustody = UnassignedLegacyRecoveryVault.onboardingInputs()) { self.custody = custody }

    func updateAccess(_ next: OnboardingInputAccess) {
        if let previous = access, previous.authIntent != next.authIntent || previous.credentialFree != next.credentialFree {
            epoch &+= 1
            lease = nil
            mayWrite = false
            failed = nil
            verifiedFields = nil
            fields = .init()
            editGeneration &+= 1
            inspected = false
            status = next.credentialFree ? .existing : .accountRestricted
        }
        access = next
        if !next.credentialFree { status = .accountRestricted }
    }

    func inspect(_ next: OnboardingInputAccess) async {
        updateAccess(next)
        guard !inspected else { schedule(); return }
        let expectedEpoch = epoch, custody = custody
        let result = await Task.detached(priority: .utility) { custody.inventory() }.value
        guard expectedEpoch == epoch else { return }
        inspected = true
        switch result {
        case .missing:
            hasCapture = false; mayWrite = true
            status = next.credentialFree ? .notSaved : .accountRestricted
            schedule()
        case .present:
            hasCapture = true; mayWrite = false
            status = next.credentialFree ? .existing : .accountRestricted
        case .unconfirmed:
            hasCapture = true; mayWrite = false
            status = .unconfirmed
        }
    }

    func editName(_ value: String, access: OnboardingInputAccess) {
        updateAccess(access)
        fields.nameUTF8 = Data(value.utf8); fields.nameWasEdited = true
        edited()
    }

    func editPremise(_ value: String, access: OnboardingInputAccess) {
        updateAccess(access)
        fields.premiseUTF8 = Data(value.utf8); fields.premiseWasEdited = true
        edited()
    }

    private func edited() {
        editGeneration &+= 1
        guard access?.credentialFree == true else { status = .accountRestricted; return }
        status = mayWrite ? .saving : (failed == nil ? .existing : .unconfirmed)
        schedule()
    }

    private func schedule() {
        guard !writing, inspected, mayWrite, fields.hasEdits, fields != verifiedFields,
              access?.permitsAccess == true else { return }
        writing = true
        Task { @MainActor in
            defer { writing = false }
            while mayWrite, access?.permitsAccess == true, fields.hasEdits {
                let work = Write(fields: fields, expected: lease, revisionID: UUID().uuidString.lowercased(), epoch: epoch)
                status = .saving
                let custody = custody
                let result = await Task.detached(priority: .utility) {
                    custody.checkpoint(work.fields, expected: work.expected, revisionID: work.revisionID)
                }.value
                guard accept(result, work: work) else { return }
                if fields == work.fields { return }
            }
        }
    }

    private func accept(_ result: OnboardingInputWriteResult, work: Write) -> Bool {
        guard work.epoch == epoch, access?.credentialFree == true else {
            hasCapture = true; mayWrite = false
            status = access?.credentialFree == true ? .existing : .accountRestricted
            return false
        }
        switch result {
        case .verified(let descriptor):
            lease = descriptor; verifiedFields = work.fields; mayWrite = true; hasCapture = true; failed = nil
            status = fields == work.fields ? .saved : .saving
            return true
        case .occupied:
            hasCapture = true; mayWrite = false; failed = nil; status = .existing
        case .tooLarge:
            // The size check runs before I/O. A later, smaller edit may use the same lease.
            mayWrite = true; failed = nil; status = .tooLarge
        case .unconfirmed:
            hasCapture = true; mayWrite = false; failed = work; status = .unconfirmed
        }
        return false
    }

    func retry(_ next: OnboardingInputAccess) async {
        updateAccess(next)
        guard !writing, next.permitsAccess else { return }
        if let work = failed, work.epoch == epoch {
            writing = true; status = .saving
            let custody = custody
            let result = await Task.detached(priority: .utility) {
                custody.checkpoint(work.fields, expected: work.expected, revisionID: work.revisionID)
            }.value
            let confirmed = accept(result, work: work)
            writing = false
            if confirmed && fields != work.fields { schedule() }
        } else {
            inspected = false
            await inspect(next)
        }
    }

    func canRecover(editGeneration: UInt64, access expected: OnboardingInputAccess) -> Bool {
        !writing && self.editGeneration == editGeneration && access == expected && expected.permitsAccess
    }

    @discardableResult
    func resumed(_ checkpoint: OnboardingInputCheckpoint, expectedEdits: UInt64, expectedAccess: OnboardingInputAccess) -> Bool {
        guard canRecover(editGeneration: expectedEdits, access: expectedAccess) else { return false }
        fields = checkpoint.fields; verifiedFields = checkpoint.fields; lease = checkpoint.descriptor; mayWrite = true
        hasCapture = true; failed = nil; inspected = true; editGeneration &+= 1; status = .saved
        return true
    }

    @discardableResult
    func discarded(expectedEdits: UInt64, expectedAccess: OnboardingInputAccess) -> Bool {
        guard canRecover(editGeneration: expectedEdits, access: expectedAccess) else { return false }
        // Discard does not clear visible fields or immediately recapture them.
        epoch &+= 1; fields = .init(); verifiedFields = nil; lease = nil; failed = nil
        hasCapture = false; mayWrite = true; inspected = true; editGeneration &+= 1; status = .notSaved
        return true
    }
}

struct OnboardingInputRecoveryActions {
    let custody: OnboardingInputCustody
    let canApply: () -> Bool
    let resume: (OnboardingInputCheckpoint) -> Bool
    let didDiscard: () -> Void
}

/// Owns custody mechanics, not text or generation. The existing Root bindings
/// remain the field owners, and only their user-edit setters enqueue captures.
struct OnboardingInputRecoveryScope<Content: View>: View {
    @Environment(\.scenePhase) private var scenePhase
    @Binding private var name: String
    @Binding private var premise: String
    @StateObject private var model: OnboardingInputRecoveryModel
    @State private var challenge: Challenge?
    @State private var showingRecovery = false
    private let content: (Binding<String>, Binding<String>) -> Content
    private struct Challenge {
        let edits: UInt64
        let access: OnboardingInputAccess
        let name: Data
        let premise: Data
    }

    init(name: Binding<String>, premise: Binding<String>,
         @ViewBuilder content: @escaping (Binding<String>, Binding<String>) -> Content) {
        _name = name; _premise = premise; self.content = content
        _model = StateObject(wrappedValue: OnboardingInputRecoveryModel(custody: Self.processCustody()))
    }

    var body: some View {
        VStack(spacing: 10) {
            content(Binding(get: { name }, set: { name = $0; model.editName($0, access: currentAccess) }),
                    Binding(get: { premise }, set: { premise = $0; model.editPremise($0, access: currentAccess) }))
            Text(custodyMessage)
                .font(.footnote).foregroundStyle(.secondary)
                .accessibilityIdentifier("onboarding.input.custody.status")
            HStack {
                if model.hasCapture {
                    Button("Recover unfinished setup") {
                        challenge = .init(edits: model.editGeneration, access: currentAccess,
                                          name: Data(name.utf8), premise: Data(premise.utf8))
                        showingRecovery = true
                    }
                    .disabled(model.status == .saving || model.status == .checking)
                    .accessibilityIdentifier("onboarding.input.recover")
                }
                if model.status == .unconfirmed {
                    Button("Retry saving") { Task { await model.retry(currentAccess) } }
                }
            }.font(.footnote)
        }
        .task { await model.inspect(currentAccess) }
        .onChange(of: scenePhase) { _, _ in
            model.updateAccess(currentAccess)
            if scenePhase == .active { Task { await model.inspect(currentAccess) } }
        }
        .onReceive(NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)) { _ in
            model.updateAccess(currentAccess)
            challenge = nil; showingRecovery = false
            Task { await model.inspect(currentAccess) }
        }
        .sheet(isPresented: $showingRecovery) {
            NavigationStack {
                ScrollView {
                    UnassignedLegacyRecoveryPanel(onboarding: .init(custody: model.custody,
                        canApply: challengeIsCurrent,
                        resume: { checkpoint in
                            guard let challenge, challengeIsCurrent(),
                                  let restoredName = String(data: checkpoint.fields.nameUTF8, encoding: .utf8),
                                  let restoredPremise = String(data: checkpoint.fields.premiseUTF8, encoding: .utf8) else { return false }
                            guard model.resumed(checkpoint, expectedEdits: challenge.edits, expectedAccess: challenge.access) else { return false }
                            if checkpoint.fields.nameWasEdited { name = restoredName }
                            if checkpoint.fields.premiseWasEdited { premise = restoredPremise }
                            showingRecovery = false; self.challenge = nil
                            return true
                        }, didDiscard: {
                            guard let challenge, challengeIsCurrent(),
                                  model.discarded(expectedEdits: challenge.edits, expectedAccess: challenge.access) else { return }
                            showingRecovery = false; self.challenge = nil
                        }))
                        .padding(24)
                }
                .navigationTitle("Unfinished setup")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { showingRecovery = false } } }
            }
        }
    }

    private var custodyMessage: String {
        if model.status == .saved,
           (model.fields.nameWasEdited && Data(name.utf8) != model.fields.nameUTF8
            || model.fields.premiseWasEdited && Data(premise.utf8) != model.fields.premiseUTF8) {
            return "The previous input is protected. Current changed fields are not saved."
        }
        return model.status.message
    }

    private func challengeIsCurrent() -> Bool {
        guard let challenge else { return false }
        return model.canRecover(editGeneration: challenge.edits, access: challenge.access)
            && challenge.access == currentAccess && Data(name.utf8) == challenge.name && Data(premise.utf8) == challenge.premise
    }

    private var currentAccess: OnboardingInputAccess {
        let session = BackendAuthClient.currentAuthSessionState()
        return .init(active: scenePhase == .active,
                     credentialFree: !BackendAuthClient.authSessionTokenDeletionIsPending()
                        && session.user == nil && !session.accessTokenPresent && !session.refreshTokenPresent,
                     authIntent: BackendAuthClient.currentAuthSessionIntentGeneration())
    }

    private static func processCustody() -> OnboardingInputCustody {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if IOThemRuntime.isRunningUITests, arguments.contains("--ui-testing"),
           let index = arguments.firstIndex(of: "--ui-onboarding-input-token"), index + 1 < arguments.count,
           let token = UUID(uuidString: arguments[index + 1]),
           let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
            return UnassignedLegacyRecoveryVault.onboardingInputs(rootDirectory: support
                .appendingPathComponent("io.them/UITestOnboardingInput/\(token.uuidString)/v1", isDirectory: true))
        }
        #endif
        return UnassignedLegacyRecoveryVault.onboardingInputs()
    }
}
