import XCTest
@testable import them

@MainActor
final class PageTalkLifecycleTests: XCTestCase {
    func testCompanionRequestDoesNotFinishPageLane() async {
        var events: [PageTalkLifecycle.Event] = []
        let lifecycle = PageTalkLifecycle { events.append($0) }
        lifecycle.observeReservation("unexpected")
        lifecycle.finish()
        lifecycle.begin()
        XCTAssertTrue(events.isEmpty)
    }

    func testPageEventsShareIdentityAndFinishOnce() async {
        var events: [PageTalkLifecycle.Event] = []
        let lifecycle = PageTalkLifecycle { events.append($0) }
        lifecycle.begin()
        lifecycle.begin()
        lifecycle.observeReservation("  ")
        lifecycle.observeReservation(" reservation ")
        lifecycle.finish()
        lifecycle.finish()
        lifecycle.observeReservation("late")
        guard case let .began(id) = events.first else { return XCTFail("missing begin") }
        XCTAssertEqual(events, [.began(id), .reservation(id, "reservation"), .finished(id)])
    }

    func testOverlappingPageRequestsHaveDifferentIdentities() async {
        var events: [PageTalkLifecycle.Event] = []
        let first = PageTalkLifecycle { events.append($0) }
        let second = PageTalkLifecycle { events.append($0) }
        first.begin()
        second.begin()
        XCTAssertEqual(events.count, 2)
        XCTAssertNotEqual(events.first, events.last)
    }
}
