import Foundation
import XCTest
@testable import them

@MainActor
final class ScreenplayRecoveryDestinationTests: XCTestCase {
    func testFailedSelectionCannotBorrowDraftAuthorityFromCachedProject() async throws {
        let suite = "THEM-recovery-destination-\(UUID())"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite); RecoveryDestinationProtocol.handler = nil }
        let destination = "original-\(UUID())", previous = "other-\(UUID())"
        let attempts = RecoveryDestinationAttempts()
        RecoveryDestinationProtocol.handler = { request in
            if request.url?.path == "/screenplay/projects/\(destination)" { attempts.record() }
            return (503, Data(#"{"error":"fixture_detail_load_failed"}"#.utf8))
        }
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [RecoveryDestinationProtocol.self]
        let api = BackendMemoryAPI(session: URLSession(configuration: config), baseURL: URL(string: "https://recovery-destination.test")!)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults), projectSelectionAPI: api)
        model.autosaveEnabled = false
        let exact = "INT. SECOND ROOM - DAY\r\n\r\nCafé. Keep B's words. \t"
        let other = try project(previous, draft: exact)
        model.projects = [try project(destination, draft: "A's separate words"), other]
        model.selectedProjectID = previous; model.selectedProject = other
        model.hydrateDraft(from: other)
        model.outline = try JSONDecoder().decode(BackendScreenplayOutline.self,
            from: Data(#"{"acts":[{"id":"other-act","title":"Other story","order":1}],"scenes":[],"beats":[]}"#.utf8))
        let beforeOutline = model.outline
        XCTAssertTrue(model.isSelectedProjectDraftLoaded)

        await model.selectProject(destination)

        XCTAssertGreaterThan(attempts.count, 0, "The actual detail request must fail, not a fake selection predicate.")
        XCTAssertEqual(model.selectedProjectID, previous, "Failed selection must return to the actual loaded screenplay.")
        XCTAssertEqual(model.selectedProject?.id, previous)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(exact.utf8))
        XCTAssertEqual(model.latestVersionID, "\(previous)-version")
        XCTAssertEqual(model.debugLoadedDraftProjectID, previous)
        XCTAssertEqual(model.outline, beforeOutline)
        XCTAssertTrue(model.isSelectedProjectDraftLoaded)
        XCTAssertNotEqual(model.selectedProjectID, destination, "B's bytes must not authorize a recovery write to A.")
    }

    func testLoadedDraftAuthorityTracksTheActualHydratedProject() throws {
        let suite = "THEM-recovery-authority-\(UUID())", defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults))
        model.autosaveEnabled = false
        let first = try project("draft-authority-a", draft: "A exact words"), second = try project("draft-authority-b", draft: "B exact words")
        model.selectedProjectID = first.id; model.selectedProject = first
        model.hydrateDraft(from: first)
        XCTAssertTrue(model.isSelectedProjectDraftLoaded)
        model.selectedProjectID = second.id; model.selectedProject = second
        XCTAssertFalse(model.isSelectedProjectDraftLoaded)
        model.hydrateDraft(from: second)
        XCTAssertTrue(model.isSelectedProjectDraftLoaded)
        XCTAssertEqual(model.fountainDraft, "B exact words")
    }

    private func project(_ id: String, draft: String) throws -> BackendScreenplayProjectSummary {
        let bytes = try JSONSerialization.data(withJSONObject: ["id": id, "title": id, "activeVersionId": "\(id)-version",
            "versions": [["id": "\(id)-version", "draft": draft, "updatedAt": 1]]])
        return try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: bytes)
    }
}

private final class RecoveryDestinationAttempts: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    func record() { lock.lock(); defer { lock.unlock() }; value += 1 }
    var count: Int { lock.lock(); defer { lock.unlock() }; return value }
}

private final class RecoveryDestinationProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "recovery-destination.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data) = Self.handler!(request)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status,
            httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
