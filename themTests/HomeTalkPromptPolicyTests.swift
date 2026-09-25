import XCTest
@testable import them

final class HomeTalkPromptPolicyTests: XCTestCase {
    func testPromptShowsWheneverNothingIsRunning() {
        XCTAssertTrue(HomeTalkPromptPolicy.shouldShow(
            voiceIsActive: false, isTurnSubmitting: false, isThinking: false
        ), "an idle home always offers a way to start talking")
    }

    func testPromptHidesWhileAConversationRuns() {
        XCTAssertFalse(HomeTalkPromptPolicy.shouldShow(
            voiceIsActive: true, isTurnSubmitting: false, isThinking: false
        ), "listening or speaking hides the prompt")
        XCTAssertFalse(HomeTalkPromptPolicy.shouldShow(
            voiceIsActive: false, isTurnSubmitting: true, isThinking: false
        ), "a turn in flight hides the prompt")
        XCTAssertFalse(HomeTalkPromptPolicy.shouldShow(
            voiceIsActive: false, isTurnSubmitting: false, isThinking: true
        ), "thinking hides the prompt")
    }
}
