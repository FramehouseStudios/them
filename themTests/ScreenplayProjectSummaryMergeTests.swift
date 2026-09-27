import XCTest
@testable import them

final class ScreenplayProjectSummaryMergeTests: XCTestCase {
    private func summary(id: String, versions: [BackendScreenplayVersion]?) throws -> BackendScreenplayProjectSummary {
        var json: [String: Any] = ["id": id, "title": "Paren Check"]
        if let versions {
            json["versions"] = versions.map { ["id": $0.id, "draft": $0.draft ?? ""] }
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayProjectSummary.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func version(_ id: String) throws -> BackendScreenplayVersion {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayVersion.self, from: Data(#"{"id":"\#(id)","draft":"INT. DOCK - DAY"}"#.utf8))
    }

    func testAThinPayloadForTheOpenProjectKeepsItsVersions() throws {
        let current = try summary(id: "p1", versions: [try version("v2"), try version("v1")])
        let thin = try summary(id: "p1", versions: nil)
        XCTAssertEqual(ScreenplayProjectSummaryMerge.keepingVersions(thin, from: current).versions?.map(\.id), ["v2", "v1"])
    }

    func testAPayloadWithVersionsWins() throws {
        let current = try summary(id: "p1", versions: [try version("v1")])
        let fresh = try summary(id: "p1", versions: [try version("v3")])
        XCTAssertEqual(ScreenplayProjectSummaryMerge.keepingVersions(fresh, from: current).versions?.map(\.id), ["v3"])
    }

    func testAnotherProjectNeverInheritsVersions() throws {
        let current = try summary(id: "p1", versions: [try version("v1")])
        let other = try summary(id: "p2", versions: nil)
        XCTAssertNil(ScreenplayProjectSummaryMerge.keepingVersions(other, from: current).versions)
        XCTAssertNil(ScreenplayProjectSummaryMerge.keepingVersions(other, from: nil).versions)
    }
}
