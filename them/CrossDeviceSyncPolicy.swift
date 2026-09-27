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

/// Decides whether a changed owner state version means the open project must
/// be re-read. The state version also moves on this device's own writes (draft
/// saves, activation, sidecar upserts); re-reading then fetched the detail,
/// outline, collaborators and comments and re-ran page analysis for nothing.
/// The poll already has the fresh project list, so it compares the open
/// project's summary with what this device holds and reloads only on a real
/// difference. Missing and empty values count as equal.
nonisolated enum CrossDeviceSelectedProjectPolicy {
    static func needsReload(
        local: BackendScreenplayProjectSummary?,
        incoming: BackendScreenplayProjectSummary?,
        localVersionID: String,
        localOutlineRevision: Int
    ) -> Bool {
        guard let local, let incoming, local.id == incoming.id else { return true }
        let incomingVersionID = (incoming.lastVersionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !incomingVersionID.isEmpty,
           incomingVersionID != localVersionID.trimmingCharacters(in: .whitespacesAndNewlines) {
            return true
        }
        if let incomingRevision = incoming.outlineRevision, incomingRevision != localOutlineRevision {
            return true
        }
        return ReloadRelevantFields(incoming) != ReloadRelevantFields(local)
    }

    private struct ReloadRelevantFields: Equatable {
        let text: [String]
        let lists: [[String]]
        let counts: [Int]
        let archived: Bool

        init(_ project: BackendScreenplayProjectSummary) {
            text = [
                project.title, project.setting, project.tone, project.promptSeed, project.logline,
                project.themeArgument, project.centralQuestion, project.protagonistWant,
                project.protagonistNeed, project.antagonisticForce, project.actPosition,
                project.endingImage, project.lastPhase, project.activeVersionId,
            ].map { ($0 ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
            lists = [project.tags, project.characters, project.unresolvedSetups].map { $0 ?? [] }
            counts = [project.commentCount ?? 0, project.collaboratorCount ?? 0]
            archived = project.archived ?? false
        }
    }
}

/// Edits typed while the project list could not load (offline launch) belong
/// to the project the page was last bound to, but no project was "loaded",
/// so the first successful load treated the page as unrelated and replaced
/// it with the server draft: the offline words vanished (seen live
/// 2026-09-27). When this returns true the load binds the page to that
/// project first, so the normal local-edit protection keeps it.
nonisolated enum ScreenplayOfflineEditAdoptionPolicy {
    static func shouldAdopt(
        projectsWereLoaded: Bool,
        selectedProjectId: String,
        pageProjectId: String,
        page: String,
        hasUnsavedEdits: Bool
    ) -> Bool {
        let selected = selectedProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        return !projectsWereLoaded
            && hasUnsavedEdits
            && !selected.isEmpty
            && selected == pageProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
            && !page.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// Which project a page's local recovery copy is filed under.
nonisolated enum ScreenplayOfflineRecoveryBinding {
    static func target(
        selectedProjectId: String,
        selectedVersionId: String,
        projectsLoaded: Bool,
        pageProjectId: String,
        pageVersionId: String
    ) -> (projectId: String, versionId: String) {
        let selected = selectedProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !selected.isEmpty || projectsLoaded {
            return (selected, selectedVersionId)
        }
        // Only while the project list has not loaded: the page's own binding.
        return (pageProjectId.trimmingCharacters(in: .whitespacesAndNewlines),
                pageVersionId.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// A clean page (usually the server draft just loaded) must not replace
    /// words the recovery banner is still offering for the same project.
    /// Seen live 2026-09-27: words typed offline were offered on the online
    /// relaunch, then the next debounce stored the server text as clean and
    /// the offer, and the words, were gone within a quarter second.
    static func overwritesPendingRecovery(
        dirty: Bool,
        targetProjectId: String,
        draft: String,
        pendingProjectId: String?,
        pendingDraft: String?
    ) -> Bool {
        guard !dirty, let pendingProjectId, let pendingDraft else { return false }
        let target = targetProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        return !target.isEmpty
            && pendingProjectId.trimmingCharacters(in: .whitespacesAndNewlines) == target
            && pendingDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                != draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

nonisolated enum ScreenplayRemoteDraftConflictPolicy {
    /// A server draft that matches the page except for surrounding whitespace
    /// brings nothing new, and writing it over the editor deletes the line the
    /// writer just started with Return. Seen live 2026-09-27: the 3 s
    /// cross-device poll reloaded this device's own autosave (trimmed by the
    /// server) and removed the newline typed after a scene heading.
    static func isWhitespaceOnlyDifference(localDraft: String, serverDraft: String) -> Bool {
        let local = localDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        return localDraft != serverDraft
            && !local.isEmpty
            && local == serverDraft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

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
