import Foundation
import Combine

nonisolated extension Notification.Name {
    /// Root posts a scoped, request-targeted stop synchronously before teardown.
    static let themStudioPromptSubmissionStopped = Notification.Name("io.them.them.studioPromptSubmissionStopped")
}

nonisolated struct StudioPromptSubmissionStop {
    let scope: OfflineTalkRecoveryScope
    let requestID: String
    let dispatchStartedAt: Date
}

/// Ephemeral ownership for the existing Screen submission state. No new store
/// or product state: a changed document revokes publication, not A's cleanup.
@MainActor
struct StudioPromptSubmissionLease {
    let document: ScreenplayLiveTalkDocument
    let backendURL: URL
    let requestID: String
    let startedAt: Date
    let pendingReplacementID: UUID?
    let submittedReplacementID: UUID?
    nonisolated private static let typedPrefix = "typed:"

    init(document: ScreenplayLiveTalkDocument, backendURL: URL, state: StudioPerceivedSpeedState,
         pendingReplacementID: UUID?, submittedReplacementID: UUID?) {
        self.document = document; self.backendURL = backendURL
        requestID = state.id; startedAt = state.startedAt
        self.pendingReplacementID = pendingReplacementID; self.submittedReplacementID = submittedReplacementID
    }

    nonisolated static func requestID(proposed: String?) -> String {
        let clean = proposed?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return clean.isEmpty ? "studio-\(UUID().uuidString.lowercased())" : clean
    }

    nonisolated static func dispatchFingerprint(requestID: String) -> String { typedPrefix + requestID }

    nonisolated static func isTypedDispatch(_ fingerprint: String) -> Bool {
        fingerprint.hasPrefix(typedPrefix) && !fingerprint.dropFirst(typedPrefix.count).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    nonisolated static func maySupersedeTyped(dispatchFingerprint: String, newRequestID: String) -> Bool {
        let newID = newRequestID.trimmingCharacters(in: .whitespacesAndNewlines)
        return isTypedDispatch(dispatchFingerprint) && !newID.isEmpty
            && String(dispatchFingerprint.dropFirst(typedPrefix.count)) != newID
    }

    static func postStop(dispatchFingerprint: String, dispatchStartedAt: Date, center: NotificationCenter = .default) {
        guard let stop = stopSignal(dispatchFingerprint: dispatchFingerprint, dispatchStartedAt: dispatchStartedAt, scope: .current()) else { return }
        center.post(name: .themStudioPromptSubmissionStopped, object: stop)
    }

    nonisolated static func stopSignal(dispatchFingerprint: String, dispatchStartedAt: Date,
        scope: OfflineTalkRecoveryScope) -> StudioPromptSubmissionStop? {
        guard isTypedDispatch(dispatchFingerprint) else { return nil }
        let requestID = String(dispatchFingerprint.dropFirst(typedPrefix.count))
        guard !requestID.isEmpty else { return nil }
        return StudioPromptSubmissionStop(scope: scope, requestID: requestID, dispatchStartedAt: dispatchStartedAt)
    }

    static func shouldRevoke(state: StudioPerceivedSpeedState, notification: Notification,
        currentScope: OfflineTalkRecoveryScope, isCurrentEditor: Bool) -> Bool {
        guard let stop = notification.object as? StudioPromptSubmissionStop else { return false }
        return isCurrentEditor && state.isActive && state.id == stop.requestID
            && state.startedAt <= stop.dispatchStartedAt && currentScope == stop.scope
    }

    nonisolated static func matchesDispatch(requestID: String, startedAt: Date,
        currentRequestID: String, currentStartedAt: Date) -> Bool {
        !requestID.isEmpty && requestID == currentRequestID && startedAt == currentStartedAt
    }

    nonisolated static func permitsPublication(dispatchOwned: Bool, documentIsCurrent: Bool,
        backendURL: URL, currentBackendURL: URL, isActive: Bool, isCancelled: Bool) -> Bool {
        dispatchOwned && documentIsCurrent && isActive && !isCancelled
            && OfflineTalkRecoveryScope.sameBackend(backendURL, currentBackendURL)
    }

    func ownsDispatch(state: StudioPerceivedSpeedState) -> Bool {
        Self.matchesDispatch(requestID: requestID, startedAt: startedAt,
            currentRequestID: state.id, currentStartedAt: state.startedAt)
    }

    func finishedState(state: StudioPerceivedSpeedState) -> StudioPerceivedSpeedState? {
        ownsDispatch(state: state) && state.isActive ? state.completing() : nil
    }

    func mayPublish(state: StudioPerceivedSpeedState, documentIsCurrent: Bool, backendURL: URL,
        selectedProjectID: String, originProjectID: String, isCurrentEditor: Bool, isCancelled: Bool) -> Bool {
        let selectedOrigin = selectedProjectID == originProjectID || (document.projectID.isEmpty && selectedProjectID.isEmpty)
        return Self.permitsPublication(dispatchOwned: ownsDispatch(state: state),
            documentIsCurrent: documentIsCurrent && isCurrentEditor && selectedOrigin,
            backendURL: self.backendURL, currentBackendURL: backendURL, isActive: state.isActive, isCancelled: isCancelled)
    }

    func ownsReplacement(pendingID: UUID?, submittedID: UUID?) -> Bool {
        pendingReplacementID == pendingID && submittedReplacementID == submittedID
    }

    nonisolated static func mayClearSeed(original: String, current: String) -> Bool {
        original.utf8.elementsEqual(current.utf8)
    }

    func stillOwnsScope(documentID: String?, owner: ScreenplayStudioAuthContext,
        backendURL: URL, isCurrentEditor: Bool) -> Bool {
        isCurrentEditor && document.documentID == documentID
            && ScreenplayStudioAuthContextPolicy.matches(expected: document.owner, current: owner)
            && OfflineTalkRecoveryScope.sameBackend(self.backendURL, backendURL)
    }

    static func revocationEvents(bridge: ScreenplayLiveDraftBridge) -> AnyPublisher<Void, Never> {
        Publishers.Merge3(bridge.$draftOrigin.map(\.documentID).removeDuplicates().map { _ in () },
            NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged).map { _ in () },
            NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification).map { _ in () }).eraseToAnyPublisher()
    }

    /// Scoped to one existing submission Task, never a background monitor.
    /// A new document can release A's busy flag while A's accepted reply drains.
    static func watchRevocation(changes: AnyPublisher<Void, Never>, isCurrent: () -> Bool,
        stillOwned: () -> Bool, onRevoked: () -> Void) async {
        guard !Task.isCancelled else { return }
        for await _ in changes.prepend(()).values {
            guard !Task.isCancelled, isCurrent() else { return }
            if !stillOwned() { onRevoked(); return }
        }
    }

    static func waitForCommittedWrite(submittedAt: Date, timeoutMs: UInt64 = 8_000,
        isCurrent: () -> Bool, currentWrite: () -> ScreenplayCommittedWrite?) async -> ScreenplayCommittedWrite? {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutMs) / 1_000)
        while Date() < deadline {
            guard isCurrent(), !Task.isCancelled else { return nil }
            if let write = currentWrite(), !write.insertedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               write.committedAt >= submittedAt.addingTimeInterval(-0.5) { return write }
            do { try await Task.sleep(nanoseconds: 100_000_000) } catch { return nil }
        }
        return nil
    }

    /// Existing completion lookup moved out of the god view. Caller must own
    /// the original document before reading its current owner-scoped fallback.
    static func voicePinReply(bridge: ScreenplayLiveDraftBridge, submittedAt: Date, matchingPrompts: [String]) -> String? {
        let defaults = UserDefaults.standard
        let storedSeconds = defaults.double(forKey: ScreenplayLiveDraftBridge.latestVoicePinReplyUpdatedAtStorageKey)
        let storedAt = storedSeconds > 0 ? Date(timeIntervalSince1970: storedSeconds) : Date.distantPast
        guard max(bridge.latestVoicePinReplyUpdatedAt, storedAt) >= submittedAt.addingTimeInterval(-5.0) else { return nil }
        let bridgePrompt = bridge.latestVoicePinPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        let latestPrompt = bridgePrompt.isEmpty
            ? defaults.string(forKey: ScreenplayLiveDraftBridge.latestVoicePinPromptStorageKey)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            : bridgePrompt
        guard latestPrompt.isEmpty || matchingPrompts.contains(latestPrompt) else { return nil }
        let bridgeReply = bridge.latestVoicePinReply.trimmingCharacters(in: .whitespacesAndNewlines)
        let latest = bridgeReply.isEmpty
            ? defaults.string(forKey: ScreenplayLiveDraftBridge.latestVoicePinReplyStorageKey)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            : bridgeReply
        return latest.isEmpty ? nil : latest
    }

    #if DEBUG || os(macOS)
    static func debugMemoryDomain(for prompt: String, routesToPage: Bool) -> StudioMemoryDomain {
        guard !routesToPage else { return .project }
        let normalized = " \(prompt.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) "
        let companionCues = [
            " i feel ",
            " i am ",
            " i'm ",
            " im ",
            " spiraling ",
            " reassure ",
            " talk me through ",
            " stuck ",
            " need you "
        ]
        let projectCues = [
            " screenplay ",
            " script ",
            " scene ",
            " midpoint ",
            " story ",
            " character ",
            " beat ",
            " act ",
            " calls him ",
            " parking lot "
        ]
        let hasCompanion = companionCues.contains(where: normalized.contains)
        let hasProject = projectCues.contains(where: normalized.contains)
        if hasCompanion && hasProject { return .mixed }
        if hasCompanion { return .companion }
        return .project
    }
    #endif
}
