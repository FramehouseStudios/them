import XCTest
import ScreenplayStudio
@testable import them

/// "FADE IN:" sat on the right margin like "CUT TO:" in the editor and in
/// print; a script opens with it at the left margin (2026-09-30).
final class ScreenplayOpeningTransitionLayoutTests: XCTestCase {
    func testFadeInSitsAtTheLeftMargin() {
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.transition, line: "FADE IN:"), .action)
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.transition, line: "  fade in:  "), .action)
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.transition, line: "FADE IN ON:"), .action)
    }

    func testOtherTransitionsStayOnTheRight() {
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.transition, line: "CUT TO:"), .transition)
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.transition, line: "FADE OUT."), .transition)
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.transition, line: "THE END"), .transition)
    }

    func testOnlyTransitionsAreRemapped() {
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.character, line: "FADE IN:"), .character)
        XCTAssertEqual(ScreenplayEditorElement.layoutElement(.sceneHeading, line: "INT. HALL - NIGHT"), .sceneHeading)
    }
}
