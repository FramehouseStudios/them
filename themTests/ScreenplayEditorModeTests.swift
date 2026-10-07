import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplayEditorModeTests: XCTestCase {
    func testInferSequenceDetectsSceneHeadingCharacterAndDialogue() {
        let draft = """
        INT. KITCHEN - DAY

        JESSICA
        I know.
        """

        let elements = ScreenplayEditorElement.inferredSequence(for: draft)

        XCTAssertEqual(elements.compactMap { $0 }, [.sceneHeading, .character, .dialogue])
    }

    func testInferSequenceResetsDialogueAfterBlankLine() {
        let draft = """
        JESSICA
        I know.

        She turns away.
        """

        let elements = ScreenplayEditorElement.inferredSequence(for: draft)

        XCTAssertEqual(elements[0], .character)
        XCTAssertEqual(elements[1], .dialogue)
        XCTAssertNil(elements[2])
        XCTAssertEqual(elements[3], .action)
    }

    func testNextElementAfterCharacterDefaultsToDialogue() {
        let next = ScreenplayEditorElement.nextElementAfterReturn(
            currentLine: "JESSICA",
            currentElement: .character,
            previousElementBeforeCurrentLine: .action
        )

        XCTAssertEqual(next, .dialogue)
    }

    func testSecondReturnAfterDialogueReturnsAction() {
        let firstReturn = ScreenplayEditorElement.nextElementAfterReturn(
            currentLine: "I know.",
            currentElement: .dialogue,
            previousElementBeforeCurrentLine: .character
        )
        let secondReturn = ScreenplayEditorElement.nextElementAfterReturn(
            currentLine: "",
            currentElement: .dialogue,
            previousElementBeforeCurrentLine: .dialogue
        )

        XCTAssertEqual(firstReturn, .dialogue)
        XCTAssertEqual(secondReturn, .action)
    }

    func testCycleForwardAndBackwardWrapsAcrossElements() {
        XCTAssertEqual(ScreenplayEditorElement.transition.next, .sceneHeading)
        XCTAssertEqual(ScreenplayEditorElement.sceneHeading.previous, .transition)
    }

    func testParagraphRestyleSkipsContentOnlyEdits() {
        XCTAssertFalse(
            ScreenplayParagraphRestylePolicy.shouldRestyle(
                previousElements: [.action],
                currentElements: [.action],
                paragraphStructureChanged: false
            )
        )
    }

    func testParagraphRestyleRunsWhenParagraphStructureChanges() {
        XCTAssertTrue(
            ScreenplayParagraphRestylePolicy.shouldRestyle(
                previousElements: [.action],
                currentElements: [.action, .action],
                paragraphStructureChanged: true
            )
        )
    }

    func testParagraphRestyleRunsWhenElementMetadataChanges() {
        XCTAssertTrue(
            ScreenplayParagraphRestylePolicy.shouldRestyle(
                previousElements: [.action],
                currentElements: [.character],
                paragraphStructureChanged: false
            )
        )
    }

    func testScreenplayLineIndexUpdatesInlineOffsetsWithoutChangingLineIdentity() {
        var index = ScreenplayLineIndex(text: "A\nB\nC")

        XCTAssertEqual(index.lineIndex(atUTF16Location: 0), 0)
        XCTAssertEqual(index.lineIndex(atUTF16Location: 2), 1)
        XCTAssertEqual(index.lineIndex(atUTF16Location: 4), 2)

        index.applyInlineEdit(onLineAt: 1, utf16LengthDelta: 2)

        XCTAssertEqual(index.lineStart(at: 2), 6)
        XCTAssertEqual(index.lineIndex(atUTF16Location: 6), 2)
        XCTAssertEqual(index.lineIndex(atUTF16Location: 5), 1)
    }

    func testScreenplayLineIndexHandlesCRLFAndTrailingEmptyLine() {
        let index = ScreenplayLineIndex(text: "A\r\nB\n")

        XCTAssertEqual(index.lineIndex(atUTF16Location: 0), 0)
        XCTAssertEqual(index.lineIndex(atUTF16Location: 3), 1)
        XCTAssertEqual(index.lineIndex(atUTF16Location: 5), 2)
        XCTAssertEqual(index.lineStart(at: 2), 5)
    }

    func testScreenplayLineIndexKeeps120PageLineLookupsLogarithmic() {
        let pageLineCount = 55
        let lineCount = 120 * pageLineCount
        let draft = (0..<lineCount).map { "ACTION \($0)" }.joined(separator: "\n")
        let targetLine = lineCount - 3
        let targetStart = (0..<targetLine).reduce(into: 0) { offset, index in
            offset += ("ACTION \(index)" as NSString).length + 1
        }
        var lineIndex = ScreenplayLineIndex(text: draft)
        var resolvedLine = -1

        measure {
            for _ in 0..<2_000 {
                let location = lineIndex.lineStart(at: targetLine) + 3
                resolvedLine = lineIndex.lineIndex(atUTF16Location: location)
                lineIndex.applyInlineEdit(onLineAt: targetLine, utf16LengthDelta: 1)
                lineIndex.applyInlineEdit(onLineAt: targetLine, utf16LengthDelta: -1)
            }
        }

        XCTAssertEqual(resolvedLine, targetLine)
        XCTAssertEqual(lineIndex.lineStart(at: targetLine), targetStart)
    }

    func testLineStartingWithIntPromotesToSceneHeading() {
        XCTAssertEqual(
            ScreenplayEditorElement.inferredElement(for: "int. diner - night", previousElement: nil),
            .sceneHeading
        )
    }

    func testEditorLineNormalizationBuildsStrictSceneHeading() {
        let normalized = FountainFormatter.normalizeEditorLine(
            "inside the diner at night",
            as: .sceneHeading
        )

        XCTAssertEqual(normalized, "INT. DINER - NIGHT")
    }

    func testEditorLineNormalizationSplitsCharacterDialogueBlock() {
        let normalized = FountainFormatter.normalizeEditorLine(
            "JESSICA (voice trembling) Dad, we need to talk.",
            as: .character
        )

        XCTAssertEqual(
            normalized,
            """
            JESSICA
            (voice trembling)
            Dad, we need to talk.
            """
        )
    }

    func testEditorLineNormalizationBuildsTransitionWithColon() {
        let normalized = FountainFormatter.normalizeEditorLine(
            "fade out",
            as: .transition
        )

        XCTAssertEqual(normalized, "FADE OUT:")
    }
}
