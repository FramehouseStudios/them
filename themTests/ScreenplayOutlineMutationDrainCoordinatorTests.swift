import XCTest
@testable import them

final class ScreenplayOutlineMutationDrainCoordinatorTests: XCTestCase {
    func testProjectSwitchDuringDrainSchedulesSelectedProject() {
        var coordinator = ScreenplayOutlineMutationDrainCoordinator()

        XCTAssertTrue(coordinator.begin(force: false))
        let followUp = coordinator.finish(
            drainedProjectID: "project-a",
            selectedProjectID: "project-b"
        )

        XCTAssertEqual(followUp, .init(shouldRun: true, force: false))
        XCTAssertFalse(coordinator.isInFlight)
    }

    func testReentrantDrainRequestIsNotLost() {
        var coordinator = ScreenplayOutlineMutationDrainCoordinator()

        XCTAssertTrue(coordinator.begin(force: false))
        XCTAssertFalse(coordinator.begin(force: false))
        let followUp = coordinator.finish(
            drainedProjectID: "project-a",
            selectedProjectID: "project-a"
        )

        XCTAssertEqual(followUp, .init(shouldRun: true, force: false))
    }

    func testReentrantForcedDrainPreservesForce() {
        var coordinator = ScreenplayOutlineMutationDrainCoordinator()

        XCTAssertTrue(coordinator.begin(force: false))
        XCTAssertFalse(coordinator.begin(force: true))
        let followUp = coordinator.finish(
            drainedProjectID: "project-a",
            selectedProjectID: "project-b"
        )

        XCTAssertEqual(followUp, .init(shouldRun: true, force: true))
    }

    func testCompletedDrainWithoutNewWorkDoesNotSpin() {
        var coordinator = ScreenplayOutlineMutationDrainCoordinator()

        XCTAssertTrue(coordinator.begin(force: false))
        let followUp = coordinator.finish(
            drainedProjectID: " project-a ",
            selectedProjectID: "project-a"
        )

        XCTAssertEqual(followUp, .init(shouldRun: false, force: false))
    }
}
