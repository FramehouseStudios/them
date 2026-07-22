import XCTest
@testable import them

final class ClementineRealtimeRecoveryTests: XCTestCase {
    func testBackoffIsBoundedToThreeAttempts() {
        XCTAssertEqual(
            ClementineRealtimeRecoveryPolicy.delayNanoseconds(forAttempt: 1),
            350_000_000
        )
        XCTAssertEqual(
            ClementineRealtimeRecoveryPolicy.delayNanoseconds(forAttempt: 2),
            900_000_000
        )
        XCTAssertEqual(
            ClementineRealtimeRecoveryPolicy.delayNanoseconds(forAttempt: 3),
            1_800_000_000
        )
        XCTAssertNil(ClementineRealtimeRecoveryPolicy.delayNanoseconds(forAttempt: 0))
        XCTAssertNil(ClementineRealtimeRecoveryPolicy.delayNanoseconds(forAttempt: 4))
    }

    func testTransportSnapshotParsesRepairableTurnAndCredentialHint() {
        let loss = ClementineRealtimeConnectionLoss.parse([
            "cause": "peer_connection_failed",
            "message": "network changed",
            "connectionGeneration": 7,
            "turnID": "realtime-7",
            "userTranscript": "Move Mara into Act Two.",
            "transcriptIsFinal": true,
            "userSpeechActive": false,
            "assistantResponseActive": true,
            "recoverable": true,
            "credentialRefreshRecommended": true,
        ])

        XCTAssertEqual(loss.cause, .peerConnectionFailed)
        XCTAssertEqual(loss.connectionGeneration, 7)
        XCTAssertEqual(loss.turnID, "realtime-7")
        XCTAssertEqual(loss.userTranscript, "Move Mara into Act Two.")
        XCTAssertTrue(loss.hasRepairableTurn)
        XCTAssertTrue(loss.assistantResponseActive)
        XCTAssertTrue(loss.credentialRefreshRecommended)
        XCTAssertTrue(ClementineRealtimeRecoveryPolicy.shouldReconnect(after: loss, attempt: 3))
        XCTAssertFalse(ClementineRealtimeRecoveryPolicy.shouldReconnect(after: loss, attempt: 4))
    }

    func testPermissionDenialFallsBackWithoutRetry() {
        let loss = ClementineRealtimeConnectionLoss.parse([
            "cause": "microphone_permission_denied",
            "message": "Permission denied",
            "recoverable": false,
            "credentialRefreshRecommended": false,
        ])

        XCTAssertEqual(loss.cause, .microphonePermissionDenied)
        XCTAssertFalse(loss.recoverable)
        XCTAssertFalse(loss.hasRepairableTurn)
        XCTAssertFalse(ClementineRealtimeRecoveryPolicy.shouldReconnect(after: loss, attempt: 1))
    }
}
