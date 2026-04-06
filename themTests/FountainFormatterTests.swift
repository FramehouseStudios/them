import XCTest
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
}
