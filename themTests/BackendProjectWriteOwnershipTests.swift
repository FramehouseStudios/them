import Foundation
import XCTest
@testable import them

final class BackendProjectWriteOwnershipTests: XCTestCase {
    override func tearDown() {
        ProjectWriteOwnershipProtocol.handler = nil
        super.tearDown()
    }

    func testMetadataWriteCannotAdoptAccountChangedDuringBootstrap() async throws {
        try await assertBootstrapSwitchIsRejected(version: false)
    }

    func testVersionWriteCannotAdoptAccountChangedDuringBootstrap() async throws {
        try await assertBootstrapSwitchIsRejected(version: true)
    }

    func testSameAccountNewLoginIntentAlsoInvalidatesPendingWrites() async throws {
        for version in [false, true] { try await assertBootstrapSwitchIsRejected(version: version, sameUser: true) }
    }

    private func assertBootstrapSwitchIsRejected(version: Bool, sameUser: Bool = false) async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                // Change the actual header provider while production bootstrap
                // is awaiting transport. Its error must not resume as writer B.
                state.changeOwner(sameUser: sameUser)
                return .json(#"{"error":"user_auth_required"}"#, status: 401)
            }
            return .json(Self.mutation, status: 201)
        }
        let api = makeAPI(state)
        await assertSuperseded {
            if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Writer A's exact words", initiatingIdentity: state.identity()) }
            else { _ = try await api.upsertScreenplayProject(title: "Writer A's story", initiatingIdentity: state.identity()) }
        }
        XCTAssertTrue(state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }.isEmpty,
                      "Old work must not be sent using the new account's headers.")
    }

    func testLateMetadataReplyCannotPublishAnotherOwnersSyncState() async throws {
        try await assertLateReplyIsRejected(version: false)
    }

    func testLateVersionConflictCannotPublishAnotherOwnersSyncState() async throws {
        try await assertLateReplyIsRejected(version: true)
    }

    private func assertLateReplyIsRejected(version: Bool) async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            state.changeOwner()
            return .json(Self.mutation, status: version ? 409 : 201)
        }
        let api = makeAPI(state)
        await assertSuperseded {
            if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Writer A's words", initiatingIdentity: state.identity()) }
            else { _ = try await api.upsertScreenplayProject(title: "Writer A's story", initiatingIdentity: state.identity()) }
        }
        let current = await api.currentSyncState()
        XCTAssertNotEqual(current.stateVersion, "stale-owner-state", "Stale responses must not emit current-owner sync state.")
        let writes = state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "X-User-Id"), "writer-a")
    }

    func testSameOwnerTokenRotationDuringBootstrapKeepsWritesWorking() async throws {
        for version in [false, true] {
            let state = ProjectWriteOwnershipState()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                if request.url?.path == "/session" {
                    state.rotateToken()
                    return .json(#"{"error":"unavailable"}"#, status: 503)
                }
                return .json(Self.mutation, status: 201)
            }
            let api = makeAPI(state)
            if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Exact draft\r\n \t ", initiatingIdentity: state.identity()) }
            else { _ = try await api.upsertScreenplayProject(title: "A", initiatingIdentity: state.identity()) }
            let writes = state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }
            XCTAssertEqual(writes.count, 1)
            XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-rotated")
            XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "X-User-Id"), "writer-a")
        }
    }

    func testHeaderConstructionCannotRetargetAfterItsOwnerCheck() async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                state.changeAfterNextSnapshot()
                return .json(#"{"error":"unavailable"}"#, status: 503)
            }
            return .json(Self.mutation, status: 201)
        }
        let api = makeAPI(state)
        await assertSuperseded { _ = try await api.upsertScreenplayProject(title: "A", initiatingIdentity: state.identity()) }
        let writes = state.requests().filter { $0.url?.path == "/screenplay/projects" }
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "X-User-Id"), "writer-a",
                       "Headers must use the checked snapshot, not consult current identity again.")
    }

    func testCanonicalIdentitySnapshotCarriesTheLoginIntent() {
        let generation = BackendAuthClient.currentAuthSessionIntentGeneration()
        let snapshot = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        XCTAssertEqual(snapshot.sessionIntentGeneration, generation)
    }

    func testCapturedCallerCannotBeReplacedByOwnerAtActorAdmission() async {
        for version in [false, true] {
            let state = ProjectWriteOwnershipState()
            let initiating = state.identity()
            state.changeOwner()
            ProjectWriteOwnershipProtocol.handler = { request in
                state.record(request)
                return .json(Self.mutation, status: 201)
            }
            let api = makeAPI(state)
            await assertSuperseded {
                if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "A", initiatingIdentity: initiating) }
                else { _ = try await api.upsertScreenplayProject(title: "A", initiatingIdentity: initiating) }
            }
            XCTAssertTrue(state.requests().isEmpty, "A queued old operation must not bootstrap or write as a new owner.")
        }
    }

    func testCancellationDuringRefreshCannotSubmitAnotherVersionRequest() async {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            return .json(#"{"error":"user_auth_required"}"#, status: 401)
        }
        let api = makeAPI(state, refresher: { _ in
            withUnsafeCurrentTask { $0?.cancel() }
            return Self.refreshedState
        })
        let save = Task {
            _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "A", initiatingIdentity: state.identity())
        }
        do { try await save.value; XCTFail("Cancelled save returned a receipt.") }
        catch is CancellationError { }
        catch { XCTFail("Unexpected error: \(error)") }
        XCTAssertEqual(state.requests().filter { $0.url?.path.hasSuffix("/version") == true }.count, 1)
    }

    func testVersionRetryUsesRefreshedTokenOnlyForTheSameLoginIntent() async throws {
        try await assertRefreshBoundary(changedOwner: false)
    }

    func testVersionRetryCannotFollowAChangedOwnerAfterRefresh() async throws {
        try await assertRefreshBoundary(changedOwner: true)
    }

    private func assertRefreshBoundary(changedOwner: Bool) async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            if request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access" {
                return .json(#"{"error":"expired_user_token"}"#, status: 401)
            }
            return .json(Self.mutation, status: 201)
        }
        let api = makeAPI(state, refresher: { expected in
            XCTAssertEqual(expected.userID, "writer-a")
            XCTAssertEqual(expected.sessionIntentGeneration, 1)
            if changedOwner { state.changeOwner() } else { state.rotateToken() }
            return Self.refreshedState
        })
        let save = { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Exact draft\r\n \t ", initiatingIdentity: state.identity()) }
        if changedOwner { await assertSuperseded(save) } else { try await save() }
        let writes = state.requests().filter { $0.url?.path.hasSuffix("/version") == true }
        XCTAssertEqual(writes.count, changedOwner ? 1 : 2)
        XCTAssertTrue(writes.allSatisfy { $0.value(forHTTPHeaderField: "X-User-Id") == "writer-a" })
        if !changedOwner { XCTAssertEqual(writes.last?.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-rotated") }
    }

    func testSameOwnerConflictEnvelopeStillReturnsItsServerVersion() async throws {
        let state = ProjectWriteOwnershipState()
        ProjectWriteOwnershipProtocol.handler = { request in
            if request.url?.path == "/session" { return .json(#"{"error":"unavailable"}"#, status: 503) }
            return .json(#"{"conflict":true,"server_version_id":"server-new","state_version":"same-owner-conflict"}"#, status: 409)
        }
        let result = try await makeAPI(state).upsertScreenplayProjectVersion(projectId: "project-a", draft: "Local words", initiatingIdentity: state.identity())
        XCTAssertEqual(result.payload.conflict, true)
        XCTAssertEqual(result.payload.serverVersionId, "server-new")
        XCTAssertEqual(result.sync.stateVersion, "same-owner-conflict")
    }

    private func makeAPI(_ state: ProjectWriteOwnershipState,
        refresher: @escaping @Sendable (ScreenplayStudioAuthContext) async throws -> BackendAuthSessionState = { _ in .signedOut }
    ) -> BackendMemoryAPI {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProjectWriteOwnershipProtocol.self]
        return BackendMemoryAPI(session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://project-write-ownership.test")!,
            requestIdentityProvider: { _ in state.identity() }, projectWriteAuthRefresher: refresher)
    }

    private func assertSuperseded(_ operation: () async throws -> Void) async {
        do {
            try await operation()
            XCTFail("A superseded owner must cancel the production write/result.")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "auth_request_superseded")
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    private static let mutation = #"{"stage":"screenplay_project","status":"saved","project_id":"project-a","version_id":"version-a","state_version":"stale-owner-state","project":{"id":"project-a","title":"A"}}"#
    private static let refreshedState = BackendAuthSessionState(
        user: BackendAuthUser(userId: "writer-a", email: "writer@example.invalid", authProvider: nil,
            emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil), accessTokenPresent: true, refreshTokenPresent: true,
        accessExpiresAt: 0, refreshExpiresAt: 0, currentSessionId: "fixture", currentFamilyId: "fixture",
        tokenType: "Bearer", pendingEmailVerification: false, verificationRequired: false)
}

private final class ProjectWriteOwnershipState: @unchecked Sendable {
    private let lock = NSLock()
    private var owner = "writer-a"
    private var epoch = 1
    private var intent = 1
    private var token = "fixture-access"
    private var switchAfterSnapshot = false
    private var recorded: [URLRequest] = []

    func identity() -> BackendAuthRequestIdentity {
        lock.lock()
        defer { lock.unlock() }
        let snapshot = BackendAuthRequestIdentity(sessionEpoch: epoch, userID: owner,
            clientToken: "fixture-client", accessToken: token, sessionIntentGeneration: intent)
        if switchAfterSnapshot {
            switchAfterSnapshot = false
            owner = "writer-b"
            intent += 1
            epoch += 1
        }
        return snapshot
    }

    func changeOwner(sameUser: Bool = false) {
        lock.lock()
        defer { lock.unlock() }
        if !sameUser { owner = "writer-b" }
        epoch += 1
        intent += 1
    }

    func rotateToken() {
        lock.lock()
        defer { lock.unlock() }
        token = "fixture-rotated"
        epoch += 1
    }

    func changeAfterNextSnapshot() {
        lock.lock()
        defer { lock.unlock() }
        switchAfterSnapshot = true
    }

    func record(_ request: URLRequest) {
        lock.lock()
        defer { lock.unlock() }
        recorded.append(request)
    }

    func requests() -> [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return recorded
    }
}

private struct ProjectWriteOwnershipResponse {
    let status: Int
    let data: Data
    static func json(_ body: String, status: Int = 200) -> Self { .init(status: status, data: Data(body.utf8)) }
}

private final class ProjectWriteOwnershipProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) throws -> ProjectWriteOwnershipResponse)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "project-write-ownership.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let handler = Self.handler else { throw URLError(.badServerResponse) }
            let result = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: result.status,
                httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: result.data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
