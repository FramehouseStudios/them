import LocalAuthentication
import SwiftUI
import UniformTypeIdentifiers

/// Device-owner access to old copies whose server origin cannot be proven.
/// Nothing in this panel imports a copy into a project or sends it to a server.
struct UnassignedLegacyRecoveryPanel: View {
    var onboarding: OnboardingInputRecoveryActions? = nil
    @Environment(\.scenePhase) private var scenePhase
    @State private var authenticationContext: LAContext?
    @State private var records: [UnassignedLegacyRecoveryDescriptor] = []
    @State private var unlocked = false
    @State private var unlockedAuthIntent: Int?
    @State private var isUnlocking = false
    @State private var accessGeneration: UInt64 = 0
    @State private var message = ""
    @State private var attempt: UnassignedRecoveryExportAttempt?
    @State private var isExporting = false
    @State private var onboardingDescriptor: OnboardingInputDescriptor?
    @State private var earlierOnboardingDescriptor: OnboardingInputDescriptor?
    @State private var confirmingOnboardingDiscard = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(onboarding == nil ? "Device recovery copies" : "Unfinished setup on this device")
                .font(.headline)
            Text(onboarding == nil
                 ? "These copies have no verified delivery destination. Exporting does not remove their local sources. JSON includes recovery metadata; screenplay text alone does not."
                 : "Resume restores only the fields you edited. It does not finish setup, sign in, start writing or send anything. The protected copy remains until you discard it.")
                .font(.subheadline)
            if !unlocked {
                Button { unlock() } label: { protectedActionLabel(isUnlocking ? "Unlocking…" : "Unlock device copies") }
                    .disabled(isUnlocking)
                    .accessibilityHint("Requires device authentication and a signed-out THEM account.")
            } else if onboarding != nil {
                if onboardingDescriptor != nil {
                    Button { prepareOnboardingAction(discard: false) } label: { protectedActionLabel("Resume saved setup") }
                        .accessibilityIdentifier("onboarding.input.resume")
                    Button(role: .destructive) { confirmingOnboardingDiscard = true } label: { protectedActionLabel("Discard saved setup") }
                        .accessibilityIdentifier("onboarding.input.discard")
                } else if earlierOnboardingDescriptor != nil {
                    Text("Earlier verified fields may omit the latest words. This is read-only recovery, not a verified newest setup.")
                        .font(.footnote)
                    Button { prepareEarlierOnboardingCopy() } label: { protectedActionLabel("Copy earlier fields") }
                        .accessibilityIdentifier("onboarding.input.copy-earlier")
                } else {
                    Text("No verified unfinished setup is available. Current fields remain untouched.")
                }
            } else if records.isEmpty {
                Text("No ownerless copies are available here. Account-linked work may require signing back in.")
                    .font(.subheadline)
            } else {
                ForEach(Array(records.enumerated()), id: \.element.recordID) { index, record in
                    HStack {
                        Text("Local copy \(index + 1)")
                        Spacer()
                        Menu("Save copy") {
                            Button("Recovery evidence (JSON)") { prepareExport(record, raw: true) }
                            Button("Screenplay text only") { prepareExport(record, raw: false) }
                        }
                        .accessibilityLabel("Save local copy \(index + 1)")
                    }
                }
            }
            if !message.isEmpty {
                Text(message).font(.footnote)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .redacted(reason: scenePhase == .active ? [] : .placeholder)
        .allowsHitTesting(scenePhase == .active)
        .accessibilityHidden(scenePhase != .active)
        .onReceive(NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)) { _ in
            let wasAccessingCopies = isUnlocking || unlocked || isExporting
            lock()
            if wasAccessingCopies {
                message = "Account state changed. Unlock the device copies again."
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background || (phase == .inactive && !isUnlocking && !isExporting) {
                lock()
            }
            if phase == .active, unlocked,
               (!deviceOnlyAccessAllowed() ||
                unlockedAuthIntent != BackendAuthClient.currentAuthSessionIntentGeneration()) {
                lock()
            }
        }
        .onDisappear { lock() }
        .confirmationDialog("Discard the saved unfinished setup?", isPresented: $confirmingOnboardingDiscard) {
            Button("Discard saved setup", role: .destructive) { prepareOnboardingAction(discard: true) }
        } message: {
            Text("This removes only the selected protected setup copy. Current visible fields are kept.")
        }
        .background {
            if let attempt {
                UnassignedRecoveryExporterHost(attempt: attempt,
                    isPresented: Binding(get: { self.attempt?.id == attempt.id && isExporting },
                                         set: { if self.attempt?.id == attempt.id { isExporting = $0 } }),
                    onCompletion: { completeExport($0, attempt: attempt) },
                    onCancellation: { cancelExport(attempt: attempt) })
                    .id(attempt.id)
            }
        }
    }

    private func protectedActionLabel(_ title: String) -> some View {
        Text(title).fixedSize(horizontal: false, vertical: true)
            .frame(minWidth: 44, maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
    }

    private func deviceOnlyAccessAllowed() -> Bool {
        let session = BackendAuthClient.currentAuthSessionState()
        return !BackendAuthClient.authSessionTokenDeletionIsPending() &&
            session.user == nil && !session.accessTokenPresent && !session.refreshTokenPresent
    }

    private func unlock() {
        guard scenePhase == .active else { return }
        guard deviceOnlyAccessAllowed() else {
            message = "Sign out of THEM before opening device-only copies. Your saved work remains on this device."
            return
        }
        if let onboarding, !onboarding.canApply() {
            message = "The fields changed or are still saving. Close recovery and try again."
            return
        }
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            message = "Device authentication is unavailable. Your older copies remain on this device."
            return
        }
        isUnlocking = true
        authenticationContext = context
        let generation = accessGeneration
        let authIntent = BackendAuthClient.currentAuthSessionIntentGeneration()
        Task { @MainActor in
            defer {
                if generation == accessGeneration {
                    isUnlocking = false
                    authenticationContext = nil
                }
            }
            do {
                let authenticated = try await context.evaluatePolicy(.deviceOwnerAuthentication,
                    localizedReason: onboarding == nil ? "Unlock older screenplay copies stored on this device." : "Unlock unfinished setup stored on this device.")
                guard generation == accessGeneration else { return }
                guard authenticated, deviceOnlyAccessAllowed(),
                      authIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else {
                    message = "Device copies remain locked."
                    return
                }
                guard scenePhase == .active else {
                    message = "Return to THEM and try unlocking the copies again."
                    return
                }
                if let onboarding {
                    let custody = onboarding.custody
                    let inventory = await Task.detached(priority: .utility) { custody.inventory() }.value
                    guard generation == accessGeneration, scenePhase == .active, deviceOnlyAccessAllowed(),
                          authIntent == BackendAuthClient.currentAuthSessionIntentGeneration(), onboarding.canApply() else { lock(); return }
                    switch inventory {
                    case .missing: onboardingDescriptor = nil; earlierOnboardingDescriptor = nil; unlocked = true
                    case .present(let descriptor): onboardingDescriptor = descriptor; earlierOnboardingDescriptor = nil; unlocked = true
                    case .unconfirmed:
                        let earlier = await Task.detached(priority: .utility) { custody.earlierCopyDescriptor() }.value
                        guard generation == accessGeneration, scenePhase == .active, deviceOnlyAccessAllowed(),
                              authIntent == BackendAuthClient.currentAuthSessionIntentGeneration(), onboarding.canApply() else { lock(); return }
                        onboardingDescriptor = nil; earlierOnboardingDescriptor = earlier
                        unlocked = earlier != nil
                        message = "Latest setup storage could not be confirmed. Both original files remain untouched."
                    }
                    if unlocked { unlockedAuthIntent = authIntent }
                    return
                }
                let vault = UnassignedLegacyRecoveryVault()
                let adapter = UnassignedLegacyRecoveryDefaultsAdapter(vault: vault)
                let source = adapter.inventory(unscopedOnly: true)
                var unconfirmed = source.unconfirmedEvidenceCount
                for record in source.records where UnassignedDeviceRecoveryPolicy.allows(record.source) {
                    switch adapter.preserve(record) {
                    case .verified: break
                    case .sourceChanged, .unconfirmed: unconfirmed += 1
                    }
                }
                let held = await ScreenplayDraftSaveOutbox.shared.captureUnassignedRecoverySources()
                guard generation == accessGeneration else { return }
                guard deviceOnlyAccessAllowed(),
                      authIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else { lock(); return }
                guard scenePhase == .active else {
                    message = "Return to THEM and try unlocking the copies again."
                    return
                }
                switch held {
                case .missing: break
                case .unconfirmed: unconfirmed += 1
                case .available(let sources, let heldUnconfirmed):
                    unconfirmed += heldUnconfirmed
                    for source in sources where UnassignedDeviceRecoveryPolicy.allows(source) {
                        switch vault.preserve(source) {
                        case .verified, .alreadyVerified: break
                        case .unconfirmed: unconfirmed += 1
                        }
                    }
                }
                guard generation == accessGeneration, scenePhase == .active, deviceOnlyAccessAllowed(),
                      authIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else { lock(); return }
                switch vault.inventory() {
                case .missing:
                    records = []
                    message = unconfirmed > 0
                        ? "Some older recovery data could not be read and remains on this device." : ""
                    unlockedAuthIntent = authIntent
                    unlocked = true
                case .available(let inventory):
                    records = inventory.records.filter(UnassignedDeviceRecoveryPolicy.allows)
                    message = inventory.unconfirmedEvidenceCount > 0 || unconfirmed > 0
                        ? "Some older recovery data could not be read and remains on this device." : ""
                    unlockedAuthIntent = authIntent
                    unlocked = true
                case .unconfirmed:
                    message = "Older recovery data could not be read and remains on this device."
                }
            } catch {
                guard generation == accessGeneration else { return }
                message = "Device copies remain locked."
            }
        }
    }

    private func prepareExport(_ descriptor: UnassignedLegacyRecoveryDescriptor, raw: Bool) {
        guard UnassignedDeviceRecoveryPolicy.allows(descriptor) else { lock(); return }
        authenticateProtectedAction(reason: "Authenticate to export this older screenplay copy.") {
            prepareAuthenticatedExport(descriptor, raw: raw)
        }
    }

    private func authenticateProtectedAction(reason: String, perform: @escaping () -> Void) {
        guard unlocked, !isUnlocking, attempt == nil, scenePhase == .active,
              deviceOnlyAccessAllowed(),
              unlockedAuthIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else { lock(); return }
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            message = "Device authentication is unavailable. Your older copies remain on this device."
            return
        }
        let generation = accessGeneration
        let authIntent = BackendAuthClient.currentAuthSessionIntentGeneration()
        authenticationContext = context
        isUnlocking = true
        Task { @MainActor in
            defer {
                if generation == accessGeneration {
                    isUnlocking = false
                    authenticationContext = nil
                }
            }
            do {
                let authenticated = try await context.evaluatePolicy(.deviceOwnerAuthentication,
                    localizedReason: reason)
                guard generation == accessGeneration else { return }
                guard unlocked, authenticated, deviceOnlyAccessAllowed(),
                      authIntent == unlockedAuthIntent,
                      authIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else { lock(); return }
                guard scenePhase == .active else {
                    lock()
                    message = "Return to THEM and unlock the copies again."
                    return
                }
                perform()
            } catch {
                guard generation == accessGeneration else { return }
                if scenePhase != .active { lock() }
                message = "The copy remains on this device. Authentication was not completed."
            }
        }
    }

    private func prepareEarlierOnboardingCopy() {
        guard let onboarding, let descriptor = earlierOnboardingDescriptor, onboarding.canApply() else { lock(); return }
        authenticateProtectedAction(reason: "Authenticate to copy earlier setup fields that may omit your latest words.") {
            let generation = accessGeneration, intent = unlockedAuthIntent, custody = onboarding.custody
            Task { @MainActor in
                guard generation == accessGeneration, scenePhase == .active, deviceOnlyAccessAllowed(),
                      intent == BackendAuthClient.currentAuthSessionIntentGeneration(), onboarding.canApply() else { lock(); return }
                let checkpoint = await Task.detached(priority: .utility) { custody.revealEarlierCopy(expected: descriptor) }.value
                guard generation == accessGeneration, scenePhase == .active, deviceOnlyAccessAllowed(),
                      intent == BackendAuthClient.currentAuthSessionIntentGeneration(), onboarding.canApply() else { lock(); return }
                guard let checkpoint, onboarding.copyEarlier(checkpoint) else {
                    message = "The earlier copy or recovery state changed. Close recovery and unlock again. Both originals remain untouched."
                    return
                }
            }
        }
    }

    private func prepareOnboardingAction(discard: Bool) {
        guard let onboarding, let descriptor = onboardingDescriptor, onboarding.canApply() else { lock(); return }
        authenticateProtectedAction(reason: discard ? "Authenticate to discard this unfinished setup." : "Authenticate to resume this unfinished setup.") {
            let generation = accessGeneration, intent = unlockedAuthIntent, custody = onboarding.custody
            Task { @MainActor in
                guard onboarding.canApply() else { lock(); return }
                if discard {
                    let discarded = await Task.detached(priority: .utility) { custody.discard(expected: descriptor) }.value
                    guard generation == accessGeneration, scenePhase == .active, deviceOnlyAccessAllowed(),
                          intent == BackendAuthClient.currentAuthSessionIntentGeneration(), onboarding.canApply() else { lock(); return }
                    if discarded { onboarding.didDiscard() }
                    else { message = "The saved setup changed or removal could not be confirmed. Current fields remain untouched." }
                } else {
                    let checkpoint = await Task.detached(priority: .utility) { custody.reveal(expected: descriptor) }.value
                    guard generation == accessGeneration, scenePhase == .active, deviceOnlyAccessAllowed(),
                          intent == BackendAuthClient.currentAuthSessionIntentGeneration(), onboarding.canApply() else { lock(); return }
                    guard let checkpoint, onboarding.resume(checkpoint) else {
                        message = "The setup or current fields changed. Close recovery and try again."
                        return
                    }
                }
            }
        }
    }

    private func prepareAuthenticatedExport(_ descriptor: UnassignedLegacyRecoveryDescriptor, raw: Bool) {
        let vault = UnassignedLegacyRecoveryVault()
        guard UnassignedDeviceRecoveryPolicy.allows(descriptor),
              case let .present(record) = vault.reveal(recordID: descriptor.recordID),
              record.descriptor == descriptor,
              UnassignedDeviceRecoveryPolicy.allows(record.descriptor) else {
            message = "This copy changed or could not be read. It remains on this device."
            return
        }
        let document: UnassignedRecoveryExportDocument
        let queuedDraft: Data? = {
            guard record.descriptor.encoding == .draftSaveJSON,
                  let entry = try? JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self, from: record.sourcePayload) else { return nil }
            return Data(entry.draft.utf8)
        }()
        if raw {
            guard case let .available(artifact) = vault.export(recordID: descriptor.recordID) else {
                message = "This copy could not be prepared for export. It remains on this device."
                return
            }
            document = .init(data: artifact.data, filename: artifact.filename, contentType: .json)
        } else {
            guard let draft = record.decodedFields?.draftUTF8 ?? queuedDraft else {
                message = "Screenplay text could not be read. Save the recovery evidence instead; the original remains on this device."
                return
            }
            document = .init(data: draft, filename: "Recovered Screenplay.fountain", contentType: .plainText)
        }
        attempt = .init(id: UUID(), generation: accessGeneration, document: document)
        isExporting = true
    }

    private func completeExport(_ result: Result<URL, Error>, attempt completed: UnassignedRecoveryExportAttempt) {
        guard attempt?.id == completed.id else { return }
        guard completed.generation == accessGeneration, unlocked, scenePhase == .active,
              deviceOnlyAccessAllowed(),
              unlockedAuthIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else { lock(); return }
        attempt = nil
        isExporting = false
        switch result {
        case .success: message = "Export saved. THEM did not remove the source or protected copy."
        case .failure: message = "The copy was not saved. The original remains on this device."
        }
    }

    private func cancelExport(attempt cancelled: UnassignedRecoveryExportAttempt) {
        guard attempt?.id == cancelled.id else { return }
        attempt = nil
        isExporting = false
        guard cancelled.generation == accessGeneration, unlocked, scenePhase == .active,
              deviceOnlyAccessAllowed(),
              unlockedAuthIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else { lock(); return }
        message = "Export cancelled. The original remains on this device."
    }

    private func lock() {
        accessGeneration &+= 1
        authenticationContext?.invalidate()
        authenticationContext = nil
        isUnlocking = false
        unlocked = false
        unlockedAuthIntent = nil
        records = []
        onboardingDescriptor = nil
        earlierOnboardingDescriptor = nil
        confirmingOnboardingDiscard = false
        attempt = nil
        isExporting = false
        message = ""
    }
}

private struct UnassignedRecoveryExportAttempt {
    let id: UUID
    let generation: UInt64
    let document: UnassignedRecoveryExportDocument
}

private struct UnassignedRecoveryExporterHost: View {
    let attempt: UnassignedRecoveryExportAttempt
    @Binding var isPresented: Bool
    let onCompletion: (Result<URL, Error>) -> Void
    let onCancellation: () -> Void

    var body: some View {
        Color.clear.frame(width: 0, height: 0)
            .fileExporter(isPresented: $isPresented, document: attempt.document,
                          contentTypes: [attempt.document.contentType],
                          defaultFilename: attempt.document.filename,
                          onCompletion: onCompletion,
                          onCancellation: onCancellation)
    }
}

private struct UnassignedRecoveryExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.plainText, .json, .data] }
    let data: Data
    let filename: String
    let contentType: UTType

    init(data: Data, filename: String, contentType: UTType) {
        self.data = data
        self.filename = filename
        self.contentType = contentType
    }

    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
        filename = configuration.file.preferredFilename ?? "Recovered Copy"
        contentType = configuration.contentType
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}
