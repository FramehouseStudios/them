import XCTest
@testable import them

final class StudioRestoreVersionConfirmationTests: XCTestCase {
    func testMessageNamesWhenTheVersionWasSavedAndThatNothingIsLost() {
        let message = StudioRestoreVersionConfirmationCopy.message(savedAt: Date().addingTimeInterval(-120))
        XCTAssertTrue(message.contains("the version saved"), message)
        XCTAssertTrue(message.contains("stays in Saved"), message)
    }

    func testMessageWithoutADateStillReads() {
        XCTAssertEqual(
            StudioRestoreVersionConfirmationCopy.message(savedAt: nil),
            "The page switches to this version. What's on the page now stays in Saved, so you can switch back."
        )
    }
}
