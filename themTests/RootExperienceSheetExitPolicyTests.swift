import XCTest
@testable import them

final class RootExperienceSheetExitPolicyTests: XCTestCase {
    func testGenericUtilitySheetDismissalsNeverStartAConversation() {
        let dismissals = RootExperienceUtilitySheet.allCases.map {
            RootExperienceSheetExitIntent.dismiss($0)
        }

        XCTAssertEqual(
            RootExperienceUtilitySheet.allCases.map(\.rawValue),
            [
                "memories",
                "notes",
                "tasks",
                "recap",
                "voiceSettings",
                "companionControls",
                "dataControls",
            ]
        )
        XCTAssertTrue(dismissals.allSatisfy { !$0.shouldStartConversation })
    }

    func testExplicitStartTalkingIntentStillStartsAConversation() {
        XCTAssertTrue(RootExperienceSheetExitIntent.startTalking.shouldStartConversation)
    }
}
