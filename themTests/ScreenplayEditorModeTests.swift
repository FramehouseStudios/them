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

    func testCueTypedOnAnActionLineStaysACue() {
        // Seen live 2026-09-28: "JOE" + Return in Action mode became "Joe."
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("JOE", as: .action), "JOE")
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("NORA (V.O.)", as: .action), "NORA (V.O.)")
        XCTAssertEqual(ScreenplayEditorElement.inferredElement(for: "JOE", previousElement: nil), .character)
    }

    func testAllCapsActionKeepsItsCaps() {
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("A GUNSHOT RINGS OUT.", as: .action), "A GUNSHOT RINGS OUT.")
    }

    func testMixedCaseActionStillGetsItsPeriod() {
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("She waits", as: .action), "She waits.")
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("The door opens", as: .action), "The door opens.")
    }

    func testActionWordsAreNotMistakenForCharacters() {
        // Seen live 2026-09-28: "Fog sits on the water." became "FOG sits...".
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("Fog sits on the water.", as: .action), "Fog sits on the water.")
        // A name with no cue yet is left as typed rather than guessed at.
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("Nora waits by the door", as: .action), "Nora waits by the door.")
    }

    func testASpeakingCharacterIsIntroducedInCapsOnFirstAppearance() {
        let block = "INT. HALL - NIGHT\n\nNora waits by the door. Fog rolls in.\n\nNORA\nAnyone?"
        let out = FountainFormatter.normalizePastedScreenplayBlock(block, fromWriter: true)
        XCTAssertTrue(out.contains("NORA waits by the door."), out)
        XCTAssertTrue(out.contains("Fog rolls in."), out)
    }
}
