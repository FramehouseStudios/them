import XCTest
@testable import them

final class StudioPromptIntentTitleTests: XCTestCase {
    func testPageIntentIsNamedForWritingNotOnlyRewriting() {
        XCTAssertEqual(ScreenplayStudioScreen.StudioPromptIntent.rewrite.title, "Write pages")
        XCTAssertEqual(ScreenplayStudioScreen.StudioPromptIntent.advice.title, "Advice")
        XCTAssertEqual(ScreenplayStudioScreen.StudioPromptIntent.voicePin.title, "Voice Pin")
    }
}

final class StudioPromptIntentMatchingTests: XCTestCase {
    typealias Intent = ScreenplayStudioScreen.StudioPromptIntent

    func testRestoredPageDestinationSelectsWritePages() {
        XCTAssertEqual(Intent.advice.matching(.page), .rewrite)
        XCTAssertEqual(Intent.voicePin.matching(.page), .rewrite)
    }

    func testWritePagesNeverPairsWithAutoOrPin() {
        XCTAssertEqual(Intent.rewrite.matching(.automatic), .advice)
        XCTAssertEqual(Intent.rewrite.matching(.voicePin), .voicePin)
    }

    func testCompatiblePairsAreLeftAlone() {
        XCTAssertEqual(Intent.advice.matching(.automatic), .advice)
        XCTAssertEqual(Intent.voicePin.matching(.automatic), .voicePin)
        XCTAssertEqual(Intent.advice.matching(.voicePin), .advice)
    }
}
