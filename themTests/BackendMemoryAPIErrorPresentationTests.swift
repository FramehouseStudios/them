import XCTest
@testable import them

final class BackendMemoryAPIErrorPresentationTests: XCTestCase {
    func testUserAuthenticationFailuresUseARecoveryMessage() {
        for message in [
            "auth_user: user_auth_required",
            "expired_user_token",
            "invalid_user_token",
            "revoked_user_token",
        ] {
            let error = BackendMemoryAPIError.server(status: 401, message: message)

            XCTAssertTrue(error.requiresUserAuthentication)
            XCTAssertEqual(
                error.localizedDescription,
                "Sign in to create projects and keep your screenplay work connected."
            )
            XCTAssertFalse(error.localizedDescription.contains("Backend error"))
        }
    }

    func testOtherServerFailuresKeepTheirDiagnosticMessage() {
        let error = BackendMemoryAPIError.server(status: 503, message: "screenplay_store_unavailable")

        XCTAssertFalse(error.requiresUserAuthentication)
        XCTAssertEqual(error.localizedDescription, "Backend error 503: screenplay_store_unavailable")
    }
}
