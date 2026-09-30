import XCTest
import ScreenplayStudio
@testable import them

final class FountainElementSpacingTests: XCTestCase {
    func testCueAfterActionGetsABlankLine() {
        let text = "INT. MOTEL ROOM - NIGHT\n\nA letter slides under the door.\n"
        let offset = FountainElementSpacing.blankLineInsertionOffset(
            in: text, cursor: (text as NSString).length, element: .character, elementAbove: .action
        )
        XCTAssertEqual(offset, (text as NSString).length, "the blank line goes at the start of the empty line")
        let fixed = (text as NSString).replacingCharacters(in: NSRange(location: offset!, length: 0), with: "\n") + "MARA\nWho's there?"
        XCTAssertEqual(
            ScreenplayPageLayout.classify(fixed.components(separatedBy: "\n")).last,
            .dialogue,
            "with the blank line the page layout reads the cue and dialogue as dialogue"
        )
    }

    func testDialogueDirectlyUnderItsCueStaysTight() {
        let text = "MARA\n"
        XCTAssertNil(FountainElementSpacing.blankLineInsertionOffset(
            in: text, cursor: (text as NSString).length, element: .dialogue, elementAbove: .character
        ))
    }

    func testActionAfterAHeadingOrAfterDialogueGetsABlankLine() {
        XCTAssertTrue(FountainElementSpacing.needsBlankLineBefore(.action, after: .sceneHeading))
        XCTAssertTrue(FountainElementSpacing.needsBlankLineBefore(.action, after: .dialogue))
        XCTAssertFalse(FountainElementSpacing.needsBlankLineBefore(.action, after: .action), "consecutive action lines stay one paragraph")
        XCTAssertTrue(FountainElementSpacing.needsBlankLineBefore(.sceneHeading, after: .dialogue))
        XCTAssertTrue(FountainElementSpacing.needsBlankLineBefore(.transition, after: .action))
    }

    func testNothingIsInsertedWhenTheLineHasTextOrIsAlreadySeparated() {
        XCTAssertNil(FountainElementSpacing.blankLineInsertionOffset(in: "Rain.\nMARA", cursor: 8, element: .character, elementAbove: .action))
        let separated = "Rain.\n\n"
        XCTAssertNil(FountainElementSpacing.blankLineInsertionOffset(
            in: separated, cursor: (separated as NSString).length, element: .character, elementAbove: .action
        ))
        XCTAssertNil(FountainElementSpacing.blankLineInsertionOffset(in: "", cursor: 0, element: .sceneHeading, elementAbove: nil))
    }

    func testACueTypedUnderActionGetsTheBlankLineFountainNeeds() {
        // 2026-09-30: "…glass.\nDANNY\nNobody moves…" printed as one action paragraph.
        let text = "INT. HALL - NIGHT\n\nRain on the glass.\nDANNY\n"
        let cueStart = (text as NSString).range(of: "DANNY").location
        XCTAssertEqual(FountainElementSpacing.blankLineOffsetAboveTypedCue(lineStart: cueStart, in: text), cueStart)
        let spaced = "INT. HALL - NIGHT\n\nRain on the glass.\n\nDANNY\n"
        XCTAssertNil(FountainElementSpacing.blankLineOffsetAboveTypedCue(lineStart: (spaced as NSString).range(of: "DANNY").location, in: spaced))
        XCTAssertNil(FountainElementSpacing.blankLineOffsetAboveTypedCue(lineStart: 0, in: "DANNY\n"), "first line")
        let fixed = (text as NSString).replacingCharacters(in: NSRange(location: cueStart, length: 0), with: "\n") + "Nobody moves until eight."
        let kinds = ScreenplayPageLayout.classify(fixed.components(separatedBy: "\n"))
        XCTAssertEqual(kinds[4], .character, "the printed page now reads a cue")
        XCTAssertEqual(kinds[5], .dialogue)
    }
}

final class ScreenplayRemoteWhitespaceOnlyDifferenceTests: XCTestCase {
    func testTheWritersNewTrailingLineIsNotAServerChange() {
        XCTAssertTrue(ScreenplayRemoteDraftConflictPolicy.isWhitespaceOnlyDifference(
            localDraft: "INT. PIER - NIGHT\n\n", serverDraft: "INT. PIER - NIGHT"
        ), "the server trims on save; its copy must not delete the line the writer just opened")
    }

    func testRealChangesAndIdenticalDraftsAreNotWhitespaceOnly() {
        XCTAssertFalse(ScreenplayRemoteDraftConflictPolicy.isWhitespaceOnlyDifference(
            localDraft: "INT. PIER - NIGHT", serverDraft: "INT. PIER - NIGHT\n\nFog."
        ))
        XCTAssertFalse(ScreenplayRemoteDraftConflictPolicy.isWhitespaceOnlyDifference(
            localDraft: "INT. PIER - NIGHT", serverDraft: "INT. PIER - NIGHT"
        ))
        XCTAssertFalse(ScreenplayRemoteDraftConflictPolicy.isWhitespaceOnlyDifference(
            localDraft: "\n\n", serverDraft: ""
        ), "an empty page still takes the server copy")
    }
}

final class ScreenplayIntegrityDialogueTests: XCTestCase {
    func testAWellFormedDialogueBlockIsNotFlaggedAsCompanionProse() {
        let draft = "INT. PIER - NIGHT\n\nFog rolls over the water.\n\nNORA\nIs anyone out there?"
        XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: draft), [], "a cue and its dialogue are screenplay, even when the line is a question")
        XCTAssertTrue(FountainFormatter.isStrongStudioPageWriteCandidate("NORA\nIs anyone out there?", allowActionOnly: true))
    }

    func testAParentheticalBetweenCueAndDialogueIsStillScreenplay() {
        let draft = "INT. DOCK - DAY\n\nRain hammers the boards.\n\nNORA\n(whispering)\nWho's there?"
        XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: draft), [])
        XCTAssertTrue(FountainFormatter.isStrongStudioPageWriteCandidate("NORA\n(whispering)\nWho's there?", allowActionOnly: true))
    }

    func testACueWithOnlyAParentheticalIsNotADialogueBlock() {
        XCTAssertFalse(FountainFormatter.isStrongStudioPageWriteCandidate("NORA\n(beat)"))
    }

    func testRealCompanionChatterIsStillFlagged() {
        let draft = "INT. PIER - NIGHT\n\nFog rolls over the water.\n\nSure! Do you want me to write the next scene for you?"
        XCTAssertEqual(FountainFormatter.screenplayIntegrityIssues(in: draft).count, 1)
    }
}

final class ScreenplayParagraphElementBlankLineTests: XCTestCase {
    private let scene = "INT. PIER - NIGHT\n\nFog rolls over the water.\n\nNORA\nIs anyone out there?\n\nNobody answers."

    func testReloadedActionAfterDialogueStaysAction() {
        let elements = bootstrapScreenplayParagraphElements(for: scene)
        XCTAssertEqual(elements, [.sceneHeading, nil, .action, nil, .character, .dialogue, nil, .action])
    }

    func testDialogueStillFollowsItsCueWithoutABlankLine() {
        let elements = bootstrapScreenplayParagraphElements(for: "NORA\nIs anyone out there?\nHello?")
        XCTAssertEqual(elements, [.character, .dialogue, .dialogue])
    }

    func testReconciledLineAfterBlankDoesNotInheritDialogue() {
        let previous = "NORA\nIs anyone out there?\n\n"
        let next = "NORA\nIs anyone out there?\n\nNobody answers."
        let elements = reconcileScreenplayParagraphElements(
            previousText: previous,
            nextText: next,
            previousElements: bootstrapScreenplayParagraphElements(for: previous),
            activeLineIndex: nil,
            explicitCurrentLineElement: nil
        )
        XCTAssertEqual(elements.last ?? nil, .action)
    }

    func testExplicitElementOnTheActiveLineStillWins() {
        let previous = "NORA\nIs anyone out there?\n\n"
        let next = "NORA\nIs anyone out there?\n\n(quietly)"
        let elements = reconcileScreenplayParagraphElements(
            previousText: previous,
            nextText: next,
            previousElements: bootstrapScreenplayParagraphElements(for: previous),
            activeLineIndex: 3,
            explicitCurrentLineElement: .dialogue
        )
        XCTAssertEqual(elements.last ?? nil, .dialogue)
    }
}
