import XCTest
@testable import them

@MainActor
final class StudioVoiceTaskScopeTests: XCTestCase {
    func testFirstClipEndingEarlyKeepsMicClosedUntilRemainderIsReady() {
        var handoff = StudioVoiceStreamHandoff()
        let remainder = URL(fileURLWithPath: "/tmp/voice-remainder.mp3")

        XCTAssertEqual(handoff.nextAction(), .wait)
        handoff.responseReady(remainder: remainder)
        XCTAssertEqual(handoff.nextAction(), .play(remainder))
        XCTAssertEqual(handoff.nextAction(), .alreadyHandled)
    }

    func testSingleClipCompletionRearmsExactlyOnceAfterResponseIsReady() {
        var handoff = StudioVoiceStreamHandoff()

        handoff.responseReady(remainder: nil)
        XCTAssertEqual(handoff.nextAction(), .finish)
        handoff.responseReady(remainder: nil)
        XCTAssertEqual(handoff.nextAction(), .alreadyHandled)
    }

    func testEarlyReturningOperationAutomaticallyReleasesItsSlot() async throws {
        let scope = StudioVoiceTaskScope()
        let id = scope.start { invocationID in
            XCTAssertTrue(scope.isCurrent(invocationID))
            return
        }
        let task = try XCTUnwrap(scope.task)
        XCTAssertTrue(scope.isCurrent(id))
        await task.value
        XCTAssertFalse(scope.isCurrent(id))
        XCTAssertNil(scope.task)
        let direct = try XCTUnwrap(scope.beginDirectIfIdle())
        XCTAssertTrue(scope.finish(direct))
    }

    func testReplacedPredecessorFinishesAfterSuccessorWithoutClearingIt() async throws {
        let scope = StudioVoiceTaskScope()
        let firstStarted = VoiceTaskContinuationGate()
        let releaseFirst = VoiceTaskContinuationGate()
        let secondStarted = VoiceTaskContinuationGate()
        let releaseSecond = VoiceTaskContinuationGate()
        let first = scope.start { _ in
            await firstStarted.open()
            await releaseFirst.wait()
        }
        let firstTask = try XCTUnwrap(scope.task)
        await firstStarted.wait()
        let second = scope.start { _ in
            await secondStarted.open()
            await releaseSecond.wait()
        }
        let secondTask = try XCTUnwrap(scope.task)
        await secondStarted.wait()
        XCTAssertNotEqual(first, second)
        XCTAssertTrue(firstTask.isCancelled)
        XCTAssertFalse(scope.isCurrent(first))
        await releaseFirst.open()
        await firstTask.value
        XCTAssertTrue(scope.isCurrent(second), "The predecessor's automatic finish must retain its successor.")
        XCTAssertNotNil(scope.task)
        XCTAssertFalse(scope.finish(first))
        await releaseSecond.open()
        await secondTask.value
        XCTAssertNil(scope.task)
        XCTAssertFalse(scope.isCurrent(second))
    }

    func testDirectReservationCannotTakeBusySlotOrFinishNewerTask() async throws {
        let scope = StudioVoiceTaskScope()
        let direct = try XCTUnwrap(scope.beginDirectIfIdle())
        XCTAssertNil(scope.task)
        XCTAssertTrue(scope.isCurrent(direct))
        XCTAssertNil(scope.beginDirectIfIdle(), "A direct reservation is busy even without a task handle.")
        let release = VoiceTaskContinuationGate()
        let replacement = scope.start { _ in await release.wait() }
        let replacementTask = try XCTUnwrap(scope.task)
        XCTAssertFalse(scope.finish(direct), "A stale direct caller cannot retire a newer task.")
        XCTAssertTrue(scope.isCurrent(replacement))
        XCTAssertNil(scope.beginDirectIfIdle(), "Direct callers must not take a task-owned slot.")
        await release.open()
        await replacementTask.value
        XCTAssertNil(scope.task)
        XCTAssertFalse(scope.isCurrent(replacement))
    }

    func testCancelInvalidatesHandleAndLateCompletionCannotClearReplacement() async throws {
        let scope = StudioVoiceTaskScope()
        XCTAssertFalse(scope.cancel())
        let started = VoiceTaskContinuationGate()
        let releaseOld = VoiceTaskContinuationGate()
        let releaseNew = VoiceTaskContinuationGate()
        let old = scope.start { _ in
            await started.open()
            await releaseOld.wait()
        }
        let oldTask = try XCTUnwrap(scope.task)
        await started.wait()
        XCTAssertFalse(oldTask.isCancelled)
        XCTAssertTrue(scope.cancel())
        XCTAssertTrue(oldTask.isCancelled)
        XCTAssertNil(scope.task)
        XCTAssertFalse(scope.isCurrent(old))
        XCTAssertFalse(scope.cancel(), "Cancellation of an idle scope is idempotent.")
        let replacement = scope.start { _ in await releaseNew.wait() }
        let replacementTask = try XCTUnwrap(scope.task)
        await releaseOld.open()
        await oldTask.value
        XCTAssertTrue(scope.isCurrent(replacement))
        XCTAssertNotNil(scope.task)
        XCTAssertFalse(scope.finish(old))
        XCTAssertTrue(scope.cancel())
        XCTAssertTrue(replacementTask.isCancelled)
        await releaseNew.open()
        await replacementTask.value
        XCTAssertNil(scope.task)
        XCTAssertFalse(scope.isCurrent(replacement))
    }

    func testCancelBeforeQueuedOperationStartsPreventsStaleWork() async throws {
        let scope = StudioVoiceTaskScope()
        var operationRan = false
        let id = scope.start { _ in operationRan = true }
        let task = try XCTUnwrap(scope.task)
        XCTAssertTrue(scope.cancel())
        await task.value
        XCTAssertTrue(task.isCancelled)
        XCTAssertFalse(operationRan)
        XCTAssertFalse(scope.isCurrent(id))
        XCTAssertNil(scope.task)
    }

    func testCancelRetiresDirectReservationAndStaleFinishPreservesNewDirectOwner() async throws {
        let scope = StudioVoiceTaskScope()
        let first = try XCTUnwrap(scope.beginDirectIfIdle())
        XCTAssertTrue(scope.cancel())
        XCTAssertFalse(scope.isCurrent(first))
        let second = try XCTUnwrap(scope.beginDirectIfIdle())
        XCTAssertNotEqual(first, second)
        XCTAssertFalse(scope.finish(first))
        XCTAssertTrue(scope.isCurrent(second))
        XCTAssertTrue(scope.finish(second))
        XCTAssertFalse(scope.finish(second))
        XCTAssertNil(scope.task)
    }
}

private actor VoiceTaskContinuationGate {
    private var isOpen = false
    private var waiters: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        guard !isOpen else { return }
        isOpen = true
        let pending = waiters
        waiters.removeAll()
        for waiter in pending { waiter.resume() }
    }
}
