import XCTest
@testable import them

final class CompanionClearConfirmationTests: XCTestCase {
    func testEveryClearActionAsksFirstAndSaysWhatIsNotTouched() {
        for action in CompanionClearConfirmation.allCases {
            XCTAssertTrue(action.title.hasSuffix("?"), "\(action) asks a question")
            XCTAssertTrue(action.message.contains("cannot be undone"))
            XCTAssertTrue(action.message.contains("not touched"), "\(action) says what survives")
            XCTAssertTrue(action.confirmLabel.hasPrefix("Clear"))
        }
        XCTAssertEqual(CompanionClearConfirmation.memory.confirmLabel, "Clear Memory")
        XCTAssertEqual(CompanionClearConfirmation.thread.confirmLabel, "Clear Thread")
        XCTAssertNotEqual(CompanionClearConfirmation.memory.message, CompanionClearConfirmation.thread.message)
    }
}
