import XCTest
@testable import them

/// Page cards wrapped every paginated line a second time at 12 pt and put
/// FADE IN: on the right and "1." on page one (2026-09-30).
final class ScreenplayPageThumbnailMetricsTests: XCTestCase {
    func testAFullActionLineFitsTheCard() {
        let metrics = ScreenplayPageThumbnailMetrics(textWidth: 300)
        XCTAssertLessThanOrEqual(62 * metrics.characterWidth, 300)
        XCTAssertLessThan(metrics.fontSize, 12)
        XCTAssertEqual(ScreenplayPageThumbnailMetrics(textWidth: 900).fontSize, 12, "never larger than the printed size")
    }

    func testIndentsAreMeasuredInCharacters() {
        let metrics = ScreenplayPageThumbnailMetrics(textWidth: 372)
        XCTAssertEqual(metrics.placement(for: .dialogue, line: "Cole's a maybe.").leading, metrics.characterWidth * 10, accuracy: 0.001)
        XCTAssertEqual(metrics.placement(for: .character, line: "DANNY").leading, metrics.characterWidth * 22, accuracy: 0.001)
    }

    func testFadeInOpensLeftAndClosingTransitionsSitRight() {
        let metrics = ScreenplayPageThumbnailMetrics(textWidth: 372)
        XCTAssertFalse(metrics.placement(for: .transition, line: "FADE IN:").trailing)
        XCTAssertTrue(metrics.placement(for: .transition, line: "CUT TO:").trailing)
    }
}
