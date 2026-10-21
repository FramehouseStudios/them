import XCTest
@testable import them

final class ScreenplayDraftSaveSlotTests: XCTestCase {
    func testASaveArrivingWhileOneRunsWaitsInsteadOfRunningBesideIt() {
        var slot = ScreenplayDraftSaveSlot<String>()
        XCTAssertTrue(slot.claim("page 27"))
        XCTAssertFalse(slot.claim("page 28"))
        XCTAssertTrue(slot.isClaimed)
        XCTAssertEqual(slot.pending, "page 28")
    }

    func testOnlyTheNewestWaitingSaveIsKept() {
        var slot = ScreenplayDraftSaveSlot<String>()
        XCTAssertTrue(slot.claim("page 28"))
        XCTAssertFalse(slot.claim("page 29"))
        XCTAssertFalse(slot.claim("page 30"))
        XCTAssertEqual(slot.takePending(), "page 30")
        XCTAssertNil(slot.pending)
    }

    func testTheRunningSaveTakesTheWaitingOneSoReleaseHandsNothingBack() {
        var slot = ScreenplayDraftSaveSlot<String>()
        XCTAssertTrue(slot.claim("page 29"))
        XCTAssertFalse(slot.claim("page 30"))
        XCTAssertEqual(slot.takePending(), "page 30")
        XCTAssertNil(slot.release())
        XCTAssertFalse(slot.isClaimed)
    }

    func testTheLastPageWriteOfABurstArrivingDuringAQueueDrainIsHandedBack() {
        var slot = ScreenplayDraftSaveSlot<String>()
        XCTAssertTrue(slot.claimForQueue())
        XCTAssertFalse(slot.claim("page 30"))
        XCTAssertEqual(slot.release(), "page 30")
        XCTAssertTrue(slot.claim("page 30"))
    }

    func testTheQueueDrainWaitsWhileASaveRunsAndLeavesItsWaitingSaveAlone() {
        var slot = ScreenplayDraftSaveSlot<String>()
        XCTAssertTrue(slot.claim("page 29"))
        XCTAssertFalse(slot.claim("page 30"))
        XCTAssertFalse(slot.claimForQueue())
        XCTAssertEqual(slot.pending, "page 30")
    }

    @MainActor
    func testTwoSavesStartedTogetherNeverBothReachTheQueueCheck() async {
        let saver = SlotSaver()
        let first = Task { await saver.save("page 29") }
        let second = Task { await saver.save("page 30") }
        await first.value
        await second.value
        XCTAssertEqual(saver.reachedQueueCheck, ["page 29", "page 30"])
        XCTAssertFalse(saver.slot.isClaimed)
    }
}

/// The view model's shape: claim, then await the local queue. Before the fix
/// the claim came after the await, so both saves passed it.
@MainActor
private final class SlotSaver {
    var slot = ScreenplayDraftSaveSlot<String>()
    var reachedQueueCheck: [String] = []

    func save(_ draft: String) async {
        guard slot.claim(draft) else { return }
        await Task.yield()
        reachedQueueCheck.append(draft)
        if let next = slot.release() {
            await save(next)
        }
    }
}
