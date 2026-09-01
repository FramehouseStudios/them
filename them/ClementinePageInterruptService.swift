import Foundation
import Combine
import os

/// D009 I2 — Page-lane interrupt / cancel service.
/// Owns reservation tracking + debounced `POST /talk/page-cancel`.
/// `ScreenplayLiveDraftBridge` stays a façade; it only signals interrupt reasons.
@MainActor
final class ClementinePageInterruptService: ObservableObject {
    struct Dependencies {
        var cancelPageLane: (String?, String?, String) async throws -> BackendPageCancelResult
        var resolveSessionId: () -> String
    }

    private let dependencies: Dependencies
    private var activePageReservationId: String?
    private var pageTalkInFlight = false
    private var lastCancelDedupKey: String?
    private var lastCancelAt: Date = .distantPast
    private let cancelDedupWindow: TimeInterval = 1.5
    private var inFlightCancelTask: Task<Void, Never>?

    init(dependencies: Dependencies) {
        self.dependencies = dependencies
    }

    convenience init(backend: BackendClient) {
        self.init(
            dependencies: Dependencies(
                cancelPageLane: { reservationId, sessionId, reason in
                    try await backend.cancelPageLane(
                        reservationId: reservationId,
                        sessionId: sessionId,
                        reason: reason
                    )
                },
                resolveSessionId: {
                    // Backend resolveSessionId falls back to X-Client-Token; mirror that.
                    (BackendAuthClient.sharedClientToken() ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
            )
        )
    }

    /// Capture reservation id from talk response header `x-clementine-page-reservation`.
    func notePageReservationId(_ reservationId: String?) {
        let clean = (reservationId ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        activePageReservationId = clean
        pageTalkInFlight = true
    }

    func markPageTalkInFlight(_ inFlight: Bool) {
        pageTalkInFlight = inFlight
    }

    func clearActivePageReservation() {
        activePageReservationId = nil
        pageTalkInFlight = false
    }

    /// Writer take-back: barge-in / manual typing / cancel → one debounced page-cancel.
    func handleInterrupt(reason: ScreenplaySyncedInsertInterruptionReason) {
        switch reason {
        case .manualTyping, .bargeIn, .cancel:
            requestPageCancel(reason: reason.rawValue)
        case .other:
            break
        }
    }

    func requestPageCancel(reason: String) {
        let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedReason = cleanReason.isEmpty ? "barge_in" : cleanReason
        let reservationId = activePageReservationId?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let hasReservation = !(reservationId?.isEmpty ?? true)
        guard pageTalkInFlight || hasReservation else { return }

        let dedupKey = "\(reservationId ?? "")|\(normalizedReason)"
        let now = Date()
        if lastCancelDedupKey == dedupKey,
           now.timeIntervalSince(lastCancelAt) < cancelDedupWindow {
            return
        }
        lastCancelDedupKey = dedupKey
        lastCancelAt = now

        inFlightCancelTask?.cancel()
        inFlightCancelTask = Task { [weak self] in
            guard let self else { return }
            do {
                let sessionHint = self.dependencies.resolveSessionId()
                let result = try await self.dependencies.cancelPageLane(
                    hasReservation ? reservationId : nil,
                    hasReservation ? nil : (sessionHint.isEmpty ? nil : sessionHint),
                    normalizedReason
                )
                if result.ok {
                    self.clearActivePageReservation()
                }
                HerLog.talk.info(
                    "POST /talk/page-cancel ok=\(result.ok) cancelled=\(result.cancelled) dropped=\(result.dropped.count) reason=\(normalizedReason, privacy: .public)"
                )
            } catch is CancellationError {
                // superseded by a newer interrupt
            } catch {
                HerLog.talk.error(
                    "POST /talk/page-cancel failed reason=\(normalizedReason, privacy: .public) error=\(error.localizedDescription, privacy: .public)"
                )
            }
        }
    }
}
