import XCTest
import CoreGraphics
@testable import them

@MainActor
final class ScreenplayStudioInspectorHitTestingTests: XCTestCase {
    private typealias Tab = ScreenplayStudioScreen.DirectionOneRightPanelTab
    private let frames: [Tab: CGRect] = [
        .them: CGRect(x: 110, y: 56, width: 104, height: 48),
        .saved: CGRect(x: 220, y: 56, width: 104, height: 48)
    ]

    func testRightInteriorCenterBelongsToThemEvenWhenFingerFootprintCanReachSaved() {
        XCTAssertEqual(ScreenplayStudioInspectorTabHitTesting.target(
            at: CGPoint(x: 213.6667, y: 80), frames: frames), .them)
    }

    func testSavedInteriorSelectsSaved() {
        XCTAssertEqual(ScreenplayStudioInspectorTabHitTesting.target(
            at: CGPoint(x: 220.3333, y: 80), frames: frames), .saved)
    }

    func testGapAndOutsidePointsDoNotActivateANeighbour() {
        for point in [CGPoint(x: 217, y: 80), CGPoint(x: -1, y: 80), CGPoint(x: 214, y: 110)] {
            XCTAssertNil(ScreenplayStudioInspectorTabHitTesting.target(at: point, frames: frames))
        }
    }

    func testMissingAmbiguousOrInvalidGeometryCannotSelectAControl() {
        let point = CGPoint(x: 111, y: 80)
        XCTAssertNil(ScreenplayStudioInspectorTabHitTesting.target(at: point, frames: [:]))
        XCTAssertNil(ScreenplayStudioInspectorTabHitTesting.target(at: point, frames: [
            .them: frames[.them]!, .saved: frames[.them]!
        ]))
        XCTAssertNil(ScreenplayStudioInspectorTabHitTesting.target(at: point, frames: [.them: .zero]))
        XCTAssertNil(ScreenplayStudioInspectorTabHitTesting.target(at: CGPoint(x: CGFloat.nan, y: 80), frames: frames))
        XCTAssertNil(ScreenplayStudioInspectorTabHitTesting.target(at: point, frames: [
            .them: CGRect(x: 0, y: 0, width: CGFloat.infinity, height: 100)
        ]))
    }
}
