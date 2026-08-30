import XCTest
@testable import them

final class StudioResponsiveLayoutTests: XCTestCase {
    func testDrawerLayoutCoversPhoneTabletAndNarrowDesktopWidths() {
        XCTAssertTrue(StudioResponsiveLayout.usesDrawers(containerWidth: 402))
        XCTAssertTrue(StudioResponsiveLayout.usesDrawers(containerWidth: 834))
        XCTAssertTrue(StudioResponsiveLayout.usesDrawers(containerWidth: 1_024))
        XCTAssertFalse(StudioResponsiveLayout.usesDrawers(containerWidth: 1_200))
    }

    func testCompactPageNeverExceedsEditorContentWidth() {
        XCTAssertEqual(StudioResponsiveLayout.pageWidth(editorWidth: 370), 314)
        XCTAssertLessThanOrEqual(StudioResponsiveLayout.pageWidth(editorWidth: 320), 264)
    }

    func testDesktopPageRetainsScreenplayReadingWidth() {
        XCTAssertEqual(StudioResponsiveLayout.pageWidth(editorWidth: 900), 504, accuracy: 0.001)
        XCTAssertEqual(StudioResponsiveLayout.pageWidth(editorWidth: 1_200), 560, accuracy: 0.001)
    }

    func testCompactTopInsetClearsPhoneStatusRegionWhenGeometryReportsZero() {
        XCTAssertEqual(StudioResponsiveLayout.compactTopInset(safeAreaInset: 0, isPhone: true), 54)
        XCTAssertEqual(StudioResponsiveLayout.compactTopInset(safeAreaInset: 62, isPhone: true), 62)
        XCTAssertEqual(StudioResponsiveLayout.compactTopInset(safeAreaInset: 0, isPhone: false), 24)
    }

    func testDrawersFitInsideSmallContainers() {
        XCTAssertEqual(StudioResponsiveLayout.sidebarDrawerWidth(containerWidth: 402), 320)
        XCTAssertEqual(StudioResponsiveLayout.inspectorDrawerWidth(containerWidth: 402), 360)
        XCTAssertLessThan(StudioResponsiveLayout.inspectorDrawerWidth(containerWidth: 300), 300)
    }
}
