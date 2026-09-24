import XCTest
@testable import them

final class MemoriesSignInGateTests: XCTestCase {
    func testAuthRequiredErrorsAreASignInStateNotAnError() {
        XCTAssertTrue(MemoriesSignInGate.isSignInRequired(BackendError.stage("auth_user", "user_auth_required")))
        XCTAssertTrue(MemoriesSignInGate.isSignInRequired(BackendError.stage("auth_user", "expired_user_token")))
        XCTAssertTrue(MemoriesSignInGate.isSignInRequired(BackendMemoryAPIError.server(status: 401, message: "user_auth_required")))
    }

    func testEverythingElseStaysAnError() {
        XCTAssertFalse(MemoriesSignInGate.isSignInRequired(BackendMemoryAPIError.server(status: 500, message: "boom")))
        XCTAssertFalse(MemoriesSignInGate.isSignInRequired(BackendMemoryAPIError.server(status: 401, message: "bad_app_token")))
        XCTAssertFalse(MemoriesSignInGate.isSignInRequired(BackendMemoryAPIError.invalidResponse))
        XCTAssertFalse(MemoriesSignInGate.isSignInRequired(URLError(.cannotConnectToHost)))
        XCTAssertFalse(MemoriesSignInGate.isSignInRequired(BackendError.stage("talk_chat", "provider_timeout")))
    }

    func testCopyInvitesRatherThanApologises() {
        XCTAssertTrue(MemoriesSignInGate.headline.hasPrefix("Sign in"))
        XCTAssertFalse(MemoriesSignInGate.headline.lowercased().contains("trouble"))
    }
}
