import XCTest
import ScreenplayStudio
@testable import them

@MainActor
final class StudioCraftReportSelectionTests: XCTestCase {
    func testStoredReportReplacesAutomaticDefaultAndScopesOverrideToThatFramework() async throws {
        var overrideBody: [String: Any]?
        let model = try makeModel { stub in
            if stub.request.url?.path == "/craft/overrides" {
                overrideBody = try? JSONSerialization.jsonObject(with: self.body(stub.request)) as? [String: Any]
                stub.respond(#"{"id":"override-1","turnId":"all-is-lost","action":"mark-present","projectId":"craft-project","versionId":"v1","frameworkId":"save-the-cat"}"#)
            } else { self.respondNormally(stub) }
        }
        await model.loadCraftReport()
        XCTAssertEqual(model.craftReport?.framework.id, "save-the-cat")
        XCTAssertEqual(model.selectedCraftFrameworkID, "save-the-cat")
        await model.createCraftTurnOverride(.init(turnId: "all-is-lost", action: "mark-present",
            reason: nil, sceneId: nil, page: 76, userId: nil, expiresAt: nil))
        XCTAssertEqual(overrideBody?["frameworkId"] as? String, "save-the-cat")
        XCTAssertEqual(overrideBody?["projectId"] as? String, "craft-project")
        XCTAssertEqual(overrideBody?["versionId"] as? String, "v1")
        XCTAssertTrue(model.craftInfoText.hasPrefix("Override saved"))
        model.resetCraftReportForProjectChange()
        XCTAssertEqual(model.selectedCraftFrameworkID, "three-act")
        await model.loadCraftReport()
        XCTAssertEqual(model.selectedCraftFrameworkID, "save-the-cat", "A reset default is still automatic")
    }

    func testExplicitSelectionIsNotOverriddenByAnIncompatibleStoredReport() async throws {
        let model = try makeModel { self.respondNormally($0) }
        model.selectCraftFramework("three-act")
        await model.loadCraftReport()
        XCTAssertEqual(model.selectedCraftFrameworkID, "three-act")
        XCTAssertNil(model.craftReport)
        XCTAssertTrue(model.craftInfoText.contains("Analyze with the selected framework"))
    }

    func testWriterChoiceDuringFetchWinsOverTheIncomingReport() async throws {
        for pendingPath in ["/craft/reports/", "/craft/twist/accepted"] {
            var model: ScreenplayStudioViewModel!
            model = try makeModel { stub in
                if stub.request.url?.path.contains(pendingPath) == true {
                    model.selectCraftFramework("story-circle")
                }
                self.respondNormally(stub)
            }
            await model.loadCraftReport()
            XCTAssertEqual(model.selectedCraftFrameworkID, "story-circle")
            XCTAssertNil(model.craftReport)
            XCTAssertFalse(model.craftInfoText.contains("report loaded"))
        }
    }

    func testAnalysisCannotReplaceAnExplicitChoiceWithADifferentResponseFramework() async throws {
        let model = try makeModel { stub in
            if stub.request.url?.path == "/craft/analyze" { stub.respond(self.report()) }
            else { self.respondNormally(stub) }
        }
        model.selectCraftFramework("three-act")
        await model.analyzeCraftReport()
        XCTAssertEqual(model.selectedCraftFrameworkID, "three-act")
        XCTAssertNil(model.craftReport)
        XCTAssertTrue(model.craftErrorText.contains("framework"))
    }

    func testLateSuccessAndErrorCannotApplyAcrossProjectVersionOrAuthenticationChanges() async throws {
        for change in ["project", "version", "auth"] {
            for status in [200, 404] {
                var model: ScreenplayStudioViewModel!
                model = try makeModel { stub in
                    if stub.request.url?.path.contains("/craft/reports/") == true {
                        switch change {
                        case "project":
                            model.selectedProjectID = "other-project"
                            model.resetCraftReportForProjectChange()
                        case "version": model.latestVersionID = "v2"
                        default: _ = BackendAuthClient.reserveAuthSessionIntent()
                        }
                        stub.respond(status == 200 ? self.report() : "{}", status: status)
                    } else { self.respondNormally(stub) }
                }
                await model.loadCraftReport(force: true)
                XCTAssertNil(model.craftReport, "\(change)/\(status)")
                XCTAssertEqual(model.craftInfoText, "", "\(change)/\(status)")
                XCTAssertEqual(model.craftErrorText, "", "\(change)/\(status)")
                XCTAssertFalse(model.isCraftLoading)
            }
        }
    }

    func testOldRequestCompletionCannotClearNewProjectLoadingState() async throws {
        let firstStarted = expectation(description: "first report request")
        let secondStarted = expectation(description: "second report request")
        var held: [CraftReportURLProtocol] = []
        let model = try makeModel { stub in
            if stub.request.url?.path.contains("/craft/reports/") == true {
                held.append(stub)
                if held.count == 1 { firstStarted.fulfill() } else { secondStarted.fulfill() }
            } else { self.respondNormally(stub) }
        }
        let old = Task { await model.loadCraftReport() }
        await fulfillment(of: [firstStarted], timeout: 3)
        model.selectedProjectID = "other-project"
        model.selectedProject = try project("other-project")
        model.resetCraftReportForProjectChange()
        let current = Task { await model.loadCraftReport() }
        await fulfillment(of: [secondStarted], timeout: 3)
        guard held.count == 2 else { return XCTFail("Expected both scoped requests") }
        held[0].respond(report())
        await old.value
        XCTAssertTrue(model.isCraftLoading)
        XCTAssertNil(model.craftReport)
        held[1].respond(report(projectID: "other-project"))
        await current.value
        XCTAssertFalse(model.isCraftLoading)
        XCTAssertEqual(model.craftReport?.projectId, "other-project")
        XCTAssertEqual(model.selectedCraftFrameworkID, "save-the-cat")
    }

    func testWrongProjectPayloadIsNotPresentedAsTheSelectedProjectsReport() async throws {
        let model = try makeModel { stub in
            if stub.request.url?.path.contains("/craft/reports/") == true {
                stub.respond(self.report(projectID: "unexpected-project"))
            } else { self.respondNormally(stub) }
        }
        await model.loadCraftReport()
        XCTAssertNil(model.craftReport)
        XCTAssertTrue(model.craftErrorText.contains("doesn't match"))
    }

    private func makeModel(handler: @escaping @MainActor (CraftReportURLProtocol) -> Void) throws -> ScreenplayStudioViewModel {
        CraftReportURLProtocol.handler = handler
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [CraftReportURLProtocol.self]
        let url = URL(string: "https://craft-report.test")!
        let client = BackendClient(baseURL: url, fallbackURL: url,
            urlSession: URLSession(configuration: configuration), persistBackendBaseURL: false, attachUserIDHeader: false)
        let store = ScreenplayLocalDraftRecoveryStore(defaults: UserDefaults(suiteName: "craft-report-\(UUID())")!)
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, craftClient: client)
        model.autosaveEnabled = false
        model.selectedProjectID = "craft-project"
        model.selectedProject = try project("craft-project")
        model.latestVersionID = "v1"
        return model
    }

    private func project(_ id: String) throws -> BackendScreenplayProjectSummary {
        try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: Data("{\"id\":\"\(id)\",\"title\":\"Craft fixture\"}".utf8))
    }

    private func respondNormally(_ stub: CraftReportURLProtocol) {
        switch stub.request.url?.path {
        case "/craft/frameworks":
            stub.respond(#"{"schemaVersion":1,"frameworks":[{"id":"three-act","title":"Three Act"},{"id":"save-the-cat","title":"Save the Cat"},{"id":"story-circle","title":"Story Circle"}]}"#)
        case let path? where path.contains("/craft/reports/"): stub.respond(report())
        case "/craft/twist/accepted":
            let projectID = URLComponents(url: stub.request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "projectId" }?.value ?? "craft-project"
            stub.respond("{\"schemaVersion\":1,\"projectId\":\"\(projectID)\",\"entries\":[]}")
        default: stub.respond("{}", status: 404)
        }
    }

    private func report(projectID: String = "craft-project") -> String {
        """
        {"id":"report-1","schemaVersion":1,"projectId":"\(projectID)","versionId":"v1",
        "framework":{"id":"save-the-cat","title":"Save the Cat"},
        "coverage":{"requiredMajorTurnCount":0,"detectedMajorTurnCount":0,"overriddenMajorTurnCount":0,"missingMajorTurnCount":0,"complete":true},
        "beatSheet":{"id":"beats-1","frameworkId":"save-the-cat","title":"Craft fixture","beats":[]},
        "majorTurns":[],"drift":{"status":"aligned","timeline":[]},"overrides":[]}
        """
    }

    private func body(_ request: URLRequest) -> Data {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var bytes = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            bytes.append(contentsOf: buffer.prefix(count))
        }
        return bytes
    }
}

private final class CraftReportURLProtocol: URLProtocol, @unchecked Sendable {
    @MainActor static var handler: ((CraftReportURLProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "craft-report.test" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Task { @MainActor in Self.handler?(self) } }
    override func stopLoading() {}
    func respond(_ json: String, status: Int = 200) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status,
            httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(json.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}
