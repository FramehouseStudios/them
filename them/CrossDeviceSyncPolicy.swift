import Foundation

nonisolated struct ScreenplayStudioAuthContext: Equatable, Sendable {
    let userID: String
    let sessionIntentGeneration: Int
}

nonisolated enum ScreenplayStudioAuthContextPolicy {
    static func matches(
        expected: ScreenplayStudioAuthContext,
        current: ScreenplayStudioAuthContext
    ) -> Bool {
        expected.userID.trimmingCharacters(in: .whitespacesAndNewlines) ==
            current.userID.trimmingCharacters(in: .whitespacesAndNewlines) &&
            expected.sessionIntentGeneration == current.sessionIntentGeneration
    }
}

nonisolated enum ScreenplayOwnerScopedStoragePolicy {
    static let anonymousOwnerID = "anonymous"

    static func normalizedOwnerID(_ ownerUserID: String) -> String {
        let normalized = ownerUserID.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? anonymousOwnerID : normalized
    }

    static func storageKey(baseKey: String, ownerUserID: String) -> String {
        let owner = normalizedOwnerID(ownerUserID)
        let encoded = Data(owner.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "\(baseKey).owner.\(encoded)"
    }
}

nonisolated enum ScreenplayLegacyWorkspaceMigrationPolicy {
    // Legacy workspace values have no trustworthy owner metadata. Keep them in
    // the signed-out workspace so the first authenticated account after an
    // upgrade cannot silently inherit another person's screenplay.
    static let quarantineOwnerUserID = ""
}

nonisolated enum ScreenplayStudioAccountTransitionPolicy {
    static func requiresStudioStateReset(
        previousOwnerUserID: String?,
        previousWasAuthenticated: Bool?,
        nextOwnerUserID: String,
        nextIsAuthenticated: Bool,
        nextAccessExpired: Bool
    ) -> Bool {
        guard let previousOwnerUserID, let previousWasAuthenticated else { return false }
        let previousOwner = ScreenplayOwnerScopedStoragePolicy.normalizedOwnerID(previousOwnerUserID)
        let nextOwner = ScreenplayOwnerScopedStoragePolicy.normalizedOwnerID(nextOwnerUserID)
        return previousOwner != nextOwner ||
            previousWasAuthenticated != nextIsAuthenticated ||
            nextAccessExpired
    }
}

nonisolated enum CrossDeviceStateVersionPolicy {
    static func shouldRefresh(knownStateVersion: String, incomingStateVersion: String) -> Bool {
        let known = knownStateVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        let incoming = incomingStateVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !incoming.isEmpty else { return false }
        return known.isEmpty || known != incoming
    }
}

nonisolated enum ScreenplayRemoteDraftConflictPolicy {
    static func shouldProtectLocalDraft(
        selectedProjectId: String,
        loadedProjectId: String,
        localDraft: String,
        serverDraft: String,
        hasUnsavedChanges: Bool,
        isManualEditing: Bool,
        secondsSinceManualEdit: TimeInterval,
        allowOverwrite: Bool
    ) -> Bool {
        let selectedProject = selectedProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let loadedProject = loadedProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let local = localDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let server = serverDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        return !allowOverwrite
            && !selectedProject.isEmpty
            && selectedProject == loadedProject
            && !local.isEmpty
            && local != server
            && (hasUnsavedChanges || (isManualEditing && secondsSinceManualEdit < 120))
    }

    static func shouldSurfaceConflict(
        localEditsProtected: Bool,
        localVersionId: String,
        serverVersionId: String,
        localDraft: String,
        serverDraft: String
    ) -> Bool {
        let localVersion = localVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let serverVersion = serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let local = localDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let server = serverDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        return localEditsProtected
            && !localVersion.isEmpty
            && !serverVersion.isEmpty
            && localVersion != serverVersion
            && local != server
    }
}
