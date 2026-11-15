import XCTest
@testable import them

final class BackendTalkRecoveryFailureTests: XCTestCase {
    func testSuccessfulAndListeningStatusesAreNotRecoveredFailures() {
        for status in ["responded", "continue_listening", "asked_repeat", "", "error"] {
            XCTAssertNil(BackendTalkRecoveryFailure(turnStatus: status, stage: "stt"))
        }
    }

    func testTranscriptionFailureIsNotPresentedAsRecoveredWriting() throws {
        let failure = try XCTUnwrap(BackendTalkRecoveryFailure(turnStatus: " ERROR_RECOVERED\n", stage: " STT "))
        XCTAssertEqual(failure.message, "Clementine couldn't transcribe that recording. Tap Talk to retry, or type your story.")
        XCTAssertFalse(failure.message.contains("Recovered"))
        XCTAssertFalse(failure.message.contains("saved"))
    }

    func testReplyFailureOffersAnExplicitRetry() throws {
        let failure = try XCTUnwrap(BackendTalkRecoveryFailure(turnStatus: "error_recovered", stage: "chat"))
        XCTAssertTrue(failure.message.contains("couldn't finish her reply"))
        XCTAssertTrue(failure.message.contains("Tap Talk to retry"))
    }

    func testPlaybackFailureDoesNotClaimGeneratedPagesWereLostOrSaved() throws {
        let failure = try XCTUnwrap(BackendTalkRecoveryFailure(turnStatus: "error_recovered", stage: "tts"))
        XCTAssertTrue(failure.message.contains("Review the page"))
        XCTAssertFalse(failure.message.contains("draft is unchanged"))
        XCTAssertFalse(failure.message.contains("saved"))
    }

    func testUnknownStageNeverEchoesProviderOrPrivateHeaderText() throws {
        for stage in [nil, "unknown-private-stage", "server", " "] as [String?] {
            let failure = try XCTUnwrap(BackendTalkRecoveryFailure(turnStatus: "error_recovered", stage: stage))
            XCTAssertEqual(failure.message, "Clementine couldn't complete that request. Review the page, then tap Talk to retry.")
        }
    }
}
