import XCTest
@testable import them

final class StudioCrossDevicePollPolicyTests: XCTestCase {
    func testActiveProjectPollsEveryTick() {
        for tick in 1...6 {
            XCTAssertTrue(StudioCrossDevicePollPolicy.shouldPoll(tick: tick, hasSelectedProject: true, unchangedStreak: 0))
        }
    }

    func testNoProjectPollsEveryFifthTick() {
        let polled = (1...10).filter {
            StudioCrossDevicePollPolicy.shouldPoll(tick: $0, hasSelectedProject: false, unchangedStreak: 0)
        }
        XCTAssertEqual(polled, [5, 10], "a Studio with nothing open checks the list four times a minute, not twenty")
    }

    func testQuietProjectBacksOffAfterTenUnchangedPolls() {
        XCTAssertTrue(StudioCrossDevicePollPolicy.shouldPoll(tick: 7, hasSelectedProject: true, unchangedStreak: 9))
        XCTAssertFalse(StudioCrossDevicePollPolicy.shouldPoll(tick: 7, hasSelectedProject: true, unchangedStreak: 10))
        XCTAssertTrue(StudioCrossDevicePollPolicy.shouldPoll(tick: 10, hasSelectedProject: true, unchangedStreak: 10))
    }

    func testAChangeResetsTheStreakAndPollingResumes() {
        XCTAssertTrue(StudioCrossDevicePollPolicy.shouldPoll(tick: 11, hasSelectedProject: true, unchangedStreak: 0),
                      "the view model zeroes the streak when the state version moves")
    }
}
