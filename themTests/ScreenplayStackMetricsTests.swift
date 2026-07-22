import XCTest
@testable import them

final class ScreenplayStackMetricsTests: XCTestCase {
    func testCompactMetricsKeepDialogueAndCharacterLinesReadable() {
        let printableWidth: CGFloat = 208
        let metrics = ScreenplayStackMetrics.editor(containerWidth: printableWidth)

        XCTAssertGreaterThanOrEqual(
            printableWidth - metrics.dialogueLeading - metrics.dialogueTrailing,
            100
        )
        XCTAssertGreaterThanOrEqual(
            printableWidth - metrics.characterLeading - metrics.characterTrailing,
            60
        )
    }

    func testEditorInsetsShrinkContinuouslyForPhoneWidths() {
        XCTAssertEqual(
            ScreenplayStackMetrics.editorTextInsetHorizontal(forEditorWidth: 254),
            22.8,
            accuracy: 0.001
        )
        XCTAssertEqual(
            ScreenplayStackMetrics.editorTextInsetHorizontal(forEditorWidth: 500),
            56,
            accuracy: 0.001
        )
    }

    func testDesktopMetricsRetainStandardPaperCalibration() {
        let metrics = ScreenplayStackMetrics.editor(containerWidth: 420)
        let reference = ScreenplayStackMetrics.calibrated(forPrintableWidth: 420)

        XCTAssertEqual(metrics.dialogueLeading, reference.dialogueLeading, accuracy: 0.001)
        XCTAssertEqual(metrics.dialogueTrailing, reference.dialogueTrailing, accuracy: 0.001)
        XCTAssertEqual(metrics.characterLeading, reference.characterLeading, accuracy: 0.001)
        XCTAssertEqual(metrics.characterTrailing, reference.characterTrailing, accuracy: 0.001)
    }
}
