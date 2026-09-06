import XCTest
@testable import them

final class ScreenplayPageLayoutTests: XCTestCase {
    private func draft(lines: Int, prefix: String = "Line") -> String {
        (1...lines).map { "\(prefix) \($0)" }.joined(separator: "\n")
    }

    func test_empty_and_whitespace_drafts_have_no_pages() {
        XCTAssertEqual(ScreenplayPageLayout.paginate(""), [])
        XCTAssertEqual(ScreenplayPageLayout.paginate("   \n\n  "), [])
        XCTAssertEqual(ScreenplayPageLayout.pageCount(for: ""), 0)
        XCTAssertEqual(ScreenplayPageLayout.summaryText(pageCount: 0), "No pages yet")
    }

    func test_fifty_five_lines_is_exactly_one_page_and_fifty_six_starts_page_two() {
        let one = ScreenplayPageLayout.paginate(draft(lines: 55))
        XCTAssertEqual(one.count, 1)
        XCTAssertEqual(one[0].startLine, 1)
        XCTAssertEqual(one[0].endLine, 55)
        XCTAssertEqual(one[0].lineCount, 55)

        let two = ScreenplayPageLayout.paginate(draft(lines: 56))
        XCTAssertEqual(two.count, 2)
        XCTAssertEqual(two[1].number, 2)
        XCTAssertEqual(two[1].startLine, 56)
        XCTAssertEqual(two[1].endLine, 56)
        XCTAssertEqual(two[1].lines, ["Line 56"])
        XCTAssertEqual(ScreenplayPageLayout.summaryText(pageCount: 1), "1 page")
        XCTAssertEqual(ScreenplayPageLayout.summaryText(pageCount: 2), "2 pages")
    }

    func test_matches_backend_normalization_crlf_and_outer_trim_only() {
        let crlf = "INT. KITCHEN - NIGHT\r\n\r\nJUNE stands.\r\n"
        let pages = ScreenplayPageLayout.paginate(crlf)
        XCTAssertEqual(pages.count, 1)
        XCTAssertEqual(pages[0].lines, ["INT. KITCHEN - NIGHT", "", "JUNE stands."])
        XCTAssertEqual(pages[0].lineCount, 3, "interior blank lines count as lines, like the backend")
    }

    func test_lines_per_page_is_clamped_like_the_backend() {
        let text = draft(lines: 50)
        XCTAssertEqual(ScreenplayPageLayout.paginate(text, linesPerPage: 5).count, 3, "24 is the floor")
        XCTAssertEqual(ScreenplayPageLayout.paginate(text, linesPerPage: 500).count, 1, "120 is the ceiling")
        XCTAssertEqual(ScreenplayPageLayout.paginate(draft(lines: 121), linesPerPage: 500).count, 2)
    }

    func test_page_numbers_line_ranges_and_cursor_lookup() {
        let pages = ScreenplayPageLayout.paginate(draft(lines: 130))
        XCTAssertEqual(pages.map(\.number), [1, 2, 3])
        XCTAssertEqual(pages.map(\.startLine), [1, 56, 111])
        XCTAssertEqual(pages.map(\.endLine), [55, 110, 130])
        XCTAssertEqual(ScreenplayPageLayout.pageNumber(containingLine: 1, in: pages), 1)
        XCTAssertEqual(ScreenplayPageLayout.pageNumber(containingLine: 110, in: pages), 2)
        XCTAssertEqual(ScreenplayPageLayout.pageNumber(containingLine: 111, in: pages), 3)
        XCTAssertNil(ScreenplayPageLayout.pageNumber(containingLine: 131, in: pages))
        let backend = pages[1].backendPage
        XCTAssertEqual(backend.page, 2)
        XCTAssertEqual(backend.startLine, 56)
        XCTAssertEqual(backend.endLine, 110)
        XCTAssertEqual(backend.lineCount, 55)
    }

    func test_minutes_follow_one_page_per_minute() {
        XCTAssertEqual(ScreenplayPageLayout.estimatedMinutes(lineCount: 0), 0)
        XCTAssertEqual(ScreenplayPageLayout.estimatedMinutes(lineCount: 55), 1, accuracy: 0.001)
        XCTAssertEqual(ScreenplayPageLayout.estimatedMinutes(lineCount: 110), 2, accuracy: 0.001)
    }
}

final class ScreenplayPageLayoutClassifyTests: XCTestCase {
    func test_reads_a_page_like_a_script() {
        let lines = [
            "INT. KITCHEN - NIGHT",
            "",
            "JUNE, 30s, rinses a single cup.",
            "",
            "JUNE",
            "(quiet)",
            "You came back.",
            "",
            "MARCUS",
            "For the cup.",
            "",
            "CUT TO:",
            "",
            "FADE IN:",
        ]
        let kinds = ScreenplayPageLayout.classify(lines)
        XCTAssertEqual(kinds, [
            .sceneHeading, .blank,
            .action, .blank,
            .character, .parenthetical, .dialogue, .blank,
            .character, .dialogue, .blank,
            .transition, .blank,
            .transition,
        ])
    }

    func test_all_caps_action_without_dialogue_stays_action() {
        XCTAssertEqual(ScreenplayPageLayout.classify(["SILENCE.", "", "A door."]), [.action, .blank, .action])
        XCTAssertEqual(ScreenplayPageLayout.classify(["LATER"]), [.action], "a cue needs a next line to speak")
    }
}
