import XCTest
@testable import them

final class HomeTalkSignInGateTests: XCTestCase {
    func testSignedOutWriterIsSentToSignIn() {
        XCTAssertTrue(HomeTalkSignInGate.requiresSignIn(isAuthenticated: false, accessTokenExpired: false, refreshTokenPresent: false, isRunningUITests: false))
    }

    func testSignedInWriterTalks() {
        XCTAssertFalse(HomeTalkSignInGate.requiresSignIn(isAuthenticated: true, accessTokenExpired: false, refreshTokenPresent: true, isRunningUITests: false))
    }

    func testExpiredAccessWithRefreshTokenStillTalks() {
        // The request path refreshes the token; the writer is not bounced.
        XCTAssertFalse(HomeTalkSignInGate.requiresSignIn(isAuthenticated: true, accessTokenExpired: true, refreshTokenPresent: true, isRunningUITests: false))
    }

    func testUITestFixturesAreNotGated() {
        XCTAssertFalse(HomeTalkSignInGate.requiresSignIn(isAuthenticated: false, accessTokenExpired: false, refreshTokenPresent: false, isRunningUITests: true))
    }

    func testCopySaysWhyWithoutNamingABrand() {
        XCTAssertTrue(HomeTalkSignInGate.message.hasPrefix("Sign in to talk."))
        XCTAssertFalse(HomeTalkSignInGate.message.contains("io.them"))
    }
}
