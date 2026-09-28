import XCTest
@testable import them

final class StudioCountTitleTests: XCTestCase {
    func testOneReadsSingular() {
        XCTAssertEqual(StudioCountTitle.text(1, "Beat", "Beats"), "Beat")
        XCTAssertEqual(StudioCountTitle.text(0, "Beat", "Beats"), "Beats")
        XCTAssertEqual(StudioCountTitle.text(3, "Scene linked", "Scenes linked"), "Scenes linked")
    }
}
