import XCTest
@testable import them

@MainActor
final class StudioTalkRequestCleanupTests: XCTestCase {
    func testOldSuspendedCompletionCannotClearReplacementRequest() async {
        await assertReplacementSurvives(cancelOld: false)
    }

    func testOldCancelledCompletionCannotClearReplacementRequest() async {
        await assertReplacementSurvives(cancelOld: true)
    }

    func testCurrentOwnerReleasesSharedStateExactlyOnce() {
        let state = CleanupState()
        state.claim("current")
        StudioActionDispatcher.finishTalkRequest(isCurrent: { state.owner == "current" }, cleanup: state.clear)
        XCTAssertNil(state.taskName)
        XCTAssertFalse(state.submitting)
        XCTAssertNil(state.lifecycle)
        XCTAssertEqual(state.sharedCleanups, 1)
    }

    func testDuplicateBeforeAdmissionStillReleasesItsCurrentCall() {
        let state = CleanupState()
        state.claim("earlier accepted timestamp")
        // Duplicate rejection has not suspended or claimed a new timestamp.
        // Its caller supplies this synchronous early-return admission lease.
        StudioActionDispatcher.finishTalkRequest(isCurrent: { true }, cleanup: state.clear)
        XCTAssertNil(state.taskName)
        XCTAssertFalse(state.submitting)
        XCTAssertEqual(state.sharedCleanups, 1)
    }

    private func assertReplacementSurvives(cancelOld: Bool) async {
        let state = CleanupState()
        let suspended = SuspendedCleanupTurn()
        let started = expectation(description: "Old request suspended")
        state.claim("old")
        let old = Task { @MainActor in
            defer {
                state.localCleanups += 1
                StudioActionDispatcher.finishTalkRequest(isCurrent: { state.owner == "old" }, cleanup: state.clear)
            }
            await suspended.wait(started)
        }
        await fulfillment(of: [started], timeout: 1)
        if cancelOld { old.cancel() }
        state.claim("replacement")
        suspended.release()
        await old.value
        XCTAssertEqual(state.taskName, "replacement", "Old finally detached the new request")
        XCTAssertTrue(state.submitting, "Old finally cleared the new submitting state")
        state.lifecycle?()
        XCTAssertEqual(state.lifecycleEvents, ["replacement"], "Old finally detached the new page callback")
        XCTAssertEqual(state.sharedCleanups, 0)
        XCTAssertEqual(state.localCleanups, 1, "Local cleanup must always run, including cancellation")
    }
}

@MainActor
private final class CleanupState {
    var owner = ""
    var taskName: String?
    var submitting = false
    var lifecycle: (() -> Void)?
    var lifecycleEvents: [String] = []
    var sharedCleanups = 0
    var localCleanups = 0
    func claim(_ name: String) {
        owner = name; taskName = name; submitting = true
        lifecycle = { [weak self] in self?.lifecycleEvents.append(name) }
    }
    func clear() {
        sharedCleanups += 1
        lifecycle = nil; taskName = nil; submitting = false
    }
}

@MainActor
private final class SuspendedCleanupTurn {
    private var continuation: CheckedContinuation<Void, Never>?
    func wait(_ started: XCTestExpectation) async {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            started.fulfill()
        }
    }
    func release() { continuation?.resume(); continuation = nil }
}
