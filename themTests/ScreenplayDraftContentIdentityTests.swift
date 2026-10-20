import XCTest
@testable import them

final class ScreenplayDraftContentIdentityTests: XCTestCase {
    func testDigestIsExactUTF8NotDisplayEqualityOrARevisionID() throws {
        let composed = "café"
        let decomposed = "cafe\u{0301}"
        XCTAssertEqual(composed, decomposed, "Swift display equality is not enough for writer bytes.")
        let identity = ScreenplayDraftContentIdentity(draft: decomposed)
        XCTAssertTrue(identity.matches(decomposed))
        for changed in [composed, decomposed + " ", "\r\n" + decomposed, decomposed + "\t"] {
            XCTAssertFalse(identity.matches(changed))
        }
        XCTAssertEqual(identity.utf8ByteCount, Data(decomposed.utf8).count)
        XCTAssertEqual(identity.utf16Count, decomposed.utf16.count)
        let restored = try JSONDecoder().decode(ScreenplayDraftContentIdentity.self,
            from: JSONEncoder().encode(identity))
        XCTAssertEqual(restored, identity)
    }

    func testEmptyAndKnownDigestRemainValidIdentities() {
        XCTAssertEqual(ScreenplayDraftContentIdentity(draft: "").sha256,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        XCTAssertEqual(ScreenplayDraftContentIdentity(draft: "abc").sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertTrue(ScreenplayDraftContentIdentity(draft: "").matches(""))
        XCTAssertFalse(ScreenplayDraftContentIdentity(draft: "").matches(" "))
    }
}
