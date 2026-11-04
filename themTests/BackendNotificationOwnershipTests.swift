import Foundation
import XCTest
@testable import them

final class BackendNotificationOwnershipTests: XCTestCase {
    @MainActor
    func testDeferredDeliveryRejectsChangedAccount() async {
        await assertDelivery(changedLogin: true, sameUser: false)
    }

    @MainActor
    func testDeferredDeliveryRejectsSameUserNewLogin() async {
        await assertDelivery(changedLogin: true, sameUser: true)
    }

    @MainActor
    func testDeferredDeliveryAcceptsSameLoginTokenRotation() async {
        await assertDelivery(changedLogin: false, sameUser: true)
    }

    @MainActor
    private func assertDelivery(changedLogin: Bool, sameUser: Bool) async {
        let state = NotificationOwnerState()
        let owner = state.identity()
        let name = Notification.Name("owned-delivery-\(UUID().uuidString)")
        let observed = NotificationDeliveryCount()
        let token = NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { note in
            XCTAssertTrue(Thread.isMainThread)
            XCTAssertEqual(note.userInfo?["fixture"] as? String, "exact words")
            observed.increment()
        }
        defer { NotificationCenter.default.removeObserver(token) }
        postBackendNotificationOnMain(name: name, userInfo: ["fixture": "exact words"],
            initiatingIdentity: owner, identityProvider: { _ in state.identity() })
        // The main actor cannot deliver its queued notification during this
        // synchronous change. The FIFO sentinel proves delivery was processed.
        state.change(changedLogin: changedLogin, sameUser: sameUser)
        let sentinel = expectation(description: "main queue passed notification delivery")
        DispatchQueue.main.async { sentinel.fulfill() }
        await fulfillment(of: [sentinel], timeout: 5)
        XCTAssertEqual(observed.count, changedLogin ? 0 : 1)
    }
}

private final class NotificationOwnerState: @unchecked Sendable {
    private let lock = NSLock()
    private var current = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "writer-a",
        clientToken: "client", accessToken: "access", sessionIntentGeneration: 1)
    func identity() -> BackendAuthRequestIdentity {
        lock.lock(); defer { lock.unlock() }
        return current
    }
    func change(changedLogin: Bool, sameUser: Bool) {
        lock.lock(); defer { lock.unlock() }
        current = .init(sessionEpoch: 2, userID: sameUser ? "writer-a" : "writer-b",
            clientToken: "client", accessToken: "rotated", sessionIntentGeneration: changedLogin ? 2 : 1)
    }
}

private final class NotificationDeliveryCount: @unchecked Sendable {
    private let lock = NSLock()
    private var value = 0
    var count: Int { lock.lock(); defer { lock.unlock() }; return value }
    func increment() { lock.lock(); defer { lock.unlock() }; value += 1 }
}
