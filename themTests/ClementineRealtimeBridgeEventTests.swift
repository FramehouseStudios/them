import XCTest
@testable import them

@MainActor
final class ClementineRealtimeBridgeEventTests: XCTestCase {
    func testFinalTextDoesNotEndAudioThatIsStillPlaying() {
        let bridge = ClementineRealtimeWebViewBridge()
        var speakingChanges: [Bool] = []
        var finalTexts: [String] = []
        var finalTranscripts: [String] = []
        bridge.onAssistantSpeakingChanged = { speakingChanges.append($0) }
        bridge.onAssistantTextFinal = { finalTexts.append($0) }
        bridge.onAssistantTranscriptFinal = { finalTranscripts.append($0) }

        bridge.receiveBridgeMessage(["type": "bridge_ready"])
        bridge.receiveBridgeMessage(["type": "connected"])
        bridge.receiveBridgeMessage([
            "type": "assistant_speaking",
            "responseOrdinal": 1,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_text_final",
            "text": "The scene arrives while the voice continues.",
            "responseOrdinal": 1,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_transcript_final",
            "text": "The scene arrives while the voice continues.",
            "responseOrdinal": 1,
        ])

        XCTAssertTrue(bridge.isAssistantSpeaking)
        XCTAssertEqual(speakingChanges, [true])
        XCTAssertEqual(finalTexts, ["The scene arrives while the voice continues."])
        XCTAssertEqual(finalTranscripts, ["The scene arrives while the voice continues."])

        bridge.receiveBridgeMessage([
            "type": "assistant_idle",
            "responseOrdinal": 1,
        ])
        XCTAssertFalse(bridge.isAssistantSpeaking)
        XCTAssertEqual(speakingChanges, [true, false])
    }

    func testInterruptedResponseRejectsLateTextAndSpeakingEvents() {
        let bridge = ClementineRealtimeWebViewBridge()
        var finalTexts: [String] = []
        bridge.onAssistantTextFinal = { finalTexts.append($0) }

        bridge.receiveBridgeMessage(["type": "bridge_ready"])
        bridge.receiveBridgeMessage(["type": "connected"])
        bridge.receiveBridgeMessage([
            "type": "assistant_speaking",
            "responseOrdinal": 1,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_interrupted",
            "responseOrdinal": 1,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_text_final",
            "text": "stale output",
            "responseOrdinal": 1,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_speaking",
            "responseOrdinal": 1,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_thinking",
            "responseOrdinal": 1,
        ])

        XCTAssertFalse(bridge.isAssistantSpeaking)
        XCTAssertTrue(finalTexts.isEmpty)
        XCTAssertEqual(bridge.activity, .listening)

        bridge.receiveBridgeMessage([
            "type": "assistant_speaking",
            "responseOrdinal": 2,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_text_final",
            "text": "fresh output",
            "responseOrdinal": 2,
        ])

        XCTAssertTrue(bridge.isAssistantSpeaking)
        XCTAssertEqual(finalTexts, ["fresh output"])
    }

    func testReconnectResetsCancelledOrdinalAndRecoversFromFailure() {
        let bridge = ClementineRealtimeWebViewBridge()
        var finalTexts: [String] = []
        bridge.onAssistantTextFinal = { finalTexts.append($0) }

        bridge.receiveBridgeMessage(["type": "bridge_ready"])
        bridge.receiveBridgeMessage(["type": "connected"])
        bridge.receiveBridgeMessage([
            "type": "assistant_interrupted",
            "responseOrdinal": 5,
        ])
        bridge.receiveBridgeMessage([
            "type": "error",
            "message": "Connection dropped.",
        ])
        XCTAssertEqual(bridge.status, .failed("Connection dropped."))

        bridge.receiveBridgeMessage(["type": "connecting"])
        bridge.receiveBridgeMessage(["type": "connected"])
        bridge.receiveBridgeMessage([
            "type": "assistant_speaking",
            "responseOrdinal": 1,
        ])
        bridge.receiveBridgeMessage([
            "type": "assistant_text_final",
            "text": "Recovered response",
            "responseOrdinal": 1,
        ])

        XCTAssertEqual(bridge.status, .live)
        XCTAssertTrue(bridge.isAssistantSpeaking)
        XCTAssertEqual(finalTexts, ["Recovered response"])
    }

    func testLatencyEventsUseTheSameDictionaryAndJSONMessageBoundary() throws {
        let bridge = ClementineRealtimeWebViewBridge()
        var events: [ClementineRealtimeLatencyEvent] = []
        bridge.onLatencyEvent = { events.append($0) }

        bridge.receiveBridgeMessage([
            "type": "latency_turn_started",
            "turnID": "realtime-1",
            "networkClass": "constrained",
        ])
        let json = try XCTUnwrap(
            "{\"type\":\"latency_first_audio\",\"turnID\":\"realtime-1\",\"elapsedMs\":725}"
                .data(using: .utf8)
        )
        bridge.receiveBridgeMessage(try XCTUnwrap(String(data: json, encoding: .utf8)))

        XCTAssertEqual(events.count, 2)
        XCTAssertEqual(events[0].kind, .turnStarted)
        XCTAssertEqual(events[0].networkClass, .constrained)
        XCTAssertEqual(events[1].kind, .firstAudio)
        XCTAssertEqual(events[1].elapsedMilliseconds, 725)
    }
}
