import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplayGhostDraftTests: XCTestCase {
    func testSpokenInteriorSlugGhostsAsSceneHeading() {
        let preview = ScreenplayGhostDraft.preview(fromPartial: "Interior kitchen day")
        XCTAssertEqual(preview?.element, .sceneHeading)
        XCTAssertEqual(preview?.text, "INT. KITCHEN - DAY")
    }

    func testSlugFollowedByActionGhostsBothLinesWithActionElement() {
        let preview = ScreenplayGhostDraft.preview(fromPartial: "interior kitchen day, Jess enters")
        XCTAssertEqual(preview?.element, .action)
        XCTAssertEqual(preview?.text, "INT. KITCHEN - DAY\nJess enters")
    }

    func testBareNameGhostsAsCharacterCue() {
        let preview = ScreenplayGhostDraft.preview(fromPartial: "Jess")
        XCTAssertEqual(preview?.element, .character)
        XCTAssertEqual(preview?.text, "JESS")
    }

    func testKnownCharacterGhostsAsCueEvenWhenLowercased() {
        let draft = "INT. KITCHEN - DAY\n\nJESS\nWe need to talk."
        let names = ScreenplayGhostDraft.characterNames(in: draft)
        XCTAssertEqual(names, ["JESS"])
        let preview = ScreenplayGhostDraft.preview(fromPartial: "jess", knownCharacters: names)
        XCTAssertEqual(preview?.element, .character)
        XCTAssertEqual(preview?.text, "JESS")
    }

    func testOrdinaryActionStaysAction() {
        let preview = ScreenplayGhostDraft.preview(fromPartial: "she walks into the kitchen and sits down")
        XCTAssertEqual(preview?.element, .action)
        XCTAssertEqual(preview?.text, "She walks into the kitchen and sits down")
    }

    func testParentheticalAndTransition() {
        XCTAssertEqual(ScreenplayGhostDraft.preview(fromPartial: "(quietly")?.element, .parenthetical)
        XCTAssertEqual(ScreenplayGhostDraft.preview(fromPartial: "(quietly")?.text, "(quietly)")
        XCTAssertEqual(ScreenplayGhostDraft.preview(fromPartial: "cut to")?.element, .transition)
        XCTAssertEqual(ScreenplayGhostDraft.preview(fromPartial: "cut to")?.text, "CUT TO:")
    }

    func testEmptyOrWhitespacePartialProducesNoGhost() {
        XCTAssertNil(ScreenplayGhostDraft.preview(fromPartial: ""))
        XCTAssertNil(ScreenplayGhostDraft.preview(fromPartial: "   \n "))
    }

    func testCommandWordsNeverGhostAsCharacterCues() {
        XCTAssertEqual(ScreenplayGhostDraft.preview(fromPartial: "Cancel")?.element, .action)
        XCTAssertEqual(ScreenplayGhostDraft.preview(fromPartial: "Print")?.element, .action)
    }
}
