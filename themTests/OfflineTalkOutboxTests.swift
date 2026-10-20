import XCTest
@testable import them

final class OfflineTalkOutboxTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("OfflineTalkOutboxTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let directory {
            try? FileManager.default.removeItem(at: directory)
        }
        directory = nil
        try super.tearDownWithError()
    }

    func testEnqueuePersistsMultipartRequestAndRestoresOnRelaunch() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-1", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("hello audio".utf8)

        let result = try await outbox.enqueue(request: request, body: body, reason: "offline")

        XCTAssertEqual(result.snapshot.pendingCount, 1)
        XCTAssertEqual(result.entry.idempotencyKey, "idem-1")
        XCTAssertEqual(result.entry.bodyByteCount, body.count)

        let relaunched = OfflineTalkOutbox(storageDirectory: directory)
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.idempotencyKey, "idem-1")
        let snapshot = await relaunched.snapshot()
        XCTAssertEqual(snapshot.pendingCount, 1)
    }

    func testFailedManifestReadRetriesOnSameActorBeforeEnqueueingMoreWords() async throws {
        let original = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("retained-first", forHTTPHeaderField: "X-Idempotency-Key")
        let firstBody = Data("original spoken scene 🎬\r\n".utf8)
        _ = try await original.enqueue(request: request, body: firstBody, reason: "offline")
        let manifest = directory.appendingPathComponent("queue.jsonl")
        let saved = directory.appendingPathComponent("queue.saved.jsonl")
        try FileManager.default.moveItem(at: manifest, to: saved)
        // A real Data(contentsOf:) failure, without relying on simulator chmod
        // or pretending this reproduces physical-device file protection.
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        let relaunched = OfflineTalkOutbox(storageDirectory: directory)
        let unavailable = await relaunched.snapshot()
        XCTAssertFalse(unavailable.lastError.isEmpty)
        XCTAssertEqual(unavailable.userVisibleStatus, "Queued turns could not be read. Retry in Data Controls; existing files have been preserved.")
        try FileManager.default.removeItem(at: manifest)
        try FileManager.default.moveItem(at: saved, to: manifest)
        request.setValue("retained-second", forHTTPHeaderField: "X-Idempotency-Key")
        let secondBody = Data("second spoken scene".utf8)
        _ = try await relaunched.enqueue(request: request, body: secondBody, reason: "offline")
        let entries = await relaunched.allEntries()
        XCTAssertEqual(Set(entries.map(\.idempotencyKey)), ["retained-first", "retained-second"])
        var sentBodies: [Data] = []
        _ = await relaunched.drainDue(now: Date().addingTimeInterval(10)) { replay in
            sentBodies.append(replay.httpBody ?? Data())
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }
        XCTAssertEqual(sentBodies, [firstBody, secondBody])
    }

    func testMalformedManifestNeverOverwritesRecoverableTurnsOrBlobs() async throws {
        for suffix in [Data("{truncated-record\n".utf8), Data([0xFF, 0xFE, 0x0A])] {
            let fixture = directory.appendingPathComponent(UUID().uuidString, isDirectory: true)
            let original = OfflineTalkOutbox(storageDirectory: fixture)
            var request = URLRequest(url: URL(string: "https://them.test/talk")!)
            request.httpMethod = "POST"
            request.setValue("keep-original", forHTTPHeaderField: "X-Idempotency-Key")
            let body = Data("Keep every word, including café and 🎬.\r\n".utf8)
            let result = try await original.enqueue(request: request, body: body, reason: "offline")
            let manifest = fixture.appendingPathComponent("queue.jsonl")
            let valid = try Data(contentsOf: manifest)
            let damaged = valid + suffix
            try damaged.write(to: manifest, options: .atomic)
            let relaunched = OfflineTalkOutbox(storageDirectory: fixture)
            let snapshot = await relaunched.snapshot()
            XCTAssertFalse(snapshot.lastError.isEmpty, "Corruption must not look like a successful empty load.")
            request.setValue("new-turn", forHTTPHeaderField: "X-Idempotency-Key")
            do {
                _ = try await relaunched.enqueue(request: request, body: Data("new".utf8), reason: "offline")
                XCTFail("Never overwrite unreadable queued work.")
            } catch { }
            do {
                _ = try await relaunched.deleteParkedEntries()
                XCTFail("Never rewrite unreadable storage while clearing parked turns.")
            } catch { }
            XCTAssertEqual(try Data(contentsOf: manifest), damaged)
            let blob = fixture.appendingPathComponent("blobs").appendingPathComponent(result.entry.bodyRef)
            XCTAssertEqual(try Data(contentsOf: blob), body)
            // Repair only the synthetic manifest; the same actor must retry
            // the read rather than keeping its failed-load empty state.
            try valid.write(to: manifest, options: .atomic)
            let recovered = await relaunched.allEntries()
            XCTAssertEqual(recovered.map(\.idempotencyKey), ["keep-original"])
        }
    }

    func testDrainDueSendsPendingEntryAndRemovesItOnSuccess() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-success", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("queued-body".utf8)

        _ = try await outbox.enqueue(request: request, body: body, reason: "offline")
        var sentBodies: [Data] = []

        let drained = await outbox.drainDue(now: Date().addingTimeInterval(10)) { replayRequest in
            sentBodies.append(replayRequest.httpBody ?? Data())
            XCTAssertEqual(replayRequest.value(forHTTPHeaderField: "X-Idempotency-Key"), "idem-success")
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(sentBodies, [body])
        XCTAssertEqual(drained.pendingCount, 0)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries, [])
    }

    func testSuccessfulTalkReplayRefreshesConversationOnlyAfterDurableAcknowledgement() async throws {
        let api = BackendMemoryAPI(baseURL: URL(string: "https://them.test")!)
        let turnID = "recovered-\(UUID().uuidString)"
        let headers = ["x-turn-id": turnID, "x-session-id": "recovered-session",
            "x-state-version": "recovered-state-\(UUID().uuidString)", "x-history-updated-at": "1792450000000"]
        let response = try XCTUnwrap(HTTPURLResponse(url: URL(string: "https://them.test/talk")!,
            statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers))
        await api.recordTurnCommitted(from: response, expectedOwnerUserID: "wrong-owner-\(UUID().uuidString)")
        let ignored = await api.currentSyncState()
        XCTAssertTrue(ignored.lastTurnId.isEmpty, "Another account's replay must not change conversation state.")

        let outbox = OfflineTalkOutbox(storageDirectory: directory, commitAPI: api)
        var request = URLRequest(url: response.url!)
        request.httpMethod = "POST"
        request.setValue("recovered-request", forHTTPHeaderField: "X-Idempotency-Key")
        let owner = OfflineTalkOutbox.currentOwnerID()
        if !owner.isEmpty { request.setValue(owner, forHTTPHeaderField: "X-User-Id") }
        let body = Data("Retain every original word.\r\n".utf8)
        let queued = try await outbox.enqueue(request: request, body: body, reason: "offline")
        let manifest = directory.appendingPathComponent("queue.jsonl")
        let saved = directory.appendingPathComponent("fixture-saved-manifest.jsonl")
        let notified = expectation(forNotification: .themTurnCommitted, object: nil) { notification in
            guard let event = BackendTurnCommittedEvent(notification: notification), event.turnId == turnID else { return false }
            XCTAssertEqual(event.source, "authoritative")
            XCTAssertEqual(try? Data(contentsOf: manifest), Data(), "Refresh only after queue removal is durable.")
            XCTAssertNil(event.userMessage, "Fetch owned authoritative history; do not inject replay text into an arbitrary project.")
            return true
        }
        _ = await outbox.drainDue(now: Date().addingTimeInterval(10)) { replay in
            XCTAssertEqual(replay.httpBody, body)
            try FileManager.default.moveItem(at: manifest, to: saved)
            try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
            return OfflineTalkOutboxSendResult(statusCode: 200, headers: headers)
        }
        let notCommitted = await api.currentSyncState()
        XCTAssertTrue(notCommitted.lastTurnId.isEmpty, "A failed local acknowledgement must not publish a completed turn.")
        try FileManager.default.removeItem(at: manifest)
        try FileManager.default.moveItem(at: saved, to: manifest)
        _ = try await outbox.retryParkedEntry(id: queued.entry.id) { replay in
            XCTAssertEqual(replay.httpBody, body)
            XCTAssertEqual(replay.value(forHTTPHeaderField: "X-Idempotency-Key"), "recovered-request")
            return OfflineTalkOutboxSendResult(statusCode: 200, headers: headers)
        }
        await fulfillment(of: [notified], timeout: 2)
        let committed = await api.currentSyncState()
        XCTAssertEqual(committed.lastTurnId, turnID)
        let entries = await outbox.allEntries()
        XCTAssertTrue(entries.isEmpty)
    }

    func testManifestFailureNeverSendsBeforeDurableInflightOrDeletesAcknowledgedPayload() async throws {
        for failAfterSend in [false, true] {
            let store = directory.appendingPathComponent(UUID().uuidString)
            let outbox = OfflineTalkOutbox(storageDirectory: store)
            var request = URLRequest(url: URL(string: "https://them.test/talk")!)
            request.httpMethod = "POST"
            request.setValue("durable-ack", forHTTPHeaderField: "X-Idempotency-Key")
            let body = Data("Every exact word: café 🎬.\r\n".utf8)
            let queued = try await outbox.enqueue(request: request, body: body, reason: "offline")
            let manifest = store.appendingPathComponent("queue.jsonl")
            let savedManifest = store.appendingPathComponent("fixture-saved-manifest.jsonl")
            let blob = store.appendingPathComponent("blobs").appendingPathComponent(queued.entry.bodyRef)
            func blockManifest() throws {
                try FileManager.default.moveItem(at: manifest, to: savedManifest)
                try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
            }
            if !failAfterSend { try blockManifest() }
            var calls = 0
            let failed = await outbox.drainDue(now: Date().addingTimeInterval(10)) { replay in
                calls += 1
                XCTAssertEqual(replay.httpBody, body)
                XCTAssertEqual(replay.value(forHTTPHeaderField: "X-Idempotency-Key"), "durable-ack")
                try blockManifest()
                return OfflineTalkOutboxSendResult(statusCode: 200)
            }
            XCTAssertEqual(calls, failAfterSend ? 1 : 0)
            XCTAssertFalse(failed.lastError.isEmpty)
            XCTAssertEqual(try Data(contentsOf: blob), body, "Never delete acknowledged bytes before manifest commit.")
            let retained = await outbox.allEntries()
            XCTAssertEqual(retained.map(\.id), [queued.entry.id])
            XCTAssertEqual(retained.first?.status, failAfterSend ? .parked : .pending)
            // Repair only the synthetic filesystem obstacle, then prove
            // relaunch retains ambiguous sends for explicit review, while
            // requests that provably never sent may still drain normally.
            try FileManager.default.removeItem(at: manifest)
            try FileManager.default.moveItem(at: savedManifest, to: manifest)
            let relaunched = OfflineTalkOutbox(storageDirectory: store)
            var replayCalls = 0
            let transport: OfflineTalkOutbox.Transport = { replay in
                replayCalls += 1
                XCTAssertEqual(replay.httpBody, body)
                XCTAssertEqual(replay.value(forHTTPHeaderField: "X-Idempotency-Key"), "durable-ack")
                return OfflineTalkOutboxSendResult(statusCode: 200)
            }
            var recovered = await relaunched.drainDue(now: Date().addingTimeInterval(20), transport: transport)
            if failAfterSend {
                XCTAssertEqual(replayCalls, 0, "An ambiguous acknowledged send must not auto-replay after relaunch.")
                XCTAssertEqual(recovered.parkedCount, 1)
                recovered = try await relaunched.retryParkedEntry(id: queued.entry.id, transport: transport)
            }
            XCTAssertEqual(replayCalls, 1)
            XCTAssertFalse(recovered.hasWork)
            XCTAssertEqual(try Data(contentsOf: manifest), Data())
            XCTAssertFalse(FileManager.default.fileExists(atPath: blob.path))
        }
    }

    func testQuestionResolutionSurvivesRelaunchAndSuppressesOnlyActiveQuestion() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(
            url: URL(string: "https://them.test/memory/screenplay-question/resolve")!
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("question-resolution-1", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue(
            "screenplay-learning-4-project.theme_argument",
            forHTTPHeaderField: "X-Screenplay-Question-ID"
        )
        request.setValue(
            "screenplay_question_resolution",
            forHTTPHeaderField: "X-Them-Outbox-Action"
        )
        let body = try JSONSerialization.data(withJSONObject: [
            "question_id": "screenplay-learning-4-project.theme_argument",
            "project_id": "split-ferries",
            "response_status": "answered",
            "answer": "Love without trust becomes possession.",
        ])

        _ = try await outbox.enqueue(request: request, body: body, reason: "offline")

        let relaunched = OfflineTalkOutbox(storageDirectory: directory)
        let queuedIDs = await relaunched.pendingScreenplayQuestionResolutionIDs()
        XCTAssertEqual(queuedIDs, Set(["screenplay-learning-4-project.theme_argument"]))

        var replayedBody = Data()
        let drained = await relaunched.drainDue(
            now: Date().addingTimeInterval(10)
        ) { replayRequest in
            replayedBody = replayRequest.httpBody ?? Data()
            XCTAssertEqual(
                replayRequest.value(forHTTPHeaderField: "X-Screenplay-Question-ID"),
                "screenplay-learning-4-project.theme_argument"
            )
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(replayedBody, body)
        XCTAssertEqual(drained.pendingCount, 0)
        let resolvedIDs = await relaunched.pendingScreenplayQuestionResolutionIDs()
        XCTAssertEqual(resolvedIDs, Set<String>())
    }

    func testQueuedWriteNeverCrossesIntoAnotherSignedInAccount() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(
            url: URL(string: "https://them.test/memory/screenplay-question/resolve")!
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("queued-\(UUID().uuidString)", forHTTPHeaderField: "X-User-Id")
        request.setValue("question-resolution-account", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("question-account", forHTTPHeaderField: "X-Screenplay-Question-ID")

        _ = try await outbox.enqueue(
            request: request,
            body: Data("{}".utf8),
            reason: "offline"
        )
        var transportCalls = 0
        let snapshot = await outbox.drainDue(
            now: Date().addingTimeInterval(10)
        ) { _ in
            transportCalls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(transportCalls, 0)
        XCTAssertEqual(snapshot.pendingCount, 0, "Another account's work is not a visible pending turn.")
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 0, "Background replay must not consume another owner's retry budget.")
        XCTAssertEqual(entries.first?.lastError, "offline")
        XCTAssertEqual(entries.first?.status, .pending)
    }

    func testAmbiguousTransportRetainsOriginalWithoutAutomaticReplayAfterRelaunch() async throws {
        let failures: [Error] = [URLError(.timedOut), URLError(.networkConnectionLost), URLError(.cancelled), CancellationError(), URLError(.notConnectedToInternet)]
        for (index, failure) in failures.enumerated() {
            let store = directory.appendingPathComponent("transport-\(index)")
            let outbox = OfflineTalkOutbox(storageDirectory: store)
            var request = URLRequest(url: URL(string: "https://them.test/talk")!)
            request.httpMethod = "POST"
            let key = "ambiguous-\(index)"
            request.setValue(key, forHTTPHeaderField: "X-Idempotency-Key")
            let owner = OfflineTalkOutbox.currentOwnerID()
            if !owner.isEmpty { request.setValue(owner, forHTTPHeaderField: "X-User-Id") }
            let body = Data("Do not duplicate my scene. 🎬\r\n".utf8)
            let queued = try await outbox.enqueue(request: request, body: body, reason: "offline")
            let first = await outbox.drainDue(now: Date().addingTimeInterval(10)) { replay in
                XCTAssertEqual(replay.httpBody, body)
                throw failure
            }
            let isAmbiguous = index < 4
            XCTAssertEqual(first.parkedCount, isAmbiguous ? 1 : 0)
            XCTAssertEqual(first.pendingCount, isAmbiguous ? 0 : 1)
            let relaunched = OfflineTalkOutbox(storageDirectory: store)
            var sends = 0
            let transport: OfflineTalkOutbox.Transport = { replay in
                sends += 1
                XCTAssertEqual(replay.httpBody, body)
                XCTAssertEqual(replay.value(forHTTPHeaderField: "X-Idempotency-Key"), key)
                return OfflineTalkOutboxSendResult(statusCode: 200)
            }
            _ = await relaunched.drainDue(now: Date().addingTimeInterval(86_400), transport: transport)
            XCTAssertEqual(sends, isAmbiguous ? 0 : 1)
            if isAmbiguous {
                let retained = await relaunched.allEntries()
                XCTAssertEqual(retained.first?.id, queued.entry.id)
                XCTAssertTrue(retained.first?.lastError?.contains("may already have been processed") == true)
                _ = try await relaunched.retryParkedEntry(id: queued.entry.id, transport: transport)
            }
            XCTAssertEqual(sends, 1)
            let remaining = await relaunched.allEntries()
            XCTAssertTrue(remaining.isEmpty)
        }
    }

    func testRetryableFailureBacksOffThenDrainsOnLaterSuccess() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-retry", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("retry".utf8), reason: "503")
        let start = Date().addingTimeInterval(10)
        var calls = 0

        let failed = await outbox.drainDue(now: start) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 503)
        }

        XCTAssertEqual(calls, 1)
        XCTAssertEqual(failed.pendingCount, 1)
        var entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 1)
        XCTAssertEqual(entries.first?.status, .pending)

        let notYet = await outbox.drainDue(now: start.addingTimeInterval(1)) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(calls, 1)
        XCTAssertEqual(notYet.pendingCount, 1)

        entries = await outbox.allEntries()
        let due = Date(timeIntervalSince1970: entries.first?.nextAttemptAt ?? start.timeIntervalSince1970)
        let drained = await outbox.drainDue(now: due.addingTimeInterval(0.1)) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(calls, 2)
        XCTAssertEqual(drained.pendingCount, 0)
        let finalEntries = await outbox.allEntries()
        XCTAssertEqual(finalEntries, [])
    }

    func testProviderQuotaParksWithoutRetryingAfterRelaunch() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-quota", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("queued".utf8), reason: "offline")
        let quotaBody = Data(#"{"stage":"talk_chat","error_class":"provider_quota","error":"insufficient_quota"}"#.utf8)
        let parked = await outbox.drainDue(now: Date().addingTimeInterval(10)) { _ in
            OfflineTalkOutboxSendResult(statusCode: 429, body: quotaBody)
        }

        XCTAssertEqual(parked.pendingCount, 0)
        XCTAssertEqual(parked.parkedCount, 1)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 0)
        XCTAssertEqual(entries.first?.nextAttemptAt, 0)
        XCTAssertEqual(
            entries.first?.lastError,
            "Clementine's writing service is temporarily unavailable. Your draft is safe. Please try again later."
        )
    }

    func testManualRetryTargetsOnlySelectedRetainedTurnAndParksRepeatedQuota() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("ordinary", forHTTPHeaderField: "X-Idempotency-Key")
        _ = try await outbox.enqueue(request: request, body: Data("other words".utf8), reason: "offline")
        request.setValue("retained", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("Exact cafe\u{0301}\r\n🎬".utf8)
        let parked = try await outbox.enqueue(request: request, body: body, reason: "provider unavailable", requiresManualRetry: true)
        let relaunched = OfflineTalkOutbox(storageDirectory: directory)
        var calls = 0
        let snapshot = try await relaunched.retryParkedEntry(id: parked.entry.id, now: Date().addingTimeInterval(10)) { replay in
            calls += 1
            XCTAssertEqual(replay.httpBody, body)
            XCTAssertEqual(replay.value(forHTTPHeaderField: "X-Idempotency-Key"), "retained")
            return OfflineTalkOutboxSendResult(statusCode: 429, body: Data(#"{"error_class":"provider_quota"}"#.utf8))
        }
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(snapshot.pendingCount, 1)
        XCTAssertEqual(snapshot.parkedCount, 1)
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.first { $0.idempotencyKey == "ordinary" }?.retries, 0)
        XCTAssertEqual(entries.first { $0.idempotencyKey == "retained" }?.status, .parked)
    }

    func testManualRetryNeverReactivatesAnotherAccountsRetainedTurn() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("other-account-\(UUID().uuidString)", forHTTPHeaderField: "X-User-Id")
        request.setValue("other-owner-request", forHTTPHeaderField: "X-Idempotency-Key")
        let retained = try await outbox.enqueue(request: request, body: Data("other owner's words".utf8),
            reason: "provider unavailable", requiresManualRetry: true)
        var calls = 0
        do {
            _ = try await outbox.retryParkedEntry(id: retained.entry.id) { _ in
                calls += 1
                return OfflineTalkOutboxSendResult(statusCode: 200)
            }
            XCTFail("Another account's request must not be reactivated.")
        } catch BackendError.stage(let stage, _) {
            XCTAssertEqual(stage, "offline_outbox")
        }
        XCTAssertEqual(calls, 0)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries, [retained.entry])
    }

    func testProviderRateLimitStillBacksOffForQueuedTurn() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-rate-limit", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("queued".utf8), reason: "offline")
        let rateLimitBody = Data(#"{"stage":"rate_limit","error":"rate_limited","retry_after_ms":1200}"#.utf8)
        let pending = await outbox.drainDue(now: Date().addingTimeInterval(10)) { _ in
            OfflineTalkOutboxSendResult(statusCode: 429, body: rateLimitBody)
        }

        XCTAssertEqual(pending.pendingCount, 1)
        XCTAssertEqual(pending.parkedCount, 0)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 1)
        XCTAssertEqual(entries.first?.status, .pending)
    }

    @MainActor
    func testRecoveryPresentationAndConfirmedDeletionStayWithCredentialOwner() async throws {
        let defaults = UserDefaults.standard
        let keys = ["auth_user_payload", "user_id", "auth_signed_in"]
        let saved = keys.map { defaults.object(forKey: $0) }
        let sharedOwner = BackendAuthClient.sharedUserID()
        defer {
            for (key, value) in zip(keys, saved) {
                if let value { defaults.set(value, forKey: key) }
                else { defaults.removeObject(forKey: key) }
            }
            if let sharedOwner { _ = BackendAuthClient.persistSharedUserID(sharedOwner) }
            else { BackendAuthClient.clearSharedUserID() }
        }
        func signIn(_ owner: String?) throws {
            guard let owner else {
                defaults.removeObject(forKey: "auth_user_payload")
                defaults.set(false, forKey: "auth_signed_in")
                BackendAuthClient.clearSharedUserID()
                return
            }
            let user = BackendAuthUser(userId: owner, email: "fixture@example.invalid", authProvider: "debug",
                emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil)
            defaults.set(try JSONEncoder().encode(user), forKey: "auth_user_payload")
            XCTAssertTrue(BackendAuthClient.persistSharedUserID(owner))
            defaults.set(true, forKey: "auth_signed_in")
            XCTAssertEqual(BackendAuthClient.currentAuthSessionState().user?.userId, owner)
        }
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        func retain(_ owner: String, _ key: String) async throws -> OfflineTalkOutboxEntry {
            var request = URLRequest(url: URL(string: "https://them.test/talk")!)
            request.httpMethod = "POST"
            request.setValue(owner, forHTTPHeaderField: "x-user-id")
            request.setValue(key, forHTTPHeaderField: "X-Idempotency-Key")
            return try await outbox.enqueue(request: request, body: Data("Exact \(key) café\r\n".utf8),
                reason: "private \(key)", requiresManualRetry: true).entry
        }
        try signIn("writer-a")
        let a = try await retain("writer-a", "a")
        let b = try await retain("writer-b", "b")
        let stateA = await outbox.recoveryState()
        XCTAssertEqual(stateA.entries.map(\.id), [a.id])
        let visibleA = await outbox.snapshot()
        XCTAssertEqual(visibleA.parkedCount, 1)
        XCTAssertEqual(stateA.snapshot.parkedCount, 1)
        XCTAssertFalse(stateA.snapshot.lastError.contains("private b"))
        let late = try await retain("writer-a", "later")
        try signIn("writer-b")
        do {
            _ = try await outbox.deleteParkedEntries(expectedOwnerID: stateA.ownerID, confirmedEntryIDs: [a.id])
            XCTFail("A confirmation from the previous account must be rejected.")
        } catch { }
        let stateB = await outbox.recoveryState()
        XCTAssertEqual(stateB.entries.map(\.id), [b.id])
        let visibleB = await outbox.snapshot()
        XCTAssertEqual(visibleB.parkedCount, 1)
        try signIn(nil)
        let signedOut = await outbox.recoveryState()
        XCTAssertEqual(signedOut.entries, [])
        XCTAssertFalse(signedOut.snapshot.hasWork)
        XCTAssertTrue(signedOut.snapshot.lastError.isEmpty)
        try signIn("writer-a")
        _ = try await outbox.deleteParkedEntries(expectedOwnerID: "writer-a", confirmedEntryIDs: [a.id, b.id])
        let restored = OfflineTalkOutbox(storageDirectory: directory)
        let survivors = await restored.allEntries()
        XCTAssertEqual(Set(survivors.map(\.id)), [b.id, late.id], "Preserve other owners and requests created after confirmation.")
        for entry in [b, late] {
            let body = try Data(contentsOf: directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef))
            XCTAssertEqual(body, Data("Exact \(entry.idempotencyKey) café\r\n".utf8))
        }
    }

    func testDelayedNotificationFromAnotherOwnerCannotBecomeVisible() {
        let current = OfflineTalkOutbox.currentOwnerID()
        let snapshot = OfflineTalkOutboxSnapshot(pendingCount: 2, inflightCount: 0, parkedCount: 3, lastError: "private error")
        var info = snapshot.notificationUserInfo
        info[OfflineTalkOutbox.NotificationKey.ownerID] = current
        let valid = OfflineTalkOutboxSnapshot(notification: Notification(name: .themOfflineTalkOutboxUpdated, userInfo: info))
        XCTAssertEqual(valid, snapshot)
        info[OfflineTalkOutbox.NotificationKey.ownerID] = "another-owner-\(UUID().uuidString)"
        let stale = OfflineTalkOutboxSnapshot(notification: Notification(name: .themOfflineTalkOutboxUpdated, userInfo: info))
        XCTAssertEqual(stale, .empty)
        let legacy = OfflineTalkOutboxSnapshot(notification: Notification(name: .themOfflineTalkOutboxUpdated, userInfo: snapshot.notificationUserInfo))
        XCTAssertEqual(legacy, .empty, "Unpartitioned notifications must fail closed.")
    }

    func testScopedPublishingDoesNotHideAStorageCreationFailure() async throws {
        let store = directory.appendingPathComponent("unavailable-store")
        let outbox = OfflineTalkOutbox(storageDirectory: store)
        _ = await outbox.snapshot() // Complete the initial missing-manifest read.
        let blocker = Data("Synthetic storage blocker, not writer data.".utf8)
        try blocker.write(to: store)
        let notified = expectation(forNotification: .themOfflineTalkOutboxUpdated, object: nil) { notification in
            !OfflineTalkOutboxSnapshot(notification: notification).lastError.isEmpty
        }
        let failed = await outbox.drainDue { _ in
            XCTFail("Unreadable storage must not send a request.")
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }
        XCTAssertFalse(failed.lastError.isEmpty)
        XCTAssertNotNil(failed.userVisibleStatus)
        await fulfillment(of: [notified], timeout: 2)
        XCTAssertEqual(try Data(contentsOf: store), blocker)
    }

    func testIdenticalRequestKeyDoesNotDeduplicateDifferentOwners() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("same-request-key", forHTTPHeaderField: "X-Idempotency-Key")
        var expected: [String: Data] = [:]
        for owner in ["owner-a", "owner-b"] {
            request.setValue(owner, forHTTPHeaderField: "X-User-Id")
            let body = Data("Exact \(owner) story.\r\n".utf8)
            let result = try await outbox.enqueue(request: request, body: body, reason: owner, requiresManualRetry: true)
            expected[result.entry.id] = body
        }
        XCTAssertEqual(expected.count, 2)
        let restored = OfflineTalkOutbox(storageDirectory: directory)
        let entries = await restored.allEntries()
        XCTAssertEqual(entries.count, 2)
        for entry in entries {
            let body = try Data(contentsOf: directory.appendingPathComponent("blobs").appendingPathComponent(entry.bodyRef))
            XCTAssertEqual(body, expected[entry.id])
        }
    }

    func testNonRetryableClientErrorParksAndCanBeDeleted() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-park", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("bad".utf8), reason: "400")
        let parked = await outbox.drainDue(now: Date().addingTimeInterval(10)) { _ in
            OfflineTalkOutboxSendResult(statusCode: 400)
        }

        XCTAssertEqual(parked.parkedCount, 1)
        var entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.status, .parked)

        let cleared = try await outbox.deleteParkedEntries()
        XCTAssertEqual(cleared.parkedCount, 0)
        entries = await outbox.allEntries()
        XCTAssertEqual(entries, [])
    }
}
