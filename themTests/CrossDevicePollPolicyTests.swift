import XCTest
@testable import them

final class CrossDevicePollPolicyTests: XCTestCase {
    func testActiveProjectPollsEveryTick() {
        for tick in 1...6 {
            XCTAssertTrue(CrossDevicePollPolicy.shouldPoll(tick: tick, hasActiveContext: true, unchangedStreak: 0))
        }
    }

    func testNoProjectPollsEveryFifthTick() {
        let polled = (1...10).filter {
            CrossDevicePollPolicy.shouldPoll(tick: $0, hasActiveContext: false, unchangedStreak: 0)
        }
        XCTAssertEqual(polled, [5, 10], "a Studio with nothing open checks the list four times a minute, not twenty")
    }

    func testQuietProjectBacksOffAfterTenUnchangedPolls() {
        XCTAssertTrue(CrossDevicePollPolicy.shouldPoll(tick: 7, hasActiveContext: true, unchangedStreak: 9))
        XCTAssertFalse(CrossDevicePollPolicy.shouldPoll(tick: 7, hasActiveContext: true, unchangedStreak: 10))
        XCTAssertTrue(CrossDevicePollPolicy.shouldPoll(tick: 10, hasActiveContext: true, unchangedStreak: 10))
    }

    func testAChangeResetsTheStreakAndPollingResumes() {
        XCTAssertTrue(CrossDevicePollPolicy.shouldPoll(tick: 11, hasActiveContext: true, unchangedStreak: 0),
                      "the view model zeroes the streak when the state version moves")
    }
}
