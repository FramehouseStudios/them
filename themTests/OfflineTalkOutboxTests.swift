import XCTest
@testable import them

private actor OfflineTalkAuthenticationScript {
    enum RefreshOutcome: Sendable {
        case success(BackendRequestAuthentication)
        case revoked
    }

    struct Call: Equatable, Sendable {
        let request: OfflineTalkOutboxAuthenticationRequest
        let expectedUserID: String
    }

    enum ScriptError: Error {
        case refreshRevoked
    }

    private let current: BackendRequestAuthentication
    private let refreshOutcome: RefreshOutcome
    private var calls: [Call] = []

    init(
        current: BackendRequestAuthentication,
        refreshOutcome: RefreshOutcome
    ) {
        self.current = current
        self.refreshOutcome = refreshOutcome
    }

    func authentication(
        for request: OfflineTalkOutboxAuthenticationRequest,
        expectedUserID: String
    ) throws -> BackendRequestAuthentication {
        calls.append(Call(request: request, expectedUserID: expectedUserID))
        guard request != .current else { return current }
        switch refreshOutcome {
        case .success(let authentication):
            return authentication
        case .revoked:
            throw ScriptError.refreshRevoked
        }
    }

    func recordedCalls() -> [Call] {
        calls
    }
}

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

        let relaunched = makeOutbox()
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries.first?.idempotencyKey, "idem-1")
        let snapshot = await relaunched.snapshot()
        XCTAssertEqual(snapshot.pendingCount, 1)
    }

    func testEnqueueManifestExcludesCredentialBearingHeaders() async throws {
        let outbox = makeOutbox()
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
        let outbox = makeOutbox()
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

        let relaunched = makeOutbox()
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
        let outbox = makeOutbox()
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

        let currentAuthentication = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "new-client",
            accessToken: "new-access",
            appToken: "new-app"
        )
        let authenticationScript = OfflineTalkAuthenticationScript(
            current: currentAuthentication,
            refreshOutcome: .success(currentAuthentication)
        )
        let relaunched = OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: { request, expectedUserID in
                try await authenticationScript.authentication(
                    for: request,
                    expectedUserID: expectedUserID
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
        let authenticationCalls = await authenticationScript.recordedCalls()
        XCTAssertEqual(
            authenticationCalls,
            [
                .init(request: .current, expectedUserID: "writer-1"),
            ]
        )
    }

    func testKnownExpiredCredentialsRefreshBeforeReplayWithoutPersistingTokens() async throws {
        let outbox = makeOutbox()
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("writer-1", forHTTPHeaderField: "X-User-Id")
        request.setValue("idem-expired", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("Bearer stale-access", forHTTPHeaderField: "Authorization")
        request.setValue("stale-client", forHTTPHeaderField: "X-Client-Token")
        let body = Data("expired-credential-body".utf8)
        _ = try await outbox.enqueue(request: request, body: body, reason: "offline")

        let expired = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "expired-client",
            accessToken: "expired-access",
            appToken: "current-app",
            accessTokenExpired: true,
            clientTokenExpired: true
        )
        let refreshed = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "fresh-client",
            accessToken: "fresh-access",
            appToken: "current-app"
        )
        let authenticationScript = OfflineTalkAuthenticationScript(
            current: expired,
            refreshOutcome: .success(refreshed)
        )
        let relaunched = OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: { request, expectedUserID in
                try await authenticationScript.authentication(
                    for: request,
                    expectedUserID: expectedUserID
                )
            }
        )
        var transportCalls = 0
        let drained = await relaunched.drainDue(now: Date().addingTimeInterval(10)) { replayRequest in
            transportCalls += 1
            XCTAssertEqual(replayRequest.httpBody, body)
            XCTAssertEqual(
                replayRequest.value(forHTTPHeaderField: "X-Idempotency-Key"),
                "idem-expired"
            )
            XCTAssertEqual(
                replayRequest.value(forHTTPHeaderField: "Authorization"),
                "Bearer fresh-access"
            )
            XCTAssertEqual(
                replayRequest.value(forHTTPHeaderField: "X-Client-Token"),
                "fresh-client"
            )
            let manifest = try String(
                contentsOf: self.directory.appendingPathComponent("queue.jsonl"),
                encoding: .utf8
            )
            XCTAssertFalse(manifest.contains("expired-access"))
            XCTAssertFalse(manifest.contains("expired-client"))
            XCTAssertFalse(manifest.contains("fresh-access"))
            XCTAssertFalse(manifest.contains("fresh-client"))
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(transportCalls, 1)
        XCTAssertEqual(drained.pendingCount, 0)
        let authenticationCalls = await authenticationScript.recordedCalls()
        XCTAssertEqual(
            authenticationCalls,
            [
                .init(request: .current, expectedUserID: "writer-1"),
                .init(request: .refreshExpired, expectedUserID: "writer-1"),
            ]
        )
    }

    func testAuthenticationRejectionRefreshesOnceAndReusesExactAction() async throws {
        let outbox = makeOutbox()
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("writer-1", forHTTPHeaderField: "X-User-Id")
        request.setValue("idem-auth-retry", forHTTPHeaderField: "X-Idempotency-Key")
        let body = Data("auth-retry-body".utf8)
        _ = try await outbox.enqueue(request: request, body: body, reason: "offline")

        let current = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "current-client",
            accessToken: "current-access",
            appToken: "current-app"
        )
        let refreshed = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "refreshed-client",
            accessToken: "refreshed-access",
            appToken: "current-app"
        )
        let authenticationScript = OfflineTalkAuthenticationScript(
            current: current,
            refreshOutcome: .success(refreshed)
        )
        let relaunched = OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: { request, expectedUserID in
                try await authenticationScript.authentication(
                    for: request,
                    expectedUserID: expectedUserID
                )
            }
        )
        var replayedBodies: [Data] = []
        var replayedIdempotencyKeys: [String] = []
        var replayedAuthorizations: [String] = []
        let drained = await relaunched.drainDue(now: Date().addingTimeInterval(10)) { replayRequest in
            replayedBodies.append(replayRequest.httpBody ?? Data())
            replayedIdempotencyKeys.append(
                replayRequest.value(forHTTPHeaderField: "X-Idempotency-Key") ?? ""
            )
            replayedAuthorizations.append(
                replayRequest.value(forHTTPHeaderField: "Authorization") ?? ""
            )
            if replayedBodies.count == 1 {
                return OfflineTalkOutboxSendResult(
                    statusCode: 401,
                    body: Data(#"{"stage":"auth_user","error":"expired_user_token"}"#.utf8)
                )
            }
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(replayedBodies, [body, body])
        XCTAssertEqual(replayedIdempotencyKeys, ["idem-auth-retry", "idem-auth-retry"])
        XCTAssertEqual(
            replayedAuthorizations,
            ["Bearer current-access", "Bearer refreshed-access"]
        )
        XCTAssertEqual(drained.pendingCount, 0)
        let remainingEntries = await relaunched.allEntries()
        XCTAssertTrue(remainingEntries.isEmpty)
        let authenticationCalls = await authenticationScript.recordedCalls()
        XCTAssertEqual(
            authenticationCalls,
            [
                .init(request: .current, expectedUserID: "writer-1"),
                .init(request: .refreshAfterRejection, expectedUserID: "writer-1"),
            ]
        )

        var duplicateSuccessCalls = 0
        _ = await relaunched.drainDue(now: Date().addingTimeInterval(20)) { _ in
            duplicateSuccessCalls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }
        XCTAssertEqual(duplicateSuccessCalls, 0)
    }

    func testFailedRefreshOfKnownExpiredCredentialsDoesNotSendStaleRequest() async throws {
        let outbox = makeOutbox()
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("writer-1", forHTTPHeaderField: "X-User-Id")
        request.setValue("idem-expired-refresh-failure", forHTTPHeaderField: "X-Idempotency-Key")
        _ = try await outbox.enqueue(
            request: request,
            body: Data("expired-refresh-failure-body".utf8),
            reason: "offline"
        )

        let expired = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "expired-client",
            accessToken: "expired-access",
            appToken: "current-app",
            accessTokenExpired: true,
            clientTokenExpired: true
        )
        let authenticationScript = OfflineTalkAuthenticationScript(
            current: expired,
            refreshOutcome: .revoked
        )
        let relaunched = OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: { request, expectedUserID in
                try await authenticationScript.authentication(
                    for: request,
                    expectedUserID: expectedUserID
                )
            }
        )
        var transportCalls = 0
        let snapshot = await relaunched.drainDue(now: Date().addingTimeInterval(10)) { _ in
            transportCalls += 1
            return OfflineTalkOutboxSendResult(statusCode: 200)
        }

        XCTAssertEqual(transportCalls, 0)
        XCTAssertEqual(snapshot.pendingCount, 1)
        XCTAssertEqual(snapshot.parkedCount, 0)
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.first?.status, .pending)
        XCTAssertEqual(entries.first?.retries, 1)
        let authenticationCalls = await authenticationScript.recordedCalls()
        XCTAssertEqual(
            authenticationCalls,
            [
                .init(request: .current, expectedUserID: "writer-1"),
                .init(request: .refreshExpired, expectedUserID: "writer-1"),
            ]
        )
    }

    func testRevokedRefreshAfterAuthenticationRejectionBacksOffWithoutParking() async throws {
        let outbox = makeOutbox()
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("writer-1", forHTTPHeaderField: "X-User-Id")
        request.setValue("idem-revoked-refresh", forHTTPHeaderField: "X-Idempotency-Key")
        _ = try await outbox.enqueue(
            request: request,
            body: Data("revoked-refresh-body".utf8),
            reason: "offline"
        )

        let current = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "current-client",
            accessToken: "rejected-access",
            appToken: "current-app"
        )
        let authenticationScript = OfflineTalkAuthenticationScript(
            current: current,
            refreshOutcome: .revoked
        )
        let relaunched = OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: { request, expectedUserID in
                try await authenticationScript.authentication(
                    for: request,
                    expectedUserID: expectedUserID
                )
            }
        )
        var transportCalls = 0
        let snapshot = await relaunched.drainDue(now: Date().addingTimeInterval(10)) { _ in
            transportCalls += 1
            return OfflineTalkOutboxSendResult(
                statusCode: 401,
                body: Data(#"{"stage":"auth_user","error":"revoked_user_token"}"#.utf8)
            )
        }

        XCTAssertEqual(transportCalls, 1)
        XCTAssertEqual(snapshot.pendingCount, 1)
        XCTAssertEqual(snapshot.parkedCount, 0)
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.first?.status, .pending)
        XCTAssertEqual(entries.first?.retries, 1)
        let authenticationCalls = await authenticationScript.recordedCalls()
        XCTAssertEqual(
            authenticationCalls,
            [
                .init(request: .current, expectedUserID: "writer-1"),
                .init(request: .refreshAfterRejection, expectedUserID: "writer-1"),
            ]
        )
    }

    func testAuthenticationRefreshCannotReplayAcrossAccountChange() async throws {
        let outbox = makeOutbox()
        var request = URLRequest(url: URL(string: "https://them.test/talk")!)
        request.httpMethod = "POST"
        request.setValue("writer-1", forHTTPHeaderField: "X-User-Id")
        request.setValue("idem-account-change", forHTTPHeaderField: "X-Idempotency-Key")
        _ = try await outbox.enqueue(
            request: request,
            body: Data("account-change-body".utf8),
            reason: "offline"
        )

        let current = BackendRequestAuthentication(
            userID: "writer-1",
            clientToken: "current-client",
            accessToken: "rejected-access",
            appToken: "current-app"
        )
        let differentAccount = BackendRequestAuthentication(
            userID: "writer-2",
            clientToken: "writer-2-client",
            accessToken: "writer-2-access",
            appToken: "current-app"
        )
        let authenticationScript = OfflineTalkAuthenticationScript(
            current: current,
            refreshOutcome: .success(differentAccount)
        )
        let relaunched = OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: { request, expectedUserID in
                try await authenticationScript.authentication(
                    for: request,
                    expectedUserID: expectedUserID
                )
            }
        )
        var transportCalls = 0
        let snapshot = await relaunched.drainDue(now: Date().addingTimeInterval(10)) { _ in
            transportCalls += 1
            return OfflineTalkOutboxSendResult(statusCode: 401)
        }

        XCTAssertEqual(transportCalls, 1)
        XCTAssertEqual(snapshot.pendingCount, 1)
        XCTAssertEqual(snapshot.parkedCount, 0)
        let entries = await relaunched.allEntries()
        XCTAssertEqual(entries.first?.status, .pending)
        XCTAssertEqual(entries.first?.retries, 1)
        XCTAssertTrue(
            entries.first?.lastError?.contains("different signed-in account") == true
        )
        let authenticationCalls = await authenticationScript.recordedCalls()
        XCTAssertEqual(
            authenticationCalls,
            [
                .init(request: .current, expectedUserID: "writer-1"),
                .init(request: .refreshAfterRejection, expectedUserID: "writer-1"),
            ]
        )
    }

    func testDrainDueSendsPendingEntryAndRemovesItOnSuccess() async throws {
        let outbox = makeOutbox()
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
        let outbox = makeOutbox()
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

        let relaunched = makeOutbox()
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
        let outbox = makeOutbox()
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
        let outbox = makeOutbox()
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
        let outbox = makeOutbox()
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
        let outbox = makeOutbox()
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
        let outbox = makeOutbox()
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

    private func makeOutbox(
        authentication: BackendRequestAuthentication = BackendRequestAuthentication(
            userID: "",
            clientToken: "",
            accessToken: "",
            appToken: ""
        )
    ) -> OfflineTalkOutbox {
        OfflineTalkOutbox(
            storageDirectory: directory,
            authenticationProvider: { _, _ in authentication }
        )
    }
}
