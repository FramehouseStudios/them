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
        XCTAssertTrue(MagicMomentSignInDeferral.signInMessage.contains("sign in"))
        XCTAssertTrue(MagicMomentSignInDeferral.signInMessage.hasPrefix("Create an account"))
        XCTAssertTrue(MagicMomentSignInDeferral.signInMessage.contains("saved"))
        XCTAssertFalse(MagicMomentSignInDeferral.signInMessage.contains("error"))
    }

    func testAccessDecisionForAFreshGuestIsRequireAccount() {
        let decision = ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: false, accessTokenExpired: false, refreshTokenPresent: false, isRunningUITests: false
        )
        XCTAssertTrue(MagicMomentSignInDeferral.shouldDefer(decision))
    }

    func testPendingFirstPageSurvivesARelaunchAndClearsWhenDone() throws {
        let suite = "MagicMomentSignInDeferralTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertNil(MagicMomentSignInDeferral.load(defaults: defaults))
        let deferral = MagicMomentSignInDeferral(name: "Sam", sceneSeed: "A lighthouse keeper finds a stranger asleep on the rocks at dawn.")
        MagicMomentSignInDeferral.persist(deferral, defaults: defaults)
        XCTAssertEqual(MagicMomentSignInDeferral.load(defaults: defaults), deferral)

        MagicMomentSignInDeferral.persist(nil, defaults: defaults)
        XCTAssertNil(MagicMomentSignInDeferral.load(defaults: defaults))
    }

    func testABlankStoredSceneIsNotRestored() throws {
        let suite = "MagicMomentSignInDeferralTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        MagicMomentSignInDeferral.persist(MagicMomentSignInDeferral(name: "Sam", sceneSeed: "  "), defaults: defaults)
        XCTAssertNil(MagicMomentSignInDeferral.load(defaults: defaults))
    }

    func testFailureMessageKeepsTheReasonAndSaysTheSceneIsSafe() {
        let message = MagicMomentSignInDeferral.failureMessage("THEM is out of writing credit right now")
        XCTAssertTrue(message.hasPrefix("Your first page wasn't written yet. THEM is out of writing credit right now."), message)
        XCTAssertTrue(message.contains("Your scene is still saved"))
        let mapped = MagicMomentSignInDeferral.failureMessage("The writing service is temporarily unavailable. Your draft is safe. Please try again later.")
        XCTAssertEqual(mapped, "Your first page wasn't written yet. The writing service is temporarily unavailable. Your draft is safe. Please try again later.")
        XCTAssertEqual(
            MagicMomentSignInDeferral.failureMessage(""),
            "Your first page wasn't written yet. Your scene is still saved; try again when you're ready."
        )
    }

    func testWaitingCardDoesNotAskASignedInWriterToSignIn() {
        XCTAssertEqual(MagicMomentSignInDeferral.waitingMessage(isSignedIn: false), MagicMomentSignInDeferral.signInMessage)
        XCTAssertFalse(MagicMomentSignInDeferral.waitingMessage(isSignedIn: true).lowercased().contains("sign in"))
    }
}
