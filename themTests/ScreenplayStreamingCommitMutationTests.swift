import Foundation
import XCTest
@testable import them

@MainActor
final class ScreenplayStreamingCommitMutationTests: XCTestCase {
    func testOriginalSelectionProducesExactFinalMutationInsteadOfAppendingToPreview() throws {
        let before = "INT. CAFE - NIGHT\r\nCafe\u{0301}.  \r\n"
        let range = NSRange(location: (before as NSString).length, length: 0)
        let partial = "JOHN\nPartial", final = "JOHN\nKeep the scar."
        let mutation = try XCTUnwrap(ScreenplayStreamingCommitMutation(before: before, current: before + partial,
            selection: range, previewRange: NSRange(location: range.location, length: (partial as NSString).length),
            text: final, prefix: "", suffix: "", replacementTarget: nil))
        XCTAssertTrue(mutation.before.utf8.elementsEqual(before.utf8))
        XCTAssertTrue(mutation.after.utf8.elementsEqual((before + final).utf8))
        XCTAssertEqual(mutation.range, range)
        XCTAssertEqual(mutation.insertion, final)
    }

    func testWriterEditOutsidePreviewPreventsGraftingAndErasingIt() {
        let original = "Original writer words.\n", partial = "JOHN\nPartial"
        let range = NSRange(location: (original as NSString).length, length: 0)
        XCTAssertNil(ScreenplayStreamingCommitMutation(before: original, current: original + partial + "Writer added this.",
            selection: range, previewRange: NSRange(location: range.location, length: (partial as NSString).length),
            text: "JOHN\nFinal", prefix: "", suffix: "", replacementTarget: nil))
    }

    func testEmptyOriginalPageRemainsTheMutationBase() throws {
        let preview = "INT. ROOM - NIGHT\nPar"
        let mutation = try XCTUnwrap(ScreenplayStreamingCommitMutation(before: "", current: preview,
            selection: NSRange(location: 0, length: 0), previewRange: NSRange(location: 0, length: (preview as NSString).length),
            text: "INT. ROOM - NIGHT\nComplete", prefix: "", suffix: "", replacementTarget: nil))
        XCTAssertTrue(mutation.before.isEmpty)
        XCTAssertEqual(mutation.after, "INT. ROOM - NIGHT\nComplete")
    }
}
