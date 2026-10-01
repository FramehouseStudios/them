import XCTest
@testable import them

@MainActor
final class PageTalkLifecycleTests: XCTestCase {
    func testRetriesKeepOriginalRequestAndSessionIdentityWithoutDuplicateBegin() async {
        var events: [PageTalkLifecycle.Event] = []
        let lifecycle = PageTalkLifecycle { events.append($0) }
        var first = URLRequest(url: URL(string: "https://synthetic.test/talk")!)
        first.setValue("original-session", forHTTPHeaderField: "X-Client-Token")
        lifecycle.attach(to: &first)
        var retry = URLRequest(url: first.url!)
        retry.setValue("refreshed-session", forHTTPHeaderField: "X-Client-Token")
        lifecycle.attach(to: &retry)
        XCTAssertEqual(first.value(forHTTPHeaderField: "x-clementine-page-request"),
            retry.value(forHTTPHeaderField: "x-clementine-page-request"))
        XCTAssertEqual(retry.value(forHTTPHeaderField: "x-session-id"), "original-session")
        XCTAssertEqual(retry.value(forHTTPHeaderField: "X-Client-Token"), "refreshed-session")
        XCTAssertEqual(events, [.began(lifecycle.id), .session(lifecycle.id, "original-session")])
        lifecycle.finish()
        XCTAssertEqual(events.last, .finished(lifecycle.id))
    }

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
