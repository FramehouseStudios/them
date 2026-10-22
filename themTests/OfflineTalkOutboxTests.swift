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
        let outbox = makeOutbox()
        var request = makeRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-1", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("hello audio".utf8)

        let result = try await outbox.enqueue(request: request, body: body, reason: "offline")

        XCTAssertEqual(result.snapshot.pendingCount, 1)
        XCTAssertEqual(result.entry.idempotencyKey, "idem-1")
        XCTAssertEqual(result.entry.bodyByteCount, body.count)

        let relaunched = makeOutbox()
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.idempotencyKey, "idem-1")
        let snapshot = await relaunched.snapshot()
        XCTAssertEqual(snapshot.pendingCount, 1)
    }

    func testDrainDueRetainsReplyUntilExplicitDeliveryAcknowledgement() async throws {
        let outbox = makeOutbox()
        var request = makeRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-success", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("queued-body".utf8)

        _ = try await outbox.enqueue(request: request, body: body, reason: "offline")
        var sentBodies: [Data] = []

        let drained = await outbox.drainDue(now: Date().addingTimeInterval(10), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!) { replayRequest in
            sentBodies.append(replayRequest.httpBody ?? Data())
            XCTAssertEqual(replayRequest.value(forHTTPHeaderField: "X-Idempotency-Key"), "idem-success")
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(sentBodies, [body])
        XCTAssertEqual(drained.pendingCount, 0)
        let entries = await outbox.allEntries()
        let retained = try XCTUnwrap(entries.first)
        XCTAssertEqual(retained.receivedReply, true)
        let reply = try await outbox.receivedReply(retained.id, initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!)
        try await outbox.acknowledgeReceivedReply(retained.id, receiptID: reply.response.id, initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!)
        let delivered = await outbox.allEntries()
        XCTAssertEqual(delivered, [])
    }

    func testSameIdempotencyKeyDoesNotCollapseDifferentAccountsOrDestinations() async throws {
        let bodies = [Data("writer-a".utf8), Data("writer-b".utf8), Data("other-backend".utf8)]
        var ids: [String] = []
        for (index, body) in bodies.enumerated() {
            let host = index == 2 ? "https://other.them.test/talk" : "https://them.test/talk"
            var request = makeRequest(url: URL(string: host)!)
            request.httpMethod = "POST"
            request.setValue(index == 1 ? "writer-b" : "writer-a", forHTTPHeaderField: "X-User-Id")
            request.setValue("same-request-key", forHTTPHeaderField: "X-Idempotency-Key")
            let outbox = makeOutbox(user: index == 1 ? "writer-b" : "writer-a", url: URL(string: host)!)
            let result = try await outbox.enqueue(request: request, body: body, reason: "offline")
            ids.append(result.entry.id)
        }
        XCTAssertEqual(Set(ids).count, 3, "An unrelated account/destination must retain its own queued bytes.")
        let entries = try manifestEntries()
        XCTAssertEqual(entries.count, 3)
        let restored = try entries.map { try PropertyListDecoder().decode(OfflineTalkStoredBody.self,
            from: Data(contentsOf: directory.appendingPathComponent("blobs").appendingPathComponent($0.bodyRef))).validatedBody(matching: $0) }
        XCTAssertEqual(Set(restored), Set(bodies))
    }

    func testQuestionResolutionSurvivesRelaunchAndSuppressesOnlyActiveQuestion() async throws {
        let anonymous = Self.identity("writer-test")
        let outbox = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in anonymous }, backendURLProvider: { URL(string: "https://them.test")! })
        var request = makeRequest(
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

        let relaunched = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in anonymous }, backendURLProvider: { URL(string: "https://them.test")! })
        let queuedIDs = await relaunched.pendingScreenplayQuestionResolutionIDs()
        XCTAssertEqual(queuedIDs, Set(["screenplay-learning-4-project.theme_argument"]))

        var replayedBody = Data()
        let drained = await relaunched.drainDue(
            now: Date().addingTimeInterval(10), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!
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
        let outbox = makeOutbox()
        var request = makeRequest(
            url: URL(string: "https://them.test/memory/screenplay-question/resolve")!
        )
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("queued-\(UUID().uuidString)", forHTTPHeaderField: "X-User-Id")
        request.setValue("question-resolution-account", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("question-account", forHTTPHeaderField: "X-Screenplay-Question-ID")

        do {
            _ = try await outbox.enqueue(request: request, body: Data("{}".utf8), reason: "offline")
            XCTFail("Inactive-owner enqueue must not acknowledge current-owner work.")
        } catch is OfflineTalkPreviousOwnerError { }
        var transportCalls = 0
        let snapshot = await outbox.drainDue(
            now: Date().addingTimeInterval(10), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!
        ) { _ in
            transportCalls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(transportCalls, 0)
        XCTAssertEqual(snapshot.pendingCount, 0)
        let entries = await outbox.allEntries()
        XCTAssertTrue(entries.isEmpty)
        let inactive = try manifestEntries()
        XCTAssertEqual(inactive.count, 1)
        XCTAssertEqual(inactive.first?.retries, 0, "Inactive accounts must retain their retry budget.")
    }

    func testQueuedQuestionIDsAreScopedToTheirOwnerAfterRelaunch() async throws {
        for user in ["writer-a", "writer-b"] {
            var request = makeRequest(url: URL(string: "https://them.test/memory/screenplay-question/resolve")!)
            request.httpMethod = "POST"
            request.setValue(user, forHTTPHeaderField: "X-User-Id")
            request.setValue("question-\(user)", forHTTPHeaderField: "X-Screenplay-Question-ID")
            request.setValue("same-question-key", forHTTPHeaderField: "X-Idempotency-Key")
            _ = try await makeOutbox(user: user).enqueue(request: request, body: Data(user.utf8), reason: "offline")
        }
        for user in ["writer-a", "writer-b"] {
            let identity = BackendAuthRequestIdentity(sessionEpoch: 1, userID: user, clientToken: "client", accessToken: "access")
            let restored = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in identity }, backendURLProvider: { URL(string: "https://them.test")! })
            let ids = await restored.pendingScreenplayQuestionResolutionIDs()
            XCTAssertEqual(ids, ["question-\(user)"])
            let entries = await restored.allEntries()
            XCTAssertEqual(entries.count, 1)
            XCTAssertEqual(try manifestEntries().count, 2, "Filtering must not delete another owner's durable bytes.")
        }
    }

    func testOwnedEnqueueRejectsSupersededLoginAtActorAdmission() async throws {
        let old = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "writer-a", clientToken: "client", accessToken: "access", sessionIntentGeneration: 1)
        let current = BackendAuthRequestIdentity(sessionEpoch: 2, userID: "writer-a", clientToken: "client", accessToken: "access", sessionIntentGeneration: 2)
        let outbox = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in current }, backendURLProvider: { URL(string: "https://them.test")! })
        var request = makeRequest(url: URL(string: "https://them.test/memory/screenplay-question/resolve")!)
        request.httpMethod = "POST"
        request.setValue("writer-a", forHTTPHeaderField: "X-User-Id")
        do {
            _ = try await outbox.enqueue(request: request, body: Data("exact answer".utf8), reason: "offline", initiatingIdentity: old)
            XCTFail("Superseded operation entered the durable queue.")
        } catch BackendMemoryAPIError.server(let code, let message) {
            XCTAssertEqual(code, 409)
            XCTAssertEqual(message, "auth_request_superseded")
        }
        let entries = await outbox.allEntries()
        XCTAssertTrue(entries.isEmpty)
    }

    func testSameOwnerRetryDeduplicatesAcrossAccessTokenRotation() async throws {
        let outbox = makeOutbox(user: "writer-a")
        var request = makeRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("writer-a", forHTTPHeaderField: "X-User-Id")
        request.setValue("request-a", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("Bearer old-fixture", forHTTPHeaderField: "Authorization")
        let first = try await outbox.enqueue(request: request, body: Data("exact words".utf8), reason: "offline")
        request.setValue("Bearer fresh-fixture", forHTTPHeaderField: "Authorization")
        let retry = try await outbox.enqueue(request: request, body: Data("exact words".utf8), reason: "offline")
        XCTAssertEqual(retry.entry.id, first.entry.id)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries.count, 1)
    }

    func testRetryableFailureBacksOffThenDrainsOnLaterSuccess() async throws {
        let outbox = makeOutbox()
        var request = makeRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-retry", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("retry".utf8), reason: "503")
        let start = Date().addingTimeInterval(10)
        var calls = 0

        let failed = await outbox.drainDue(now: start, initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 503)
        }

        XCTAssertEqual(calls, 1)
        XCTAssertEqual(failed.pendingCount, 1)
        var entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 1)
        XCTAssertEqual(entries.first?.status, .pending)

        let notYet = await outbox.drainDue(now: start.addingTimeInterval(1), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(calls, 1)
        XCTAssertEqual(notYet.pendingCount, 1)

        entries = await outbox.allEntries()
        let due = Date(timeIntervalSince1970: entries.first?.nextAttemptAt ?? start.timeIntervalSince1970)
        let drained = await outbox.drainDue(now: due.addingTimeInterval(0.1), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!) { _ in
            calls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(calls, 2)
        XCTAssertEqual(drained.pendingCount, 0)
        let finalEntries = await outbox.allEntries()
        let retained = try XCTUnwrap(finalEntries.first)
        XCTAssertEqual(retained.receivedReply, true)
        let reply = try await outbox.receivedReply(retained.id, initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!)
        try await outbox.acknowledgeReceivedReply(retained.id, receiptID: reply.response.id, initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!)
        let delivered = await outbox.allEntries()
        XCTAssertTrue(delivered.isEmpty)
    }

    func testProviderQuotaParksWithoutRetryingAfterRelaunch() async throws {
        let outbox = makeOutbox()
        var request = makeRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-quota", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("queued".utf8), reason: "offline")
        let quotaBody = Data(#"{"stage":"talk_chat","error_class":"provider_quota","error":"insufficient_quota"}"#.utf8)
        let parked = await outbox.drainDue(now: Date().addingTimeInterval(10), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!) { _ in
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
        let outbox = makeOutbox()
        var request = makeRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-rate-limit", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("queued".utf8), reason: "offline")
        let rateLimitBody = Data(#"{"stage":"rate_limit","error":"rate_limited","retry_after_ms":1200}"#.utf8)
        let pending = await outbox.drainDue(now: Date().addingTimeInterval(10), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!) { _ in
            OfflineTalkOutboxSendResult(statusCode: 429, body: rateLimitBody)
        }

        XCTAssertEqual(pending.pendingCount, 1)
        XCTAssertEqual(pending.parkedCount, 0)
        let entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.retries, 1)
        XCTAssertEqual(entries.first?.status, .pending)
    }

    func testNonRetryableClientErrorParksAndCanBeDeleted() async throws {
        let outbox = makeOutbox()
        var request = makeRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=test", forHTTPHeaderField: "Content-Type")
        request.setValue("idem-park", forHTTPHeaderField: "X-Idempotency-Key")

        _ = try await outbox.enqueue(request: request, body: Data("bad".utf8), reason: "400")
        let parked = await outbox.drainDue(now: Date().addingTimeInterval(10), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!) { _ in
            OfflineTalkOutboxSendResult(statusCode: 400)
        }

        XCTAssertEqual(parked.parkedCount, 1)
        var entries = await outbox.allEntries()
        XCTAssertEqual(entries.first?.status, .parked)

        let cleared = try await outbox.deleteParkedEntries(confirmedEntryIDs: Set(entries.map(\.id)), initiatingIdentity: Self.identity("writer-test"), backendURL: URL(string: "https://them.test")!)
        XCTAssertEqual(cleared.parkedCount, 0)
        entries = await outbox.allEntries()
        XCTAssertEqual(entries, [])
    }
    private static func identity(_ user: String) -> BackendAuthRequestIdentity {
        .init(sessionEpoch: 1, userID: user, clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    }
    private func makeOutbox(user: String = "writer-test", url: URL = URL(string: "https://them.test")!) -> OfflineTalkOutbox {
        let owner = Self.identity(user)
        return OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in owner }, backendURLProvider: { url })
    }
    private func makeRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.setValue("writer-test", forHTTPHeaderField: "X-User-Id")
        return request
    }
    private func manifestEntries() throws -> [OfflineTalkOutboxEntry] {
        try Data(contentsOf: directory.appendingPathComponent("queue.jsonl")).split(separator: 10).map {
            try JSONDecoder().decode(OfflineTalkOutboxEntry.self, from: Data($0))
        }
    }

}
