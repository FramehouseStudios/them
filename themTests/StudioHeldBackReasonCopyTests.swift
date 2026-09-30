import XCTest
@testable import them

final class StudioHeldBackReasonCopyTests: XCTestCase {
    func testAHeldBackPageSaysWhyInAWritersWords() {
        // 74-page run 2026-09-30: "did not pass the screenplay quality check" gave the writer nothing to act on.
        XCTAssertEqual(
            StudioHeldBackReasonCopy.notice(reason: "missing_act_one_commitment"),
            "Page held back: it didn't push toward the choice Act I is building to. Your draft is unchanged."
        )
        XCTAssertEqual(
            StudioHeldBackReasonCopy.message(reason: "accepted_canon_contradiction"),
            "Clementine held this page back: it contradicted something already on your pages. Your draft is unchanged."
        )
        XCTAssertTrue(StudioStatusLine.isProblem(StudioHeldBackReasonCopy.notice(reason: "on_the_nose_dialogue")))
    }

    func testUnknownReasonsKeepThePlainNotice() {
        XCTAssertEqual(StudioHeldBackReasonCopy.notice(reason: "low_page_quality"), "Page held back. Your draft is unchanged.")
        XCTAssertEqual(StudioHeldBackReasonCopy.notice(reason: ""), "Page held back. Your draft is unchanged.")
        XCTAssertNil(StudioHeldBackReasonCopy.why(reason: "some_future_reason"))
    }

    func testNoReasonCopyUsesGateJargon() {
        let reasons = ["missing_act_one_commitment", "missing_act_two_reversal", "missing_act_three_payoff", "underfilled_page_text",
                       "placeholder_page_text", "summary_like_page_batch", "dialogue_tactic_lock", "on_the_nose_dialogue",
                       "expository_dialogue_dump", "interchangeable_dialogue_voice", "missing_character_arc_pressure",
                       "low_dramatic_density", "weak_first_page_opening", "accepted_canon_contradiction",
                       "missing_next_scene_execution_brief", "missing_batch_scene_anchor"]
        for reason in reasons {
            let why = try? XCTUnwrap(StudioHeldBackReasonCopy.why(reason: reason))
            XCTAssertNotNil(why, reason)
            XCTAssertFalse(why?.contains("_") ?? true, reason)
        }
    }
}
