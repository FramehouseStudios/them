import XCTest
@testable import them

final class NumberedChoicePresentationTests: XCTestCase {
    func testKeyNumbersAppearOnlyWhereAKeyboardIsTheNorm() {
        XCTAssertEqual(NumberedChoicePresentation.label(number: "1", title: "Keep Local", showsKeyNumbers: true), "1 Keep Local")
        XCTAssertEqual(NumberedChoicePresentation.label(number: "1", title: "Keep Local", showsKeyNumbers: false), "Keep Local")
    }

    func testIPhoneHidesKeyNumbers() {
        #if os(iOS)
        XCTAssertFalse(NumberedChoicePresentation.showsKeyNumbers)
        XCTAssertEqual(NumberedChoicePresentation.label(number: "2", title: "Discard Copy"), "Discard Copy")
        #endif
    }

    func testKeyboardHintsOnlyWhereAKeyboardIsTheNorm() {
        XCTAssertEqual(NumberedChoicePresentation.keyboardHint("⌥⌘B", showsKeyNumbers: true), "⌥⌘B")
        XCTAssertNil(NumberedChoicePresentation.keyboardHint("Press 1 to replace or 2 to append.", showsKeyNumbers: false))
        #if os(iOS)
        XCTAssertNil(NumberedChoicePresentation.keyboardHint("Press 1 for an email summary."))
        #endif
    }
}
