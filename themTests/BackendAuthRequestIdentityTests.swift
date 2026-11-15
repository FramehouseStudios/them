import XCTest
@testable import them

final class BackendAuthRequestIdentityTests: XCTestCase {
    func testAuthenticatedOwnerUsesDurablePayloadWithoutSecureStoreFallback() async {
        var secureStoreReads = 0
        let authenticated = BackendAuthRequestIdentity.preferredUserID(authenticatedUserID: "owner-authenticated") {
            secureStoreReads += 1
            return "different-shared-owner"
        }
        XCTAssertEqual(authenticated, "owner-authenticated")
        XCTAssertEqual(secureStoreReads, 0, "Partial-result ownership checks must not read Keychain for a known authenticated owner.")
        let anonymous = BackendAuthRequestIdentity.preferredUserID(authenticatedUserID: "") {
            secureStoreReads += 1
            return "owner-anonymous"
        }
        XCTAssertEqual(anonymous, "owner-anonymous", "Signed-out/legacy identity retains the established fallback.")
        XCTAssertEqual(secureStoreReads, 1)
    }
}
