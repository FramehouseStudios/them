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

    func testFormatNormalizesFadeOutToColonTransition() {
        let raw = "fade out"

        let result = FountainFormatter.format(rawText: raw)

        XCTAssertEqual(result, "FADE OUT:")
    }

    func testNormalizeEditorLineWrapsAndCleansParenthetical() {
        let result = FountainFormatter.normalizeEditorLine(
            "Beat.",
            as: .parenthetical
        )

        XCTAssertEqual(result, "(beat)")
    }

    func test_pasted_action_pronouns_are_not_promoted_to_character_names() {
        let raw = """
        INT. KITCHEN - NIGHT

        MARA stands at the sink. She does not turn around.

        MARA
        Not me.

        He waits. She does not move. Then Frank steps closer.
        """
        let out = FountainFormatter.normalizePastedScreenplayBlock(raw, existingDraft: "")
        XCTAssertTrue(out.contains("He waits. She does not move."), out)
        XCTAssertFalse(out.contains("HE waits"), out)
        XCTAssertTrue(out.contains("FRANK steps closer"), "a real first appearance is still promoted: \(out)")
    }

    func test_terse_dialogue_under_a_cue_is_not_a_page_integrity_issue() {
        let draft = """
        INT. KITCHEN - NIGHT

        FRANK
        I kept the receipt.

        MARA (O.S.)
        For what?

        FRANK
        (beat)
        The ring.

        Can you help me with this scene?
        """
        let issues = FountainFormatter.screenplayIntegrityIssues(in: draft)
        XCTAssertEqual(issues.map(\.preview), ["Can you help me with this scene?"], "\(issues)")
    }
}
