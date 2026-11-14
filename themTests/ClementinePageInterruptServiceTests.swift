import XCTest
@testable import them

@MainActor
final class ClementinePageInterruptServiceTests: XCTestCase {
    func testLifecycleMakesReservationImmediatelyAvailableForWriterInterrupt() async throws {
        let gate = CancelGate()
        let service = makeLifecycleService(gate)
        let lifecycle = PageTalkLifecycle { service.handlePageLifecycle($0) }
        lifecycle.begin()
        lifecycle.observeReservation("current-reservation")
        let task = try XCTUnwrap(service.requestPageCancel(reason: "manual_typing"))
        await task.value
        lifecycle.finish()
        let calls = await gate.calls()
        XCTAssertEqual(calls.map(\.reservationId), ["current-reservation"])
    }

    func testOldCompletionCannotDisableNewHeaderlessTurnCancellation() async throws {
        let gate = CancelGate()
        let service = makeLifecycleService(gate)
        let oldID = UUID(), newID = UUID()
        service.handlePageLifecycle(.began(oldID))
        service.handlePageLifecycle(.began(newID))
        service.handlePageLifecycle(.finished(oldID))
        let task = try XCTUnwrap(service.requestPageCancel(reason: "manual_typing"))
        await task.value
        let calls = await gate.calls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertNil(calls.first?.reservationId)
        XCTAssertEqual(calls.first?.sessionId, "session")
    }

    func testLateOldHeaderCannotReplaceCurrentReservation() async throws {
        let gate = CancelGate()
        let service = makeLifecycleService(gate)
        let oldID = UUID(), newID = UUID()
        service.handlePageLifecycle(.began(oldID))
        service.handlePageLifecycle(.began(newID))
        service.handlePageLifecycle(.reservation(newID, "new-reservation"))
        service.handlePageLifecycle(.reservation(oldID, "old-reservation"))
        let task = try XCTUnwrap(service.requestPageCancel(reason: "manual_typing"))
        await task.value
        let calls = await gate.calls()
        XCTAssertEqual(calls.map(\.reservationId), ["new-reservation"])
    }

    private func makeLifecycleService(_ gate: CancelGate) -> ClementinePageInterruptService {
        ClementinePageInterruptService(dependencies: .init(
            cancelPageLane: { id, session, reason in
                await gate.record(reservationId: id, sessionId: session, reason: reason)
                return BackendPageCancelResult(ok: true, cancelled: true, reservationId: id,
                    sessionId: session, dropped: [], cancelReason: reason, status: "cancelled")
            },
            resolveSessionId: { "session" }
        ))
    }

    func testNewTurnBeforeReservationHeaderIsNotClearedOrDeduplicated() async throws {
        let entered = expectation(description: "session cancellation started")
        let transport = DelayedPageCancellation(entered: entered)
        let service = ClementinePageInterruptService(dependencies: .init(
            cancelPageLane: { id, _, _ in await transport.cancel(id) },
            resolveSessionId: { "session" }
        ))
        service.markPageTalkInFlight(true)
        let oldTask = try XCTUnwrap(service.requestPageCancel(reason: "barge_in"))
        await fulfillment(of: [entered], timeout: 2)
        service.markPageTalkInFlight(true)
        transport.finishFirst()
        await oldTask.value
        let newTask = service.requestPageCancel(reason: "barge_in")
        await newTask?.value
        XCTAssertEqual(transport.reservations.count, 2)
        XCTAssertTrue(transport.reservations.allSatisfy { $0 == nil })
    }

    func testDelayedOldCancellationDoesNotClearNewReservation() async throws {
        let entered = expectation(description: "old cancellation started")
        let transport = DelayedPageCancellation(entered: entered)
        let service = ClementinePageInterruptService(dependencies: .init(
            cancelPageLane: { id, _, _ in await transport.cancel(id) },
            resolveSessionId: { "session" }
        ))
        service.notePageReservationId("old-reservation")
        let oldTask = try XCTUnwrap(service.requestPageCancel(reason: "barge_in"))
        await fulfillment(of: [entered], timeout: 2)
        service.notePageReservationId("new-reservation")
        transport.finishFirst()
        await oldTask.value
        let newTask = service.requestPageCancel(reason: "manual_typing")
        await newTask?.value
        XCTAssertEqual(transport.reservations, ["old-reservation", "new-reservation"])
    }

    func testHandleInterruptCancelsByReservationOnce() async throws {
        let gate = CancelGate()
        let service = ClementinePageInterruptService(
            dependencies: .init(
                cancelPageLane: { reservationId, sessionId, reason in
                    await gate.record(reservationId: reservationId, sessionId: sessionId, reason: reason)
                    return BackendPageCancelResult(
                        ok: true,
                        cancelled: true,
                        reservationId: reservationId,
                        sessionId: sessionId,
                        dropped: reservationId.map { [$0] } ?? [],
                        cancelReason: reason,
                        status: "cancelled"
                    )
                },
                resolveSessionId: { "sess-fallback" }
            )
        )

        service.notePageReservationId("res-1")
        service.handleInterrupt(reason: .bargeIn)
        service.handleInterrupt(reason: .bargeIn) // debounced

        try await Task.sleep(nanoseconds: 150_000_000)
        let calls = await gate.calls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertEqual(calls[0].reservationId, "res-1")
        XCTAssertEqual(calls[0].reason, "barge_in")
        XCTAssertNil(calls[0].sessionId)
    }

    func testHandleInterruptFallsBackToSessionWhenNoReservation() async throws {
        let gate = CancelGate()
        let service = ClementinePageInterruptService(
            dependencies: .init(
                cancelPageLane: { reservationId, sessionId, reason in
                    await gate.record(reservationId: reservationId, sessionId: sessionId, reason: reason)
                    return BackendPageCancelResult(
                        ok: true,
                        cancelled: true,
                        reservationId: nil,
                        sessionId: sessionId,
                        dropped: ["x"],
                        cancelReason: reason,
                        status: "cancelled"
                    )
                },
                resolveSessionId: { "sess-owner" }
            )
        )

        service.markPageTalkInFlight(true)
        service.handleInterrupt(reason: .manualTyping)

        try await Task.sleep(nanoseconds: 150_000_000)
        let calls = await gate.calls()
        XCTAssertEqual(calls.count, 1)
        XCTAssertNil(calls[0].reservationId)
        XCTAssertEqual(calls[0].sessionId, "sess-owner")
        XCTAssertEqual(calls[0].reason, "manual_typing")
    }

    func testOtherReasonDoesNotCancel() async throws {
        let gate = CancelGate()
        let service = ClementinePageInterruptService(
            dependencies: .init(
                cancelPageLane: { reservationId, sessionId, reason in
                    await gate.record(reservationId: reservationId, sessionId: sessionId, reason: reason)
                    return BackendPageCancelResult(
                        ok: true,
                        cancelled: true,
                        reservationId: reservationId,
                        sessionId: sessionId,
                        dropped: [],
                        cancelReason: reason,
                        status: nil
                    )
                },
                resolveSessionId: { "sess" }
            )
        )
        service.markPageTalkInFlight(true)
        service.handleInterrupt(reason: .other)
        try await Task.sleep(nanoseconds: 80_000_000)
        let calls = await gate.calls()
        XCTAssertEqual(calls.count, 0)
    }
}

@MainActor
private final class DelayedPageCancellation {
    let entered: XCTestExpectation
    var reservations: [String?] = []
    private var first: CheckedContinuation<BackendPageCancelResult, Never>?

    init(entered: XCTestExpectation) { self.entered = entered }

    func cancel(_ reservation: String?) async -> BackendPageCancelResult {
        reservations.append(reservation)
        if reservations.count == 1 {
            return await withCheckedContinuation { continuation in
                first = continuation
                entered.fulfill()
            }
        }
        return result()
    }

    func finishFirst() {
        first?.resume(returning: result())
        first = nil
    }

    private func result() -> BackendPageCancelResult {
        BackendPageCancelResult(ok: true, cancelled: true, reservationId: nil,
                               sessionId: nil, dropped: [], cancelReason: nil, status: "cancelled")
    }
}

private actor CancelGate {
    struct Call: Equatable {
        let reservationId: String?
        let sessionId: String?
        let reason: String
    }

    private var storage: [Call] = []

    func record(reservationId: String?, sessionId: String?, reason: String) {
        storage.append(Call(reservationId: reservationId, sessionId: sessionId, reason: reason))
    }

    func calls() -> [Call] { storage }
}
