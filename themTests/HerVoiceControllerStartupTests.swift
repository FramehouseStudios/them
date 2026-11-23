import AVFoundation
import XCTest
@testable import them

@MainActor
final class HerVoiceControllerStartupTests: XCTestCase {
    func testTalkShowsRetryNoticeAndStaysIdleWhenAudioSessionCannotStart() async {
        enum SessionError: Error { case unavailable }
        var startAttempts = 0
        let voice = HerVoiceController(
            requestMicrophonePermission: { $0(.authorized) },
            prepareListeningSession: {
                startAttempts += 1
                throw SessionError.unavailable
            }
        )
        var utteranceProduced = false
        voice.onUtteranceReady = { _ in utteranceProduced = true }

        voice.armOnce()

        XCTAssertEqual(startAttempts, 1)
        XCTAssertEqual(voice.mode, .idle)
        XCTAssertTrue(voice.showSpaceHint)
        XCTAssertEqual(voice.micPermissionNotice?.title, "Microphone Unavailable")
        XCTAssertEqual(voice.micPermissionNotice?.offersSettings, false)
        XCTAssertFalse(utteranceProduced)

        voice.armOnce()
        XCTAssertEqual(startAttempts, 2)
        XCTAssertEqual(voice.mode, .idle)
    }

    func testFailedResumeAfterPlaybackClearsTheListeningState() async {
        enum SessionError: Error { case unavailable }
        let voice = HerVoiceController(prepareListeningSession: { throw SessionError.unavailable })
        voice.markAssistantPlaybackStarted()
        voice.markAssistantPlaybackEnded()
        XCTAssertEqual(voice.mode, .armedListening)

        voice.resumeRecordingIfNeeded()

        XCTAssertEqual(voice.mode, .idle)
        XCTAssertEqual(voice.micPermissionNotice?.offersSettings, false)
    }

    func testStopPreventsAnOldPermissionResponseFromRearmingTheMicrophone() async {
        var completePermission: ((AVAuthorizationStatus) -> Void)?
        let voice = HerVoiceController(
            requestMicrophonePermission: { completePermission = $0 },
            prepareListeningSession: { XCTFail("The stopped request must not start audio.") }
        )

        voice.armOnce()
        XCTAssertNotNil(completePermission)
        voice.teardown()
        completePermission?(.authorized)

        XCTAssertEqual(voice.mode, .idle)
        XCTAssertNil(voice.micPermissionNotice)
    }

    func testDeniedMicrophoneAuthorizationOffersSettingsWithoutStartingAudio() async {
        let voice = HerVoiceController(
            requestMicrophonePermission: { $0(.denied) },
            prepareListeningSession: { XCTFail("Microphone permission is required.") }
        )

        voice.armOnce()

        XCTAssertEqual(voice.mode, .idle)
        XCTAssertEqual(voice.micPermissionNotice?.title, "Microphone Access Needed")
        XCTAssertEqual(voice.micPermissionNotice?.offersSettings, true)
    }
}
