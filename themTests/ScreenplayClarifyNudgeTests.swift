import XCTest
@testable import them

final class ScreenplayClarifyNudgeTests: XCTestCase {
    func testBracketedSubjectBecomesQuestionOnItsLine() {
        let draft = "INT. KITCHEN - DAY\n\nJess enters.\n\nTODO: clarify [Jess's want]\n\nMARCUS\nHey."
        let nudge = ScreenplayClarifyNudge.nudge(in: draft)
        XCTAssertEqual(nudge, .init(question: "Can you clarify Jess's want?", line: 5))
    }

    func testBareMarkerFallsBackToGenericQuestion() {
        let nudge = ScreenplayClarifyNudge.nudge(in: "Something.\nTODO: clarify\nMore.")
        XCTAssertEqual(nudge?.question, "Can you clarify the story a bit more?")
        XCTAssertEqual(nudge?.line, 2)
    }

    func testMarkerIsCaseInsensitiveAndTrailingPunctuationIsDropped() {
        let nudge = ScreenplayClarifyNudge.nudge(in: "todo: Clarify — what she wants from her mother.")
        XCTAssertEqual(nudge?.question, "Can you clarify what she wants from her mother?")
    }

    func testLeadingFunctionWordIsLowercasedButNamesAreNot() {
        XCTAssertEqual(ScreenplayClarifyNudge.question(from: " What Jess needs "), "Can you clarify what Jess needs?")
        XCTAssertEqual(ScreenplayClarifyNudge.question(from: "(Marcus's secret)"), "Can you clarify Marcus's secret?")
    }

    func testFirstMarkerWinsWhenSeveralExist() {
        let nudge = ScreenplayClarifyNudge.nudge(in: "TODO: clarify [one]\nTODO: clarify [two]")
        XCTAssertEqual(nudge?.question, "Can you clarify one?")
        XCTAssertEqual(nudge?.line, 1)
    }

    func testNoMarkerYieldsNoNudge() {
        XCTAssertNil(ScreenplayClarifyNudge.nudge(in: "INT. ROOM - DAY\n\nNothing to do here."))
        XCTAssertNil(ScreenplayClarifyNudge.nudge(in: ""))
    }
}
