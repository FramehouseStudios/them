import XCTest
@testable import them

final class ScreenplayReplacementResolverTests: XCTestCase {
    private let auth = ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 1)
    func testValidTargetResolvesItsOriginalRange() {
        let text = "INT. ROOM - NIGHT\n\nJOHN\nOriginal words."
        let range = (text as NSString).range(of: "Original words.")
        let result = ScreenplayReplacementResolver.resolve(existing: text, candidateRange: range,
            fallbackSelection: NSRange(location: 0, length: 0), target: target("Original words.", draft: text),
            projectID: "project", authContext: auth)
        XCTAssertFalse(result.isRejected)
        XCTAssertTrue(result.isReplacement)
        XCTAssertEqual(result.range, range)
    }

    func testChangedTargetCannotBlindlyReplaceWhateverStillOccupiesItsLine() {
        let text = "The writer replaced this line manually."
        let result = ScreenplayReplacementResolver.resolve(existing: text,
            candidateRange: NSRange(location: 0, length: (text as NSString).length),
            fallbackSelection: NSRange(location: 0, length: 0), target: target("Original words."),
            projectID: "project", authContext: auth)
        XCTAssertTrue(result.isRejected, "An unmatched old line number is not permission to replace newer text.")
    }

    func testMissingTargetCannotBecomeAnInsertionAtTheCurrentCursor() {
        let text = "Keep these words."
        let result = ScreenplayReplacementResolver.resolve(existing: text,
            candidateRange: NSRange(location: (text as NSString).length, length: 0),
            fallbackSelection: NSRange(location: 0, length: 0), target: target("Original words."),
            projectID: "project", authContext: auth)
        XCTAssertTrue(result.isRejected, "A failed rewrite must not silently turn into another page insert.")
    }

    func testSameTextElsewhereCannotRedirectTheCapturedRange() {
        let text = "JOHN\nYes.\n\nSAM\nNo."
        let result = ScreenplayReplacementResolver.resolve(existing: text,
            candidateRange: (text as NSString).range(of: "No."), fallbackSelection: NSRange(location: 0, length: 0),
            target: target("Yes.", draft: text), projectID: "project", authContext: auth)
        XCTAssertTrue(result.isRejected, "Do not search for the first matching dialogue elsewhere.")
    }

    func testChangedBytesProjectAndAuthEpochRejectEvenWhenTheTargetLineMatches() {
        let original = "JOHN\ncafe\u{0301}\n"
        let captured = target("cafe\u{0301}", draft: original)
        for text in ["JOHN\ncafé\n", original + " ", original.replacingOccurrences(of: "\n", with: "\r\n")] {
            let result = ScreenplayReplacementResolver.resolve(existing: text,
                candidateRange: NSRange(location: 5, length: 5), fallbackSelection: NSRange(location: 0, length: 0),
                target: captured, projectID: "project", authContext: auth)
            XCTAssertTrue(result.isRejected)
        }
        for (project, context) in [("other", auth), ("project", ScreenplayStudioAuthContext(userID: "other", sessionIntentGeneration: 1)),
            ("project", ScreenplayStudioAuthContext(userID: "writer", sessionIntentGeneration: 2))] {
            XCTAssertTrue(ScreenplayReplacementResolver.resolve(existing: original,
                candidateRange: NSRange(location: 5, length: 5), fallbackSelection: NSRange(location: 0, length: 0),
                target: captured, projectID: project, authContext: context).isRejected)
        }
    }

    func testOrdinaryInsertionWithoutARewriteKeepsItsSelection() {
        let selection = NSRange(location: 3, length: 0)
        let result = ScreenplayReplacementResolver.resolve(existing: "Some text", candidateRange: selection,
            fallbackSelection: selection, target: nil, projectID: "project", authContext: auth)
        XCTAssertFalse(result.isRejected)
        XCTAssertFalse(result.isReplacement)
        XCTAssertEqual(result.range, selection)
    }

    private func target(_ text: String, draft: String? = nil) -> ScreenplayPendingReplacementTarget {
        .init(id: UUID(), sourceWriteID: "write", startLine: 4, endLine: 4, currentText: text,
            draftIdentity: .init(draft: draft ?? text), projectID: "project", authContext: auth)
    }
}
