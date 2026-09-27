import XCTest
@testable import them

final class StudioClearDraftConfirmationCopyTests: XCTestCase {
    func testTheWriterIsToldWhatIsLostAndWhatSurvives() {
        XCTAssertTrue(StudioClearDraftConfirmationCopy.title.hasSuffix("?"))
        XCTAssertTrue(StudioClearDraftConfirmationCopy.message.contains("recovery copy"), "clearDraft also deletes the local recovery copy")
        XCTAssertTrue(StudioClearDraftConfirmationCopy.message.contains("stay in Saved"), "server versions survive")
        XCTAssertTrue(StudioClearDraftConfirmationCopy.message.contains("cannot be undone"))
        XCTAssertEqual(StudioClearDraftConfirmationCopy.confirmLabel, "Clear Page")
    }
}
