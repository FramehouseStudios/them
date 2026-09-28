import XCTest
@testable import them

final class ScreenplayPagePlacementHintTests: XCTestCase {
    func testPhoneHintSaysTap() {
        #if os(iOS)
        XCTAssertTrue(ScreenplayPagePlacementHint.text.contains("tap to place"))
        XCTAssertFalse(ScreenplayPagePlacementHint.text.contains("click"))
        #endif
    }
}
