import Foundation
import XCTest
@testable import them

@MainActor
final class BackendTalkOwnershipTests: XCTestCase {
    override func tearDown() {
        TalkOwnerProtocol.handler = nil
        super.tearDown()
    }

    func testAccountSwitchOn401DoesNotRefreshOrRetryAsNewWriter() async throws {
        try await rejectSwitchedOwner(status: 401)
    }

    func testAccountSwitchOn503DoesNotRetryOrQueueAsNewWriter() async throws {
        try await rejectSwitchedOwner(status: 503)
    }

    func testSameWriterNewLoginIntentDoesNotAcceptPreviousReply() async throws {
        try await rejectSwitchedOwner(status: 200, sameUser: true)
    }

    func testAccountSwitchOnSuccessDoesNotPublishOrReturnPreviousReply() async throws {
        try await rejectSwitchedOwner(status: 200)
    }

    func testAccountSwitchOnTransportFailureDoesNotRetryOrQueue() async throws {
        let state = TalkOwnerState()
        TalkOwnerProtocol.handler = { request in
            guard request.url?.path == "/talk" else { return Self.bootstrap(request) }
            state.record(request)
            state.switchOwner()
            throw URLError(.networkConnectionLost)
        }
        await assertSuperseded { try await self.send(self.client(state)) }
        XCTAssertEqual(state.requests.count, 1)
        XCTAssertEqual(state.refreshCount, 0)
    }

    func testSameOwnerTokenRefreshKeepsRequestKeyAndCapturedOwner() async throws {
        let state = TalkOwnerState()
        TalkOwnerProtocol.handler = { request in
            guard request.url?.path == "/talk" else { return Self.bootstrap(request) }
            state.record(request)
            return state.requests.count == 1 ? Self.unauthorized : Self.success
        }
        let expectedOwner = state.snapshot().ownerContext
        let api = client(state)
        let result = try await send(api)
        defer { try? FileManager.default.removeItem(at: result.audioURL) }
        XCTAssertEqual(state.requests.count, 2)
        XCTAssertEqual(state.requests.map { $0.value(forHTTPHeaderField: "Authorization") },
                       ["Bearer access-a", "Bearer access-rotated"])
        XCTAssertEqual(state.requests.map { $0.value(forHTTPHeaderField: "X-Idempotency-Key") },
                       ["one-logical-page", "one-logical-page"])
        XCTAssertTrue(state.requests.allSatisfy { $0.value(forHTTPHeaderField: "X-User-Id") == "writer-owner-a" })
        XCTAssertEqual(state.refreshCount, 1)
        XCTAssertEqual(state.refreshOwner, expectedOwner)
    }

    func testAccountSwitchDuringRefreshCannotRetryOldPageUnderNewAccount() async throws {
        let state = TalkOwnerState()
        TalkOwnerProtocol.handler = { request in
            guard request.url?.path == "/talk" else { return Self.bootstrap(request) }
            state.record(request)
            return Self.unauthorized
        }
        let api = client(state, switchesOwnerOnRefresh: true)
        await assertSuperseded { try await self.send(api) }
        XCTAssertEqual(state.requests.count, 1)
        XCTAssertEqual(state.refreshCount, 1)
    }

    func testAccountSwitchDuringSessionBootstrapCannotSendPage() async throws {
        // This case must exercise /session, not a credential left by another
        // class in the full bundle. Only the erased test host is affected.
        BackendAuthClient.clearSharedClientToken()
        let state = TalkOwnerState()
        TalkOwnerProtocol.handler = { request in
            if request.url?.path == "/session" {
                state.switchOwner()
                return Self.unauthorized
            }
            if request.url?.path == "/talk" { state.record(request) }
            return Self.bootstrap(request)
        }
        await assertSuperseded { try await self.send(self.client(state)) }
        XCTAssertTrue(state.requests.isEmpty)
        XCTAssertEqual(state.refreshCount, 0)
    }

    func testFailedClientSessionRefreshDoesNotDeleteSharedCredential() async throws {
        let state = TalkOwnerState()
        XCTAssertTrue(BackendAuthClient.persistSharedClientTokenIfCurrent("kept-fixture-token",
            expiryRaw: ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600)),
            baseURLRaw: "https://talk-owner.test", expectedSessionEpoch: BackendAuthClient.currentAuthSessionEpoch()))
        defer { BackendAuthClient.clearSharedClientToken() }
        TalkOwnerProtocol.handler = { request in
            guard request.url?.path == "/talk" else { return Self.bootstrap(request) }
            state.record(request)
            return .init(status: 401, headers: ["Content-Type": "application/json"],
                         body: Data(#"{"stage":"auth_client","error":"expired"}"#.utf8))
        }
        do { _ = try await send(client(state)); XCTFail("Refresh should fail") } catch {}
        XCTAssertEqual(BackendAuthClient.sharedClientToken(), "kept-fixture-token")
        XCTAssertEqual(state.requests.count, 1)
    }

    func testMetadataLookupAccountSwitchRejectsFinalResult() async throws {
        let state = TalkOwnerState()
        defer { BackendAuthClient.clearSharedClientToken() }
        TalkOwnerProtocol.handler = { request in
            if request.url?.path == "/talk" {
                state.record(request)
                var headers = Self.success.headers
                headers["x-turn-id"] = "fixture-turn"
                headers["x-session-id"] = "fixture-session"
                headers["x-turn-meta-available"] = "1"
                return .init(status: 200, headers: headers, body: Self.success.body)
            }
            if request.url?.path == "/talk/turn/fixture-turn" {
                XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer access-a")
                state.switchOwner()
                return .init(status: 200, headers: ["Content-Type": "application/json"],
                             body: Data(#"{"turn_id":"fixture-turn","reply":"late"}"#.utf8))
            }
            return Self.bootstrap(request)
        }
        await assertSuperseded { try await self.send(self.client(state)) }
        XCTAssertEqual(state.requests.count, 1)
    }

    func testPageActivityOlderAccountCannotClearNewerRequest() {
        let activity = BackendTalkPageActivity()
        let old = UUID(), new = UUID()
        activity.begin(old, owner: .init(userID: "a", sessionIntentGeneration: 1))
        activity.begin(new, owner: .init(userID: "b", sessionIntentGeneration: 2))
        XCTAssertNil(activity.finish(old, currentOwner: .init(userID: "b", sessionIntentGeneration: 2)))
        XCTAssertEqual(activity.finish(new, currentOwner: .init(userID: "b", sessionIntentGeneration: 2)), false)
    }

    func testPageActivityOverlappingSameOwnerAttemptsRemainInFlight() {
        let activity = BackendTalkPageActivity()
        let first = UUID(), second = UUID(), owner = ScreenplayStudioAuthContext(userID: "a", sessionIntentGeneration: 1)
        activity.begin(first, owner: owner)
        activity.begin(second, owner: owner)
        XCTAssertEqual(activity.finish(first, currentOwner: owner), true)
        XCTAssertEqual(activity.finish(second, currentOwner: owner), false)
        XCTAssertNil(activity.finish(first, currentOwner: owner))
    }

    func testPageActivityConcurrentAttemptsSerializeFinalPublication() {
        let activity = BackendTalkPageActivity(), state = TalkOwnerState()
        let owner = state.snapshot().ownerContext
        DispatchQueue.concurrentPerform(iterations: 100) { _ in
            let id = UUID()
            activity.begin(id, owner: owner, onChange: { state.recordActivity($0) })
            activity.finish(id, currentOwner: owner, onChange: { state.recordActivity($0) })
        }
        XCTAssertEqual(state.activityEvents.count, 200)
        XCTAssertEqual(state.activityEvents.last, false)
    }

    private func rejectSwitchedOwner(status: Int, sameUser: Bool = false) async throws {
        let state = TalkOwnerState()
        let callback = expectation(description: "An old owner's reply must not reach the UI")
        callback.isInverted = true
        TalkOwnerProtocol.handler = { request in
            guard request.url?.path == "/talk" else { return Self.bootstrap(request) }
            state.record(request)
            state.switchOwner(sameUser: sameUser)
            return status == 200 ? Self.success : .init(status: status,
                headers: ["Content-Type": "application/json"], body: Self.unauthorized.body)
        }
        await assertSuperseded {
            try await self.send(self.client(state), onText: { _ in callback.fulfill() },
                                onMetadata: { _ in callback.fulfill() }, onAudio: { _ in callback.fulfill() })
        }
        await fulfillment(of: [callback], timeout: 0.1)
        XCTAssertEqual(state.requests.count, 1)
        XCTAssertEqual(state.refreshCount, 0)
    }

    private func assertSuperseded(_ operation: () async throws -> BackendTalkResult,
                                  file: StaticString = #filePath, line: UInt = #line) async {
        do { _ = try await operation(); XCTFail("Old-owner operation was accepted", file: file, line: line) }
        catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409, file: file, line: line)
            XCTAssertEqual(message, "auth_request_superseded", file: file, line: line)
        } catch { XCTFail("Unexpected error: \(error)", file: file, line: line) }
    }

    private func client(_ state: TalkOwnerState, switchesOwnerOnRefresh: Bool = false) -> BackendClient {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [TalkOwnerProtocol.self]
        let url = URL(string: "https://talk-owner.test")!
        return BackendClient(baseURL: url, fallbackURL: url, urlSession: URLSession(configuration: config),
            persistBackendBaseURL: false, requestIdentityProvider: { _ in state.snapshot() },
            talkAuthRefresher: { owner in
                state.refreshed(switchOwner: switchesOwnerOnRefresh, owner: owner)
                return Self.refreshedState
            })
    }

    private func send(_ client: BackendClient, onText: ((String) -> Void)? = nil,
                      onMetadata: ((BackendTalkResponseMetadata) -> Void)? = nil,
                      onAudio: ((URL) -> Void)? = nil) async throws -> BackendTalkResult {
        try await client.talk(fileURL: URL(fileURLWithPath: "/fixture.wav"), fileDataOverride: Self.success.body,
            idempotencyKey: "one-logical-page", studioMetadata: .init(
                screenplayProjectId: "project-a", screenplayDocumentRevisionId: "version-a",
                screenplayTarget: "page", screenplayPromptSource: "voice", screenplayWriteId: "write-a",
                screenplayAnchorLine: nil, screenplayAnchorEndLine: nil, screenplayInsertionMode: "append",
                screenplayAnchorSceneLabel: "", screenplayAnchorDraftSceneId: "", screenplayAnchorOutlineSceneId: "",
                screenplayAnchorOutlineBeatIds: [], screenplayAnchorScriptNodeId: "", screenplayNoteTitle: "",
                screenplayNoteBody: "", screenplayInsertedText: "", screenplayReplacementApplied: false,
                screenplayReplacedWriteId: "", screenplayRevisedBlockText: "", screenplayResolvedAnchorExcerpt: ""),
            onResponseMetadataReady: onMetadata, onFirstAudioSegmentReady: onAudio, onTextReady: onText)
    }

    nonisolated private static func bootstrap(_ request: URLRequest) -> TalkOwnerResponse {
        request.url?.path == "/health" ? .init(status: 200, headers: ["Content-Type": "application/json"], body: Data(#"{"ok":true}"#.utf8)) :
            .init(status: 403, headers: ["Content-Type": "application/json"], body: Data(#"{"error":"fixture_no_session"}"#.utf8))
    }
    nonisolated private static var unauthorized: TalkOwnerResponse {
        .init(status: 401, headers: ["Content-Type": "application/json"],
              body: Data(#"{"stage":"auth_user","error":"user_auth_required"}"#.utf8))
    }
    nonisolated private static var refreshedState: BackendAuthSessionState {
        .init(user: BackendAuthUser(userId: "writer-owner-a", email: "fixture@example.invalid", authProvider: nil,
            emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil), accessTokenPresent: true,
            refreshTokenPresent: true, accessExpiresAt: 0, refreshExpiresAt: 0, currentSessionId: "fixture",
            currentFamilyId: "fixture", tokenType: "Bearer", pendingEmailVerification: false, verificationRequired: false)
    }
    nonisolated private static var success: TalkOwnerResponse {
        .init(status: 200, headers: ["Content-Type": "audio/wav", "x-reply": "Fixture reply", "x-tts-first-bytes": "1200"],
              body: Data("RIFF0000WAVE".utf8) + Data(repeating: 0, count: 1200))
    }
}

private final class TalkOwnerState: @unchecked Sendable {
    private let lock = NSLock()
    private var identity = BackendAuthRequestIdentity(sessionEpoch: BackendAuthClient.currentAuthSessionEpoch(), userID: "writer-owner-a",
        clientToken: "fixture-client", accessToken: "access-a", sessionIntentGeneration: 1)
    private var recorded: [URLRequest] = []
    private var refreshes = 0
    private var refreshedOwner: ScreenplayStudioAuthContext?
    private var activity: [Bool] = []
    func snapshot() -> BackendAuthRequestIdentity { lock.lock(); defer { lock.unlock() }; return identity }
    var requests: [URLRequest] { lock.lock(); defer { lock.unlock() }; return recorded }
    var refreshCount: Int { lock.lock(); defer { lock.unlock() }; return refreshes }
    var refreshOwner: ScreenplayStudioAuthContext? { lock.lock(); defer { lock.unlock() }; return refreshedOwner }
    var activityEvents: [Bool] { lock.lock(); defer { lock.unlock() }; return activity }
    func recordActivity(_ value: Bool) { lock.lock(); defer { lock.unlock() }; activity.append(value) }
    func record(_ request: URLRequest) { lock.lock(); defer { lock.unlock() }; recorded.append(request) }
    func switchOwner(sameUser: Bool = false) {
        lock.lock(); defer { lock.unlock() }
        identity = .init(sessionEpoch: 2, userID: sameUser ? "writer-owner-a" : "writer-owner-b",
                         clientToken: "fixture-b", accessToken: "access-b", sessionIntentGeneration: 2)
    }
    func refreshed(switchOwner: Bool, owner: ScreenplayStudioAuthContext) {
        lock.lock(); defer { lock.unlock() }; refreshes += 1
        refreshedOwner = owner
        identity = .init(sessionEpoch: 2, userID: switchOwner ? "writer-owner-b" : "writer-owner-a",
                         clientToken: "fixture-client", accessToken: "access-rotated", sessionIntentGeneration: switchOwner ? 2 : 1)
    }
}

private struct TalkOwnerResponse { let status: Int; let headers: [String: String]; let body: Data }
private final class TalkOwnerProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> TalkOwnerResponse)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "talk-owner.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let response = try Self.handler!(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: response.status,
                httpVersion: "HTTP/1.1", headerFields: response.headers)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: response.body)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
