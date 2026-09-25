import XCTest
@testable import them

final class SheetReturnTalkPolicyTests: XCTestCase {
    func testReturnResumesOnlyARunningConversation() {
        XCTAssertTrue(SheetReturnTalkPolicy.shouldResume(
            conversationLoopEnabled: true, needsOnboardingName: false
        ), "a writer mid-conversation gets the mic back when the sheet closes")
        XCTAssertFalse(SheetReturnTalkPolicy.shouldResume(
            conversationLoopEnabled: false, needsOnboardingName: false
        ), "a quiet home stays quiet; only Talk starts a conversation")
    }

    func testReturnNeverArmsDuringOnboarding() {
        XCTAssertFalse(SheetReturnTalkPolicy.shouldResume(
            conversationLoopEnabled: true, needsOnboardingName: true
        ))
    }
}
