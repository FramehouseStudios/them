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

    private let actTwoPage = """
    INT. ST. AGNES HOSPITAL - FOURTH FLOOR - ROOM 4 - NIGHT

    A private room nobody uses. Blinds drawn. A cot, a space heater, a paper bag of oranges.

    JUNE BAPTISTE (70s), retired ward sister, sits upright in a visitor's chair like she owns it. She does not look surprised to see Nora.

    JUNE
    You're the sister.

    NORA
    Where is he?

    JUNE
    Safe. For now. He asked me not to tell you.

    Nora holds up the bus transfer. Her hand shakes.

    NORA
    He wrote your name on this. For me.

    June takes the transfer. Reads the back. Her face changes.

    JUNE
    That's not his handwriting.

    Nora snatches it back. Looks at the pencil letters. Tight, slanted. Not Danny's loose scrawl.

    NORA
    Then whose is it?

    June stands. Crosses to the door. Locks it.

    JUNE
    Somebody who wanted you up here tonight. Which means they know where he is too.

    Nora backs toward the window. Through the blinds: a security guard on the loading dock below, thermos in hand, looking up. DESMOND.

    Nora's breath fogs the glass.
    """

    private let finalPage = """
    EXT. ST. AGNES HOSPITAL - LOADING DOCK - DAWN

    Grey light. Rain has stopped. Steam lifts off the asphalt.

    Desmond sits on an upturned crate, thermos empty, hands cuffed in front of him. A patrol car idles, lights off.

    Nora stands over him in her cardigan. The green canvas coat is over her arm.

    DESMOND
    I kept him alive. You know that. Six weeks, I kept him fed.

    NORA
    You kept him hidden. From me.

    DESMOND
    From the people he owed.

    She drops the bus transfer in his lap. The pencil letters face up. ROOM 4 - ASK FOR JUNE.

    NORA
    You wrote this so I'd lead you to him.

    Desmond doesn't deny it.

    Behind them, the ambulance doors open. DANNY OKAFOR (20s), thin, bandaged hand, climbs down with June steadying his elbow.

    Nora doesn't run. She walks. Holds out the coat.

    Danny takes it. Puts it on. It still fits.

    DANNY
    (barely)
    You found my coat.

    NORA
    I found you.

    She fixes his collar, the way she used to on school mornings.

    Down the corridor window, the lost and found cage is empty now. Just a single child's boot, waiting for somebody else.

    FADE OUT.

    THE END
    """

    func testAnActTwoPageKeepsEveryLine() {
        // As in the Studio, earlier pages are the existing draft: Nora and
        // Desmond are not "first appearances" in caps again.
        let normalized = FountainFormatter.normalizeHollywoodDraft(actTwoPage, existingDraft: page)
        XCTAssertEqual(nonBlankLines(normalized), nonBlankLines(actTwoPage))
    }

    func testTheFinalPageKeepsEveryLineAndEndsOnFadeOut() {
        let normalized = FountainFormatter.normalizeHollywoodDraft(finalPage, existingDraft: page + "\n\n" + actTwoPage)
        XCTAssertEqual(nonBlankLines(normalized), nonBlankLines(finalPage))
        XCTAssertEqual(Array(nonBlankLines(normalized).suffix(2)), ["FADE OUT.", "THE END"])
        XCTAssertTrue(ScreenplayEditorElement.looksLikeTransition("FADE OUT."))
    }

    func testAContinuousHeadingStaysAHeading() {
        // Live 2026-09-29: "INT. BUS DEPOT - NIGHT - CONTINUOUS" after "INT. BUS DEPOT - NIGHT"
        // lost its heading and left a bare "Continuous." action line.
        let existing = "INT. BUS DEPOT - NIGHT\n\nRain on the roof.\n\nMae climbs aboard."
        let page = "INT. BUS DEPOT - NIGHT - CONTINUOUS\n\nRain hammers the depot roof."
        let deduped = FountainFormatter.removingDuplicateLeadingSceneHeading(
            from: page,
            existingDraft: existing,
            insertionUTF16Location: (existing as NSString).length
        )
        XCTAssertFalse(nonBlankLines(deduped).contains { $0.lowercased().hasPrefix("continuous") }, deduped)
        XCTAssertEqual(nonBlankLines(deduped).first, "INT. BUS DEPOT - NIGHT - CONTINUOUS")
        let normalized = FountainFormatter.normalizeHollywoodDraft(page, existingDraft: existing)
        XCTAssertEqual(nonBlankLines(normalized).first, "INT. BUS DEPOT - NIGHT - CONTINUOUS", normalized)
        XCTAssertEqual(nonBlankLines(FountainFormatter.normalizeHollywoodDraft("INT. ATTIC - DAY (FLASHBACK)\n\nDust.")).first, "INT. ATTIC - DAY (FLASHBACK)")
    }

    func testAnExactRepeatOfTheCurrentHeadingIsStillDropped() {
        let existing = "INT. BUS DEPOT - NIGHT\n\nRain on the roof."
        let deduped = FountainFormatter.removingDuplicateLeadingSceneHeading(
            from: "INT. BUS DEPOT - NIGHT\n\nMae waits.",
            existingDraft: existing,
            insertionUTF16Location: (existing as NSString).length
        )
        XCTAssertEqual(nonBlankLines(deduped), ["Mae waits."])
    }

    func testNoDoubleBlankLineBeforeACharacterIntroduction() {
        // Live 2026-09-29: "...paper bag of oranges.\n\n\nJUNE BAPTISTE (70s), ..." was saved.
        let normalized = FountainFormatter.normalizeHollywoodDraft(actTwoPage, existingDraft: page)
        XCTAssertFalse(normalized.contains("\n\n\n"), normalized)
    }

    func testVoiceStyleHeadingsStillConvert() {
        XCTAssertTrue(FountainFormatter.normalizeHollywoodDraft("inside the diner at night").hasPrefix("INT."))
    }
}
