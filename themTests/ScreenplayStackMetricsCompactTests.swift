import XCTest
import UIKit
@testable import them

final class ScreenplayStackMetricsCompactTests: XCTestCase {
    private func columnCharacters(_ leading: CGFloat, _ trailing: CGFloat, _ metrics: ScreenplayStackMetrics) -> CGFloat {
        (metrics.printableWidth - leading - trailing) / ScreenplayStackMetrics.editorCharacterWidth
    }

    func testCharacterWidthMatchesTheEditorFont() {
        let font = UIFont(name: "Courier", size: 12)!
        let advance = ("M" as NSString).size(withAttributes: [.font: font]).width
        XCTAssertEqual(advance, ScreenplayStackMetrics.editorCharacterWidth, accuracy: 0.05)
    }

    func testPhonePageKeepsDialogueAndParentheticalsReadable() {
        for width: CGFloat in [180, 200, 230, 260] {
            let metrics = ScreenplayStackMetrics.editor(containerWidth: width)
            XCTAssertGreaterThanOrEqual(columnCharacters(metrics.dialogueLeading, metrics.dialogueTrailing, metrics), 17.99, "width \(width)")
            XCTAssertGreaterThanOrEqual(columnCharacters(metrics.parentheticalLeading, metrics.parentheticalTrailing, metrics), 15.99, "width \(width)")
            XCTAssertGreaterThan(metrics.parentheticalLeading, metrics.dialogueLeading, "parentheticals sit inside dialogue")
            XCTAssertGreaterThan(metrics.characterLeading, metrics.dialogueLeading, "cues sit right of dialogue")
        }
    }

    func testWidePagesKeepTheCalibratedPaperLayout() {
        let wide = ScreenplayStackMetrics.editor(containerWidth: 480)
        let calibrated = ScreenplayStackMetrics.calibrated(forPrintableWidth: 480)
        XCTAssertEqual(wide.dialogueLeading, calibrated.dialogueLeading)
        XCTAssertEqual(wide.parentheticalLeading, calibrated.parentheticalLeading)
    }
}
