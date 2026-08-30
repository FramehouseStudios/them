import Foundation

struct ScreenplayNavigatorRootPolicy {
    static func preferredRootURL(
        isMacOS: Bool,
        applicationSupportURL: URL?,
        documentsURL: URL?,
        temporaryURL: URL
    ) -> URL {
        if isMacOS {
            return (applicationSupportURL ?? temporaryURL)
                .appendingPathComponent("io.them", isDirectory: true)
                .appendingPathComponent("Screenplays", isDirectory: true)
        }
        return documentsURL ?? temporaryURL
    }

    static func preferredRootURL(fileManager: FileManager = .default) -> URL {
        #if os(macOS)
        let isMacOS = true
        #else
        let isMacOS = false
        #endif
        return preferredRootURL(
            isMacOS: isMacOS,
            applicationSupportURL: fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first,
            documentsURL: fileManager.urls(for: .documentDirectory, in: .userDomainMask).first,
            temporaryURL: fileManager.temporaryDirectory
        )
    }
}

struct ScreenplayProjectScopedState {
    static func matches(_ scopedProjectId: String?, selectedProjectId: String) -> Bool {
        let scoped = (scopedProjectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let selected = selectedProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
        return !scoped.isEmpty && scoped == selected
    }
}

struct ScreenplayCharacterTraitsRefreshPolicy {
    static func shouldFallbackToUserLibrary(
        response: BackendCharacterTraitsResponse,
        projectID: String?,
        projectTitle: String?
    ) -> Bool {
        let scopedProjectID = (projectID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let scopedProjectTitle = (projectTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let responseError = (response.error ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return response.characters.isEmpty &&
            responseError.isEmpty &&
            (!scopedProjectID.isEmpty || !scopedProjectTitle.isEmpty)
    }
}

struct ScreenplayProjectSelectionRestorePolicy {
    static func selectedProjectId(
        activeProjectId: String?,
        preferredProjectId: String? = nil,
        projects: [BackendScreenplayProjectSummary]
    ) -> String {
        let active = (activeProjectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !active.isEmpty { return active }
        let preferred = (preferredProjectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !preferred.isEmpty,
           projects.contains(where: { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) == preferred }) {
            return preferred
        }
        return projects.first?.id ?? ""
    }
}

struct ScreenplayProjectLoadApplicationPolicy {
    static func shouldApply(
        selectedProjectIDAtStart: String,
        currentSelectedProjectID: String
    ) -> Bool {
        selectedProjectIDAtStart.trimmingCharacters(in: .whitespacesAndNewlines)
            == currentSelectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct ScreenplayProjectBindingStoragePolicy {
    static func restoredValue(
        productValue: String?,
        legacyDebugValue: String?,
        isAutomationSession: Bool
    ) -> String? {
        if isAutomationSession {
            return legacyDebugValue
        }
        return productValue ?? legacyDebugValue
    }
}

struct ScreenplayStudioPostHydrationRestorePolicy {
    static func canRestoreWorkspace(
        selectedProjectID: String,
        loadedProjectID: String?,
        loadedDraftProjectID: String,
        isLoading: Bool
    ) -> Bool {
        guard !isLoading else { return false }
        let selected = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !selected.isEmpty else { return true }
        let loaded = (loadedProjectID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let loadedDraft = loadedDraftProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        return loaded == selected && loadedDraft == selected
    }
}

struct ScreenplayProjectDraftRestorePolicy {
    static func preferredVersion(in project: BackendScreenplayProjectSummary) -> BackendScreenplayVersion? {
        let versions = sortedVersions(in: project)
        guard !versions.isEmpty else { return nil }
        let preferredIDs = [
            project.activeVersionId,
            project.lastVersionId,
        ]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        for id in preferredIDs {
            if let version = versions.first(where: { $0.id == id }) {
                return version
            }
        }
        return versions.first
    }

    private static func sortedVersions(in project: BackendScreenplayProjectSummary) -> [BackendScreenplayVersion] {
        (project.versions ?? []).sorted { lhs, rhs in
            (lhs.updatedAt ?? lhs.createdAt ?? 0) > (rhs.updatedAt ?? rhs.createdAt ?? 0)
        }
    }
}

struct ScreenplayUnconfirmedSaveRecoveryPolicy {
    static func shouldPersist(projectId: String, draft: String) -> Bool {
        !projectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct ScreenplayProgrammaticDraftAutosavePolicy {
    static func shouldAutosave(
        hasSelectedProject: Bool,
        autosaveEnabled: Bool,
        hasUnsavedDraftChanges: Bool,
        isStreamingDraftPreviewActive: Bool,
        draft: String
    ) -> Bool {
        hasSelectedProject &&
            autosaveEnabled &&
            hasUnsavedDraftChanges &&
            !isStreamingDraftPreviewActive &&
            !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct ScreenplayDraftSaveIntent: Equatable {
    let source: String
    let notes: String

    static let autosave = ScreenplayDraftSaveIntent(source: "studio_autosave", notes: "")
    static let clementinePageWrite = ScreenplayDraftSaveIntent(
        source: "studio_clementine_page_write",
        notes: "Saved from Clementine page write"
    )
}

struct ScreenplayDraftSaveIntentPolicy {
    static func intent(
        draft: String,
        selectedProjectID: String,
        isManualDraftEditing: Bool,
        committedWrite: ScreenplayCommittedWrite?
    ) -> ScreenplayDraftSaveIntent {
        guard !isManualDraftEditing,
              let committedWrite,
              committedWrite.isAuthoritativeWrite else {
            return .autosave
        }

        let selectedProject = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !selectedProject.isEmpty,
              selectedProject == committedWrite.normalizedProjectID,
              normalizedDraft(draft) == normalizedDraft(committedWrite.committedDraft) else {
            return .autosave
        }
        return .clementinePageWrite
    }

    private static func normalizedDraft(_ draft: String) -> String {
        draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct ScreenplayDraftSaveCompletionPolicy {
    static func hasUnsavedChanges(currentDraft: String, savedDraft: String) -> Bool {
        normalizedDraft(currentDraft) != normalizedDraft(savedDraft)
    }

    private static func normalizedDraft(_ draft: String) -> String {
        draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct ScreenplayDraftIntegrityFingerprint {
    static func value(for draft: String) -> String {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in draft.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 1_099_511_628_211
        }
        return String(hash, radix: 16)
    }
}

struct ScreenplayDraftSaveCoalescingPolicy {
    static func shouldCoalesce(
        activeDraft: String,
        activeSource: String,
        activeNotes: String,
        activeBaseVersionOverride: String?,
        pendingDraft: String,
        pendingSource: String,
        pendingNotes: String,
        pendingBaseVersionOverride: String?
    ) -> Bool {
        normalizedDraft(activeDraft) == normalizedDraft(pendingDraft) &&
            activeSource == pendingSource &&
            activeNotes == pendingNotes &&
            normalizedKey(activeBaseVersionOverride) == normalizedKey(pendingBaseVersionOverride)
    }

    private static func normalizedDraft(_ draft: String) -> String {
        draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizedKey(_ value: String?) -> String {
        (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct ScreenplayDraftSaveRetryPolicy {
    static func shouldRetry(_ error: Error) -> Bool {
        if error is URLError { return true }
        guard let apiError = error as? BackendMemoryAPIError else { return false }
        switch apiError {
        case .invalidResponse:
            return true
        case .invalidBaseURL:
            return false
        case .server(let status, _):
            return status == 408 ||
                status == 425 ||
                status == 429 ||
                (500...599).contains(status)
        }
    }
}

struct ScreenplayCommittedDraftAdoptionPolicy {
    static func shouldAdopt(
        selectedProjectID: String,
        committedProjectID: String,
        currentDraft: String,
        previousDraft: String,
        committedDraft: String
    ) -> Bool {
        let selectedProject = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let committedProject = committedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let current = normalizedDraft(currentDraft)
        let previous = normalizedDraft(previousDraft)
        let committed = normalizedDraft(committedDraft)
        guard !selectedProject.isEmpty,
              selectedProject == committedProject,
              !committed.isEmpty else {
            return false
        }
        return current == previous || current == committed
    }

    private static func normalizedDraft(_ draft: String) -> String {
        draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
