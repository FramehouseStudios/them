import XCTest
@testable import them

final class BackendEvolutionSyncPolicyTests: XCTestCase {
    func testAutoSyncRequiresBackendBackedSessionAndNonTestRuntime() {
        XCTAssertTrue(
            BackendEvolutionSyncPolicy.shouldAutoSync(
                sessionId: "session-1",
                cachedSessionAvailable: false,
                isRunningTests: false
            )
        )
        XCTAssertTrue(
            BackendEvolutionSyncPolicy.shouldAutoSync(
                sessionId: "",
                cachedSessionAvailable: true,
                isRunningTests: false
            )
        )
        XCTAssertFalse(
            BackendEvolutionSyncPolicy.shouldAutoSync(
                sessionId: "",
                cachedSessionAvailable: false,
                isRunningTests: false
            )
        )
        XCTAssertFalse(
            BackendEvolutionSyncPolicy.shouldAutoSync(
                sessionId: "session-1",
                cachedSessionAvailable: true,
                isRunningTests: true
            )
        )
    }
}
