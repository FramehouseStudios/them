import XCTest
@testable import them

final class ScreenplayNextBeatPillsTests: XCTestCase {
    func testVisibleBeatsTrimsDedupesAndCapsAtThree() {
        let beats = ["  June lies to Maya ", "june lies to maya", "", "Maya plays  the tape", "The landlord knocks", "A fourth"]
        XCTAssertEqual(
            ScreenplayNextBeatPills.visibleBeats(beats),
            ["June lies to Maya", "Maya plays the tape", "The landlord knocks"]
        )
        XCTAssertEqual(ScreenplayNextBeatPills.visibleBeats([]), [])
    }

    func testPromptRoutesTheBeatAsAWriteRequest() {
        XCTAssertEqual(
            ScreenplayNextBeatPills.prompt(for: "June lies to Maya — cost: the tape stays hidden."),
            "Write the next beat: June lies to Maya — cost: the tape stays hidden."
        )
    }

    func testLabelDropsTheCostClauseButKeepsPlainBeats() {
        XCTAssertEqual(ScreenplayNextBeatPills.label(for: "June lies to Maya — cost: the tape stays hidden"), "June lies to Maya")
        XCTAssertEqual(ScreenplayNextBeatPills.label(for: "Maya plays the tape - Cost: June leaves"), "Maya plays the tape")
        XCTAssertEqual(ScreenplayNextBeatPills.label(for: "The landlord knocks"), "The landlord knocks")
    }
}
