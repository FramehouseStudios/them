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
    private var pageTrackingID = UUID()
    private var activePageRequestID: UUID?
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

    func handlePageLifecycle(_ event: PageTalkLifecycle.Event) {
        switch event {
        case .began(let id):
            activePageRequestID = id
            markPageTalkInFlight(true)
        case .reservation(let id, let reservation):
            guard activePageRequestID == id else { return }
            notePageReservationId(reservation)
        case .finished(let id):
            guard activePageRequestID == id else { return }
            markPageTalkInFlight(false)
        }
    }

    /// Capture reservation id from talk response header `x-clementine-page-reservation`.
    func notePageReservationId(_ reservationId: String?) {
        let clean = (reservationId ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        if activePageReservationId != clean { pageTrackingID = UUID() }
        activePageReservationId = clean
        pageTalkInFlight = true
    }

    func markPageTalkInFlight(_ inFlight: Bool) {
        if inFlight {
            pageTrackingID = UUID()
            activePageReservationId = nil
        }
        pageTalkInFlight = inFlight
    }

    func clearActivePageReservation() {
        pageTrackingID = UUID()
        activePageRequestID = nil
        activePageReservationId = nil
        pageTalkInFlight = false
    }

    /// Writer take-back: barge-in / manual typing / cancel → one debounced page-cancel.
    func handleInterrupt(reason: ScreenplaySyncedInsertInterruptionReason) {
        guard ScreenplayStreamCancellationPolicy.notifiesBackend(reason) else { return }
        requestPageCancel(reason: reason.rawValue)
    }

    @discardableResult
    func requestPageCancel(reason: String) -> Task<Void, Never>? {
        let cleanReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedReason = cleanReason.isEmpty ? "barge_in" : cleanReason
        let reservationId = activePageReservationId?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let hasReservation = !(reservationId?.isEmpty ?? true)
        guard pageTalkInFlight || hasReservation else { return nil }

        let trackingID = pageTrackingID
        let dedupKey = "\(trackingID)|\(reservationId ?? "")|\(normalizedReason)"
        let now = Date()
        if lastCancelDedupKey == dedupKey,
           now.timeIntervalSince(lastCancelAt) < cancelDedupWindow {
            return nil
        }
        lastCancelDedupKey = dedupKey
        lastCancelAt = now

        inFlightCancelTask?.cancel()
        inFlightCancelTask = Task { [weak self] in
            guard let self, !Task.isCancelled, self.pageTrackingID == trackingID else { return }
            do {
                let sessionHint = self.dependencies.resolveSessionId()
                let result = try await self.dependencies.cancelPageLane(
                    hasReservation ? reservationId : nil,
                    hasReservation ? nil : (sessionHint.isEmpty ? nil : sessionHint),
                    normalizedReason
                )
                // A transport may ignore cancellation and return after a new Page
                // turn starts. Its result must not clear the newer turn's tracking.
                if result.ok, !Task.isCancelled, self.pageTrackingID == trackingID {
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
        return inFlightCancelTask
    }
}
