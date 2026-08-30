import Foundation

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
