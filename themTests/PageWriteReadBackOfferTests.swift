import XCTest
import ScreenplayStudio
@testable import them

final class PageWriteReadBackOfferTests: XCTestCase {
    func testAnswersRouteToTheRightReadBack() {
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "Yeah, what you just wrote"), .lastWrite)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "yes please"), .lastWrite)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "Read it back."), .lastWrite)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "The page."), .page)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "no, just the whole page"), .page)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "the whole script"), .script)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "read everything from the top"), .script)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "no thanks"), .decline)
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: "Nah, I'm good"), .decline)
    }

    func testANewRequestIsNotTakenAsAnAnswer() {
        // "yes" must not become a page-write approval, but a real instruction
        // is not a read-back choice either.
        XCTAssertNil(PageWriteReadBackOffer.choice(for: "Write the next scene where June lies to Nora"))
        XCTAssertNil(PageWriteReadBackOffer.choice(for: "no, make Desmond the one who wrote it"))
    }

    func testTheComposersWrapperIsNotTheAnswer() {
        let wrapped = "Produce screenplay-ready rewritten material that directly answers the writer.\n\nWriter request: The page"
        XCTAssertEqual(PageWriteReadBackOffer.choice(for: wrapped), .page)
        XCTAssertFalse(PageWriteReadBackOffer.closesOffer(wrapped))
    }

    func testOnlyARealRequestClosesTheOffer() {
        XCTAssertFalse(PageWriteReadBackOffer.closesOffer("um"))
        XCTAssertFalse(PageWriteReadBackOffer.closesOffer("hmm okay"))
        XCTAssertTrue(PageWriteReadBackOffer.closesOffer("write the next scene"))
    }

    func testTheOfferIsCasualAndStablePerWrite() {
        let line = PageWriteReadBackOffer.line(seed: "write-123")
        XCTAssertEqual(line, PageWriteReadBackOffer.line(seed: "write-123"))
        XCTAssertTrue(PageWriteReadBackOffer.lines.contains(line))
        XCTAssertTrue(line.lowercased().contains("script"))
    }

    func testPageTextIsThePageHoldingTheLineNotTheScriptOpening() {
        let pageOne = (1...60).map { "Nora checks bed \($0)." }.joined(separator: "\n\n")
        let draft = "INT. WARD - NIGHT\n\n" + pageOne + "\n\nINT. ROOF - DAWN\n\nDanny waits by the vent."
        let lastLine = draft.components(separatedBy: "\n").count
        let text = PageWriteReadBackOffer.pageText(in: draft, containingLine: lastLine)
        XCTAssertTrue(text.contains("Danny waits by the vent."), text)
        XCTAssertFalse(text.hasPrefix("INT. WARD - NIGHT"), "not the first page")
    }

    func testEveryOfferButtonRoutesToItsChoice() {
        let expected: [String: PageWriteReadBackOffer.Choice] = [
            "What I wrote": .lastWrite, "The page": .page, "Whole script": .script, "Not now": .decline,
        ]
        XCTAssertEqual(StudioReadBackOfferBar.answers.count, expected.count)
        for option in StudioReadBackOfferBar.answers {
            XCTAssertEqual(PageWriteReadBackOffer.choice(for: option.text), expected[option.title], option.title)
        }
    }
}
