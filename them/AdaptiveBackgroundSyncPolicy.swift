import Foundation

nonisolated enum AdaptiveBackgroundSyncLane: String, CaseIterable, Hashable, Sendable {
    case studioProjects
    case memories
    case pendingScreenplayQuestion
    case studioCreativeInstincts
}

nonisolated enum AdaptiveBackgroundSyncTrigger: Equatable, Sendable {
    case timer
    case becameActive
}

nonisolated enum AdaptiveBackgroundSyncOutcome: Equatable, Sendable {
    case succeeded
    case failed
    case deferred
}

nonisolated struct AdaptiveBackgroundSyncLaneState: Equatable, Sendable {
    var lastAttemptAt: Date?
    var lastSuccessAt: Date?
    var consecutiveFailures = 0
    var isInFlight = false
}

nonisolated enum AdaptiveBackgroundSyncPolicy {
    /// A lightweight scheduling heartbeat. Network work is still gated by each
    /// lane's substantially longer cadence below.
    static let schedulerTickInterval: TimeInterval = 15

    static func minimumInterval(for lane: AdaptiveBackgroundSyncLane) -> TimeInterval {
        switch lane {
        case .studioProjects:
            return 30
        case .memories:
            return 45
        case .pendingScreenplayQuestion:
            return 120
        case .studioCreativeInstincts:
            return 180
        }
    }

    static func maximumBackoffInterval(for lane: AdaptiveBackgroundSyncLane) -> TimeInterval {
        switch lane {
        case .studioProjects:
            return 240
        case .memories:
            return 360
        case .pendingScreenplayQuestion:
            return 600
        case .studioCreativeInstincts:
            return 900
        }
    }

    static func effectiveInterval(
        for lane: AdaptiveBackgroundSyncLane,
        consecutiveFailures: Int
    ) -> TimeInterval {
        let boundedFailures = min(max(0, consecutiveFailures), 6)
        let multiplier = Double(1 << boundedFailures)
        return min(
            minimumInterval(for: lane) * multiplier,
            maximumBackoffInterval(for: lane)
        )
    }

    static func shouldStart(
        lane: AdaptiveBackgroundSyncLane,
        trigger: AdaptiveBackgroundSyncTrigger,
        now: Date,
        baselineAt: Date,
        state: AdaptiveBackgroundSyncLaneState,
        isSceneActive: Bool,
        isTestRuntime: Bool
    ) -> Bool {
        guard isSceneActive, !isTestRuntime, !state.isInFlight else { return false }
        if trigger == .becameActive {
            return true
        }
        let mostRecentAttempt = state.lastAttemptAt ?? baselineAt
        return now.timeIntervalSince(mostRecentAttempt) >= effectiveInterval(
            for: lane,
            consecutiveFailures: state.consecutiveFailures
        )
    }
}

nonisolated struct AdaptiveBackgroundSyncCoordinator: Equatable, Sendable {
    private(set) var baselineAt: Date
    private(set) var states: [AdaptiveBackgroundSyncLane: AdaptiveBackgroundSyncLaneState]

    init(now: Date = Date()) {
        baselineAt = now
        states = [:]
    }

    func state(for lane: AdaptiveBackgroundSyncLane) -> AdaptiveBackgroundSyncLaneState {
        states[lane] ?? AdaptiveBackgroundSyncLaneState()
    }

    mutating func begin(
        _ lane: AdaptiveBackgroundSyncLane,
        trigger: AdaptiveBackgroundSyncTrigger,
        now: Date,
        isSceneActive: Bool,
        isTestRuntime: Bool
    ) -> Bool {
        var laneState = state(for: lane)
        guard AdaptiveBackgroundSyncPolicy.shouldStart(
            lane: lane,
            trigger: trigger,
            now: now,
            baselineAt: baselineAt,
            state: laneState,
            isSceneActive: isSceneActive,
            isTestRuntime: isTestRuntime
        ) else {
            return false
        }
        laneState.lastAttemptAt = now
        laneState.isInFlight = true
        states[lane] = laneState
        return true
    }

    mutating func finish(
        _ lane: AdaptiveBackgroundSyncLane,
        outcome: AdaptiveBackgroundSyncOutcome,
        at date: Date
    ) {
        var laneState = state(for: lane)
        laneState.isInFlight = false
        switch outcome {
        case .succeeded:
            laneState.lastSuccessAt = date
            laneState.consecutiveFailures = 0
        case .failed:
            laneState.consecutiveFailures += 1
        case .deferred:
            break
        }
        states[lane] = laneState
    }

    mutating func noteImmediateRefresh(
        _ lane: AdaptiveBackgroundSyncLane,
        outcome: AdaptiveBackgroundSyncOutcome,
        at date: Date
    ) {
        var laneState = state(for: lane)
        laneState.lastAttemptAt = date
        states[lane] = laneState
        finish(lane, outcome: outcome, at: date)
    }
}
