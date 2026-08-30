import XCTest
@testable import them

final class BackendAuthDebugSessionPolicyTests: XCTestCase {
    func testSyntheticDebugUserRequiresSignedInTokenAndUserID() {
        XCTAssertNil(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: false,
            accessToken: "access-token",
            userID: "user-1",
            email: "writer@example.com"
        ))
        XCTAssertNil(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: true,
            accessToken: "",
            userID: "user-1",
            email: "writer@example.com"
        ))
        XCTAssertNil(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: true,
            accessToken: "access-token",
            userID: "",
            email: "writer@example.com"
        ))
    }

    func testSyntheticDebugUserPreservesAuthenticatedIdentity() throws {
        let user = try XCTUnwrap(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: true,
            accessToken: "access-token",
            userID: "user-1",
            email: "writer@example.com"
        ))

        XCTAssertEqual(user.userId, "user-1")
        XCTAssertEqual(user.email, "writer@example.com")
        XCTAssertEqual(user.authProvider, "debug")
        XCTAssertTrue(user.emailVerified)
    }
}
