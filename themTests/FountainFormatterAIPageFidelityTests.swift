import XCTest
import ScreenplayStudio
@testable import them

/// An AI-written page, seen live 2026-09-28, that the formatter damaged: a
/// character introduction became a cue plus a heading cut at "night" (text
/// lost), "Inside:" became a speaker, "(barely)" and a dialogue line with
/// "building" became scene headings.
final class FountainFormatterAIPageFidelityTests: XCTestCase {
    private let page = """
    INT. ST. AGNES HOSPITAL - BASEMENT CORRIDOR - NIGHT

    Fluorescent tubes hum. A mop bucket drifts on its own down a slight slope.

    NORA OKAFOR (30s), night nurse, scrubs under a cardigan, pushes a cart of returned linens. She stops at a wire cage marked LOST AND FOUND.

    Inside: umbrellas, a walker, a single child's boot. And a green canvas coat with a torn left pocket.

    Nora goes still.

    She unlatches the cage. Lifts the coat. Turns the pocket inside out. A bus transfer, dated six weeks ago, falls to the floor.

    NORA
    (barely)
    Danny.

    DESMOND (60s), security guard, rounds the corner with a thermos.

    DESMOND
    Cage is for Monday, hon. Tag it, leave it.

    NORA
    Who brought this in?

    DESMOND
    Whoever brings anything in. ER, mostly. Why?

    NORA
    It's my brother's.

    Desmond looks at the coat, then at her. He sets the thermos down.

    DESMOND
    Your brother the one on the flyers by the elevators?

    Nora nods. She presses the coat to her face. It smells of rain and diesel.

    NORA
    He was here. He was in this building.

    DESMOND
    Or his coat was.

    She picks up the bus transfer. Turns it over. On the back, in pencil: ROOM 4 - ASK FOR JUNE.

    Nora looks up at the elevator. The floor numbers glow. The one for the fourth floor flickers.
    """

    private func nonBlankLines(_ text: String) -> [String] {
        text.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    func testAWellFormedAIPageKeepsEveryLine() {
        let normalized = FountainFormatter.normalizeHollywoodDraft(page)
        XCTAssertEqual(nonBlankLines(normalized), nonBlankLines(page))
    }

    func testNothingUnderACueBecomesASceneHeading() {
        let normalized = FountainFormatter.normalizeHollywoodDraft(
            "NORA\n(barely)\nDanny.\n\nNORA\nHe was here. He was in this building."
        )
        XCTAssertFalse(normalized.contains("INT."), normalized)
        XCTAssertTrue(normalized.contains("(barely)"))
        XCTAssertTrue(normalized.contains("He was here. He was in this building."))
    }

    func testCharacterIntroductionAndColonLabelsStayAction() {
        let normalized = FountainFormatter.normalizeHollywoodDraft(
            "INT. WARD - NIGHT\n\nNORA OKAFOR (30s), night nurse, pushes a cart of returned linens.\n\nInside: umbrellas, a walker, a single child's boot."
        )
        XCTAssertTrue(normalized.contains("NORA OKAFOR (30s), night nurse, pushes a cart of returned linens."), normalized)
        XCTAssertTrue(normalized.contains("Inside: umbrellas, a walker, a single child's boot."), normalized)
        XCTAssertFalse(normalized.contains("INT. INSIDE"))
    }

    func testVoiceStyleHeadingsStillConvert() {
        XCTAssertTrue(FountainFormatter.normalizeHollywoodDraft("inside the diner at night").hasPrefix("INT."))
    }
}
