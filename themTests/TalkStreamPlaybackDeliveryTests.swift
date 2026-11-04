import XCTest
@testable import them

final class TalkStreamPlaybackDeliveryTests: XCTestCase {
    func testFirstSegmentBeforeAcceptedResponseWaitsAndLaterStartsRemainderOnce() {
        var playback = TalkStreamPlaybackDelivery()
        XCTAssertEqual(playback.firstSegmentFinished(), .wait)
        let remainder = URL(fileURLWithPath: "/accepted-remainder.wav")
        playback.registerResponse(remainder: remainder)
        XCTAssertEqual(playback.firstSegmentFinished(), .play(remainder))
        // A queued first-segment callback after the remainder started must
        // not stand in for the actual remainder player's completion callback.
        XCTAssertEqual(playback.firstSegmentFinished(), .wait)
    }

    func testRegistrationBeforePostResponseAwaitCannotLoseRemainder() {
        var playback = TalkStreamPlaybackDelivery()
        let remainder = URL(fileURLWithPath: "/registered-before-memory-await.wav")
        playback.registerResponse(remainder: remainder)
        XCTAssertEqual(playback.firstSegmentFinished(), .play(remainder))
        playback.registerResponse(remainder: nil)
        XCTAssertEqual(playback.firstSegmentFinished(), .wait)
    }

    func testResponseWithNoRemainderFinishesOnlyAfterRegistration() {
        var playback = TalkStreamPlaybackDelivery()
        XCTAssertEqual(playback.firstSegmentFinished(), .wait)
        playback.registerResponse(remainder: nil)
        XCTAssertEqual(playback.firstSegmentFinished(), .finish)
    }
}
