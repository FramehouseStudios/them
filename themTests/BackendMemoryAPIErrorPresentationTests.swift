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

    func testKnownServerCodesBecomeWriterFacingSentences() {
        let refused = BackendMemoryAPIError.server(status: 503, message: "iap_credit: iap_verify_not_configured")
        XCTAssertFalse(refused.requiresUserAuthentication)
        XCTAssertEqual(
            refused.localizedDescription,
            "Purchases are temporarily unavailable. Your purchase is saved and will be applied automatically."
        )
        let limited = BackendMemoryAPIError.server(status: 429, message: "talk: talk_rate_limited")
        XCTAssertEqual(limited.localizedDescription, "You're sending messages too quickly. Please wait a moment.")
    }

    func testRawCodeStaysInTheErrorValueSoRecoveryChecksStillWork() {
        // The message is the programmatic contract; only the description is mapped.
        let error = BackendMemoryAPIError.server(status: 401, message: "auth_user: user_auth_required")
        guard case let .server(_, message) = error else { return XCTFail("expected .server") }
        XCTAssertEqual(message, "auth_user: user_auth_required")
        XCTAssertTrue(error.requiresUserAuthentication)
    }

    func testOtherServerFailuresKeepTheirDiagnosticMessage() {
        let error = BackendMemoryAPIError.server(status: 503, message: "screenplay_store_unavailable")

        XCTAssertFalse(error.requiresUserAuthentication)
        XCTAssertEqual(error.localizedDescription, "Backend error 503: screenplay_store_unavailable")
    }
}
