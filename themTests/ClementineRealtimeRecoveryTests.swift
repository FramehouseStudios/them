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
            "assistantSpeaking": false,
            "recoverable": true,
            "credentialRefreshRecommended": true,
        ])

        XCTAssertEqual(loss.cause, .peerConnectionFailed)
        XCTAssertEqual(loss.connectionGeneration, 7)
        XCTAssertEqual(loss.turnID, "realtime-7")
        XCTAssertEqual(loss.userTranscript, "Move Mara into Act Two.")
        XCTAssertTrue(loss.hasRepairableTurn)
        XCTAssertTrue(loss.assistantResponseActive)
        XCTAssertEqual(loss.faultStage, .thinking)
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

    func testFaultStagesRouteIncompleteSpeechToFallbackAndFinalTurnsToRepair() {
        let expectations: [(ClementineRealtimeFaultStage, Bool, Bool)] = [
            (.speech, true, false),
            (.transcription, true, false),
            (.thinking, false, true),
            (.playback, false, true),
        ]

        for (stage, expectsFallback, expectsRepair) in expectations {
            let loss = ClementineRealtimeConnectionLoss.simulatedFault(stage: stage)
            XCTAssertEqual(loss.faultStage, stage)
            XCTAssertEqual(loss.requiresStandardVoiceFallback, expectsFallback)
            XCTAssertEqual(loss.hasRepairableTurn, expectsRepair)
        }
    }

    func testOutcomeGateAcceptsExactlyOneRepairOrFallbackPerTurn() {
        var gate = ClementineRealtimeRecoveryOutcomeGate()
        gate.begin(turnID: "turn-7", transcript: "Finish the ferry scene.")

        XCTAssertTrue(gate.accept(.repairedResponse))
        XCTAssertFalse(gate.accept(.repairedResponse))
        XCTAssertFalse(gate.accept(.standardVoiceFallback))
        XCTAssertEqual(gate.outcome, .repairedResponse)
        XCTAssertEqual(gate.acceptedCount, 1)
        XCTAssertEqual(gate.suppressedCount, 2)

        gate.begin(turnID: "turn-8", transcript: "A different turn.")
        XCTAssertTrue(gate.accept(.standardVoiceFallback))
        XCTAssertFalse(gate.accept(.standardVoiceFallback))
        XCTAssertEqual(gate.outcome, .standardVoiceFallback)
        XCTAssertEqual(gate.acceptedCount, 1)
        XCTAssertEqual(gate.suppressedCount, 1)
    }
}
