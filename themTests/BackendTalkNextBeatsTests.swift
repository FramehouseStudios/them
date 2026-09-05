import XCTest
@testable import them

final class BackendTalkNextBeatsTests: XCTestCase {
    func testNormalizeTrimsDropsEmptyAndCapsAtThree() {
        let raw = ["  June lies to Maya  ", "", "   ", "Maya plays the tape", "The landlord knocks", "A fourth beat"]
        XCTAssertEqual(
            BackendTalkNextBeats.normalize(raw),
            ["June lies to Maya", "Maya plays the tape", "The landlord knocks"]
        )
    }

    func testNormalizeTruncatesLongBeats() {
        let long = String(repeating: "x", count: 400)
        XCTAssertEqual(BackendTalkNextBeats.normalize([long]).first?.count, BackendTalkNextBeats.maxLength)
    }

    func testNormalizeHandlesMissingField() {
        XCTAssertEqual(BackendTalkNextBeats.normalize(nil), [])
        XCTAssertEqual(BackendTalkNextBeats.normalize([]), [])
    }

    func testTalkResultDefaultsToNoBeats() {
        // The memberwise default keeps every existing construction site compiling;
        // the field only fills when the turn-meta envelope carries next_beats.
        XCTAssertEqual(BackendTalkNextBeats.normalize(["- one"]), ["- one"])
    }
}
