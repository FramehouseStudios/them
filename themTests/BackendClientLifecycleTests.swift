import Foundation
import XCTest
@testable import them

private nonisolated enum BackendClientLifecycleTaskContext {
    @TaskLocal static var marker: Int = 0
}

final class BackendClientLifecycleTests: XCTestCase {
    @MainActor
    func testSynchronousReleaseInsideTaskLocalScopeDoesNotCrash() {
        weak var releasedClient: BackendClient?
        BackendClientLifecycleTaskContext.$marker.withValue(7) {
            var client: BackendClient? = makeClient()
            releasedClient = client
            XCTAssertNotNil(releasedClient)
            XCTAssertEqual(BackendClientLifecycleTaskContext.marker, 7)
            client = nil
            XCTAssertNil(releasedClient, "Release the actual client; do not leak it to avoid teardown.")
            XCTAssertEqual(BackendClientLifecycleTaskContext.marker, 7)
        }
        XCTAssertEqual(BackendClientLifecycleTaskContext.marker, 0)
    }

    @MainActor
    func testAsyncReleasePreservesTaskLocalScopeAndDeallocatesClient() async {
        await BackendClientLifecycleTaskContext.$marker.withValue(9) {
            weak var releasedClient: BackendClient?
            var client: BackendClient? = makeClient()
            releasedClient = client
            await Task.yield()
            XCTAssertEqual(BackendClientLifecycleTaskContext.marker, 9)
            client = nil
            XCTAssertNil(releasedClient)
            XCTAssertEqual(BackendClientLifecycleTaskContext.marker, 9)
        }
        XCTAssertEqual(BackendClientLifecycleTaskContext.marker, 0)
    }

    @MainActor
    private func makeClient() -> BackendClient {
        let unusedURL = URL(string: "https://client-lifecycle.test")!
        return BackendClient(baseURL: unusedURL, fallbackURL: unusedURL,
            persistBackendBaseURL: false, attachUserIDHeader: false)
    }
}
