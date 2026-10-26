import Foundation
import XCTest
@testable import them

final class BackendProjectWriteBoundaryRegressionTests: XCTestCase {
    override func tearDown() {
        ProjectBoundaryProtocol.handler = nil
        super.tearDown()
    }

    func testMetadataDoesNotAdoptAnotherOwnerDuringBootstrap() async {
        await assertBoundary(version: false, switchDuringBootstrap: true)
    }

    func testVersionDoesNotAdoptAnotherOwnerDuringBootstrap() async {
        await assertBoundary(version: true, switchDuringBootstrap: true)
    }

    func testLateMetadataDoesNotPublishStaleSync() async {
        await assertBoundary(version: false, switchDuringBootstrap: false)
    }

    func testLateVersionConflictDoesNotPublishStaleSync() async {
        await assertBoundary(version: true, switchDuringBootstrap: false)
    }

    private func assertBoundary(version: Bool, switchDuringBootstrap: Bool) async {
        let state = ProjectBoundaryState()
        ProjectBoundaryProtocol.handler = { request in
            state.record(request)
            if request.url?.path == "/session" {
                if switchDuringBootstrap { state.switchOwner() }
                return (503, #"{"error":"unavailable"}"#)
            }
            if !switchDuringBootstrap { state.switchOwner() }
            return (version ? 409 : 201,
                #"{"stage":"screenplay_project","status":"saved","project_id":"project-a","version_id":"version-a","state_version":"old-owner-state","project":{"id":"project-a","title":"A"}}"#)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ProjectBoundaryProtocol.self]
        let api = BackendMemoryAPI(session: URLSession(configuration: configuration),
            baseURL: URL(string: "https://project-boundary.test")!,
            requestIdentityProvider: { _ in state.identity() })
        do {
            if version { _ = try await api.upsertScreenplayProjectVersion(projectId: "project-a", draft: "Writer A exact words") }
            else { _ = try await api.upsertScreenplayProject(title: "Writer A story") }
            XCTFail("Superseded work returned a current-owner receipt.")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "auth_request_superseded")
        } catch { XCTFail("Unexpected error: \(error)") }
        let sync = await api.currentSyncState()
        XCTAssertNotEqual(sync.stateVersion, "old-owner-state")
        let writes = state.requests().filter { $0.url?.path.hasPrefix("/screenplay/projects") == true }
        if switchDuringBootstrap { XCTAssertTrue(writes.isEmpty, "Old work was submitted after account switch.") }
        else {
            XCTAssertEqual(writes.count, 1)
            XCTAssertEqual(writes.first?.value(forHTTPHeaderField: "X-User-Id"), "writer-a")
        }
    }
}

private final class ProjectBoundaryState: @unchecked Sendable {
    private let lock = NSLock()
    private var owner = "writer-a"
    private var recorded: [URLRequest] = []
    func switchOwner() { lock.lock(); defer { lock.unlock() }; owner = "writer-b" }
    func identity() -> BackendAuthRequestIdentity {
        lock.lock(); defer { lock.unlock() }
        return .init(sessionEpoch: owner == "writer-a" ? 1 : 2,
            userID: owner, clientToken: "fixture-client", accessToken: "fixture-access")
    }
    func record(_ request: URLRequest) { lock.lock(); defer { lock.unlock() }; recorded.append(request) }
    func requests() -> [URLRequest] { lock.lock(); defer { lock.unlock() }; return recorded }
}

private final class ProjectBoundaryProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, String))?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "project-boundary.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let handler = Self.handler else { client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return }
        let (status, body) = handler(request)
        let response = HTTPURLResponse(url: request.url!, statusCode: status,
            httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
