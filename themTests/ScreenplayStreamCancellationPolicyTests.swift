import XCTest
@testable import them

final class ScreenplayStreamCancellationPolicyTests: XCTestCase {
    func testQueuedInsertClassification() {
        let queued: [ScreenplayInsertionRequest.Mode] = [
            .streamInsertProgress, .streamInsertFinalize, .streamInsertCancel,
            .voiceRevealPrepare, .voiceRevealUpdate, .voiceRevealFinalize, .voiceRevealCancel
        ]
        for mode in queued {
            XCTAssertTrue(ScreenplayStreamCancellationPolicy.hasQueuedInsert(mode), "\(mode)")
        }
        let ordinary: [ScreenplayInsertionRequest.Mode?] = [
            .insert, .streamPreview, .streamCommit, .streamCancel, nil
        ]
        for mode in ordinary {
            XCTAssertFalse(ScreenplayStreamCancellationPolicy.hasQueuedInsert(mode))
        }
    }

    func testEveryCancellationStatePreservesOriginalDecisions() {
        for rollback in [false, true] {
            for streaming in [false, true] {
                for synced in [false, true] {
                    for queued in [false, true] {
                        // Characterize the original bridge's precedence across all 16 states.
                        var expected = ScreenplayStreamCancellationPolicy.PendingAction.retain
                        if rollback, streaming || synced { expected = .rollback }
                        else if !rollback, queued { expected = .clear }
                        XCTAssertEqual(ScreenplayStreamCancellationPolicy.pendingAction(
                            rollbackDraft: rollback, wasStreaming: streaming,
                            cancelledSynced: synced, hadQueuedInsert: queued
                        ), expected)
                    }
                }
            }
        }
    }

    func testWriterTakeBackAlwaysNotifiesBackendEvenWithoutLocalStream() {
        for reason: ScreenplaySyncedInsertInterruptionReason in [.manualTyping, .bargeIn, .cancel] {
            XCTAssertTrue(ScreenplayStreamCancellationPolicy.notifiesBackend(reason))
        }
        XCTAssertFalse(ScreenplayStreamCancellationPolicy.notifiesBackend(.other))
    }
}
