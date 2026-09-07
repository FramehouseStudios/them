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
        XCTAssertEqual(ScreenplayPageLayout.summaryText(pageCount: 1), "1 page")
        XCTAssertEqual(ScreenplayPageLayout.summaryText(pageCount: 2), "2 pages")
    }

    func test_letter_page_model_constants() {
        XCTAssertEqual(ScreenplayPageLayout.defaultLinesPerPage, 54)
        XCTAssertEqual(ScreenplayPageLayout.charsPerLine(.action), 62)
        XCTAssertEqual(ScreenplayPageLayout.charsPerLine(.character), 41)
        XCTAssertEqual(ScreenplayPageLayout.charsPerLine(.dialogue), 36)
        XCTAssertEqual(ScreenplayPageLayout.charsPerLine(.parenthetical), 26)
        XCTAssertEqual(ScreenplayPageLayout.charsPerLine(.transition), 21)
        XCTAssertEqual(ScreenplayPageLayout.spaceBefore(.sceneHeading), 2)
        XCTAssertEqual(ScreenplayPageLayout.spaceBefore(.dialogue), 0)
        XCTAssertEqual(ScreenplayPageLayout.estimatedMinutes(lineCount: 54), 1, accuracy: 0.001)
    }

    func test_wrap_is_greedy_monospace_and_cuts_oversized_words() {
        XCTAssertEqual(ScreenplayPageLayout.wrap("", width: 10), [""])
        XCTAssertEqual(ScreenplayPageLayout.wrap("one two three", width: 7), ["one two", "three"])
        XCTAssertEqual(ScreenplayPageLayout.wrap("abcdefghijkl", width: 5), ["abcde", "fghij", "kl"])
        XCTAssertEqual(ScreenplayPageLayout.wrap("  spaced   out  ", width: 20), ["spaced out"])
    }

    func test_raw_drafts_overflow_line_by_line_and_clamp_lines_per_page() {
        let pages = ScreenplayPageLayout.paginate(draft(lines: 120), linesPerPage: 55)
        XCTAssertEqual(pages.map { [$0.startLine, $0.endLine, $0.lineCount] }, [[1, 55, 55], [56, 110, 55], [111, 120, 10]])
        XCTAssertEqual(ScreenplayPageLayout.paginate(draft(lines: 50), linesPerPage: 5).count, 3, "24 is the floor")
        XCTAssertEqual(ScreenplayPageLayout.paginate(draft(lines: 50), linesPerPage: 500).count, 1, "120 is the ceiling")
        XCTAssertEqual(ScreenplayPageLayout.pageNumber(containingLine: 110, in: pages), 2)
        XCTAssertNil(ScreenplayPageLayout.pageNumber(containingLine: 131, in: pages))
        let backend = pages[1].backendPage
        XCTAssertEqual(backend.page, 2)
        XCTAssertEqual(backend.startLine, 56)
        XCTAssertEqual(backend.lineCount, 55)
    }

    func test_scene_heading_keeps_with_next_block_and_cue_keeps_two_lines() {
        let filler = (1...20).map { "Action line \($0)." }.joined(separator: "\n")
        let heading = ScreenplayPageLayout.paginate("\(filler)\n\nINT. LATE - NIGHT\n\nThe heading moved with this line.", linesPerPage: 24)
        XCTAssertEqual(heading.count, 2)
        XCTAssertEqual(heading[0].lineCount, 20)
        XCTAssertEqual(heading[1].lines.first, "INT. LATE - NIGHT")

        let fits = ScreenplayPageLayout.paginate("\(filler)\n\nMARA\nShort.\nStill short.", linesPerPage: 24)
        XCTAssertEqual(fits.count, 1)
        let tight = ScreenplayPageLayout.paginate("\(filler)\nOne more.\n\nMARA\nShort.\nStill short.", linesPerPage: 24)
        XCTAssertEqual(tight.count, 2)
        XCTAssertEqual(tight[1].lines.first, "MARA")
    }

    func test_long_speech_splits_with_more_and_contd() {
        let speech = (1...12).map { "Line \($0) of the speech that runs long." }.joined(separator: " ")
        let filler = (1...14).map { "Action line \($0)." }.joined(separator: "\n")
        let pages = ScreenplayPageLayout.paginate("\(filler)\n\nSIMONE\n\(speech)", linesPerPage: 24)
        XCTAssertEqual(pages.count, 2)
        XCTAssertEqual(pages[0].lines.last, "(MORE)")
        XCTAssertEqual(pages[1].lines.first, "SIMONE (CONT'D)")
        XCTAssertEqual(pages[1].startLine, 16, "the CONT'D cue reports the original cue line")
        XCTAssertGreaterThanOrEqual(pages[1].lines.count - 1, 2)
    }

    func test_crlf_and_outer_trim_match_the_backend() {
        let pages = ScreenplayPageLayout.paginate("  INT. GARAGE - NIGHT\r\n\r\nThe engine runs.\r\n\r\nOWEN\r\nSign it.\r\n  ")
        XCTAssertEqual(pages.count, 1)
        XCTAssertEqual(pages[0].lines, ["INT. GARAGE - NIGHT", "", "The engine runs.", "", "OWEN", "Sign it."])
    }
}

final class ScreenplayPageLayoutClassifyTests: XCTestCase {
    func test_reads_a_page_like_a_script() {
        let lines = [
            "INT. KITCHEN - NIGHT", "", "JUNE, 30s, rinses a single cup.", "",
            "JUNE", "(quiet)", "You came back.", "", "MARCUS", "For the cup.", "",
            "CUT TO:", "", "FADE IN:",
        ]
        XCTAssertEqual(ScreenplayPageLayout.classify(lines), [
            .sceneHeading, .blank, .action, .blank,
            .character, .parenthetical, .dialogue, .blank,
            .character, .dialogue, .blank,
            .transition, .blank, .transition,
        ])
    }

    func test_all_caps_action_without_dialogue_stays_action() {
        XCTAssertEqual(ScreenplayPageLayout.classify(["SILENCE.", "", "A door."]), [.action, .blank, .action])
        XCTAssertEqual(ScreenplayPageLayout.classify(["LATER"]), [.action])
    }
}

/// docs/pagination/fixtures.json is generated by the backend engine; the Swift
/// engine must reproduce every page exactly or the phone and the server
/// disagree about where a script breaks.
final class ScreenplayPageLayoutParityTests: XCTestCase {
    private struct ExpectedPage: Decodable {
        let page: Int
        let startLine: Int
        let endLine: Int
        let lineCount: Int
        let firstLine: String
        let lastLine: String
        let moreCount: Int
        let contdCount: Int
    }
    private struct Expected: Decodable { let lineCount: Int; let renderedLineCount: Int; let pages: [ExpectedPage] }
    private struct Fixture: Decodable { let id: String; let linesPerPage: Int; let draft: String; let expected: Expected }
    private struct File: Decodable { let fixtures: [Fixture] }

    private func repositoryRoot() throws -> URL {
        var cursor = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while cursor.path != cursor.deletingLastPathComponent().path {
            if FileManager.default.fileExists(atPath: cursor.appendingPathComponent("AGENTS.md").path),
               FileManager.default.fileExists(atPath: cursor.appendingPathComponent("TASKS.md").path) {
                return cursor
            }
            cursor.deleteLastPathComponent()
        }
        throw XCTSkip("Repository root not found from \(#filePath).")
    }

    func test_swift_engine_reproduces_the_shared_fixtures() throws {
        let url = try repositoryRoot().appendingPathComponent("docs/pagination/fixtures.json")
        let file = try JSONDecoder().decode(File.self, from: Data(contentsOf: url))
        XCTAssertGreaterThanOrEqual(file.fixtures.count, 5)
        for fixture in file.fixtures {
            let pages = ScreenplayPageLayout.paginate(fixture.draft, linesPerPage: fixture.linesPerPage)
            XCTAssertEqual(pages.count, fixture.expected.pages.count, fixture.id)
            XCTAssertEqual(pages.reduce(0) { $0 + $1.lineCount }, fixture.expected.renderedLineCount, "\(fixture.id) rendered lines")
            for (page, expected) in zip(pages, fixture.expected.pages) {
                XCTAssertEqual(page.number, expected.page, fixture.id)
                XCTAssertEqual(page.startLine, expected.startLine, "\(fixture.id) p\(page.number) start")
                XCTAssertEqual(page.endLine, expected.endLine, "\(fixture.id) p\(page.number) end")
                XCTAssertEqual(page.lineCount, expected.lineCount, "\(fixture.id) p\(page.number) lines")
                XCTAssertEqual(page.lines.first ?? "", expected.firstLine, "\(fixture.id) p\(page.number) first")
                XCTAssertEqual(page.lines.last ?? "", expected.lastLine, "\(fixture.id) p\(page.number) last")
                XCTAssertEqual(page.lines.filter { $0 == "(MORE)" }.count, expected.moreCount, "\(fixture.id) p\(page.number) MORE")
                XCTAssertEqual(page.lines.filter { $0.hasSuffix("(CONT'D)") }.count, expected.contdCount, "\(fixture.id) p\(page.number) CONT'D")
            }
        }
    }
}
