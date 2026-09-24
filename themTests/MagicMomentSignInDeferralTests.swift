import XCTest
@testable import them

final class MagicMomentSignInDeferralTests: XCTestCase {
    func testOnlyAGuestDefersTheFirstPage() {
        XCTAssertTrue(MagicMomentSignInDeferral.shouldDefer(.requireAccount))
        XCTAssertFalse(MagicMomentSignInDeferral.shouldDefer(.openWorkspace))
        XCTAssertFalse(MagicMomentSignInDeferral.shouldDefer(.refreshPersistedSession), "a persisted session is refreshed, not bounced to the sheet")
    }

    func testDeferralKeepsTheWritersWordsAndSaysWhatHappensNext() {
        let deferral = MagicMomentSignInDeferral(name: "Ada", sceneSeed: "A detective finds a letter under a motel door")
        XCTAssertEqual(deferral.name, "Ada")
        XCTAssertEqual(deferral.sceneSeed, "A detective finds a letter under a motel door")
        XCTAssertTrue(MagicMomentSignInDeferral.signInMessage.contains("Sign in"))
        XCTAssertTrue(MagicMomentSignInDeferral.signInMessage.contains("saved"))
        XCTAssertFalse(MagicMomentSignInDeferral.signInMessage.contains("error"))
    }

    func testAccessDecisionForAFreshGuestIsRequireAccount() {
        let decision = ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: false, accessTokenExpired: false, refreshTokenPresent: false, isRunningUITests: false
        )
        XCTAssertTrue(MagicMomentSignInDeferral.shouldDefer(decision))
    }
}
