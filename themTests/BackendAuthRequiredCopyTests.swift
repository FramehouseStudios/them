import XCTest
@testable import them

final class BackendAuthRequiredCopyTests: XCTestCase {
    func testIPhoneCopyDoesNotOfferVisualContext() {
        #if os(iOS)
        XCTAssertEqual(BackendAuthRequiredCopy.message, "Sign in to use live writing and voice.")
        #endif
    }

    func testAuthRequiredStageErrorUsesTheSharedCopy() {
        let error = BackendError.stage("auth", "user_auth_required")
        XCTAssertTrue(error.requiresUserAuthentication)
        XCTAssertEqual(error.errorDescription, BackendAuthRequiredCopy.message)
    }
}
