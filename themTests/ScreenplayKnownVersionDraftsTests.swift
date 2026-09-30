import XCTest
@testable import them

/// Seen live 2026-09-30: every save of a 74-page script answered 3.2 MB (24
/// full drafts). Drafts the app holds are named on the request, omitted by the
/// backend, and put back here before any caller sees the project.
final class ScreenplayKnownVersionDraftsTests: XCTestCase {
    private func project(_ id: String, versions: [(id: String, draft: String?)]) throws -> BackendScreenplayProjectSummary? {
        let json: [String: Any] = [
            "id": id,
            "title": "Sine Die",
            "versions": versions.map { version -> [String: Any] in
                var item: [String: Any] = ["id": version.id]
                if let draft = version.draft {
                    item["draft"] = draft
                    item["studio_write_anchors"] = [["write_id": "w-\(version.id)", "inserted_text": draft]]
                } else {
                    item["draft"] = NSNull()
                    item["studio_write_anchors"] = NSNull()
                }
                return item
            },
        ]
        let data = try JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayProjectSummary.self, from: data)
    }

    func testOmittedDraftsComeBackFromWhatTheAppAlreadyHolds() throws {
        let cache = ScreenplayKnownVersionDrafts()
        var first = try project("p1", versions: [("v1", "FADE IN:\n\nPage one.")])
        cache.fill(&first)
        XCTAssertEqual(cache.knownVersionIDs(forProject: "p1"), ["v1"])

        var lean = try project("p1", versions: [("v2", "FADE IN:\n\nPage one.\n\nPage two."), ("v1", nil)])
        cache.fill(&lean)
        let drafts = Dictionary(uniqueKeysWithValues: (lean?.versions ?? []).map { ($0.id, $0.draft ?? "") })
        XCTAssertEqual(drafts["v1"], "FADE IN:\n\nPage one.")
        XCTAssertEqual(drafts["v2"], "FADE IN:\n\nPage one.\n\nPage two.")
        XCTAssertEqual(cache.knownVersionIDs(forProject: "p1"), ["v1", "v2"])
        let restored = lean?.versions?.first { $0.id == "v1" }
        XCTAssertEqual(restored?.studioWriteAnchors?.first?.writeId, "w-v1", "the held version comes back whole, anchors included")
    }

    func testOnlyListedVersionsAreKeptAndNamed() throws {
        let cache = ScreenplayKnownVersionDrafts()
        var first = try project("p1", versions: [("v1", "one"), ("v2", "two")])
        cache.fill(&first)
        var later = try project("p1", versions: [("v3", "three"), ("v2", nil)])
        cache.fill(&later)
        XCTAssertEqual(cache.knownVersionIDs(forProject: "p1"), ["v2", "v3"])
        XCTAssertEqual(cache.queryItems(forProject: "p1").first?.value, "v2,v3")
        var payload: [String: Any] = [:]
        cache.addKnownVersionIDs(to: &payload, projectID: "p1")
        XCTAssertEqual(payload["known_version_ids"] as? [String], ["v2", "v3"])
        XCTAssertTrue(cache.knownVersionIDs(forProject: "other").isEmpty)
        cache.forgetAll()
        XCTAssertTrue(cache.knownVersionIDs(forProject: "p1").isEmpty)
    }

    func testAnUnknownOmittedDraftStaysEmptyRatherThanWrong() throws {
        let cache = ScreenplayKnownVersionDrafts()
        var lean = try project("p1", versions: [("v9", nil)])
        cache.fill(&lean)
        XCTAssertNil(lean?.versions?.first?.draft)
        XCTAssertTrue(cache.knownVersionIDs(forProject: "p1").isEmpty)
    }
}
