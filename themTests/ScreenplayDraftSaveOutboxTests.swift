import XCTest
@testable import them

final class ScreenplayDraftSaveOutboxTests: XCTestCase {
    func testInterruptedSeedRetryOnlyChangesInflightEntryAndPreservesRequestIdentity() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "seed", source: "studio_initial_seed"))
        try await store.markInflight(id: "seed")
        try await store.markRetryable(id: "seed", error: "Selection changed", onlyIfInflight: true)
        var entries = try await store.entriesForTesting()
        XCTAssertEqual(entries.map(\.id), ["seed"])
        XCTAssertEqual(entries.first?.status, .pending)
        try await store.markParked(id: "seed", error: "Conflict")
        try await store.markRetryable(id: "seed", error: "Late response", onlyIfInflight: true)
        entries = try await store.entriesForTesting()
        XCTAssertEqual(entries.first?.status, .parked)
        try await store.remove(id: "seed")
        try await store.markRetryable(id: "seed", error: "Discarded", onlyIfInflight: true)
        entries = try await store.entriesForTesting()
        XCTAssertTrue(entries.isEmpty)
    }

    func testConflictHydrationOrderingNeverInfersOrderFromOpaqueIDsOrInvalidTimes() {
        func accepts(_ id: String, _ incoming: Double, known: Double = 300) -> Bool {
            ScreenplayConflictHydrationPolicy.canApply(baseVersionID: "base", knownServerVersionID: "known",
                knownServerUpdatedAt: known, incomingVersionID: id, incomingUpdatedAt: incoming)
        }
        XCTAssertTrue(accepts(" known ", 0))
        XCTAssertTrue(accepts("newer", 400))
        XCTAssertFalse(accepts("base", 1000))
        for invalid in [0, 299, 300, .infinity, .nan] {
            XCTAssertFalse(accepts("different", invalid))
        }
        XCTAssertFalse(accepts("different", 400, known: 0))
        XCTAssertFalse(accepts("different", 400, known: .nan))
        XCTAssertFalse(accepts("", 400))
    }

    @MainActor
    func testKnownServerHeadConfirmingExactWriterBytesRetiresConflictWithoutAnotherWrite() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "  Writer words cafe\u{0301}\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        let suite = "them.exact-known-head.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        await model.restorePendingDraftSaveBeforeProjectHydration()
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "confirmed", serverDraft: raw,
            serverDraftExcerpt: raw, serverUpdatedAt: 300)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "confirmed", "versions": [["id": "confirmed", "draft": raw]]])
        await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
        XCTAssertEqual(model.latestVersionID, "confirmed")
        XCTAssertNil(model.conflictState)
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        let copies = try await queue.entriesForTesting()
        XCTAssertTrue(copies.isEmpty)
    }

    @MainActor
    func testConflictHydrationRejectsOlderUnknownAndMissingHeadsButAcceptsProvenNewerHead() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "  Writer words cafe\u{0301}\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        let suite = "them.conflict-ordering.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        await model.restorePendingDraftSaveBeforeProjectHydration()
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote-v3", serverDraft: "New collaborator words",
            serverDraftExcerpt: "New collaborator words", serverUpdatedAt: 300)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        for (id, draft, updatedAt) in [("remote-v2", "Older collaborator words", 200),
                                       ("unknown", raw, 0), ("", "", 0),
                                       ("server-v1", raw, 100)] {
            let versions: [[String: Any]] = id.isEmpty ? [] : [["id": id, "draft": draft, "updatedAt": updatedAt]]
            let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
                "activeVersionId": id, "versions": versions])
            await model.hydrateDraftRestoringQueuedSaves(from:
                try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
            await Task.yield()
            XCTAssertEqual(model.conflictState, conflict, "An unproven or old head is not a resolution: \(id)")
            XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
            XCTAssertTrue(model.hasUnsavedDraftChanges)
            let copies = try await queue.entriesForTesting()
            XCTAssertEqual(copies.map(\.draft), [raw])
            XCTAssertEqual(copies.first?.status, .parked)
        }
        let sameHead = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote-v3", "versions": [["id": "remote-v3", "draft": "New collaborator words"]]])
        await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: sameHead))
        XCTAssertEqual(model.conflictState?.serverUpdatedAt, 300,
            "A sparse response for the known version must not erase its ordering evidence.")
        let newer = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote-v4", "versions": [["id": "remote-v4", "draft": "Newest words", "updatedAt": 400]]])
        await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: newer))
        XCTAssertEqual(model.conflictState?.serverVersionId, "remote-v4")
        XCTAssertEqual(model.conflictState?.serverDraft, "Newest words")
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        let retained = try await queue.entriesForTesting()
        XCTAssertEqual(retained.map(\.draft), [raw])
        XCTAssertEqual(retained.first?.status, .parked)
    }

    @MainActor
    func testDelayedBaseHydrationCannotClearAnUnresolvedNewerServerConflict() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "  Writer words cafe\u{0301}\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        let suite = "them.stale-conflict-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        await model.restorePendingDraftSaveBeforeProjectHydration()
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote-v2", serverDraft: "Collaborator words",
            serverDraftExcerpt: "Collaborator words", serverUpdatedAt: 200)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        // A detail request started before v2 was observed returns its old v1 response.
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "server-v1", "versions": [["id": "server-v1", "draft": "Original saved words"]]])
        await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.conflictState, conflict, "A delayed base response is not the writer's resolution.")
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.latestVersionID, "server-v1")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [raw])
        XCTAssertEqual(copies.first?.status, .parked)
    }

    func testBlankSnapshotQueueRequiresExplicitFlagAndWriterSource() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var snapshot = makeEntry(id: "blank-snapshot", draft: "", source: "studio_snapshot")
        do {
            try await queue.enqueue(snapshot)
            XCTFail("A missing flag must never authorize deletion.")
        } catch BackendMemoryAPIError.server(let status, _) {
            XCTAssertEqual(status, 400)
        }
        snapshot.allowEmptyDraft = true
        try await queue.enqueue(snapshot)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let saved = try await reopened.entriesForTesting()
        XCTAssertEqual(saved.first?.source, "studio_snapshot")
        XCTAssertEqual(saved.first?.draft, "")
        XCTAssertEqual(saved.first?.allowEmptyDraft, true)
        XCTAssertFalse(ScreenplayIntentionalBlankSavePolicy.permits(source: "studio_clementine_page_write"))
        XCTAssertFalse(ScreenplayIntentionalBlankSavePolicy.permits(source: "studio_restore"))
    }

    func testBlankIntentSurvivesQueueCodecAndOldManifestsDefaultOff() throws {
        let old = try JSONEncoder().encode(makeEntry(id: "legacy"))
        let decoded = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self, from: old)
        XCTAssertFalse(decoded.allowEmptyDraft ?? false)
        var blank = makeEntry(id: "delete-all", draft: "")
        blank.allowEmptyDraft = true
        let reopened = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONEncoder().encode(blank))
        XCTAssertEqual(reopened.allowEmptyDraft, true)
        XCTAssertEqual(reopened.draft, "")
    }

    @MainActor
    func testFlaggedBlankQueueRestoresBeforeRemoteHydration() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var blank = replacingOwner(of: makeEntry(id: "blank", draft: ""), with: owner)
        blank.allowEmptyDraft = true
        try await queue.enqueue(blank)
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.blank-queued.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: reopened)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertTrue(model.hasIntentionalBlankDraft)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        let copies = try await reopened.entriesForTesting()
        XCTAssertEqual(copies.first?.allowEmptyDraft, true)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testManualDeleteAllSurvivesDebounceAndServerHydration() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.delete-all.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Original writer words", versionID: "base")
        model.fountainDraft = ""
        model.noteManualDraftEdit()
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(recovery.dirtyOrdinarySnapshot(ownerUserId: owner, projectId: "project-1")?.draft, "")
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        model.hydrateDraft(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testProjectHydrationRestoresParkedWriterSaveBeforeRemoteDraft() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "  Writer words cafe\u{0301}\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "parked", draft: local), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.project-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [local])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testBoundaryWhitespaceEditStaysDirtyThroughDebounce() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.boundary-save.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let saved = "  INT. ROOM - NIGHT\r\nWriter words.\r\n"
        model.applyStructuralUITestDraft(saved, versionID: "saved")
        model.fountainDraft = saved + "\n"
        model.noteManualDraftEdit()
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array((saved + "\n").utf8))
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, saved + "\n")
    }

    func testQueueDoesNotCoalesceWhitespaceDistinctWriterDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let drafts = ["Writer words", "Writer words\n", "  Writer words\r\n", "Writer words\r\n"]
        for (index, draft) in drafts.enumerated() {
            try await store.enqueue(makeEntry(id: "exact-\(index)", draft: draft, createdAt: Double(index + 100)))
        }
        let restored = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let copies = try await restored.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), drafts)
    }

    func testSaveIdentifierRejectsWhitespaceDistinctReuse() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "exact-id", draft: "Writer words"))
        do {
            try await store.enqueue(makeEntry(id: "exact-id", draft: "Writer words\n"))
            XCTFail("A changed payload must not acknowledge the earlier request.")
        } catch BackendMemoryAPIError.server(let status, _) { XCTAssertEqual(status, 409) }
    }

    func testQueueRetainsUnicodeByteDistinctWriterDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let drafts = ["Caf\u{00e9}", "Cafe\u{0301}"]
        for (index, draft) in drafts.enumerated() {
            try await store.enqueue(makeEntry(id: "unicode-\(index)", draft: draft, createdAt: Double(index + 100)))
        }
        let copies = try await store.entriesForTesting()
        XCTAssertEqual(copies.count, 2)
        XCTAssertEqual(copies.map { Array($0.draft.utf8) }, drafts.map { Array($0.utf8) })
    }

    @MainActor
    func testRevertingToSavedRawTextDoesNotBecomeDirtyAfterDebounce() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.save-revert.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        let saved = "  INT. ROOM - NIGHT\r\n\r\nWriter words.\r\n"
        model.applyStructuralUITestDraft(saved, versionID: "saved")
        model.fountainDraft = "Changed writer words"
        model.noteManualDraftEdit()
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        model.fountainDraft = saved
        model.noteManualDraftEdit()
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.fountainDraft, saved)
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        let copies = try await queue.entriesForTesting()
        XCTAssertTrue(copies.isEmpty)
    }

    @MainActor
    func testEmptyProjectHydrationDoesNotKeepAnotherProjectsCleanPage() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.empty-project.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "old-project"
        model.applyStructuralUITestDraft("Old project words", versionID: "old")
        model.selectedProjectID = "new-project"
        let data = try JSONSerialization.data(withJSONObject: ["id": "new-project", "title": "New", "versions": []])
        model.hydrateDraft(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertEqual(model.latestVersionID, "")
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    private final class DeferredConflictProject {
        let started = XCTestExpectation(description: "Canonical fetch started")
        var continuation: CheckedContinuation<BackendScreenplayProjectSummary, Never>?
        func load() async -> BackendScreenplayProjectSummary {
            await withCheckedContinuation { continuation in
                self.continuation = continuation
                started.fulfill()
            }
        }
    }

    @MainActor
    func testLoadServerFetchesCurrentHeadEvenWhenConflictHasCachedText() async throws {
        let fetched = expectation(description: "Current head fetched")
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote-v3", "versions": [["id": "remote-v3", "draft": "Current server words", "updatedAt": 3]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        let suite = "them.fresh-server-choice.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory),
            conflictProjectLoader: { id in
                XCTAssertEqual(id, "project-1")
                fetched.fulfill()
                return project
            })
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Writer words"
        model.hasUnsavedDraftChanges = true
        model.conflictState = .init(projectId: "project-1", baseVersionId: "server-v1",
            serverVersionId: "remote-v2", serverDraft: "Stale cached words",
            serverDraftExcerpt: "Stale cached words", serverUpdatedAt: 2)
        await model.applyServerVersionFromConflict()?.value
        await fulfillment(of: [fetched], timeout: 2)
        await Task.yield()
        XCTAssertEqual(model.fountainDraft, "Current server words")
        XCTAssertEqual(model.latestVersionID, "remote-v3")
        XCTAssertNil(model.conflictState)
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testFreshServerChoiceRetainsDurableWordsForUnusableHeadsAndAllowsBlank() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let cases: [(String, String, String, String?, Double, Bool)] = [
            ("missing-active", "project-1", "absent", "Old text", 400, false),
            ("missing-draft", "project-1", "remote", nil, 300, false),
            ("wrong-project", "other-project", "remote", "Other text", 300, false),
            ("older-head", "project-1", "older", "Older text", 200, false),
            ("unknown-head", "project-1", "unknown", "Unknown text", 0, false),
            ("fetch-failure", "project-1", "remote", "Cached text", 300, false),
            ("blank-head", "project-1", "remote", "", 0, true),
        ]
        for (name, projectID, activeID, draft, timestamp, accepted) in cases {
            let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory.appendingPathComponent(name))
            let raw = "  Writer cafe\u{0301}\r\n"
            try await queue.enqueue(replacingOwner(of: makeEntry(id: name, draft: raw), with: owner))
            _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
            let suite = "them.choice-\(name).\(UUID().uuidString)"
            let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
            defer { defaults.removePersistentDomain(forName: suite) }
            let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
            recovery.save(ownerUserId: owner, projectId: "project-1", draft: raw,
                baseVersionId: "server-v1", dirty: true)
            var version: [String: Any] = ["id": name == "missing-active" ? "old" : activeID,
                "projectId": projectID, "updatedAt": timestamp]
            if let draft { version["draft"] = draft }
            let data = try JSONSerialization.data(withJSONObject: ["id": projectID, "title": name,
                "activeVersionId": activeID, "versions": [version]])
            let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
            let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
                draftSaveOutbox: queue, conflictProjectLoader: { _ in
                    if name == "fetch-failure" { throw URLError(.notConnectedToInternet) }
                    return project
                })
            model.autosaveEnabled = false
            model.selectedProjectID = "project-1"
            model.fountainDraft = raw
            model.hasUnsavedDraftChanges = true
            let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
                baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "Cached text",
                serverDraftExcerpt: "Cached text", serverUpdatedAt: 300)
            model.conflictState = conflict
            await model.applyServerVersionFromConflict()?.value
            XCTAssertFalse(model.isLoadingServerConflict, name)
            if accepted {
                XCTAssertEqual(model.fountainDraft, "", name)
                XCTAssertEqual(model.latestVersionID, "remote", name)
                XCTAssertNil(model.conflictState, name)
                XCTAssertFalse(model.hasUnsavedDraftChanges, name)
            } else {
                XCTAssertEqual(Array(model.fountainDraft.utf8), Array(raw.utf8), name)
                XCTAssertEqual(model.conflictState, conflict, name)
                XCTAssertTrue(model.hasUnsavedDraftChanges, name)
                XCTAssertFalse(model.errorText.isEmpty, name)
                XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, raw, name)
                let copies = try await queue.entriesForTesting()
                XCTAssertEqual(copies.map(\.draft), [raw], name)
                XCTAssertEqual(copies.first?.status, .parked, name)
            }
            try? await Task.sleep(nanoseconds: 1_100_000_000)
        }
    }

    @MainActor
    func testCanonicallyEquivalentTypingDuringServerFetchIsNotOverwritten() async throws {
        let suite = "them.unicode-server-choice.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let deferred = DeferredConflictProject()
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory),
            conflictProjectLoader: { _ in await deferred.load() })
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        model.fountainDraft = "café"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "base", serverVersionId: "remote", serverDraft: "",
            serverDraftExcerpt: "", serverUpdatedAt: 1)
        model.conflictState = conflict
        let task = try XCTUnwrap(model.applyServerVersionFromConflict())
        XCTAssertNil(model.applyServerVersionFromConflict(), "A duplicate tap must not start another fetch.")
        await fulfillment(of: [deferred.started], timeout: 2)
        model.fountainDraft = "cafe\u{0301}"
        model.hasUnsavedDraftChanges = true
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]])
        deferred.continuation?.resume(returning: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        await task.value
        XCTAssertEqual(Array(model.fountainDraft.utf8), Array("cafe\u{0301}".utf8))
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testTypingDuringServerChoiceFetchPreservesNewerEditorAndQueuedCopy() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer"), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.delayed-conflict-fetch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let deferred = DeferredConflictProject()
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            conflictProjectLoader: { _ in await deferred.load() })
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Draft one"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "",
            serverDraftExcerpt: "", serverUpdatedAt: 1)
        model.conflictState = conflict
        let task = Task { await model.loadCurrentServerDraftForConflict(conflict,
            owner: ScreenplayStudioAuthContext(userID: owner,
                sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()),
            draftAtChoice: "Draft one", choiceTime: 200) }
        await fulfillment(of: [deferred.started], timeout: 2)
        model.fountainDraft = "Newer words typed during fetch\n"
        model.hasUnsavedDraftChanges = true
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: model.fountainDraft,
            baseVersionId: "server-v1", dirty: true)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Server words"]]])
        deferred.continuation?.resume(returning: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        await task.value
        XCTAssertEqual(model.fountainDraft, "Newer words typed during fetch\n")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, model.fountainDraft)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Draft one"])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testWhitespaceOnlyServerDifferenceCannotDiscardRawWriterCopy() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "Writer words\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.whitespace-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        await model.restorePendingDraftSaveBeforeProjectHydration()
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Writer words"]]])
        model.hydrateDraft(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.fountainDraft, raw)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [raw])
        XCTAssertEqual(copies.first?.status, .parked)
    }

    @MainActor
    func testMissingServerFetchFailurePreservesConflictAndDurableWords() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer"), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.failed-conflict-fetch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "Draft one",
            baseVersionId: "server-v1", dirty: true, savedAt: 100)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue,
            conflictProjectLoader: { _ in throw URLError(.notConnectedToInternet) })
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Draft one"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "",
            serverDraftExcerpt: "", serverUpdatedAt: 1)
        model.conflictState = conflict
        await model.loadCurrentServerDraftForConflict(conflict,
            owner: ScreenplayStudioAuthContext(userID: owner,
                sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()),
            draftAtChoice: model.fountainDraft, choiceTime: 200)
        XCTAssertEqual(model.fountainDraft, "Draft one")
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertFalse(model.errorText.isEmpty)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "Draft one")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Draft one"])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testCanonicalHydrationRetiresExactMatchingParkedCopyWithoutAnotherWrite() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let raw = "  Writer words\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: raw), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.confirmed-conflict.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        await model.restorePendingDraftSaveBeforeProjectHydration()
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "confirmed", "versions": [["id": "confirmed", "draft": raw]]])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.hydrateDraft(from: project)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
        XCTAssertEqual(model.fountainDraft, raw)
        XCTAssertEqual(model.latestVersionID, "confirmed")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
        let copies = try await queue.entriesForTesting()
        XCTAssertTrue(copies.isEmpty)
    }

    func testFailedConflictPersistenceAndDiscardNeverDropTheInMemoryCopies() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "writer"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        let before = try await store.entriesForTesting()
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try FileManager.default.moveItem(at: manifest, to: storageDirectory.appendingPathComponent("original.json"))
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do {
            _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
            XCTFail("Writing over a directory should fail")
        } catch {}
        do {
            try await store.discardConflicts(projectId: "project-1", ownerUserId: "user-1", through: 1000)
            XCTFail("Discard must not report durability when the manifest cannot be written")
        } catch {}
        do {
            try await store.markSucceeded(id: "writer", serverVersionId: "confirmed", supersedesEarlierSaves: true)
            XCTFail("Acknowledgement cleanup must not report durability when the manifest cannot be written")
        } catch {}
        let after = try await store.entriesForTesting()
        XCTAssertEqual(after, before)
    }

    @MainActor
    func testConflictHandlerRejectsAnotherProjectOwnerAndSignInGeneration() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "private"), with: owner))
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(), draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "base", serverVersionId: "remote", serverDraft: "Remote",
            serverDraftExcerpt: "Remote", serverUpdatedAt: 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner + "-other")
        XCTAssertNil(model.conflictState)
        let stale = ScreenplayStudioAuthContext(userID: owner,
            sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration() + 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner, expectedContext: stale)
        XCTAssertNil(model.conflictState)
        model.selectedProjectID = "other-project"
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        XCTAssertNil(model.conflictState)
        let entries = try await queue.entriesForTesting()
        XCTAssertEqual(entries.first?.status, .pending)
    }

    @MainActor
    func testRelaunchMustPreferNewerUnsavedRecoveryOverOlderConflictedQueue() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "older", draft: "Submitted words", createdAt: 100), with: owner))
        _ = try await queue.retainConflict(projectId: "project-1", ownerUserId: owner)
        let suite = "them.conflict-relaunch.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: "  Newer writer words\r\n",
                      baseVersionId: "base-newer", dirty: true, savedAt: 200)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        model.fountainDraft = ""
        await model.restorePendingDraftSaveBeforeProjectHydration()
        XCTAssertEqual(model.fountainDraft, "  Newer writer words\r\n")
        XCTAssertEqual(model.latestVersionID, "base-newer")
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "  Newer writer words\r\n")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Submitted words"])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRealConflictHandlerRecoversQueuedWordsWhenEditorWasHydratedFromServer() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "  INT. ROOM - NIGHT\r\n\r\nWriter words.\r\n"
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "writer", draft: local), with: owner))
        let suite = "them.conflict-handler.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        model.applyStructuralUITestDraft("Collaborator draft", versionID: "remote")
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "Collaborator draft",
            serverDraftExcerpt: "Collaborator draft", serverUpdatedAt: 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        XCTAssertEqual(model.fountainDraft, local)
        XCTAssertEqual(model.conflictState, conflict)
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertEqual(model.parkedDraftSaveCount, 1)
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, local)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let copies = try await relaunched.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), [local])
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    @MainActor
    func testRealConflictHandlerKeepsNewerEditorWorkAndAllSubmittedCopies() async throws {
        let owner = BackendAuthClient.currentAuthSessionState().user?.userId ?? ""
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await queue.enqueue(replacingOwner(of: makeEntry(id: "submitted", draft: "Submitted words"), with: owner))
        let suite = "them.conflict-handler.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.selectedProjectID = "project-1"
        model.fountainDraft = "Newer writer edits"
        model.hasUnsavedDraftChanges = true
        let conflict = ScreenplayStudioViewModel.SaveConflictState(projectId: "project-1",
            baseVersionId: "server-v1", serverVersionId: "remote", serverDraft: "Collaborator draft",
            serverDraftExcerpt: "Collaborator draft", serverUpdatedAt: 1)
        await model.handleDraftSaveConflict(conflict, ownerUserId: owner)
        XCTAssertEqual(model.fountainDraft, "Newer writer edits")
        XCTAssertEqual(recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String, "Newer writer edits")
        let copies = try await queue.entriesForTesting()
        XCTAssertEqual(copies.map(\.draft), ["Submitted words"])
        XCTAssertEqual(copies.first?.status, .parked)
        try? await Task.sleep(nanoseconds: 1_100_000_000)
    }

    func testConflictRetainsEveryDraftAcrossRelaunchWithoutAutomaticReplay() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let first = makeEntry(id: "first", draft: "  First draft\r\n", createdAt: 100)
        let newest = makeEntry(id: "newest", draft: "Newest draft\n", createdAt: 101)
        try await store.enqueue(first)
        try await store.enqueue(newest)
        let retained = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        XCTAssertEqual(retained?.draft, newest.draft)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entries = try await relaunched.entriesForTesting()
        XCTAssertEqual(entries.map(\.draft), [first.draft, newest.draft])
        XCTAssertTrue(entries.allSatisfy { $0.status == .parked })
        let retry = try await relaunched.beginNext(projectId: "project-1", ownerUserId: "user-1", force: true)
        XCTAssertNil(retry)
        let restored = try await relaunched.pendingEntry(projectId: "project-1", ownerUserId: "user-1")
        XCTAssertEqual(restored?.draft, newest.draft)
    }

    func testConflictResolutionRetiresOlderCopiesOnlyAfterServerConfirmation() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "old", createdAt: 100))
        try await store.enqueue(replacingOwner(of: makeEntry(id: "private", createdAt: 100), with: "user-2"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        try await store.enqueue(makeEntry(id: "choice", draft: "Chosen draft", createdAt: 102))
        try await store.enqueue(makeEntry(id: "newer-edit", draft: "Newer edit", createdAt: 103))
        let before = try await store.entriesForTesting()
        XCTAssertEqual(before.count, 4)
        try await store.markSucceeded(id: "choice", serverVersionId: "confirmed",
                                      supersedesEarlierSaves: true)
        let after = try await store.entriesForTesting()
        XCTAssertEqual(Set(after.map(\.id)), ["private", "newer-edit"])
        XCTAssertEqual(after.first { $0.id == "newer-edit" }?.baseVersionId, "confirmed")
    }

    func testExplicitServerChoiceCannotDiscardOtherOwnerOrLaterConflict() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "old", createdAt: 100))
        try await store.enqueue(makeEntry(id: "later", draft: "Later writer text", createdAt: 200))
        try await store.enqueue(replacingOwner(of: makeEntry(id: "private", createdAt: 100), with: "user-2"))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        try await store.discardConflicts(projectId: "project-1", ownerUserId: "user-1", through: 150)
        let after = try await store.entriesForTesting()
        XCTAssertEqual(Set(after.map(\.id)), ["private", "later"])
    }

    func testOrdinaryAcknowledgementCannotRetireParkedConflictCopies() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "old", createdAt: 100))
        try await store.enqueue(makeEntry(id: "new", draft: "Exact words\r\n", createdAt: 101))
        _ = try await store.retainConflict(projectId: "project-1", ownerUserId: "user-1")
        let acknowledged = try await store.markSucceeded(id: "old", serverVersionId: "stale-success",
            requireUnparkedRequest: true)
        XCTAssertFalse(acknowledged)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retained = try await relaunched.entriesForTesting()
        XCTAssertEqual(retained.map(\.id), ["old", "new"])
        XCTAssertTrue(retained.allSatisfy { $0.status == .parked && $0.baseVersionId == "server-v1" })
        XCTAssertEqual(Array(retained.last!.draft.utf8), Array("Exact words\r\n".utf8))
    }

    func testExplicitDiscardFencesLateAdmissionWithoutDependingOnWallClock() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let authority = UUID()
        try await store.discardConflicts(projectId: "project-1", ownerUserId: "user-1", through: 150,
            authorityID: authority, authorityGeneration: 3)
        try await store.enqueueConflictCopy(makeEntry(id: "late", createdAt: 999),
            authorityID: authority, authorityGeneration: 3)
        var entries = try await store.entriesForTesting()
        XCTAssertTrue(entries.isEmpty)
        try await store.enqueueConflictCopy(makeEntry(id: "new-choice", createdAt: 90),
            authorityID: authority, authorityGeneration: 4)
        try await store.enqueueConflictCopy(makeEntry(id: "new-model", createdAt: 90),
            authorityID: UUID(), authorityGeneration: 1)
        try await store.enqueueConflictCopy(replacingOwner(of: makeEntry(id: "other-owner"), with: "user-2"),
            authorityID: authority, authorityGeneration: 1)
        entries = try await store.entriesForTesting()
        XCTAssertEqual(Set(entries.map(\.id)), ["new-choice", "new-model", "other-owner"])
        XCTAssertTrue(entries.allSatisfy { $0.status == .parked })
    }

    private var storageDirectory: URL!

    override func setUp() {
        super.setUp()
        storageDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("ScreenplayDraftSaveOutboxTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        if let storageDirectory {
            try? FileManager.default.removeItem(at: storageDirectory)
        }
        storageDirectory = nil
        super.tearDown()
    }

    func testQueuePersistsAndRecoversInterruptedInflightSave() async throws {
        let firstStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-1")

        try await firstStore.enqueue(entry)
        try await firstStore.markInflight(id: entry.id, now: Date(timeIntervalSince1970: 101))

        let restoredStore = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restored = try await restoredStore.entriesForTesting()
        XCTAssertEqual(restored.count, 1)
        XCTAssertEqual(restored.first?.id, "save-1")
        XCTAssertEqual(restored.first?.status, .pending)
        XCTAssertEqual(restored.first?.lastError, "Interrupted while saving.")
    }

    func testQueueDeduplicatesSameSaveIdentifier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-once")

        try await store.enqueue(entry)
        try await store.enqueue(entry)

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-once"])
    }

    func testSnapshotCountsOnlyTheCurrentAccount() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "my-save"))
        let otherOwner = replacingOwner(of: makeEntry(id: "other-save"), with: "user-2")
        try await store.enqueue(otherOwner)

        let mine = await store.snapshot(ownerUserId: "user-1")
        let theirs = await store.snapshot(ownerUserId: "user-2")
        let all = await store.snapshot()

        XCTAssertEqual(mine.pendingCount, 1)
        XCTAssertEqual(theirs.pendingCount, 1)
        XCTAssertEqual(all.pendingCount, 2)
    }

    func testCorruptManifestIsNotSilentlyReplacedByAnEmptyQueue() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let corruptData = Data("{not-json".utf8)
        try corruptData.write(to: manifestURL)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)

        let firstRead = await store.snapshot(ownerUserId: "user-1")
        let secondRead = await store.snapshot(ownerUserId: "user-1")

        XCTAssertFalse(firstRead.lastError.isEmpty)
        XCTAssertFalse(secondRead.lastError.isEmpty)
        XCTAssertEqual(try Data(contentsOf: manifestURL), corruptData)
    }

    func testSuccessfulSaveRebasesCausallyFollowingDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.enqueue(makeEntry(id: "save-2", draft: "Draft two", createdAt: 101))
        try await store.enqueue(makeEntry(id: "save-3", draft: "Draft three", createdAt: 102))

        try await store.markSucceeded(
            id: "save-1",
            serverVersionId: "server-v2",
            now: Date(timeIntervalSince1970: 103)
        )

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-2", "save-3"])
        XCTAssertEqual(stored.map(\.baseVersionId), ["server-v2", "server-v2"])
    }

    func testLaterDraftCannotSkipOlderBackedOffSave() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.markRetryable(
            id: "save-1",
            error: "offline",
            now: Date(timeIntervalSince1970: 100)
        )
        try await store.enqueue(makeEntry(id: "save-2", draft: "Draft two", createdAt: 101))

        let skipped = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101),
            force: false
        )
        XCTAssertNil(skipped)

        let forced = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101),
            force: true
        )
        XCTAssertEqual(forced?.id, "save-1")
    }

    func testAnotherAccountsOlderSaveDoesNotBlockCurrentAccount() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var otherOwner = makeEntry(id: "other-save", draft: "Other draft", createdAt: 99)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)
        try await store.enqueue(makeEntry(id: "my-save", createdAt: 100))

        let next = try await store.beginNext(
            projectId: "project-1",
            ownerUserId: "user-1",
            now: Date(timeIntervalSince1970: 101),
            force: true
        )

        XCTAssertEqual(next?.id, "my-save")
    }

    func testSuccessfulSaveDoesNotRebaseAnotherAccountsProject() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "my-save", createdAt: 100))
        var otherOwner = makeEntry(id: "other-save", draft: "Other draft", createdAt: 101)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)

        try await store.markSucceeded(id: "my-save", serverVersionId: "my-server-v2")

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored.first?.id, "other-save")
        XCTAssertEqual(stored.first?.baseVersionId, "server-v1")
    }

    func testConflictCleanupRemovesTheWholeProjectChainOnlyForCurrentOwner() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-1", draft: "Draft one", createdAt: 100))
        try await store.enqueue(makeEntry(id: "save-2", draft: "Draft two", createdAt: 101))
        var otherOwner = makeEntry(id: "save-other", draft: "Other draft", createdAt: 102)
        otherOwner = replacingOwner(of: otherOwner, with: "user-2")
        try await store.enqueue(otherOwner)

        try await store.removeAll(projectId: "project-1", ownerUserId: "user-1")

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-other"])
    }

    func testRetryBackoffEventuallyParksWithoutDroppingDraft() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "save-retry"))

        for retry in 1...6 {
            try await store.markRetryable(
                id: "save-retry",
                error: "offline \(retry)",
                now: Date(timeIntervalSince1970: TimeInterval(200 + retry))
            )
        }

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.first?.status, .parked)
        XCTAssertEqual(stored.first?.retries, 6)
        XCTAssertEqual(stored.first?.draft, "Draft one")
        XCTAssertEqual(stored.first?.lastError, "offline 6")
    }

    func testUITestResetRemovesPersistedDraftSaveQueue() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "stale-ui-save"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: storageDirectory.path))

        ScreenplayDraftSaveOutbox.resetStoredQueueForUITesting(at: storageDirectory)

        XCTAssertFalse(FileManager.default.fileExists(atPath: storageDirectory.path))
    }

    private func makeEntry(
        id: String,
        draft: String = "Draft one",
        source: String = "studio_autosave",
        createdAt: TimeInterval = 100
    ) -> ScreenplayDraftSaveOutboxEntry {
        ScreenplayDraftSaveOutboxEntry(
            id: id,
            projectId: "project-1",
            ownerUserId: "user-1",
            draft: draft,
            title: "Feature",
            phase: "scene_draft",
            notes: "",
            source: source,
            studioWriteAnchors: [],
            screenplayBindings: [],
            baseVersionId: "server-v1",
            createdAt: createdAt,
            updatedAt: createdAt,
            status: .pending,
            retries: 0,
            nextAttemptAt: createdAt,
            lastError: ""
        )
    }

    private func replacingOwner(
        of entry: ScreenplayDraftSaveOutboxEntry,
        with ownerUserId: String
    ) -> ScreenplayDraftSaveOutboxEntry {
        ScreenplayDraftSaveOutboxEntry(
            id: entry.id,
            projectId: entry.projectId,
            ownerUserId: ownerUserId,
            draft: entry.draft,
            title: entry.title,
            phase: entry.phase,
            notes: entry.notes,
            source: entry.source,
            studioWriteAnchors: entry.studioWriteAnchors,
            screenplayBindings: entry.screenplayBindings,
            baseVersionId: entry.baseVersionId,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            status: entry.status,
            retries: entry.retries,
            nextAttemptAt: entry.nextAttemptAt,
            lastError: entry.lastError
        )
    }
}
