import XCTest
@testable import them

final class ScreenplayPagePlacementHintTests: XCTestCase {
    func testPhoneHintSaysTap() {
        #if os(iOS)
        XCTAssertTrue(ScreenplayPagePlacementHint.text.contains("tap to place"))
        XCTAssertFalse(ScreenplayPagePlacementHint.text.contains("click"))
        #endif
    }

    func testHeaderHintOnlyOnWideLayoutsWithAnEmptyPage() {
        XCTAssertTrue(ScreenplayPagePlacementHint.showsInHeader(pageIsEmpty: true, isCompact: false))
        XCTAssertFalse(ScreenplayPagePlacementHint.showsInHeader(pageIsEmpty: true, isCompact: true), "the phone's empty page already carries the hint")
        XCTAssertFalse(ScreenplayPagePlacementHint.showsInHeader(pageIsEmpty: false, isCompact: false))
    }

    func testANewEmptyProjectReadsAsABlankPageNotAsUnsaved() {
        XCTAssertTrue(StudioBlankPageStatus.applies(pageIsEmpty: true, hasSavedVersion: false, hasUnsavedChanges: false, isSaving: false))
        XCTAssertFalse(StudioBlankPageStatus.applies(pageIsEmpty: true, hasSavedVersion: true, hasUnsavedChanges: false, isSaving: false), "a cleared page with history keeps its saved state")
        XCTAssertFalse(StudioBlankPageStatus.applies(pageIsEmpty: false, hasSavedVersion: false, hasUnsavedChanges: false, isSaving: false))
        XCTAssertFalse(StudioBlankPageStatus.applies(pageIsEmpty: true, hasSavedVersion: false, hasUnsavedChanges: true, isSaving: false))
    }
}
