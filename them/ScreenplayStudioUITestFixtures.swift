import Foundation

#if DEBUG
@MainActor
enum ScreenplayStudioUITestFixtures {
    static func applyDraftConflictIfRequested(
        viewModel: ScreenplayStudioViewModel,
        alreadyApplied: Bool
    ) -> Bool {
        guard IOThemRuntime.isRunningUITests,
              ProcessInfo.processInfo.arguments.contains("--ui-show-draft-conflict"),
              !alreadyApplied,
              viewModel.conflictState == nil else { return alreadyApplied }
        let selectedID = viewModel.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let project = viewModel.selectedProject ?? viewModel.projects.first(where: {
            selectedID.isEmpty || $0.id == selectedID
        }) else { return false }
        viewModel.selectedProject = project
        viewModel.selectedProjectID = project.id
        let serverDraft = """
        EXT. FERRY TERMINAL - DAWN
        MARA
        The server copy survives.
        """
        viewModel.conflictState = ScreenplayStudioViewModel.SaveConflictState(
            projectId: project.id,
            baseVersionId: viewModel.latestVersionID,
            serverVersionId: "ui-server-version",
            serverDraft: serverDraft,
            serverDraftExcerpt: "EXT. FERRY TERMINAL - DAWN",
            serverUpdatedAt: Date().timeIntervalSince1970 * 1_000
        )
        viewModel.hasUnsavedDraftChanges = true
        viewModel.autosaveStatusText = "Conflict detected"
        viewModel.infoText = "Another device updated this draft. Choose keep mine or load server."
        return true
    }

    static func applyHeldDraftRecoveryIfRequested(viewModel: ScreenplayStudioViewModel) {
        guard IOThemRuntime.isRunningUITests,
              ProcessInfo.processInfo.arguments.contains("--ui-held-draft-recovery-fixture") else { return }
        let owner = ScreenplayStudioAuthContext.current()
        let projectID = viewModel.selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !owner.userID.isEmpty, !projectID.isEmpty else {
            viewModel.errorText = "Synthetic held-copy fixture requires its synthetic account and project."
            return
        }
        let backendURL = BackendAuthClient.resolvedBackendBaseURL()
        let documentID = ScreenplayLiveDraftBridge.shared.draftOrigin.documentID ?? "ui-held-copy-document"
        let row = ScreenplayDraftSaveOutboxEntry(
            id: "ui-held-draft-copy", projectId: projectID, ownerUserId: owner.userID,
            draft: "INT. SYNTHETIC ARCHIVE - NIGHT\n\nTHE EXACT HELD UI FIXTURE COPY.\n",
            title: "Synthetic Held Copy", phase: "scene_draft",
            notes: "DEBUG-only held-copy UI fixture", source: "ui_test_fixture",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "ui-held-base",
            createdAt: 100, updatedAt: 100, status: .parked, retries: 0,
            nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.loadServerDeferredReason,
            deliveryOrigin: .init(documentID: documentID, backendURL: backendURL)
        )
        Task { @MainActor in
            do {
                try await ScreenplayDraftSaveOutbox.shared.enqueue(row)
                guard ScreenplayStudioAuthContext.current() == owner,
                      viewModel.selectedProjectID == projectID else { return }
                viewModel.heldDraftRecovery = row
                viewModel.reopenHeldDraftRecovery()
                viewModel.autosaveStatusText = "Server draft loaded - local copy held"
                viewModel.infoText = "Synthetic DEBUG-only held copy is ready for UI inspection."
            } catch {
                viewModel.errorText = "Synthetic held-copy fixture failed: \(error.localizedDescription)"
            }
        }
    }

    static func isSyntheticHeldRecovery(_ row: ScreenplayDraftSaveOutboxEntry?) -> Bool {
        row?.ownerUserId == "synthetic-held-copy-writer" && row?.source == "ui_test_fixture"
    }

    static func heldRecoveryUsesLoopback(_ row: ScreenplayDraftSaveOutboxEntry?) -> Bool {
        guard let host = row?.deliveryOrigin?.backendURL.host else { return false }
        return ["127.0.0.1", "localhost", "::1", "[::1]"].contains(host)
    }
}
#endif
