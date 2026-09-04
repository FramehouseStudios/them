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

    func testEnqueueManifestExcludesCredentialBearingHeaders() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("writer-1", forHTTPHeaderField: "X-User-Id")
        request.setValue("idem-private", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("clementine", forHTTPHeaderField: "X-Persona-Key")
        request.setValue("audio", forHTTPHeaderField: "X-Talk-Stream")
        request.setValue("Bearer access-secret", forHTTPHeaderField: "Authorization")
        request.setValue("Basic proxy-secret", forHTTPHeaderField: "Proxy-Authorization")
        request.setValue("client-secret", forHTTPHeaderField: "X-Client-Token")
        request.setValue("app-secret", forHTTPHeaderField: "X-APP-TOKEN")
        request.setValue("session=cookie-secret", forHTTPHeaderField: "Cookie")
        request.setValue("api-secret", forHTTPHeaderField: "X-API-Key")
        request.setValue("custom-secret", forHTTPHeaderField: "X-Custom-Secret")

        let result = try await outbox.enqueue(
            request: request,
            body: Data("queued-body".utf8),
            reason: "offline"
        )

        XCTAssertEqual(result.entry.ownerUserId, "writer-1")
        XCTAssertEqual(
            result.entry.headers,
            [
                "Accept": "application/json",
                "Content-Type": "multipart/form-data; boundary=test",
                "X-Idempotency-Key": "idem-private",
                "X-Persona-Key": "clementine",
                "X-Talk-Stream": "audio",
            ]
        )

        let manifestURL = directory.appendingPathComponent("queue.jsonl")
        let manifest = try String(contentsOf: manifestURL, encoding: .utf8)
        for forbiddenValue in [
            "access-secret",
            "proxy-secret",
            "client-secret",
            "app-secret",
            "cookie-secret",
            "api-secret",
            "custom-secret",
        ] {
            XCTAssertFalse(manifest.contains(forbiddenValue))
        }
        for forbiddenHeader in [
            "Authorization",
            "Proxy-Authorization",
            "X-Client-Token",
            "X-APP-TOKEN",
            "Cookie",
            "X-API-Key",
            "X-Custom-Secret",
        ] {
            XCTAssertFalse(manifest.localizedCaseInsensitiveContains(forbiddenHeader))
        }
    }

    func testRelaunchScrubsCredentialsFromLegacyManifest() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("legacy-idem", forHTTPHeaderField: "X-Idempotency-Key")
        _ = try await outbox.enqueue(
            request: request,
            body: Data("legacy-body".utf8),
            reason: "offline"
        )

        let queuedEntries = await outbox.allEntries()
        var legacyEntry = try XCTUnwrap(queuedEntries.first)
        legacyEntry.ownerUserId = nil
        legacyEntry.headers["X-User-Id"] = "writer-legacy"
        legacyEntry.headers["Authorization"] = "Bearer legacy-access-secret"
        legacyEntry.headers["X-Client-Token"] = "legacy-client-secret"
        legacyEntry.headers["X-APP-TOKEN"] = "legacy-app-secret"
        legacyEntry.headers["Cookie"] = "session=legacy-cookie-secret"
        var legacyManifest = try JSONEncoder().encode(legacyEntry)
        legacyManifest.append(0x0A)
        let manifestURL = directory.appendingPathComponent("queue.jsonl")
        try legacyManifest.write(to: manifestURL, options: .atomic)

        let relaunched = OfflineTalkOutbox(storageDirectory: directory)
        let restoredEntries = await relaunched.allEntries()
        let restoredEntry = try XCTUnwrap(restoredEntries.first)

        XCTAssertEqual(restoredEntry.ownerUserId, "writer-legacy")
        XCTAssertEqual(restoredEntry.headers, ["X-Idempotency-Key": "legacy-idem"])
        let scrubbedManifest = try String(contentsOf: manifestURL, encoding: .utf8)
        XCTAssertFalse(scrubbedManifest.contains("legacy-access-secret"))
        XCTAssertFalse(scrubbedManifest.contains("legacy-client-secret"))
        XCTAssertFalse(scrubbedManifest.contains("legacy-app-secret"))
        XCTAssertFalse(scrubbedManifest.contains("legacy-cookie-secret"))
    }

    func testReplayRebuildsCurrentAuthenticationAfterTokensRotate() async throws {
        let outbox = OfflineTalkOutbox(storageDirectory: directory)
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("writer-1", forHTTPHeaderField: "X-User-Id")
        request.setValue("idem-rotated", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("Bearer old-access", forHTTPHeaderField: "Authorization")
        request.setValue("old-client", forHTTPHeaderField: "X-Client-Token")
        request.setValue("old-app", forHTTPHeaderField: "X-APP-TOKEN")
        request.setValue("session=old-cookie", forHTTPHeaderField: "Cookie")
        _ = try await outbox.enqueue(
            request: request,
            body: Data("rotated-body".utf8),
            reason: "offline"
        )

        let relaunched = OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: {
                BackendRequestAuthentication(
                    userID: "writer-1",
                    clientToken: "new-client",
                    accessToken: "new-access",
                    appToken: "new-app"
                )
            }
        )
        var didSend = false
        let drained = await relaunched.drainDue(
            now: Date().addingTimeInterval(10)
        ) { replayRequest in
            didSend = true
            XCTAssertEqual(replayRequest.value(forHTTPHeaderField: "X-User-Id"), "writer-1")
            XCTAssertEqual(replayRequest.value(forHTTPHeaderField: "X-Client-Token"), "new-client")
            XCTAssertEqual(replayRequest.value(forHTTPHeaderField: "X-APP-TOKEN"), "new-app")
            XCTAssertEqual(replayRequest.value(forHTTPHeaderField: "Authorization"), "Bearer new-access")
            XCTAssertNil(replayRequest.value(forHTTPHeaderField: "Cookie"))
            XCTAssertFalse(replayRequest.httpShouldHandleCookies)
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertTrue(didSend)
        XCTAssertEqual(drained.pendingCount, 0)
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
        XCTAssertEqual(snapshot.pendingCount, 1)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 1)
        XCTAssertTrue(
            entries.first?.lastError?.contains("different signed-in account") == true
        )
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
