import XCTest
@testable import them

final class HomeLeftOffBannerTests: XCTestCase {
    func testCollapsedPreviewSkipsTheGreeting() {
        XCTAssertEqual(
            HomeLeftOffBanner.collapsedPreview("Welcome back. We were in Act I - Opening Image."),
            "We were in Act I - Opening Image."
        )
    }

    func testCollapsedPreviewKeepsTextWithoutTheGreeting() {
        XCTAssertEqual(
            HomeLeftOffBanner.collapsedPreview("  Mae left the pier.  "),
            "Mae left the pier."
        )
    }
}
