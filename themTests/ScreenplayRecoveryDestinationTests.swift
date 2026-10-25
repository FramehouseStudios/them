import Foundation
import XCTest
@testable import them

@MainActor
final class ScreenplayRecoveryDestinationTests: XCTestCase {
    func testDelayedProjectReadCannotRollbackANewerConfirmedPage() async throws {
        let suite = "THEM-recovery-delayed-read-\(UUID())", defaults = UserDefaults(suiteName: suite)!
        let gate = RecoveryDestinationResponseGate()
        defer {
            gate.release(); defaults.removePersistentDomain(forName: suite)
            RecoveryDestinationProtocol.handler = nil; RecoveryDestinationProtocol.responseScheduler = nil
        }
        let id = "recovered-delayed-page", before = "INT. ROOM - NIGHT\n\nOriginal words."
        let after = before + "\n\nMARA\nKeep the recovered scene. \t"
        let requested = expectation(description: "Old project read captured before the new receipt")
        let response = try JSONSerialization.data(withJSONObject: ["project": ["id": id, "title": id,
            "activeVersionId": "old-version", "versions": [["id": "old-version", "draft": before, "updatedAt": 1]]]])
        RecoveryDestinationProtocol.handler = { _ in (200, response) }
        RecoveryDestinationProtocol.responseScheduler = { request, send in
            if request.url?.path == "/screenplay/projects/\(id)" { gate.hold(send); requested.fulfill() }
            else { send() }
        }
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [RecoveryDestinationProtocol.self]
        let api = BackendMemoryAPI(session: URLSession(configuration: config), baseURL: URL(string: "https://recovery-destination.test")!)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: .init(defaults: defaults), projectSelectionAPI: api)
        model.autosaveEnabled = false
        let old = try project(id, draft: before, versionID: "old-version")
        model.selectedProjectID = id; model.selectedProject = old; model.hydrateDraft(from: old)
        let refresh = Task { await model.refreshSelectedProjectForDebug() }
        await fulfillment(of: [requested], timeout: 3)
        let saved = try project(id, draft: after, versionID: "confirmed-recovery-version")
        model.selectedProject = saved; model.hydrateDraft(from: saved)
        gate.release()
        await refresh.value

        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(after.utf8), "A read started before the save must not replace its confirmed page.")
        XCTAssertEqual(model.latestVersionID, "confirmed-recovery-version")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
    }

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

    private func project(_ id: String, draft: String, versionID: String? = nil) throws -> BackendScreenplayProjectSummary {
        let version = versionID ?? "\(id)-version"
        let bytes = try JSONSerialization.data(withJSONObject: ["id": id, "title": id, "activeVersionId": version,
            "versions": [["id": version, "draft": draft, "updatedAt": 1]]])
        return try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: bytes)
    }
}

private final class RecoveryDestinationAttempts: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    func record() { lock.lock(); defer { lock.unlock() }; value += 1 }
    var count: Int { lock.lock(); defer { lock.unlock() }; return value }
}

private final class RecoveryDestinationResponseGate: @unchecked Sendable {
    private let lock = NSLock()
    private var response: (() -> Void)?
    func hold(_ send: @escaping () -> Void) { lock.lock(); response = send; lock.unlock() }
    func release() { lock.lock(); let send = response; response = nil; lock.unlock(); send?() }
}

private final class RecoveryDestinationProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var responseScheduler: ((URLRequest, @escaping () -> Void) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "recovery-destination.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data) = Self.handler!(request)
        let send = {
            self.client?.urlProtocol(self, didReceive: HTTPURLResponse(url: self.request.url!, statusCode: status,
                httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: data)
            self.client?.urlProtocolDidFinishLoading(self)
        }
        if let schedule = Self.responseScheduler { schedule(request, send) } else { send() }
    }
    override func stopLoading() {}
}
