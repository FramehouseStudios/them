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

    func testPreLineageManifestDecodesSavesAndRelaunchesWithEmptyLineage() async throws {
        let legacyEntry = makeEntry(id: "pre-lineage")
        let priorShape = try JSONDecoder().decode(PriorDraftSaveOutboxEntry.self,
            from: JSONEncoder().encode(legacyEntry))
        let legacyData = try JSONEncoder().encode([priorShape])
        let legacyObject = try XCTUnwrap(JSONSerialization.jsonObject(with: legacyData) as? [[String: Any]])
        XCTAssertNil(legacyObject.first?["supersededConflictRequests"])
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        try legacyData.write(to: storageDirectory.appendingPathComponent("queue.json"), options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restoredLegacy = try await store.entriesForTesting()
        XCTAssertEqual(restoredLegacy.map(\.id), [legacyEntry.id])
        XCTAssertEqual(restoredLegacy.first?.supersededConflictRequests, [])

        let newEntry = makeEntry(id: "post-lineage", draft: "Later draft", createdAt: 101)
        try await store.enqueue(newEntry)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let saved = try await relaunched.entriesForTesting()
        XCTAssertEqual(saved.map(\.id), [legacyEntry.id, newEntry.id])
        XCTAssertTrue(saved.allSatisfy { $0.supersededConflictRequests.isEmpty })
    }

    func testPresentNullConflictLineageFailsClosedWithoutRewritingManifest() async throws {
        let entry = makeEntry(id: "null-lineage")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(entry)) as? [String: Any])
        payload["supersededConflictRequests"] = NSNull()
        let malformed = try JSONSerialization.data(withJSONObject: [payload], options: [.sortedKeys])
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try malformed.write(to: manifestURL, options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let firstRead = await store.snapshot(ownerUserId: entry.ownerUserId)
        let secondRead = await store.snapshot(ownerUserId: entry.ownerUserId)

        XCTAssertFalse(firstRead.lastError.isEmpty)
        XCTAssertFalse(secondRead.lastError.isEmpty)
        XCTAssertEqual(try Data(contentsOf: manifestURL), malformed)
    }

    func testLineageManifestRejectsArrayOnlyDowngradeAndRestoresExactRetry() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeEntry(id: "parked-conflict", draft: "Exact local words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        var resolution = makeEntry(id: "keep-mine", draft: conflict.draft, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        resolution.supersededConflictRequests = try await store.conflictResolutionReferences(for: conflict)
        try await store.enqueue(resolution)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let protectedBytes = try Data(contentsOf: manifestURL)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: protectedBytes) as? [String: Any])

        XCTAssertEqual(object["schemaVersion"] as? Int, 2)
        XCTAssertEqual((object["entries"] as? [[String: Any]])?.count, 2)
        XCTAssertThrowsError(try JSONDecoder().decode([PriorDraftSaveOutboxEntry].self,
            from: protectedBytes), "An array-only build must fail before it can drop lineage")
        XCTAssertEqual(try Data(contentsOf: manifestURL), protectedBytes)
        let isDurable = try await store.hasDurableTarget(id: resolution.id, matching: resolution)
        XCTAssertTrue(isDurable, "Durable readback must understand the protected envelope")

        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let next = try await relaunched.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)
        XCTAssertEqual(next?.id, resolution.id)
        XCTAssertEqual(next?.supersededConflictRequests, resolution.supersededConflictRequests)
        XCTAssertNotNil(try JSONSerialization.jsonObject(
            with: Data(contentsOf: manifestURL)) as? [String: Any])
    }

    func testLineageEnvelopeTransitionWriteFailureRollsBackToExactLegacyArray() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 4)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let conflict = makeEntry(id: "legacy-parked", draft: "Exact local words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        var resolution = makeEntry(id: "protected-resolution", draft: conflict.draft, createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        resolution.supersededConflictRequests = try await store.conflictResolutionReferences(for: conflict)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let legacyBytes = try Data(contentsOf: manifestURL)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: legacyBytes) as? [[String: Any]])
        try Data().write(to: failMarker)

        do {
            try await store.enqueue(resolution)
            XCTFail("A failed envelope write reported a durable resolution")
        } catch {}

        XCTAssertEqual(try Data(contentsOf: manifestURL), legacyBytes)
        let retained = try await store.entriesForTesting()
        XCTAssertEqual(retained.map(\.id), [conflict.id])
    }

    func testUnknownOrMalformedLineageManifestFailsClosedWithoutRewrite() async throws {
        let entry = makeEntry(id: "protected")
        let encodedEntry = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(entry)) as? [String: Any])
        let payloads: [[String: Any]] = [
            ["schemaVersion": 99, "entries": [encodedEntry]],
            ["schemaVersion": 2, "entries": "not-an-array"],
            ["schemaVersion": 2, "entries": [encodedEntry]],
        ]

        for (index, payload) in payloads.enumerated() {
            let directory = storageDirectory.appendingPathComponent("invalid-\(index)", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let manifestURL = directory.appendingPathComponent("queue.json")
            let original = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
            try original.write(to: manifestURL, options: .atomic)
            let store = ScreenplayDraftSaveOutbox(storageDirectory: directory)

            let first = await store.snapshot(ownerUserId: entry.ownerUserId)
            let second = await store.snapshot(ownerUserId: entry.ownerUserId)

            XCTAssertFalse(first.lastError.isEmpty)
            XCTAssertFalse(second.lastError.isEmpty)
            do {
                _ = try await store.hasDurableTarget(id: entry.id, matching: entry)
                XCTFail("Malformed or unknown storage was accepted by durable readback")
            } catch {}
            XCTAssertEqual(try Data(contentsOf: manifestURL), original)
        }
    }

    @MainActor
    func testRequestCreationTimeSurvivesMaterializationRebaseAndRelaunch() {
        let context = ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 1)
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 0)
        let reference = ScreenplayDraftConflictRequestReference(requestID: "older", projectId: "project",
            ownerUserId: "writer", deliveryOrigin: nil, requestAuthority: nil,
            requestDigest: String(repeating: "a", count: 64))
        let request = ScreenplayStudioViewModel.DraftSaveRequest(id: "request", createdAt: 123,
            projectId: "project", ownerUserId: "writer", draft: "Writer words", title: "Title",
            phase: "scene_draft", source: "studio_manual", notes: "", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "base", authContext: context, requestAuthority: authority,
            supersededConflictRequests: [reference])
        XCTAssertEqual(request.outboxEntry.supersededConflictRequests, [reference])
        XCTAssertEqual(request.rebased(on: "new-base").outboxEntry.supersededConflictRequests, [reference])
        XCTAssertEqual(ScreenplayStudioViewModel.DraftSaveRequest(entry: request.outboxEntry,
            authContext: context).supersededConflictRequests, [reference])
        XCTAssertEqual(request.outboxEntry.requestAuthority, authority)
        XCTAssertEqual(request.rebased(on: "new-base").outboxEntry.requestAuthority, authority)
        XCTAssertEqual(ScreenplayStudioViewModel.DraftSaveRequest(entry: request.outboxEntry,
            authContext: context).requestAuthority, authority)
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

    func testSameIDRejectsByteDistinctMetadataButKeepsDurableRebase() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "same-id", draft: "Same words")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        payload["notes"] = "caf\u{00e9}"
        let first = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        try await store.enqueue(first)
        payload["notes"] = "cafe\u{0301}"
        let changed = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        do {
            _ = try await store.enqueueForDelivery(changed)
            XCTFail("A reused ID must reject byte-distinct notes")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }
        var staleBase = first
        staleBase.baseVersionId = "older-client-base"
        let retained = try await store.enqueueForDelivery(staleBase)
        XCTAssertEqual(retained.baseVersionId, first.baseVersionId)
        XCTAssertEqual(Data(retained.notes.utf8), Data(first.notes.utf8))
    }

    func testDifferentIDsDoNotCoalesceByteDistinctMetadata() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "first", draft: "Same words")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        payload["title"] = "caf\u{00e9}"
        let first = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        try await store.enqueue(first)
        payload["id"] = "second"
        payload["title"] = "cafe\u{0301}"
        let second = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        let retained = try await store.enqueueForDelivery(second)
        XCTAssertEqual(retained.id, second.id)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(Set(rows.map(\.id)), Set([first.id, second.id]))
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

    func testLoadServerRetiresOnlyExactSelectedRequestsAndKeepsUnrelatedOlderRows() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let lineage = UUID()
        let selected = makeEntry(id: "selected", draft: "Selected words", createdAt: 100,
            origin: origin, authority: .init(id: lineage, generation: 4))
        let unrelatedPending = makeEntry(id: "unrelated-pending", draft: "Distinct pending words", createdAt: 90,
            origin: origin, authority: .init(id: lineage, generation: 3))
        let unrelatedInflight = makeEntry(id: "unrelated-inflight", draft: "Distinct inflight words", createdAt: 80,
            origin: origin, authority: .init(id: lineage, generation: 2))
        try await store.enqueue(selected)
        try await store.enqueue(unrelatedPending)
        try await store.enqueue(unrelatedInflight)
        try await store.markInflight(id: unrelatedInflight.id)
        _ = try await store.retainConflict(selected)

        let selection = try await store.captureLoadServerSelection(
            projectId: selected.projectId,
            ownerUserId: selected.ownerUserId,
            deliveryOrigin: origin,
            explicitRequests: [selected]
        )
        let resolution = try await store.resolveLoadServerSelection(selection)

        XCTAssertEqual(selection.requests.map(\.id), [selected.id])
        XCTAssertEqual(resolution.retiredRequestIDs, [selected.id])
        let remaining = try await store.entriesForTesting()
        XCTAssertEqual(Set(remaining.map(\.id)), Set([unrelatedPending.id, unrelatedInflight.id]))
        XCTAssertEqual(remaining.first(where: { $0.id == unrelatedPending.id })?.status, .pending)
        XCTAssertEqual(remaining.first(where: { $0.id == unrelatedInflight.id })?.status, .inflight)
        let markers = try await store.retirementMarkersForTesting()
        XCTAssertEqual(markers.map(\.id), [selected.id])
    }

    func testLoadServerDoesNotInferConsentForAnotherParkedDraftInTheSameDocument() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "shared-document",
            backendURL: URL(string: "https://save.test")!
        )
        let lineage = UUID()
        let selected = makeEntry(id: "discard-this", draft: "Writer explicitly discarded these words",
            createdAt: 100, origin: origin, authority: .init(id: lineage, generation: 1))
        let preserved = makeEntry(id: "preserve-this", draft: "Different writer words must remain",
            createdAt: 101, origin: origin, authority: .init(id: lineage, generation: 2))
        try await store.enqueue(selected)
        try await store.enqueue(preserved)
        _ = try await store.retainConflict(projectId: selected.projectId,
            ownerUserId: selected.ownerUserId, deliveryOrigin: origin)

        let parkedBeforeChoice = try await store.entriesForTesting()
        XCTAssertEqual(Set(parkedBeforeChoice.map(\.id)), Set([selected.id, preserved.id]))
        XCTAssertTrue(parkedBeforeChoice.allSatisfy { $0.status == .parked })
        let selection = try await store.captureLoadServerSelection(projectId: selected.projectId,
            ownerUserId: selected.ownerUserId, deliveryOrigin: origin, explicitRequests: [selected])
        let resolution = try await store.resolveLoadServerSelection(selection)

        XCTAssertEqual(resolution.retiredRequestIDs, [selected.id])
        let afterChoice = try await store.entriesForTesting()
        XCTAssertEqual(afterChoice.map(\.id), [preserved.id])
        XCTAssertEqual(afterChoice.first?.status, .parked)
        XCTAssertEqual(afterChoice.first.map { Data($0.draft.utf8) }, Data(preserved.draft.utf8))

        try await store.markRetryable(id: preserved.id, error: "Writer chose Keep Mine")
        guard case .deliver(let deliverable)? = try await store.beginDeliveryUnlessRetiredByLoadServer(preserved) else {
            return XCTFail("The unselected parked draft was fenced by another request's Load Server choice")
        }
        XCTAssertEqual(deliverable.id, preserved.id)
        XCTAssertEqual(Data(deliverable.draft.utf8), Data(preserved.draft.utf8))
    }

    func testRetiredRequestUsesStableIdentityNotCreatedAtAndSurvivesRelaunch() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 7)
        let original = makeEntry(id: "late-request", draft: "Exact late words", createdAt: 100,
            origin: origin, authority: authority)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(
            projectId: original.projectId,
            ownerUserId: original.ownerUserId,
            deliveryOrigin: origin,
            explicitRequests: [original]
        )
        _ = try await store.resolveLoadServerSelection(selection)

        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rematerialized = makeEntry(id: original.id, draft: original.draft, createdAt: 999,
            origin: origin, authority: authority)
        let rejected = try await relaunched.beginDeliveryUnlessRetiredByLoadServer(rematerialized)
        XCTAssertNil(rejected, "A reconstructed wall clock must not revive an exact retired request")
        let queued = try await relaunched.enqueueUnlessRetiredByLoadServer(rematerialized)
        XCTAssertFalse(queued, "A retired request must not be reported as queued")
        let afterRejection = try await relaunched.entriesForTesting()
        XCTAssertTrue(afterRejection.isEmpty, "A retired request must not reappear as active work")
        let independent = makeEntry(id: "independent", draft: "Independent words", createdAt: 50,
            origin: origin, authority: authority)
        guard case .deliver(let admitted)? = try await relaunched.beginDeliveryUnlessRetiredByLoadServer(independent) else {
            return XCTFail("A different request ID was swept by another request's authority")
        }
        XCTAssertEqual(admitted.id, independent.id)
    }

    func testSameRequestIDWithDifferentAuthorityIsRejectedNotSilentlyRetired() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let original = makeEntry(id: "stable-id", origin: origin,
            authority: .init(id: UUID(), generation: 1))
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: original.projectId,
            ownerUserId: original.ownerUserId, deliveryOrigin: origin, explicitRequests: [original])
        _ = try await store.resolveLoadServerSelection(selection)
        let reused = makeEntry(id: original.id, origin: origin,
            authority: .init(id: UUID(), generation: 1))

        do {
            _ = try await store.beginDeliveryUnlessRetiredByLoadServer(reused)
            XCTFail("A reused ID with different authority was silently treated as the retired request")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }
    }

    func testLoadServerResolutionWriteFailureKeepsRowsAndDoesNotInstallFence() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 1)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let request = makeEntry(id: "kept", origin: origin,
            authority: .init(id: UUID(), generation: 1))
        try await store.enqueue(request)
        _ = try await store.retainConflict(request)
        let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
            ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let before = try Data(contentsOf: manifestURL)
        try Data().write(to: failMarker)

        do {
            _ = try await store.resolveLoadServerSelection(selection)
            XCTFail("A failed atomic write reported a durable Load Server resolution")
        } catch {
            XCTAssertFalse(error.localizedDescription.isEmpty)
        }
        try FileManager.default.removeItem(at: failMarker)
        XCTAssertEqual(try Data(contentsOf: manifestURL), before)
        let retainedRows = try await store.entriesForTesting()
        let retainedMarkers = try await store.retirementMarkersForTesting()
        XCTAssertEqual(retainedRows.map(\.id), [request.id])
        XCTAssertTrue(retainedMarkers.isEmpty)
    }

    func testArrayOnlyDowngradeMarkerFailsClosedAndSurvivesPriorNormalCleanup() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let request = makeEntry(id: "retired-id", draft: "Retired words", origin: origin,
            authority: .init(id: UUID(), generation: 12))
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
            ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
        _ = try await store.resolveLoadServerSelection(selection)
        let data = try Data(contentsOf: storageDirectory.appendingPathComponent("queue.json"))
        var priorRows = try JSONDecoder().decode([PriorDraftSaveOutboxEntry].self, from: data)
        let marker = try XCTUnwrap(priorRows.first(where: { $0.id == request.id }))

        XCTAssertEqual(marker.status, .parked)
        XCTAssertTrue(marker.draft.isEmpty)
        XCTAssertTrue(marker.title.isEmpty)
        XCTAssertTrue(marker.phase.isEmpty)
        XCTAssertTrue(marker.studioWriteAnchors.isEmpty)
        XCTAssertTrue(marker.screenplayBindings.isEmpty)
        XCTAssertTrue(marker.baseVersionId.isEmpty)
        XCTAssertNotEqual(marker.projectId, request.projectId)
        XCTAssertNotEqual(marker.ownerUserId, request.ownerUserId)
        XCTAssertNotEqual(marker.deliveryOrigin, request.deliveryOrigin)
        XCTAssertEqual(priorRows.filter { $0.status == .parked }.count, 1,
            "The prior global snapshot reports one conservative parked item after downgrade")
        XCTAssertTrue(priorRows.filter { $0.ownerUserId == request.ownerUserId && $0.status == .parked }.isEmpty)

        let ordinarySuccess = makeEntry(id: "ordinary-success", draft: "Other saved words", createdAt: 200,
            origin: origin, authority: .init(id: UUID(), generation: 13))
        let priorOrdinarySuccess = try JSONDecoder().decode(PriorDraftSaveOutboxEntry.self,
            from: JSONEncoder().encode(ordinarySuccess))
        priorRows.append(priorOrdinarySuccess)
        let priorBeginNextHead = priorRows.first { row in
            row.projectId == request.projectId && row.ownerUserId == request.ownerUserId &&
                row.initialization == nil
        }
        XCTAssertEqual(priorBeginNextHead?.id, ordinarySuccess.id,
            "The sentinel marker must not block the prior app's owner/project drain")
        let completedIndex = try XCTUnwrap(priorRows.firstIndex(where: { $0.id == ordinarySuccess.id }))
        let priorCompleted = priorRows.remove(at: completedIndex)
        priorRows.removeAll { row in
            row.projectId == priorCompleted.projectId &&
                row.ownerUserId == priorCompleted.ownerUserId &&
                row.deliveryOrigin == priorCompleted.deliveryOrigin && row.status == .parked &&
                row.createdAt <= priorCompleted.createdAt
        }
        XCTAssertNotNil(priorRows.first(where: { $0.id == request.id }),
            "The prior markSucceeded cleanup would remove the downgrade fence")
        priorRows.removeAll { $0.projectId == request.projectId && $0.ownerUserId == request.ownerUserId }
        XCTAssertNotNil(priorRows.first(where: { $0.id == request.id }),
            "The prior project removeAll would remove the sentinel-scoped fence")
        XCTAssertFalse(marker.projectId == request.projectId && marker.ownerUserId == request.ownerUserId &&
            marker.deliveryOrigin == request.deliveryOrigin && marker.draft.utf8.elementsEqual(request.draft.utf8),
            "The prior same-ID admission guard must fail closed on the sentinel marker")

        var priorRetriedMarker = marker
        priorRetriedMarker.status = .pending
        priorRetriedMarker.lastError = "Interrupted while saving."
        try JSONEncoder().encode([priorRetriedMarker]).write(
            to: storageDirectory.appendingPathComponent("queue.json"), options: .atomic)
        let upgradedAgain = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let stillRejected = try await upgradedAgain.beginDeliveryUnlessRetiredByLoadServer(request)
        let normalizedMarkers = try await upgradedAgain.retirementMarkersForTesting()
        XCTAssertNil(stillRejected)
        XCTAssertEqual(normalizedMarkers.map(\.status), [.parked],
            "A prior retry mutation must not erase the fence when the new app returns")
    }

    func testRetirementMarkerKeepsOnlyScopeAuthorityAndCanonicalDigest() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-private",
            backendURL: URL(string: "https://save.test")!
        )
        let privateDraft = "PRIVATE RETIRED WORDS\r\nCafe\u{0301}\t"
        let request = makeEntry(id: "privacy-fence", draft: privateDraft, origin: origin,
            authority: .init(id: UUID(), generation: 21))
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
            ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
        _ = try await store.resolveLoadServerSelection(selection)

        let privacyMarkers = try await store.retirementMarkersForTesting()
        let marker = try XCTUnwrap(privacyMarkers.first)
        XCTAssertTrue(marker.draft.isEmpty)
        XCTAssertTrue(marker.title.isEmpty)
        XCTAssertTrue(marker.phase.isEmpty)
        XCTAssertTrue(marker.studioWriteAnchors.isEmpty)
        XCTAssertTrue(marker.screenplayBindings.isEmpty)
        XCTAssertTrue(marker.baseVersionId.isEmpty)
        XCTAssertNil(marker.loadServerRetirement?.source)
        XCTAssertNil(marker.loadServerRetirement?.notes)
        XCTAssertEqual(marker.loadServerRetirement?.requestDigest?.count, 64)
        let manifest = try Data(contentsOf: storageDirectory.appendingPathComponent("queue.json"))
        XCTAssertNil(manifest.range(of: Data(privateDraft.utf8)),
            "A retirement fence must not retain screenplay bytes")
    }

    func testUnreleasedV1MarkerIsRewrittenWithoutItsScreenplayContent() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 22)
        let privateDraft = "LEGACY PRIVATE RETIRED WORDS"
        let request = makeEntry(id: "legacy-v1-marker", draft: privateDraft, origin: origin,
            authority: authority)
        let retirement = ScreenplayDraftLoadServerRetirement(
            requestID: request.id,
            projectId: request.projectId,
            ownerUserId: request.ownerUserId,
            deliveryOrigin: origin,
            requestAuthority: authority,
            requestDigest: nil,
            source: request.source,
            notes: request.notes
        )
        let retirementNotes = "load-server-retirement-v1:" +
            (try JSONEncoder().encode(retirement)).base64EncodedString()
        var marker = ScreenplayDraftSaveOutboxEntry(
            id: request.id,
            projectId: "load-server-retirement",
            ownerUserId: "load-server-retirement",
            draft: request.draft,
            title: request.title,
            phase: request.phase,
            notes: retirementNotes,
            source: "studio_load_server_retirement",
            studioWriteAnchors: request.studioWriteAnchors,
            screenplayBindings: request.screenplayBindings,
            baseVersionId: request.baseVersionId,
            createdAt: request.createdAt,
            updatedAt: request.updatedAt,
            status: .parked,
            retries: request.retries,
            nextAttemptAt: 0,
            lastError: "old marker"
        )
        marker.deliveryOrigin = .init(
            documentID: "retired-\(authority.id.uuidString.lowercased())-\(authority.generation)",
            backendURL: origin.backendURL
        )
        marker.requestAuthority = authority
        marker.loadServerRetirement = retirement
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        try JSONEncoder().encode([marker]).write(to: manifestURL, options: .atomic)

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let migratedMarkers = try await store.retirementMarkersForTesting()
        let migrated = try XCTUnwrap(migratedMarkers.first)
        XCTAssertTrue(migrated.draft.isEmpty)
        XCTAssertTrue(migrated.notes.hasPrefix("load-server-retirement-v2:"))
        XCTAssertNotNil(migrated.loadServerRetirement?.requestDigest)
        XCTAssertNil(try Data(contentsOf: manifestURL).range(of: Data(privateDraft.utf8)))
    }

    func testCanonicalDigestLengthPrefixesEveryExactField() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let authority = ScreenplayDraftSaveRequestAuthority(id: UUID(), generation: 30)
        let seed = makeEntry(id: "boundary-safe", draft: "Exact\r\nCafe\u{0301}", origin: origin,
            authority: authority)
        var originalPayload = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(seed)) as? [String: Any]
        )
        originalPayload["title"] = "ab"
        originalPayload["phase"] = "c"
        let original = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: originalPayload))
        var boundaryCollisionPayload = originalPayload
        boundaryCollisionPayload["title"] = "a"
        boundaryCollisionPayload["phase"] = "bc"
        let boundaryCollision = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: boundaryCollisionPayload))

        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selection = try await store.captureLoadServerSelection(projectId: original.projectId,
            ownerUserId: original.ownerUserId, deliveryOrigin: origin, explicitRequests: [original])
        _ = try await store.resolveLoadServerSelection(selection)
        do {
            _ = try await store.beginDeliveryUnlessRetiredByLoadServer(boundaryCollision)
            XCTFail("Adjacent field concatenation collided with the retired request")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }

        var byteDistinctPayload = originalPayload
        byteDistinctPayload["draft"] = original.draft.precomposedStringWithCanonicalMapping
        let byteDistinct = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: byteDistinctPayload))
        do {
            _ = try await store.beginDeliveryUnlessRetiredByLoadServer(byteDistinct)
            XCTFail("Unicode-normalized screenplay bytes collided with the retired request")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "screenplay_save_id_reused")
        }
    }

    func testExactConflictRetentionPreservesDistinctLegacyNilOriginDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let selected = makeEntry(id: "legacy-selected", draft: "First writer's words")
        let other = makeEntry(id: "legacy-other", draft: "Different writer's words")
        try await store.enqueue(selected)
        try await store.enqueue(other)
        let retained = try await store.retainConflict(selected)
        XCTAssertEqual(retained?.id, selected.id)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let rows = try await relaunched.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == selected.id })?.status, .parked)
        XCTAssertEqual(rows.first(where: { $0.id == other.id })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == other.id })?.draft, other.draft)

        let absent = makeEntry(id: "absent", draft: "Not on disk",
            authority: .init(id: UUID(), generation: 0))
        do {
            _ = try await relaunched.retainConflict(absent)
            XCTFail("A nil-origin request must not be manufactured as a conflict")
        } catch BackendMemoryAPIError.invalidResponse {}
        let after = try await relaunched.entriesForTesting()
        XCTAssertFalse(after.contains { $0.id == absent.id })
    }

    func testAcknowledgedSaveDoesNotDeleteOrRebaseDistinctParkedDrafts() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let origin = ScreenplayDraftSaveOrigin(documentID: "same-document", backendURL: URL(string: "https://save.test")!)
        let older = makeEntry(id: "parked-older", draft: "Older distinct draft", createdAt: 100, origin: origin)
        let completed = makeEntry(id: "acknowledged", draft: "Saved draft", createdAt: 101, origin: origin)
        let newer = makeEntry(id: "parked-newer", draft: "Newer distinct draft", createdAt: 102, origin: origin)
        try await store.enqueue(older)
        try await store.enqueue(completed)
        try await store.enqueue(newer)
        _ = try await store.retainConflict(older)
        _ = try await store.retainConflict(newer)
        try await store.markSucceeded(id: completed.id, serverVersionId: "new-server-head")
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let remaining = try await relaunched.parkedConflictEntries(projectId: older.projectId, ownerUserId: older.ownerUserId)
        XCTAssertEqual(Set(remaining.map(\.id)), Set([older.id, newer.id]))
        XCTAssertEqual(remaining.first(where: { $0.id == older.id })?.draft, older.draft)
        XCTAssertEqual(remaining.first(where: { $0.id == newer.id })?.draft, newer.draft)
        XCTAssertTrue(remaining.allSatisfy { $0.baseVersionId == "server-v1" })
    }

    func testConflictLineageReferencesExactLegacyNilOriginWithoutWriterContent() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let legacy = makeEntry(id: "legacy-nil-origin", draft: "Private exact writer words")
        try await store.enqueue(legacy)
        _ = try await store.retainConflict(legacy)

        let references = try await store.conflictResolutionReferences(for: legacy)

        let reference = try XCTUnwrap(references.first)
        XCTAssertEqual(reference.requestID, legacy.id)
        XCTAssertNil(reference.deliveryOrigin)
        XCTAssertNil(reference.requestAuthority)
        XCTAssertEqual(reference.requestDigest.count, 64)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(
            with: JSONEncoder().encode(reference)) as? [String: Any])
        XCTAssertNil(payload["draft"])
        XCTAssertNil(payload["title"])
        XCTAssertNil(payload["notes"])
        XCTAssertNil(payload["source"])
        XCTAssertFalse(String(data: try JSONEncoder().encode(reference), encoding: .utf8)?
            .contains(legacy.draft) == true)
    }

    func testDifferentConflictLineagesNeverCoalesce() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let first = makeEntry(id: "conflict-one", draft: "First private draft", createdAt: 100)
        let second = makeEntry(id: "conflict-two", draft: "Second private draft", createdAt: 101)
        for conflict in [first, second] {
            try await store.enqueue(conflict)
            _ = try await store.retainConflict(conflict)
        }
        let firstReferences = try await store.conflictResolutionReferences(for: first)
        let secondReferences = try await store.conflictResolutionReferences(for: second)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        var firstResolution = makeEntry(id: "resolution-one", draft: "Same replacement", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        firstResolution.supersededConflictRequests = firstReferences
        var secondResolution = makeEntry(id: "resolution-two", draft: "Same replacement", createdAt: 103,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        secondResolution.supersededConflictRequests = secondReferences

        let firstAdmitted = try await store.enqueueForDelivery(firstResolution)
        let secondAdmitted = try await store.enqueueForDelivery(secondResolution)
        XCTAssertEqual(firstAdmitted.id, firstResolution.id)
        XCTAssertEqual(secondAdmitted.id, secondResolution.id)
        let rows = try await store.entriesForTesting()
        XCTAssertTrue(rows.contains { $0.id == firstResolution.id })
        XCTAssertTrue(rows.contains { $0.id == secondResolution.id })
    }

    func testOnlyExactLinkedResolutionMayCrossItsParkedConflictBarrier() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeEntry(id: "parked", draft: "Original", createdAt: 100)
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        let references = try await store.conflictResolutionReferences(for: conflict)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        var resolution = makeEntry(id: "resolution", draft: "Replacement", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 3))
        resolution.supersededConflictRequests = references
        try await store.enqueue(resolution)
        try await store.enqueue(makeEntry(id: "later-unrelated", draft: "Later", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 4)))

        let next = try await store.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)
        XCTAssertEqual(next?.id, resolution.id)

        let blockedDirectory = storageDirectory.appendingPathComponent("unrelated-barrier", isDirectory: true)
        let blockedStore = ScreenplayDraftSaveOutbox(storageDirectory: blockedDirectory)
        let unrelatedConflict = makeEntry(id: "unrelated-conflict", draft: "Other", createdAt: 99)
        try await blockedStore.enqueue(unrelatedConflict)
        _ = try await blockedStore.retainConflict(unrelatedConflict)
        try await blockedStore.enqueue(resolution)
        let blocked = try await blockedStore.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)
        XCTAssertNil(blocked)
    }

    func testLinkedResolutionCannotSkipAnEarlierUnrelatedPendingEdit() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let conflict = makeEntry(id: "parked", draft: "Original", createdAt: 100)
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        let references = try await store.conflictResolutionReferences(for: conflict)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        try await store.enqueue(makeEntry(id: "unrelated-pending", draft: "Independent edit",
            createdAt: 101, origin: origin, authority: .init(id: UUID(), generation: 5)))
        var resolution = makeEntry(id: "resolution", draft: "Replacement", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 6))
        resolution.supersededConflictRequests = references
        try await store.enqueue(resolution)

        let next = try await store.beginNext(projectId: conflict.projectId,
            ownerUserId: conflict.ownerUserId, force: true)

        XCTAssertNil(next)
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.first(where: { $0.id == "unrelated-pending" })?.status, .pending)
        XCTAssertEqual(rows.first(where: { $0.id == resolution.id })?.status, .pending)
    }

    func testConfirmedConflictCompletionIsAtomicAndPreservesUnrelatedRows() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 3)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let conflict = makeEntry(id: "original", draft: "Original private words", createdAt: 100)
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        let references = try await store.conflictResolutionReferences(for: conflict)
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        var resolution = makeEntry(id: "resolution", draft: "Kept writer words", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 5))
        resolution.supersededConflictRequests = references
        let unrelated = replacingOwner(of: makeEntry(id: "unrelated", draft: "Other owner words",
            createdAt: 102, origin: origin), with: "user-2")
        try await store.enqueue(resolution)
        try await store.enqueue(unrelated)
        try await store.markInflight(id: resolution.id)
        let evidence = try makeOrdinaryEvidence(for: resolution, versionID: "server-v2")
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let before = try Data(contentsOf: manifestURL)
        XCTAssertNotNil(try JSONSerialization.jsonObject(with: before) as? [String: Any])
        try Data().write(to: failMarker)

        do {
            try await store.completeConfirmedConflictResolution(resolution, evidence: evidence,
                echoedRequestID: resolution.id)
            XCTFail("A failed atomic manifest write reported completion")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: manifestURL), before)
        let rolledBack = try await store.entriesForTesting()
        XCTAssertEqual(Set(rolledBack.map(\.id)), Set([conflict.id, resolution.id, unrelated.id]))

        try FileManager.default.removeItem(at: failMarker)
        try await store.completeConfirmedConflictResolution(resolution, evidence: evidence,
            echoedRequestID: resolution.id)
        let remaining = try await store.entriesForTesting()
        XCTAssertEqual(remaining.map(\.id), [unrelated.id])
        XCTAssertEqual(remaining.first?.draft, unrelated.draft)
        XCTAssertNotNil(try JSONSerialization.jsonObject(
            with: Data(contentsOf: manifestURL)) as? [[String: Any]])
    }

    func testConfirmedConflictCompletionReturnsToLegacyArrayAndPreservesRetirementMarker() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let retired = makeEntry(id: "retired-load-server", draft: "Retired words", createdAt: 90,
            origin: origin, authority: .init(id: UUID(), generation: 1))
        let selection = try await store.captureLoadServerSelection(projectId: retired.projectId,
            ownerUserId: retired.ownerUserId, deliveryOrigin: origin, explicitRequests: [retired])
        _ = try await store.resolveLoadServerSelection(selection)

        let conflict = makeEntry(id: "original-conflict", draft: "Original words", createdAt: 100,
            origin: origin, authority: .init(id: UUID(), generation: 2))
        try await store.enqueue(conflict)
        _ = try await store.retainConflict(conflict)
        var resolution = makeEntry(id: "confirmed-keep-mine", draft: "Kept words", createdAt: 101,
            origin: origin, authority: .init(id: UUID(), generation: 3))
        resolution.supersededConflictRequests = try await store.conflictResolutionReferences(for: conflict)
        let unrelated = makeEntry(id: "unrelated-pending", draft: "Later words", createdAt: 102,
            origin: origin, authority: .init(id: UUID(), generation: 4))
        try await store.enqueue(resolution)
        try await store.enqueue(unrelated)
        try await store.markInflight(id: resolution.id)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        XCTAssertNotNil(try JSONSerialization.jsonObject(
            with: Data(contentsOf: manifestURL)) as? [String: Any])

        try await store.completeConfirmedConflictResolution(resolution,
            evidence: try makeOrdinaryEvidence(for: resolution, versionID: "server-v2"),
            echoedRequestID: resolution.id)

        let legacyBytes = try Data(contentsOf: manifestURL)
        let priorRows = try JSONDecoder().decode([PriorDraftSaveOutboxEntry].self, from: legacyBytes)
        XCTAssertEqual(Set(priorRows.map(\.id)), Set([retired.id, unrelated.id]))
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let restoredEntries = try await relaunched.entriesForTesting()
        let restoredMarkers = try await relaunched.retirementMarkersForTesting()
        XCTAssertEqual(restoredEntries.map(\.id), [unrelated.id])
        XCTAssertEqual(restoredMarkers.map(\.id), [retired.id])
    }

    func testParkedConflictCopiesRemainSeparateAndOwnerScopedAfterRelaunch() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let first = makeEntry(id: "copy-one", draft: "First writer's words")
        let second = makeEntry(id: "copy-two", draft: "Different writer's words")
        let otherOwner = replacingOwner(of: makeEntry(id: "other-owner", draft: "Private other owner"), with: "user-2")
        try await store.enqueue(first)
        try await store.enqueue(second)
        try await store.enqueue(otherOwner)
        _ = try await store.retainConflict(first)
        _ = try await store.retainConflict(second)
        _ = try await store.retainConflict(otherOwner)
        let relaunched = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let copies = try await relaunched.parkedConflictEntries(projectId: first.projectId, ownerUserId: first.ownerUserId)
        XCTAssertEqual(Set(copies.map(\.id)), Set([first.id, second.id]))
        XCTAssertEqual(Set(copies.map(\.draft)), Set([first.draft, second.draft]))
        let otherCopies = try await relaunched.parkedConflictEntries(projectId: first.projectId, ownerUserId: otherOwner.ownerUserId)
        XCTAssertEqual(otherCopies.map(\.id), [otherOwner.id])
    }

    func testConflictSelectionRejectsCanonicallyEqualButByteDistinctMetadata() async throws {
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let original = makeEntry(id: "exact-metadata", draft: "Same writer words")
        var payload = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        payload["notes"] = "caf\u{00e9}"
        let stored = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        payload["notes"] = "cafe\u{0301}"
        let changed = try JSONDecoder().decode(ScreenplayDraftSaveOutboxEntry.self,
            from: JSONSerialization.data(withJSONObject: payload))
        XCTAssertFalse(stored.notes.utf8.elementsEqual(changed.notes.utf8))
        try await store.enqueue(stored)
        _ = try await store.retainConflict(stored)
        do {
            _ = try await store.conflictResolutionReferences(for: changed)
            XCTFail("Byte-distinct metadata must not authorize a different stored conflict")
        } catch BackendMemoryAPIError.invalidResponse {}
        let rows = try await store.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .parked)
    }

    func testLegacyDurableParkedConflictCanRetireWithoutManufacturedAuthority() async throws {
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let legacy = makeEntry(id: "legacy", origin: origin)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        try await store.enqueue(legacy)
        _ = try await store.retainConflict(projectId: legacy.projectId,
            ownerUserId: legacy.ownerUserId, deliveryOrigin: origin)

        let selection = try await store.captureLoadServerSelection(projectId: legacy.projectId,
            ownerUserId: legacy.ownerUserId, deliveryOrigin: origin, explicitRequests: [legacy])
        _ = try await store.resolveLoadServerSelection(selection)
        let legacyEntries = try await store.entriesForTesting()
        let legacyMarkers = try await store.retirementMarkersForTesting()
        XCTAssertTrue(legacyEntries.isEmpty)
        let marker = try XCTUnwrap(legacyMarkers.first)
        XCTAssertNil(marker.requestAuthority)
        XCTAssertNil(marker.loadServerRetirement?.requestAuthority)
        XCTAssertNotNil(marker.loadServerRetirement?.requestDigest)
        let legacyDelivery = try await store.beginDeliveryUnlessRetiredByLoadServer(legacy)
        XCTAssertNil(legacyDelivery)

        let absentDirectory = storageDirectory.appendingPathComponent("absent-legacy", isDirectory: true)
        let absentStore = ScreenplayDraftSaveOutbox(storageDirectory: absentDirectory)
        do {
            _ = try await absentStore.captureLoadServerSelection(projectId: legacy.projectId,
                ownerUserId: legacy.ownerUserId, deliveryOrigin: origin, explicitRequests: [legacy])
            XCTFail("An in-memory legacy request acquired deletion authority")
        } catch BackendMemoryAPIError.invalidResponse {}
        do {
            _ = try await absentStore.retainConflict(legacy)
            XCTFail("An absent legacy request was synthesized as a durable conflict")
        } catch BackendMemoryAPIError.invalidResponse {}
    }

    func testProjectRemovalPurgesExactMarkersAndRollsBackEveryCollectionOnFailure() async throws {
        let failMarker = storageDirectory.appendingPathComponent("fail-next-write")
        let store = ScreenplayDraftSaveOutbox(
            storageDirectory: storageDirectory,
            manifestWriter: { data, url in
                if FileManager.default.fileExists(atPath: failMarker.path) {
                    throw NSError(domain: "ScreenplayDraftSaveOutboxTests", code: 2)
                }
                try data.write(to: url, options: .atomic)
            }
        )
        let origin = ScreenplayDraftSaveOrigin(
            documentID: "document-a",
            backendURL: URL(string: "https://save.test")!
        )
        let mine = makeEntry(id: "mine-marker", draft: "Mine", origin: origin,
            authority: .init(id: UUID(), generation: 40))
        let theirs = replacingOwner(of: makeEntry(id: "their-marker", draft: "Theirs", origin: origin,
            authority: .init(id: UUID(), generation: 41)), with: "user-2")
        for request in [mine, theirs] {
            let selection = try await store.captureLoadServerSelection(projectId: request.projectId,
                ownerUserId: request.ownerUserId, deliveryOrigin: origin, explicitRequests: [request])
            _ = try await store.resolveLoadServerSelection(selection)
        }
        let activeMine = makeEntry(id: "mine-active", draft: "Active", createdAt: 200, origin: origin,
            authority: .init(id: UUID(), generation: 42))
        try await store.enqueue(activeMine)
        let manifestURL = storageDirectory.appendingPathComponent("queue.json")
        let before = try Data(contentsOf: manifestURL)
        try Data().write(to: failMarker)

        do {
            try await store.removeAll(projectId: mine.projectId, ownerUserId: mine.ownerUserId)
            XCTFail("A failed project purge reported success")
        } catch {
            XCTAssertEqual(try Data(contentsOf: manifestURL), before)
            let entriesAfterFailure = try await store.entriesForTesting()
            let markersAfterFailure = try await store.retirementMarkersForTesting()
            XCTAssertEqual(entriesAfterFailure.map(\.id), [activeMine.id])
            XCTAssertEqual(Set(markersAfterFailure.map(\.id)), Set([mine.id, theirs.id]))
        }
        try FileManager.default.removeItem(at: failMarker)
        try await store.removeAll(projectId: mine.projectId, ownerUserId: mine.ownerUserId)
        let entriesAfterRemoval = try await store.entriesForTesting()
        let markersAfterRemoval = try await store.retirementMarkersForTesting()
        XCTAssertTrue(entriesAfterRemoval.isEmpty)
        XCTAssertEqual(markersAfterRemoval.map(\.id), [theirs.id])
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

    func testFirstDurableReadProtectsLegacyArrayWithLineage() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        var entry = makeEntry(id: "linked-resolution")
        entry.supersededConflictRequests = [.init(requestID: "parked", projectId: entry.projectId,
            ownerUserId: entry.ownerUserId, deliveryOrigin: nil, requestAuthority: nil,
            requestDigest: String(repeating: "a", count: 64))]
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try JSONEncoder().encode([entry]).write(to: manifest)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        let present = try await store.hasDurableTarget(id: entry.id, matching: entry)
        XCTAssertTrue(present)
        let protected = try JSONSerialization.jsonObject(with: Data(contentsOf: manifest)) as? [String: Any]
        XCTAssertEqual(protected?["schemaVersion"] as? Int, 2)
    }

    func testDurableReadRejectsEnvelopeWithMalformedRetirementMarker() async throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        var entry = makeEntry(id: "linked-resolution")
        entry.supersededConflictRequests = [.init(requestID: "parked", projectId: entry.projectId,
            ownerUserId: entry.ownerUserId, deliveryOrigin: nil, requestAuthority: nil,
            requestDigest: String(repeating: "a", count: 64))]
        var marker = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(makeEntry(id: "marker"))) as? [String: Any])
        marker["projectId"] = "load-server-retirement"
        marker["ownerUserId"] = "load-server-retirement"
        marker["source"] = "studio_load_server_retirement"
        marker["notes"] = "load-server-retirement-v2:invalid"
        let resolution = try JSONSerialization.jsonObject(with: JSONEncoder().encode(entry))
        let corrupt = try JSONSerialization.data(withJSONObject: ["schemaVersion": 2, "entries": [resolution, marker]], options: [.sortedKeys])
        let manifest = storageDirectory.appendingPathComponent("queue.json")
        try corrupt.write(to: manifest)
        let store = ScreenplayDraftSaveOutbox(storageDirectory: storageDirectory)
        do {
            _ = try await store.hasDurableTarget(id: entry.id, matching: entry)
            XCTFail("A malformed marker must prevent durable proof")
        } catch {}
        XCTAssertEqual(try Data(contentsOf: manifest), corrupt)
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
        createdAt: TimeInterval = 100,
        origin: ScreenplayDraftSaveOrigin? = nil,
        authority: ScreenplayDraftSaveRequestAuthority? = nil
    ) -> ScreenplayDraftSaveOutboxEntry {
        var entry = ScreenplayDraftSaveOutboxEntry(
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
        entry.deliveryOrigin = origin
        entry.requestAuthority = authority
        return entry
    }

    private func replacingOwner(
        of entry: ScreenplayDraftSaveOutboxEntry,
        with ownerUserId: String
    ) -> ScreenplayDraftSaveOutboxEntry {
        var replaced = ScreenplayDraftSaveOutboxEntry(
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
        replaced.initialization = entry.initialization
        replaced.deliveryOrigin = entry.deliveryOrigin
        replaced.requestAuthority = entry.requestAuthority
        replaced.loadServerRetirement = entry.loadServerRetirement
        replaced.supersededConflictRequests = entry.supersededConflictRequests
        return replaced
    }

    private func makeOrdinaryEvidence(
        for entry: ScreenplayDraftSaveOutboxEntry,
        versionID: String
    ) throws -> ScreenplayConfirmedDraftSave {
        let version = try JSONDecoder().decode(BackendScreenplayVersion.self,
            from: JSONSerialization.data(withJSONObject: [
                "id": versionID,
                "projectId": entry.projectId,
                "clientRequestId": entry.id,
                "draft": entry.draft,
            ]))
        let owner = ScreenplayStudioAuthContext(userID: entry.ownerUserId, sessionIntentGeneration: 7)
        return try XCTUnwrap(ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: version,
            versionID: versionID, projectID: entry.projectId,
            responseURL: entry.deliveryOrigin?.backendURL, owner: owner, currentOwner: owner))
    }
}

/// Exact array element shape from the 4a3525c prior app. Decoding and then
/// encoding this type deliberately drops every new field, reproducing a real
/// downgrade rewrite instead of letting the current decoder preserve metadata.
private struct PriorDraftSaveOutboxEntry: Codable {
    let id: String
    let projectId: String
    let ownerUserId: String
    let draft: String
    let title: String
    let phase: String
    let notes: String
    let source: String
    let studioWriteAnchors: [BackendScreenplayWriteAnchor]
    let screenplayBindings: [BackendScreenplayBindingRecord]
    var baseVersionId: String
    let createdAt: TimeInterval
    var updatedAt: TimeInterval
    var status: ScreenplayDraftSaveOutboxStatus
    var retries: Int
    var nextAttemptAt: TimeInterval
    var lastError: String
    var initialization: ScreenplayInitialProjectMetadata? = nil
    var deliveryOrigin: ScreenplayDraftSaveOrigin? = nil
}
