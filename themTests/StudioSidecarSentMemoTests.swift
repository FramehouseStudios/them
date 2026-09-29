import XCTest
@testable import them

@MainActor
final class StudioSidecarSentMemoTests: XCTestCase {
    override func setUp() async throws { StudioSidecarSentMemo.reset() }

    func testAnIdenticalPayloadIsNotSentTwice() {
        // A long page write is stored cut to 2,400 characters, so it never
        // "matches the server"; without this the Studio re-sent it every second.
        let payload = ["long insert " + String(repeating: "x", count: 3_000)]
        XCTAssertFalse(StudioSidecarSentMemo.isRepeat("askNoteHistory", projectID: "p1", payload: payload))
        StudioSidecarSentMemo.record("askNoteHistory", projectID: "p1", payload: payload)
        XCTAssertTrue(StudioSidecarSentMemo.isRepeat("askNoteHistory", projectID: "p1", payload: payload))
    }

    func testAChangedPayloadOrAnotherProjectStillSends() {
        StudioSidecarSentMemo.record("askNoteHistory", projectID: "p1", payload: ["a"])
        XCTAssertFalse(StudioSidecarSentMemo.isRepeat("askNoteHistory", projectID: "p1", payload: ["a", "b"]))
        XCTAssertFalse(StudioSidecarSentMemo.isRepeat("askNoteHistory", projectID: "p2", payload: ["a"]))
        XCTAssertFalse(StudioSidecarSentMemo.isRepeat("threadView", projectID: "p1", payload: ["a"]))
    }
}

final class StudioExchangeStableIDTests: XCTestCase {
    func testTheSameThreadTurnAlwaysGetsTheSameID() {
        let first = StudioExchangeStableID.uuid(threadID: "turn-1", turn: 1)
        XCTAssertEqual(first, StudioExchangeStableID.uuid(threadID: "turn-1", turn: 1))
        XCTAssertNotEqual(first, StudioExchangeStableID.uuid(threadID: "turn-1", turn: 2))
        XCTAssertNotEqual(first, StudioExchangeStableID.uuid(threadID: "turn-2", turn: 1))
    }
}
