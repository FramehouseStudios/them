import XCTest
@testable import them

final class FirstPageOnboardingPolicyTests: XCTestCase {
    func testAttemptTrimsAndPreservesWriterInputForRetry() throws {
        let attempt = try XCTUnwrap(FirstPageOnboardingAttempt.make(
            writerName: "  Ava  ",
            sceneSeed: "  A blue key waits under a motel door.  ",
            fallbackSceneSeed: "Fallback scene"
        ))

        XCTAssertEqual(attempt.writerName, "Ava")
        XCTAssertEqual(attempt.sceneSeed, "A blue key waits under a motel door.")
    }

    func testAttemptUsesFallbackSceneWithoutAcceptingABlankName() throws {
        XCTAssertNil(FirstPageOnboardingAttempt.make(
            writerName: "  \n ",
            sceneSeed: "A scene",
            fallbackSceneSeed: "Fallback scene"
        ))

        let attempt = try XCTUnwrap(FirstPageOnboardingAttempt.make(
            writerName: "Ava",
            sceneSeed: " \n ",
            fallbackSceneSeed: "  Someone carries an unsaid secret.  "
        ))
        XCTAssertEqual(attempt.sceneSeed, "Someone carries an unsaid secret.")
    }

    func testOnlySuccessfulGenerationCompletesOnboarding() {
        let success = FirstPageOnboardingOutcome.resolve(errorMessage: nil)
        let failure = FirstPageOnboardingOutcome.resolve(errorMessage: "  Network unavailable.  ")

        XCTAssertTrue(success.shouldCompleteOnboarding)
        XCTAssertFalse(failure.shouldCompleteOnboarding)
        XCTAssertEqual(failure, .failure("Network unavailable."))
    }

    func testWritingPresentationStaysVisibleAndLocksInputs() {
        let presentation = FirstPageOnboardingPresentation(
            isSubmitting: true,
            errorMessage: ""
        )

        XCTAssertEqual(presentation.state, .writing)
        XCTAssertEqual(presentation.primaryActionTitle, "Writing...")
        XCTAssertEqual(presentation.statusMessage, "Clementine is writing your first page...")
        XCTAssertTrue(presentation.showsProgress)
        XCTAssertTrue(presentation.inputsAreDisabled)
        XCTAssertFalse(presentation.isFailure)
    }

    func testFailurePresentationRestoresAnActionableRetryWithoutDiscardingDraft() {
        let presentation = FirstPageOnboardingPresentation(
            isSubmitting: false,
            errorMessage: "  The request timed out.  "
        )

        XCTAssertEqual(presentation.state, .failed("The request timed out."))
        XCTAssertEqual(presentation.primaryActionTitle, "Retry Page")
        XCTAssertEqual(
            presentation.statusMessage,
            "The request timed out. Your name and scene idea are still here. Try again when you're ready."
        )
        XCTAssertFalse(presentation.showsProgress)
        XCTAssertFalse(presentation.inputsAreDisabled)
        XCTAssertTrue(presentation.isFailure)
    }
}
