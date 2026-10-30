import LocalAuthentication
import SwiftUI
import UniformTypeIdentifiers

/// Device-owner access to old copies whose server origin cannot be proven.
/// Nothing in this panel imports a copy into a project or sends it to a server.
struct UnassignedLegacyRecoveryPanel: View {
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

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Device recovery copies")
                .font(.headline)
            Text("These copies have no verified delivery destination. Exporting does not remove their local sources. JSON includes recovery metadata; screenplay text alone does not.")
                .font(.subheadline)
            if !unlocked {
                Button(isUnlocking ? "Unlocking…" : "Unlock device copies") { unlock() }
                    .disabled(isUnlocking)
                    .accessibilityHint("Requires device authentication and a signed-out THEM account.")
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
                    localizedReason: "Unlock older screenplay copies stored on this device.")
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
                    localizedReason: "Authenticate to export this older screenplay copy.")
                guard generation == accessGeneration else { return }
                guard unlocked, authenticated, deviceOnlyAccessAllowed(),
                      authIntent == unlockedAuthIntent,
                      authIntent == BackendAuthClient.currentAuthSessionIntentGeneration() else { lock(); return }
                guard scenePhase == .active else {
                    lock()
                    message = "Return to THEM and unlock the copies again."
                    return
                }
                prepareAuthenticatedExport(descriptor, raw: raw)
            } catch {
                guard generation == accessGeneration else { return }
                if scenePhase != .active { lock() }
                message = "The copy remains on this device. Authentication was not completed."
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
