import XCTest
import ScreenplayStudio
@testable import them

final class FountainFormatterTests: XCTestCase {
    func testFormatStripsMetaInstructionPrefixAndTrailingComma() {
        let raw = "Write one tense screenplay action line: She reaches the door before he can answer,"

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(result, "She reaches the door before he can answer.")
    }

    func testFormatNormalizesCommaPeriodArtifact() {
        let raw = "Action line: She reaches the door before he can answer,."

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(result, "She reaches the door before he can answer.")
    }

    func testFormatNormalizesSemicolonPeriodArtifact() {
        let raw = "Action line: She reaches the door before he can answer;."

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(result, "She reaches the door before he can answer.")
    }

    func testFormatCleansStructuredFountainActionWithoutChangingSlugline() {
        let raw = """
        INT. DINER - NIGHT

        She reaches the door before he can answer;
        """

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(
            result,
            """
            INT. DINER - NIGHT

            She reaches the door before he can answer.
            """
        )
    }

    func testFormatCompletesSplitSceneHeadingTimeBeforeAction() {
        let raw = """
        INT. KITCHEN -
        DAY
        A sun - drenched kitchen waits in silence.
        """

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(
            result,
            """
            INT. KITCHEN - DAY

            A sun-drenched kitchen waits in silence.
            """
        )
    }

    func testFormatSplitsGluedSceneHeadingTimeFromAction() {
        let raw = """
        INT. KITCHEN - DAYA sun - drenched kitchen waits in silence.
        SARAH
        I need the truth.
        """

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(
            result,
            """
            INT. KITCHEN - DAY

            A sun-drenched kitchen waits in silence.

            SARAH
            I need the truth.
            """
        )
    }

    func testFormatSplitsDoubleSpacedSceneHeadingTimeFromUppercaseAction() {
        let raw = """
        INT. KITCHEN - DAY  A SUN - DRENCHED KITCHEN WAITS IN SILENCE.
        """

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(
            result,
            """
            INT. KITCHEN - DAY

            A sun-drenched kitchen waits in silence.
            """
        )
    }

    func testFormatDoesNotTreatMetaInstructionAsCharacterDialogue() {
        let raw = "Write one tense screenplay action line: She reaches the door before he can answer"

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertFalse(result.contains("WRITE ONE TENSE SCREENPLAY ACTION LINE"))
        XCTAssertEqual(result, "She reaches the door before he can answer.")
    }

    func testFormatPreservesRealCharacterDialogue() {
        let raw = "SARAH: I can't do this"

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(
            result,
            """
            SARAH
            I can't do this
            """
        )
    }

    func testFormatSplitsInlineCharacterParentheticalDialogue() {
        let raw = """
        INT. KITCHEN - DAY

        JESSICA (voice trembling) Dad, we need to talk.
        """

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(
            result,
            """
            INT. KITCHEN - DAY

            JESSICA
            (voice trembling)
            Dad, we need to talk.
            """
        )
    }

    func testFormatUppercasesFirstAppearanceBeforeCharacterCue() {
        let raw = """
        Jessica crosses to the sink.

        JESSICA
        I know.
        """

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(
            result,
            """
            JESSICA crosses to the sink.

            JESSICA
            I know.
            """
        )
    }

    func testFormatUppercasesStandaloneActionIntroductionAtSentenceStart() {
        let raw = "Maya hesitates, then looks away."

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(result, "MAYA hesitates, then looks away.")
    }

    func testFormatDoesNotUppercaseLocationLikeOpeningAction() {
        let raw = "Paris glows beneath the rain."

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(result, "Paris glows beneath the rain.")
        XCTAssertFalse(result.contains("PARIS"))
    }

    func testFormatNormalizesFadeOutToPeriodTransition() {
        // "FADE OUT." is the industry form and the backend page contract's;
        // "FADE OUT:" was read there as neither a transition nor a cue.
        XCTAssertEqual(FountainFormatter.format(rawText: "fade out"), "FADE OUT.")
        XCTAssertEqual(FountainFormatter.format(rawText: "FADE OUT:"), "FADE OUT.")
        XCTAssertEqual(FountainFormatter.format(rawText: "fade to black"), "FADE TO BLACK.")
        XCTAssertTrue(ScreenplayEditorElement.looksLikeTransition("FADE OUT."))
        XCTAssertTrue(ScreenplayEditorElement.looksLikeTransition("SMASH TO BLACK."))
    }

    func testSceneHeadingKeepsHyphenatedWords() {
        // Seen live 2026-09-28: "EXT. TWO-LANE ROAD - DAY" printed "TWO - LANE".
        XCTAssertEqual(FountainFormatter.spacedHeadingSeparators("EXT. TWO-LANE ROAD - DAY"), "EXT. TWO-LANE ROAD - DAY")
        XCTAssertEqual(FountainFormatter.spacedHeadingSeparators("INT. MOTHER-IN-LAW'S KITCHEN -NIGHT"), "INT. MOTHER-IN-LAW'S KITCHEN - NIGHT")
        XCTAssertEqual(FountainFormatter.spacedHeadingSeparators("INT. DINER-NIGHT"), "INT. DINER - NIGHT")
        XCTAssertEqual(FountainFormatter.spacedHeadingSeparators("INT. DINER -- NIGHT"), "INT. DINER - NIGHT")
        let draft = FountainFormatter.normalizeHollywoodDraft("EXT. TWO-LANE ROAD - DAY\n\nA truck idles.")
        XCTAssertTrue(draft.hasPrefix("EXT. TWO-LANE ROAD - DAY"), draft)
    }

    func testNormalizeEditorLineWrapsAndCleansParenthetical() {
        let result = FountainFormatter.normalizeEditorLine(
            "Beat.",
            as: .parenthetical
        )

        XCTAssertEqual(result, "(beat)")
    }
}
