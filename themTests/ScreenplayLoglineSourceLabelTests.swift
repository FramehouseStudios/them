import XCTest
@testable import them

final class ScreenplayLoglineSourceLabelTests: XCTestCase {
    func testSourcesReadAsTheWriterWouldSayThem() {
        XCTAssertEqual(ScreenplayLoglineSourceLabel.text(for: "openai"), "OpenAI")
        XCTAssertEqual(ScreenplayLoglineSourceLabel.text(for: "stub"), "Template")
        XCTAssertEqual(ScreenplayLoglineSourceLabel.text(for: " "), "")
    }

    func testRecentLoglinesDropRepeats() {
        let recent = ScreenplayLoglineSourceLabel.distinctRecent(["A", "A", " B ", "", "C", "D"], limit: 3)
        XCTAssertEqual(recent, ["A", "B", "C"])
    }
}
