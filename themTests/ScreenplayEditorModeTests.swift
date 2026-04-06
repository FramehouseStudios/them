import XCTest
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
