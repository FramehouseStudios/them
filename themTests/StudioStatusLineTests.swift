import XCTest
@testable import them

final class StudioStatusLineTests: XCTestCase {
    func testFailuresReadAsProblemsAndStayLonger() {
        for text in ["Page held back. Your draft is unchanged.", "Studio project save failed: offline", "Memory correction failed: timeout"] {
            XCTAssertTrue(StudioStatusLine.isProblem(text), text)
            XCTAssertEqual(StudioStatusLine.displaySeconds(for: text), 12)
        }
    }

    func testProgressAndSuccessAreNotProblems() {
        for text in ["io.them is writing the first page...", "Saved correction for MAE.", "Reading back the page."] {
            XCTAssertFalse(StudioStatusLine.isProblem(text), text)
            XCTAssertEqual(StudioStatusLine.displaySeconds(for: text), 5)
        }
    }
}
