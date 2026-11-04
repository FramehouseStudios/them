import XCTest
@testable import them

@MainActor
final class StudioTalkDeferredDeliveryTests: XCTestCase {
    func testStopBeforeExecutionDropsQueuedMetadataAudioAndText() async {
        let state = DeliveryState()
        var delivered: [String] = []
        let queued = ["metadata", "audio", "text"].map { event in
            StudioActionDispatcher.enqueueTalkDelivery(isCurrent: { state.current }) { delivered.append(event) }
        }
        XCTAssertTrue(delivered.isEmpty, "This must exercise deferred execution, not synchronous callbacks")
        state.current = false // Stop occurs while the main actor still owns this turn.
        for task in queued { await task.value }
        XCTAssertTrue(delivered.isEmpty, "Queued callbacks restarted a stopped turn")
    }

    func testNewTurnDoesNotReviveQueuedCallbacksFromTheOldTurn() async {
        let state = DeliveryState()
        var delivered: [String] = []
        let old = StudioActionDispatcher.enqueueTalkDelivery(isCurrent: { state.turn == "first" }) {
            delivered.append("old audio")
        }
        state.turn = "second"
        let new = StudioActionDispatcher.enqueueTalkDelivery(isCurrent: { state.turn == "second" }) {
            delivered.append("new audio")
        }
        await old.value
        await new.value
        XCTAssertEqual(delivered, ["new audio"])
    }

    func testCurrentTurnDeliversAllCallbacksInOrder() async {
        var delivered: [String] = []
        // Each callback is enqueued by the previous one to prove causal order
        // without assuming scheduling order between independent Swift Tasks.
        let text = expectation(description: "Current turn text delivered")
        let metadata = StudioActionDispatcher.enqueueTalkDelivery(isCurrent: { true }) {
            delivered.append("metadata")
            StudioActionDispatcher.enqueueTalkDelivery(isCurrent: { true }) {
                delivered.append("audio")
                StudioActionDispatcher.enqueueTalkDelivery(isCurrent: { true }) {
                    delivered.append("text")
                    text.fulfill()
                }
            }
        }
        await metadata.value
        await fulfillment(of: [text], timeout: 1)
        XCTAssertEqual(delivered, ["metadata", "audio", "text"])
    }

    func testCancelledDeliveryDoesNotPublishEvenIfTurnStillMatches() async {
        var delivered = false
        let queued = StudioActionDispatcher.enqueueTalkDelivery(isCurrent: { true }) { delivered = true }
        queued.cancel()
        await queued.value
        XCTAssertFalse(delivered)
    }
}

@MainActor
private final class DeliveryState {
    var current = true
    var turn = "first"
}
