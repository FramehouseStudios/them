import XCTest
import ScreenplayStudio
@testable import them

/// Live 2026-09-30: right after a streamed page write, MAE and DRIVER showed as
/// left-aligned action; a relaunch showed them as cues. A streamed line keeps
/// the element its first fragment got, so the commit re-reads the final text.
final class CommittedWriteElementsTests: XCTestCase {
    private let draft = """
    INT. BUS DEPOT - NIGHT

    Rain on the roof. A single bus idles with its doors open.

    MAE
    Last one tonight?

    DRIVER
    Last one ever, the way my back feels.

    Mae climbs aboard and takes the seat behind him.
    """

    func testCommittedLinesAreClassifiedFromTheirFinalText() {
        let lineCount = screenplayLineTexts(draft).count
        // What streaming left behind: every non-blank line kept "action".
        let streamed: [ScreenplayEditorElement?] = screenplayLineTexts(draft).map {
            $0.trimmingCharacters(in: .whitespaces).isEmpty ? nil : .action
        }
        let fixed = reinferScreenplayParagraphElements(streamed, text: draft, lines: 1...lineCount)
        let lines = screenplayLineTexts(draft)
        func element(of text: String) -> ScreenplayEditorElement? {
            fixed[lines.firstIndex(of: text)!]
        }
        XCTAssertEqual(element(of: "INT. BUS DEPOT - NIGHT"), .sceneHeading)
        XCTAssertEqual(element(of: "MAE"), .character)
        XCTAssertEqual(element(of: "Last one tonight?"), .dialogue)
        XCTAssertEqual(element(of: "DRIVER"), .character)
        XCTAssertEqual(element(of: "Mae climbs aboard and takes the seat behind him."), .action)
    }

    func testLinesOutsideTheWriteKeepTheWritersElements() {
        let lines = screenplayLineTexts(draft)
        var elements: [ScreenplayEditorElement?] = lines.map { $0.isEmpty ? nil : .action }
        elements[0] = .transition // the writer's own choice above the write
        let maeLine = lines.firstIndex(of: "MAE")! + 1
        let fixed = reinferScreenplayParagraphElements(elements, text: draft, lines: maeLine...(maeLine + 1))
        XCTAssertEqual(fixed[0], .transition)
        XCTAssertEqual(fixed[maeLine - 1], .character)
        XCTAssertEqual(fixed[maeLine], .dialogue)
        XCTAssertEqual(fixed[lines.firstIndex(of: "DRIVER")!], .action, "outside the committed range")
    }

    func testAMismatchedElementListIsLeftAlone() {
        let elements: [ScreenplayEditorElement?] = [.action]
        XCTAssertEqual(reinferScreenplayParagraphElements(elements, text: draft, lines: 1...3), elements)
    }
}
