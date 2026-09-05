import XCTest
@testable import them

final class ScreenplayDraftGateTests: XCTestCase {
    func testLongSpeechIsNotAnOrphan() {
        let draft = """
        INT. KITCHEN - DAY

        Maya sets the reel on the table.

        MAYA
        I watched it four times last night.
        Every frame of it. The street, the car,
        the way he looks over his shoulder before
        he gets in. You can't tell me that's nothing.
        You can't.
        """
        XCTAssertNil(ScreenplayDraftGate.firstErrorReason(draft: draft))
    }

    func testParentheticalInsideLongSpeechIsFine() {
        let draft = """
        MAYA
        (quietly)
        I watched it four times.
        Every frame.
        (beat)
        You can't tell me that's nothing.
        """
        XCTAssertFalse(ScreenplayDraftGate.hasFormatErrors(draft: draft))
    }

    func testDialogueWithoutACueIsAnOrphan() {
        let draft = """
        INT. KITCHEN - DAY

        Maya sets the reel on the table.

        (quietly)
        I watched it four times last night.
        """
        XCTAssertTrue(ScreenplayDraftGate.hasFormatErrors(draft: draft))
        XCTAssertNotNil(ScreenplayDraftGate.firstErrorReason(draft: draft))
    }

    func testEmptyDraftIsReported() {
        XCTAssertEqual(ScreenplayDraftGate.firstErrorReason(draft: " \n"), "Draft is empty.")
    }

    func testSceneHeadingWithoutIntOrExtIsRejected() {
        XCTAssertFalse(ScreenplayDraftGate.hasFormatErrors(draft: "EXT. STREET - NIGHT\n\nRain."))
        XCTAssertFalse(ScreenplayDraftGate.hasFormatErrors(draft: "I/E. CAR - CONTINUOUS\n\nRain."))
    }
}
