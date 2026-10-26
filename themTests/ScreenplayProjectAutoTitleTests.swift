import XCTest
@testable import them

final class ScreenplayProjectAutoTitleTests: XCTestCase {
    func test_first_action_line_is_never_the_title() {
        let draft = "INT. KITCHEN - NIGHT\n\nMARA stands at the sink. She does not turn around.\n\nMARA\nYou said you would call.\n"
        let title = ScreenplayProjectAutoTitle.title(for: draft, pack: "")
        XCTAssertEqual(title, "Kitchen at Night")
        XCTAssertFalse(title.lowercased().contains("stands at the sink"))
    }

    func test_title_page_wins_over_scene_heading() {
        let draft = "Title: The Long Night\nCredit: written by\nAuthor: J. Ortiz\n\nINT. KITCHEN - NIGHT\n\nMARA waits.\n"
        XCTAssertEqual(ScreenplayProjectAutoTitle.title(for: draft, pack: "horror"), "The Long Night")
        XCTAssertEqual(ScreenplayProjectAutoTitle.titlePageTitle(in: ["title: _*Echo Chamber*_"]), "Echo Chamber")
    }

    func test_scene_heading_variants() {
        XCTAssertEqual(ScreenplayProjectAutoTitle.sceneHeadingTitle("EXT. PORCH - DAWN"), "Porch at Dawn")
        XCTAssertEqual(ScreenplayProjectAutoTitle.sceneHeadingTitle("INT./EXT. CAR - CONTINUOUS"), "Car at Continuous")
        XCTAssertEqual(ScreenplayProjectAutoTitle.sceneHeadingTitle("EXT. FAKE MOON"), "Fake Moon")
        XCTAssertNil(ScreenplayProjectAutoTitle.sceneHeadingTitle("MARA stands at the sink."))
        XCTAssertNil(ScreenplayProjectAutoTitle.sceneHeadingTitle("INT."))
    }

    func test_pack_then_dated_fallback_when_there_is_no_heading() {
        XCTAssertEqual(ScreenplayProjectAutoTitle.title(for: "She waits by the phone.\n", pack: "short_film"), "Short Film")
        let fixed = Date(timeIntervalSince1970: 1_800_000_000)
        let fallback = ScreenplayProjectAutoTitle.title(for: "", pack: "", now: fixed)
        XCTAssertTrue(fallback.hasPrefix("Studio Draft "), fallback)
    }

    func test_titles_are_clamped() {
        let long = "INT. " + String(repeating: "VERY LONG LOCATION NAME ", count: 6) + "- NIGHT"
        let title = ScreenplayProjectAutoTitle.sceneHeadingTitle(long) ?? ""
        XCTAssertLessThanOrEqual(title.count, ScreenplayProjectAutoTitle.maxLength)
    }
}
