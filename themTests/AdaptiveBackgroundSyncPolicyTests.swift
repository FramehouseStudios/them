import XCTest
@testable import them

final class AdaptiveBackgroundSyncPolicyTests: XCTestCase {
    private let start = Date(timeIntervalSince1970: 1_000)

    func testTimerWaitsForEachLaneCadenceAndCreativeInstinctsAreSlowest() {
        var coordinator = AdaptiveBackgroundSyncCoordinator(now: start)

        XCTAssertFalse(begin(.studioProjects, after: 29, coordinator: &coordinator))
        XCTAssertTrue(begin(.studioProjects, after: 30, coordinator: &coordinator))
        XCTAssertFalse(begin(.memories, after: 44, coordinator: &coordinator))
        XCTAssertTrue(begin(.memories, after: 45, coordinator: &coordinator))
        XCTAssertFalse(begin(.pendingScreenplayQuestion, after: 119, coordinator: &coordinator))
        XCTAssertTrue(begin(.pendingScreenplayQuestion, after: 120, coordinator: &coordinator))
        XCTAssertFalse(begin(.studioCreativeInstincts, after: 179, coordinator: &coordinator))
        XCTAssertTrue(begin(.studioCreativeInstincts, after: 180, coordinator: &coordinator))
    }

    func testInactiveAndTestScenesNeverStartNetworkWork() {
        var coordinator = AdaptiveBackgroundSyncCoordinator(now: start)
        let due = start.addingTimeInterval(600)

        XCTAssertFalse(coordinator.begin(
            .studioProjects,
            trigger: .timer,
            now: due,
            isSceneActive: false,
            isTestRuntime: false
        ))
        XCTAssertFalse(coordinator.begin(
            .memories,
            trigger: .becameActive,
            now: due,
            isSceneActive: true,
            isTestRuntime: true
        ))
    }

    func testReturningActiveRefreshesImmediatelyDespiteRecentSuccess() {
        var coordinator = AdaptiveBackgroundSyncCoordinator(now: start)
        coordinator.noteImmediateRefresh(
            .studioProjects,
            outcome: .succeeded,
            at: start
        )

        XCTAssertTrue(coordinator.begin(
            .studioProjects,
            trigger: .becameActive,
            now: start.addingTimeInterval(2),
            isSceneActive: true,
            isTestRuntime: false
        ))
        XCTAssertFalse(coordinator.begin(
            .studioProjects,
            trigger: .becameActive,
            now: start.addingTimeInterval(3),
            isSceneActive: true,
            isTestRuntime: false
        ), "An in-flight activation refresh must not be duplicated.")
    }

    func testFailuresBackOffAndSuccessRestoresBaseCadence() {
        var coordinator = AdaptiveBackgroundSyncCoordinator(now: start)
        let firstAttempt = start.addingTimeInterval(30)
        XCTAssertTrue(begin(.studioProjects, after: 30, coordinator: &coordinator))
        coordinator.finish(.studioProjects, outcome: .failed, at: firstAttempt)

        XCTAssertEqual(
            AdaptiveBackgroundSyncPolicy.effectiveInterval(
                for: .studioProjects,
                consecutiveFailures: coordinator.state(for: .studioProjects).consecutiveFailures
            ),
            60
        )
        XCTAssertFalse(begin(.studioProjects, after: 89, coordinator: &coordinator))
        XCTAssertTrue(begin(.studioProjects, after: 90, coordinator: &coordinator))

        let recovery = start.addingTimeInterval(90)
        coordinator.finish(.studioProjects, outcome: .succeeded, at: recovery)
        XCTAssertEqual(coordinator.state(for: .studioProjects).consecutiveFailures, 0)
        XCTAssertFalse(begin(.studioProjects, after: 119, coordinator: &coordinator))
        XCTAssertTrue(begin(.studioProjects, after: 120, coordinator: &coordinator))
    }

    func testDeferredAttemptDoesNotIncreaseFailureBackoff() {
        var coordinator = AdaptiveBackgroundSyncCoordinator(now: start)
        XCTAssertTrue(begin(.memories, after: 45, coordinator: &coordinator))
        coordinator.finish(
            .memories,
            outcome: .deferred,
            at: start.addingTimeInterval(45)
        )

        XCTAssertEqual(coordinator.state(for: .memories).consecutiveFailures, 0)
        XCTAssertFalse(begin(.memories, after: 89, coordinator: &coordinator))
        XCTAssertTrue(begin(.memories, after: 90, coordinator: &coordinator))
    }

    func testBackoffIsCappedPerLane() {
        XCTAssertEqual(
            AdaptiveBackgroundSyncPolicy.effectiveInterval(
                for: .studioCreativeInstincts,
                consecutiveFailures: 20
            ),
            900
        )
        XCTAssertEqual(
            AdaptiveBackgroundSyncPolicy.effectiveInterval(
                for: .studioProjects,
                consecutiveFailures: 20
            ),
            240
        )
    }

    private func begin(
        _ lane: AdaptiveBackgroundSyncLane,
        after seconds: TimeInterval,
        coordinator: inout AdaptiveBackgroundSyncCoordinator
    ) -> Bool {
        coordinator.begin(
            lane,
            trigger: .timer,
            now: start.addingTimeInterval(seconds),
            isSceneActive: true,
            isTestRuntime: false
        )
    }
}
