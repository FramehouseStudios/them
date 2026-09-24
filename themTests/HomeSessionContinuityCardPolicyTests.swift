import XCTest
@testable import them

final class HomeSessionContinuityCardPolicyTests: XCTestCase {
    func testCardWaitsUntilOnboardingIsDone() {
        XCTAssertFalse(HomeSessionContinuityCardPolicy.shouldShow(
            hasMeaningfulSnapshot: true, fingerprint: "a", dismissedFingerprint: "", needsOnboardingName: true
        ), "a writer who has not given a name is not welcomed back under the onboarding card")
        XCTAssertTrue(HomeSessionContinuityCardPolicy.shouldShow(
            hasMeaningfulSnapshot: true, fingerprint: "a", dismissedFingerprint: "", needsOnboardingName: false
        ))
    }

    func testCardRespectsDismissalAndEmptySnapshots() {
        XCTAssertFalse(HomeSessionContinuityCardPolicy.shouldShow(
            hasMeaningfulSnapshot: false, fingerprint: "a", dismissedFingerprint: "", needsOnboardingName: false
        ))
        XCTAssertFalse(HomeSessionContinuityCardPolicy.shouldShow(
            hasMeaningfulSnapshot: true, fingerprint: "a", dismissedFingerprint: "a", needsOnboardingName: false
        ), "hidden once stays hidden for the same thread")
        XCTAssertTrue(HomeSessionContinuityCardPolicy.shouldShow(
            hasMeaningfulSnapshot: true, fingerprint: "b", dismissedFingerprint: "a", needsOnboardingName: false
        ), "a new thread shows again")
    }
}
