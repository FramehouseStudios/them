import XCTest
@testable import them

final class ScreenplayDraftSaveOutboxTests: XCTestCase {
    @MainActor
    func testProjectHydrationRestoresQueuedWriterBeforeRemoteDraft() async throws {
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let local = "\r\nWriter words cafe\u{0301}\r\n \t "
        let entry = replacingOwner(of: makeEntry(id: "queued", draft: local), with: ScreenplayStudioAuthContext.current().userID)
        var queuedPayload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(entry)) as? [String: Any])
        queuedPayload["screenplayBindings"] = [["draftSceneId": "queued-scene", "outlineSceneId": "writer-outline", "updatedAt": 100]]
        queuedPayload["studioWriteAnchors"] = [["writeId": "queued-writer-annotation", "anchorLine": 4]]
        let queued = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: queuedPayload))
        try await queue.enqueue(queued)
        let suite = "them.queued-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery, draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "remote", "versions": [["id": "remote", "draft": "Collaborator words"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertTrue(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(local.utf8))
        XCTAssertTrue(model.hasUnsavedDraftChanges)
        XCTAssertNotNil(model.conflictState)
        XCTAssertEqual(model.screenplayBindings, queued.screenplayBindings, "Protected local words lost their queued binding metadata")
        XCTAssertEqual(model.studioWriteAnchors, queued.studioWriteAnchors, "Server hydration replaced unresolved local annotations")
        let retained = try await queue.entriesForTesting()
        XCTAssertEqual(retained.map { Data($0.draft.utf8) }, [Data(local.utf8)])
    }

    @MainActor
    func testQueuedOriginCannotRelabelNewerPersistedWordsWhenBootstrapFlagsAreClean() async throws {
        let owner = ScreenplayStudioAuthContext.current()
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var entry = replacingOwner(of: makeEntry(id: "older-queued", draft: "Earlier queued writer words"), with: owner.userID)
        entry.deliveryOrigin = .init(documentID: "earlier-document", backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await queue.enqueue(entry)
        let suite = "them.newer-origin.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "newer-origin"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = entry.projectId
        let newer = "Newer persisted cafe\u{0301} words. \r\n"
        model.applyServerDraft(newer, versionId: "newer-local-base")
        let bridge = ScreenplayLiveDraftBridge.shared
        let origin = bridge.draftOrigin.documentID
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: JSONSerialization.data(withJSONObject: ["id": entry.projectId, "title": entry.title,
                "versions": [["id": entry.baseVersionId, "draft": "Earlier server baseline"]]]))
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertFalse(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(newer.utf8))
        XCTAssertEqual(Data(bridge.draftText.utf8), Data(newer.utf8))
        XCTAssertEqual(bridge.draftOrigin.documentID, origin)
        let kept = try await queue.entriesForTesting()
        XCTAssertEqual(kept.map(\.id), [entry.id])
    }

    @MainActor
    func testVersionlessProjectHydrationClearsThePreviousProjectsMetadata() async throws {
        let suite = "them.empty-project-metadata.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "empty-project"),
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "old-project"
        model.applyServerDraft("Earlier saved words", versionId: "old-version")
        model.screenplayBindings = [try JSONDecoder().decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"old-scene\"}".utf8))]
        model.selectedProjectID = "new-versionless-project"
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self,
            from: Data("{\"id\":\"new-versionless-project\",\"title\":\"New\"}".utf8))
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: project)
        XCTAssertTrue(applied)
        XCTAssertTrue(model.fountainDraft.isEmpty)
        XCTAssertTrue(model.screenplayBindings.isEmpty, "A new empty project inherited another project's binding metadata")
        XCTAssertTrue(model.studioWriteAnchors.isEmpty)
    }

    @MainActor
    func testMissingDeclaredHeadCannotHydrateAnOlderVersionOverWriterPage() async throws {
        let suite = "them.missing-head.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let recovery = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: recovery,
            draftSaveOutbox: ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let writer = "Writer cafe\u{0301} exact words.  \r\n"
        model.applyServerDraft(writer, versionId: "local-base")
        let owner = ScreenplayStudioAuthContext.current().userID
        recovery.save(ownerUserId: owner, projectId: "project-1", draft: writer,
            baseVersionId: "local-base", dirty: true)
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "activeVersionId": "missing-current", "lastVersionId": "old", "versionCount": 2,
            "versions": [["id": "old", "draft": "Older historical text"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from:
            try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertFalse(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertEqual((recovery.payloads(ownerUserId: owner)["project-1"]?["draft"] as? String)
            .map { Data($0.utf8) }, Data(writer.utf8))
        XCTAssertFalse(model.errorText.isEmpty)
    }

    @MainActor
    func testUnreadableQueueCannotReplaceCurrentPageDuringHydration() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let file = storageDirectory.appendingPathComponent("queue.json")
        let corrupt = Data("{not-json".utf8)
        try corrupt.write(to: file)
        let queue = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let suite = "them.corrupt-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"), draftSaveOutbox: queue)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-1"
        let writer = "My exact cafe\u{0301} words. \r\n"
        model.applyServerDraft(writer, versionId: "base")
        let data = try JSONSerialization.data(withJSONObject: ["id": "project-1", "title": "Test",
            "versions": [["id": "remote", "draft": "Remote words"]]])
        let applied = await model.hydrateDraftRestoringQueuedSaves(from: try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data))
        XCTAssertFalse(applied)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(writer.utf8))
        XCTAssertEqual(model.errorText, ScreenplayDraftSaveRecoveryPresentationPolicy.unreadableQueueError)
        XCTAssertEqual(try Data(contentsOf: file), corrupt)
    }

    private var storageDirectory: URL!

    override func setUp() {
        super.setUp()
        storageDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("ScreenplayDraftSaveOutboxTests-(UUID().uuidString)", isDirectory: true)
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

    @MainActor
    func testRequestCreationTimeSurvivesMaterializationRebaseAndRelaunch() {
        let context = ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 1)
        let request = ScreenplayStudioViewModel.DraftSaveRequest(id: "request", createdAt: 123,
            projectId: "project", ownerUserId: "writer", draft: "Writer words", title: "Title",
            phase: "scene_draft", source: "studio_manual", notes: "", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "base", authContext: context)
        XCTAssertEqual(request.outboxEntry.createdAt, 123)
        XCTAssertEqual(request.outboxEntry.createdAt, 123)
        XCTAssertEqual(request.rebased(on: "new-base").outboxEntry.createdAt, 123)
        let restored = ScreenplayStudioViewModel.DraftSaveRequest(entry: request.outboxEntry, authContext: context)
        XCTAssertEqual(restored.outboxEntry.createdAt, 123)
        XCTAssertEqual(restored.rebased(on: "later").outboxEntry.createdAt, 123)
    }

    func testFailedQueueClaimKeepsTheSavePendingInMemoryAndOnDisk() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "claim-persist-failure")
        try await store.enqueue(entry)
        let backup = storageDirectory.appendingPathExtension("saved")
        defer { try? FileManager.default.removeItem(at: backup) }
        try FileManager.default.moveItem(at: storageDirectory, to: backup)
        XCTAssertTrue(FileManager.default.createFile(atPath: storageDirectory.path, contents: Data()))
        do {
            _ = try await store.beginNext(projectId: entry.projectId, ownerUserId: entry.ownerUserId, force: true)
            XCTFail("Claim should fail when the queue directory cannot be written")
        } catch { }
        let inMemory = try await store.entriesForTesting()
        XCTAssertEqual(inMemory.first?.status, .pending)
        let restarted = ScreenplayDraftSaveOutbox(storageDirectory: backup)
        let onDisk = try await restarted.entriesForTesting()
        XCTAssertEqual(onDisk.first?.status, .pending)
        XCTAssertEqual(onDisk.first?.id, entry.id)
    }

    func testQueueDeduplicatesSameSaveIdentifier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "save-once")

        try await store.enqueue(entry)
        try await store.enqueue(entry)

        let stored = try await store.entriesForTesting()
        XCTAssertEqual(stored.map(\.id), ["save-once"])
    }

    func testQueuePreservesByteDistinctDraftsAcrossRestartAndAcknowledgement() async throws {
        let raw = "\r\nINT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} waits.\r\n \t "
        let drafts = [raw, raw + " ", raw.replacingOccurrences(of: "\r\n", with: "\n"),
                      raw.precomposedStringWithCanonicalMapping]
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "raw-0", draft: raw))
        try await store.markInflight(id: "raw-0")
        for index in 1..<drafts.count {
            try await store.enqueue(makeEntry(id: "raw-\(index)", draft: drafts[index],
                                              createdAt: TimeInterval(100 + index)))
        }
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restored = try await relaunched.entriesForTesting()
        XCTAssertEqual(restored.count, drafts.count, "Normalized equality must not discard later writer bytes.")
        XCTAssertEqual(restored.map { Data($0.draft.utf8) }, drafts.map { Data($0.utf8) })
        for index in drafts.indices {
            let next = try await relaunched.beginNext(projectId: "project-1", ownerUserId: "user-1", force: true)
            XCTAssertEqual(next?.id, "raw-\(index)")
            XCTAssertEqual(next?.baseVersionId, index == 0 ? "server-v1" : "ack-\(index - 1)")
            XCTAssertEqual(next.map { Data($0.draft.utf8) }, Data(drafts[index].utf8))
            guard let next else { return }
            try await relaunched.markSucceeded(id: next.id, serverVersionId: "ack-\(index)")
        }
        let remaining = try await relaunched.entriesForTesting()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testQueueRejectsSameIdentifierWithDifferentRawBytes() async throws {
        let raw = "\r\nINT. CAFE - NIGHT\r\n\r\nA cafe\u{0301} waits.\r\n \t "
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(makeEntry(id: "raw-once", draft: raw))
        for changed in [raw + " ", raw.replacingOccurrences(of: "\r\n", with: "\n"),
                        raw.precomposedStringWithCanonicalMapping] {
            do {
                try await store.enqueue(makeEntry(id: "raw-once", draft: changed))
                XCTFail("A request ID cannot acknowledge different draft bytes.")
            } catch BackendMemoryAPIError.server(let status, let message) {
                XCTAssertEqual(status, 409)
                XCTAssertEqual(message, "screenplay_save_id_reused")
            }
        }
        try await store.enqueue(makeEntry(id: "same-bytes-other-id", draft: raw))
        let retained = try await store.entriesForTesting()
        XCTAssertEqual(retained.count, 1, "An exactly identical queued draft still coalesces.")
        XCTAssertEqual(retained.first.map { Data($0.draft.utf8) }, Data(raw.utf8))
    }

    func testCoalescedDeliveryUsesTheDurableRequestIdentifierAcrossRestart() async throws {
        let original = makeEntry(id: "durable-request")
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(original)
        let restarted = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let duplicate = makeEntry(id: "fresh-caller-request")
        let delivery = try await restarted.enqueueForDelivery(duplicate)
        XCTAssertEqual(delivery.id, original.id)
        XCTAssertEqual(delivery.baseVersionId, original.baseVersionId)
        XCTAssertEqual(Data(delivery.draft.utf8), Data(original.draft.utf8))
        try await restarted.markInflight(id: delivery.id)
        try await restarted.markSucceeded(id: delivery.id, serverVersionId: "confirmed-version")
        let remaining = try await restarted.entriesForTesting()
        XCTAssertTrue(remaining.isEmpty, "An acknowledged coalesced request must retire its durable row")
    }

    func testIdenticalTextDoesNotCoalesceDistinctWriterIntentOrBindings() async throws {
        let original = makeEntry(id: "original-intent")
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(original)
        let changes: [[String: Any]] = [
            ["title": "Retitled"], ["phase": "rewrite"],
            ["source": "studio_conflict_resolve"], ["notes": "Explicit writer choice"],
            ["studioWriteAnchors": [["writeId": "new-anchor", "anchorLine": 4]]],
            ["screenplayBindings": [["draftSceneId": "new-scene", "outlineSceneId": "beat-2"]]]
        ]
        for (index, patch) in changes.enumerated() {
            var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
            payload["id"] = "distinct-intent-\(index)"
            for (key, value) in patch { payload[key] = value }
            let changed = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
                from: JSONSerialization.data(withJSONObject: payload))
            let retained = try await store.enqueueForDelivery(changed)
            XCTAssertEqual(retained, changed, "Canonical delivery silently replaced writer intent: \(patch.keys)")
        }
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, changes.count + 1)
    }

    func testPassiveDeliveryKeepsTheExistingExplicitIntentAndRequestIdentifier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(makeEntry(id: "explicit-save"))) as? [String: Any])
        payload["source"] = "studio_manual"; payload["notes"] = "Writer checkpoint"
        payload["deliveryOrigin"] = ["documentID": "exact-document", "backendURL": "https://save.test"]
        let explicit = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        try await store.enqueue(explicit)
        var passive = makeEntry(id: "passive-repeat"); passive.deliveryOrigin = explicit.deliveryOrigin
        guard case .deliver(let delivery) = try await store.beginDelivery(passive) else {
            return XCTFail("The pending explicit request was not claimed")
        }
        XCTAssertEqual(delivery.id, explicit.id)
        XCTAssertEqual(delivery.source, "studio_manual")
        XCTAssertEqual(delivery.notes, "Writer checkpoint")
        XCTAssertEqual(delivery.status, .inflight)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, 1, "Housekeeping manufactured a second explicit save")
    }

    func testJoiningAnInflightSaveDoesNotGrantASecondDelivery() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "claimed-once")
        guard case .deliver = try await store.beginDelivery(entry) else { return XCTFail("First claim failed") }
        guard case .alreadyInflight(let retained) = try await store.beginDelivery(entry) else {
            return XCTFail("An already inflight request was granted a second delivery")
        }
        XCTAssertEqual(retained.id, entry.id)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .inflight)
    }

    func testDeliveryCannotReactivateAParkedRequest() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "needs-choice")
        try await store.enqueue(entry)
        try await store.markParked(id: entry.id, error: "Requires a writer choice")
        guard case .parked(let retained) = try await store.beginDelivery(entry) else {
            return XCTFail("A parked conflict was silently retried")
        }
        XCTAssertEqual(retained.id, entry.id)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.map(\.status), [.parked])
        XCTAssertEqual(rows.map(\.draft), [entry.draft])
    }

    func testPassiveAbsorptionRequiresTheFreshAcknowledgementsExactTargetAndBase() {
        var passive = makeEntry(id: "passive-after-ack")
        passive.deliveryOrigin = .init(documentID: "exact-document", backendURL: URL(string: "https://save.test")!)
        let saved = passive
        XCTAssertTrue(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        var projection = try! XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(passive)) as? [String: Any])
        projection["screenplayBindings"] = [["draftSceneId": "restored-projection"]]
        let projected = try! JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: projection))
        XCTAssertFalse(projected.hasSameTarget(as: saved), "Queue equality must still preserve different metadata")
        XCTAssertTrue(projected.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"),
            "Restoring derived metadata must not create another screenplay version after a fresh same-flight acknowledgement")
        projection["source"] = "studio_snapshot"
        let explicit = try! JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: projection))
        XCTAssertFalse(explicit.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.baseVersionId = "fresh-ack"
        XCTAssertTrue(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.baseVersionId = "other-captured-base"
        XCTAssertFalse(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.baseVersionId = saved.baseVersionId
        passive.deliveryOrigin = .init(documentID: "another-document", backendURL: URL(string: "https://save.test")!)
        XCTAssertFalse(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
        passive.deliveryOrigin = nil
        XCTAssertFalse(passive.isSatisfiedByAcknowledgement(of: saved, versionID: "fresh-ack"))
    }

    func testFailureAbsorptionNeedsAnExactRowActuallyStoredOnDisk() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let entry = makeEntry(id: "durable-before-failure")
        let absent = try await store.hasDurableTarget(id: entry.id, matching: entry)
        XCTAssertFalse(absent)
        try await store.enqueue(entry)
        let present = try await store.hasDurableTarget(id: entry.id, matching: entry)
        XCTAssertTrue(present)
        let different = makeEntry(id: "different", draft: entry.draft + " ")
        let mismatch = try await store.hasDurableTarget(id: entry.id, matching: different)
        XCTAssertFalse(mismatch)
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
            source: "studio_autosave",
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
