import XCTest
@testable import them

@MainActor
final class ClementinePageInterruptServiceTests: XCTestCase {
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
