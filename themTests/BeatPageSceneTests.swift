import XCTest
@testable import them

/// "Pick Scene" on a beat did nothing when the outline had no scenes
/// (2026-09-30); the page's scene is matched by its heading.
final class BeatPageSceneTests: XCTestCase {
    private func scene(_ id: String, slugline: String?, title: String = "") throws -> BackendScreenplayScene {
        var json: [String: Any] = ["id": id, "title": title]
        if let slugline { json["slugline"] = slugline }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayScene.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testThePageSceneIsFoundByItsHeadingInAnyCase() throws {
        let scenes = [try scene("s1", slugline: "INT. SENATE FLOOR - NIGHT"), try scene("s2", slugline: nil, title: "INT. HALL - NIGHT")]
        XCTAssertEqual(ScreenplayStudioViewModel.outlineScene(matching: " int. hall - night ", in: scenes)?.id, "s2")
        XCTAssertEqual(ScreenplayStudioViewModel.outlineScene(matching: "INT. SENATE FLOOR - NIGHT", in: scenes)?.id, "s1")
        XCTAssertNil(ScreenplayStudioViewModel.outlineScene(matching: "EXT. STEPS - DAY", in: scenes))
    }

    func testThePickerOffersOnlyPageScenesTheOutlineLacks() throws {
        let outline = [try scene("s1", slugline: "INT. HALL - NIGHT")]
        XCTAssertEqual(
            ScreenplayStudioViewModel.pageScenesMissingFromOutline(["INT. HALL - NIGHT", "EXT. STEPS - DAY", "ext. steps - day", " "], outline: outline),
            ["EXT. STEPS - DAY"]
        )
    }
}
