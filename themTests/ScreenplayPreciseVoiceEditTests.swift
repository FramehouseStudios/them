import XCTest
@testable import them

@MainActor
final class ScreenplayPreciseVoiceEditTests: XCTestCase {
    private let transactionID = UUID(uuidString: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")!

    func testParsesNaturalCommandWithWordPageOrdinalQuotedReplacementAndSave() throws {
        let intent = try parsed(#"Page twenty-five, fourth line by John, replace it with “I know what I saw.” and save."#)

        XCTAssertEqual(intent.transactionID, transactionID)
        XCTAssertEqual(intent.page, 25)
        XCTAssertEqual(intent.dialogueOrdinal, 4)
        XCTAssertEqual(intent.character, "JOHN")
        XCTAssertEqual(intent.replacementText, "I know what I saw.")
        XCTAssertTrue(intent.saveRequested)
    }

    func testParsesDigitsNumericOrdinalPossessiveCharacterAndUnsavedReplacement() throws {
        let intent = try parsed("page 25, 4th John's dialogue, change with We leave at dawn.")

        XCTAssertEqual(intent.page, 25)
        XCTAssertEqual(intent.dialogueOrdinal, 4)
        XCTAssertEqual(intent.character, "JOHN")
        XCTAssertEqual(intent.replacementText, "We leave at dawn.")
        XCTAssertFalse(intent.saveRequested)
    }

    func testParsesCharacterBeforeLineAndCompoundOrdinal() throws {
        let intent = try parsed("page one hundred and two, twenty-fourth John line, replace it with Keep moving.")
        XCTAssertEqual(intent.page, 102)
        XCTAssertEqual(intent.dialogueOrdinal, 24)
        XCTAssertEqual(intent.character, "JOHN")
    }

    func testQuotedReplacementMayContainAndSaveWithoutRequestingSave() throws {
        let intent = try parsed(#"page 2, first line from Mary Jane, replace with "Wait and save yourself.""#)
        XCTAssertEqual(intent.replacementText, "Wait and save yourself.")
        XCTAssertFalse(intent.saveRequested)
    }

    func testParserRejectsMissingTargetOrReplacement() {
        XCTAssertFailure(ScreenplayPreciseEditCommandParser.parse("replace John's line", transactionID: transactionID))
        XCTAssertFailure(ScreenplayPreciseEditCommandParser.parse("page zero, first line by John, replace with Hello", transactionID: transactionID))
        XCTAssertFailure(ScreenplayPreciseEditCommandParser.parse("page 2, zeroth line by John, replace with Hello", transactionID: transactionID))
        XCTAssertFailure(ScreenplayPreciseEditCommandParser.parse(#"page 2, first line by John, replace with """#, transactionID: transactionID))
    }

    func testSnapshotUsesFixedFiftyFiveLineBoundaries() {
        XCTAssertEqual(snapshot(lineCount: 54).pages, [.init(number: 1, startLine: 1, endLine: 54)])
        XCTAssertEqual(snapshot(lineCount: 55).pages, [.init(number: 1, startLine: 1, endLine: 55)])
        XCTAssertEqual(
            snapshot(lineCount: 56).pages,
            [.init(number: 1, startLine: 1, endLine: 55), .init(number: 2, startLine: 56, endLine: 56)]
        )
        XCTAssertEqual(ScreenplayPreciseEditDocumentSnapshot.spokenLinesPerPage, 55)
    }

    func testResolvesFourthRepeatedCueOnRequestedPage() throws {
        let draft = (1...4).map { "JOHN\nLine \($0)." }.joined(separator: "\n\n")
        let intent = try parsed("page 1, fourth line by John, replace it with Final line and save")

        guard case let .resolved(anchor) = resolve(intent, draft: draft) else {
            return XCTFail("Expected a resolved anchor")
        }
        XCTAssertEqual(anchor.cueLine, 10)
        XCTAssertEqual(anchor.startLine, 11)
        XCTAssertEqual(anchor.endLine, 11)
        XCTAssertEqual(anchor.expectedOldText, "Line 4.")
        XCTAssertEqual(anchor.replacementText, "Final line")
        XCTAssertTrue(anchor.saveRequested)
    }

    func testResolvesMultilineDialogueAfterParentheticalWithoutReplacingParenthetical() throws {
        let draft = "INT. ROOM - NIGHT\n\nJOHN (V.O.)\n(quietly)\nFirst sentence.\nSecond sentence.\n\nMARY\nNo."
        let intent = try parsed("page 1, first line by John, replace with I changed it.")

        guard case let .resolved(anchor) = resolve(intent, draft: draft) else {
            return XCTFail("Expected a resolved anchor")
        }
        XCTAssertEqual(anchor.cueLine, 3)
        XCTAssertEqual(anchor.startLine, 5)
        XCTAssertEqual(anchor.endLine, 6)
        XCTAssertEqual(anchor.expectedOldText, "First sentence.\nSecond sentence.")
    }

    func testUppercaseDialogueIsNotMisclassifiedAsAnotherCharacterCue() throws {
        let draft = "JOHN\nNO. WE LEAVE NOW."
        let intent = try parsed("page 1, first line by John, replace with Fine.")
        guard case let .resolved(anchor) = resolve(intent, draft: draft) else {
            return XCTFail("Expected uppercase dialogue to resolve")
        }
        XCTAssertEqual(anchor.expectedOldText, "NO. WE LEAVE NOW.")
    }

    func testResolverRestrictsCueAndDialogueToRequestedPage() throws {
        let prefix = (1...55).map { "action \($0)" }.joined(separator: "\n")
        let draft = prefix + "\nJOHN\nPage two dialogue."
        let intent = try parsed("page 2, first line by John, replace with Changed.")

        guard case let .resolved(anchor) = resolve(intent, draft: draft) else {
            return XCTFail("Expected a page-two anchor")
        }
        XCTAssertEqual(anchor.page, 2)
        XCTAssertEqual(anchor.cueLine, 56)
        XCTAssertEqual(anchor.startLine, 57)
    }

    func testResolverDoesNotReachAcrossSpokenPageBoundary() throws {
        let prefix = (1...54).map { "action \($0)" }.joined(separator: "\n")
        let draft = prefix + "\nJOHN\nDialogue begins on page two."
        let intent = try parsed("page 1, first line by John, replace with Changed.")
        XCTAssertEqual(resolve(intent, draft: draft), .notFound)
    }

    func testResolverReturnsNotFoundForMissingPageCharacterOrOrdinal() throws {
        let draft = "JOHN\nOnly line."
        XCTAssertEqual(resolve(try parsed("page 2, first line by John, replace with X"), draft: draft), .notFound)
        XCTAssertEqual(resolve(try parsed("page 1, first line by Mary, replace with X"), draft: draft), .notFound)
        XCTAssertEqual(resolve(try parsed("page 1, second line by John, replace with X"), draft: draft), .notFound)
    }

    func testResolverRejectsDuplicateStableTargetsAsAmbiguous() throws {
        let draft = "JOHN\nSame line.\n\nJOHN\nSame line."
        let result = resolve(try parsed("page 1, first line by John, replace with Changed."), draft: draft)

        guard case let .ambiguous(ranges) = result else { return XCTFail("Expected ambiguity") }
        XCTAssertEqual(ranges.count, 2)
    }

    func testTargetHashIsStableWhenUnrelatedTextIsAppended() throws {
        let intent = try parsed("page 1, first line by John, replace with Changed.")
        let draft = "JOHN\nOriginal line."
        guard case let .resolved(before) = resolve(intent, draft: draft),
              case let .resolved(after) = resolve(intent, draft: draft + "\n\nMARY\nNew ending.") else {
            return XCTFail("Expected both anchors")
        }

        XCTAssertNotEqual(before.snapshotDraftHash, after.snapshotDraftHash)
        XCTAssertEqual(before.expectedTargetHash, after.expectedTargetHash)
        XCTAssertEqual(before.replacementRange, after.replacementRange)
    }

    func testTargetHashRemainsStableWhenUnrelatedTextMovesRange() throws {
        let intent = try parsed("page 1, first line by John, replace with Changed.")
        guard case let .resolved(before) = resolve(intent, draft: "JOHN\nOriginal line."),
              case let .resolved(after) = resolve(intent, draft: "New opening.\n\nJOHN\nOriginal line.") else {
            return XCTFail("Expected both anchors")
        }
        XCTAssertNotEqual(before.replacementRange, after.replacementRange)
        XCTAssertEqual(before.expectedTargetHash, after.expectedTargetHash)
    }

    func testReplacementRangeUsesUTF16CoordinatesAndPreservesCRLF() throws {
        let draft = "😀 OPENING\r\n\r\nJOHN\r\nHello.\r\nAgain."
        let intent = try parsed("page 1, first line by John, replace with Changed.")
        guard case let .resolved(anchor) = resolve(intent, draft: draft) else {
            return XCTFail("Expected an anchor")
        }
        XCTAssertEqual((draft as NSString).substring(with: anchor.replacementRange), "Hello.\r\nAgain.")
        XCTAssertEqual(anchor.expectedOldText, "Hello.\r\nAgain.")
    }

    func testSnapshotHashChangesWithDraftButNotRevision() {
        let first = ScreenplayPreciseEditDocumentSnapshot(projectID: "p", baseVersionID: "v", draft: "Draft", revision: 1)
        let laterRevision = ScreenplayPreciseEditDocumentSnapshot(projectID: "p", baseVersionID: "v", draft: "Draft", revision: 2)
        let edited = ScreenplayPreciseEditDocumentSnapshot(projectID: "p", baseVersionID: "v", draft: "Edited", revision: 2)
        XCTAssertEqual(first.draftHash, laterRevision.draftHash)
        XCTAssertNotEqual(first.draftHash, edited.draftHash)
    }

    private func parsed(_ command: String) throws -> ScreenplayPreciseEditIntent {
        try ScreenplayPreciseEditCommandParser.parse(command, transactionID: transactionID).get()
    }

    private func resolve(_ intent: ScreenplayPreciseEditIntent, draft: String) -> ScreenplayPreciseEditResolution {
        ScreenplayPreciseEditResolver.resolve(
            intent,
            in: ScreenplayPreciseEditDocumentSnapshot(projectID: "project", baseVersionID: "version", draft: draft, revision: 1)
        )
    }

    private func snapshot(lineCount: Int) -> ScreenplayPreciseEditDocumentSnapshot {
        ScreenplayPreciseEditDocumentSnapshot(
            projectID: "project",
            baseVersionID: "version",
            draft: (1...lineCount).map { "line \($0)" }.joined(separator: "\n"),
            revision: 1
        )
    }
}

private extension XCTestCase {
    func XCTAssertFailure<Success, Failure>(_ result: Result<Success, Failure>, file: StaticString = #filePath, line: UInt = #line) {
        guard case .failure = result else { return XCTFail("Expected failure", file: file, line: line) }
    }
}
