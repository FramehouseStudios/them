import XCTest
@testable import them

@MainActor
final class ClementineLatencyTelemetryTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suiteName = "ClementineLatencyTelemetryTests"

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: suiteName)
        defaults.removePersistentDomain(forName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        super.tearDown()
    }

    func testFirstTextAndAudioAreRecordedOnceWithoutConversationContent() throws {
        let store = ClementineLatencyTelemetryStore(
            defaults: defaults,
            storageKey: "latency",
            maxSamples: 4
        )
        let start = Date(timeIntervalSince1970: 100)

        store.beginTurn(id: "turn-1", transport: .studioTypedSpeech, at: start)
        store.recordFirstText(turnID: "turn-1", at: start.addingTimeInterval(0.12))
        store.recordFirstText(turnID: "turn-1", at: start.addingTimeInterval(0.80))
        store.recordFirstAudio(
            turnID: "turn-1",
            at: start.addingTimeInterval(0.31),
            networkClass: .fast,
            targetCharacters: 68
        )

        let sample = try XCTUnwrap(store.samples.first)
        XCTAssertEqual(sample.firstTextMs ?? -1, 120, accuracy: 0.01)
        XCTAssertEqual(sample.firstAudioMs ?? -1, 310, accuracy: 0.01)
        XCTAssertEqual(sample.speechNetworkClass, .fast)
        XCTAssertEqual(sample.speechTargetCharacters, 68)

        let persisted = try XCTUnwrap(defaults.data(forKey: "latency"))
        let json = try XCTUnwrap(String(data: persisted, encoding: .utf8))
        XCTAssertFalse(json.contains("prompt"))
        XCTAssertFalse(json.contains("transcript"))
        XCTAssertFalse(json.contains("reply"))
    }

    func testStoreBoundsSamplesAndComputesPercentiles() {
        let store = ClementineLatencyTelemetryStore(
            defaults: defaults,
            storageKey: "bounded",
            maxSamples: 3
        )
        let start = Date(timeIntervalSince1970: 100)

        for index in 0..<5 {
            let turnID = "turn-\(index)"
            store.beginTurn(id: turnID, transport: .realtimeVoice, at: start)
            store.recordFirstText(turnID: turnID, elapsedMilliseconds: Double((index + 1) * 100))
            store.recordFirstAudio(turnID: turnID, elapsedMilliseconds: Double((index + 1) * 200))
        }

        XCTAssertEqual(store.samples.map(\.id), ["turn-2", "turn-3", "turn-4"])
        XCTAssertEqual(store.summary.sampleCount, 3)
        XCTAssertEqual(store.summary.medianFirstTextMs, 400)
        XCTAssertEqual(store.summary.p95FirstAudioMs ?? -1, 980, accuracy: 0.01)
    }

    func testRealtimeBridgeLatencyPayloadParsesNumericAndNetworkFields() throws {
        let event = try XCTUnwrap(
            ClementineRealtimeLatencyEvent.parse(
                eventType: "latency_first_audio",
                payload: [
                    "turnID": "realtime-1",
                    "elapsedMs": 184.5,
                    "networkClass": "constrained"
                ]
            )
        )

        XCTAssertEqual(event.kind, .firstAudio)
        XCTAssertEqual(event.turnID, "realtime-1")
        XCTAssertEqual(event.elapsedMilliseconds, 184.5)
        XCTAssertEqual(event.networkClass, .constrained)
    }
}
