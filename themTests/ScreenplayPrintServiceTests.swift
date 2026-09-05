import XCTest
import PDFKit
@testable import them

final class ScreenplayPrintServiceTests: XCTestCase {
    private let paperKey = "io.them.print.paperOverride"

    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: ScreenplayPrintFeature.disabledKey)
        UserDefaults.standard.removeObject(forKey: paperKey)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: ScreenplayPrintFeature.disabledKey)
        UserDefaults.standard.removeObject(forKey: paperKey)
        super.tearDown()
    }

    // MARK: - Page count

    func testShortDraftRendersOnePageAndPageCountMatchesPDF() throws {
        let draft = """
        INT. KITCHEN - DAY

        Maya sets the reel on the table.

        MAYA
        I watched it four times last night.
        """
        let pdf = try ScreenplayPrintService.makePDF(draft: draft, title: "Test")
        let document = try XCTUnwrap(PDFDocument(data: pdf))
        XCTAssertEqual(document.pageCount, 1)
        XCTAssertEqual(ScreenplayPrintService.pageCount(of: pdf), 1)
    }

    func testLongDraftPaginatesAndPageCountMatchesPDF() throws {
        let draft = Self.longDraft(dialogueLines: 400)
        let pdf = try ScreenplayPrintService.makePDF(draft: draft, title: "Test")
        let document = try XCTUnwrap(PDFDocument(data: pdf))
        XCTAssertGreaterThan(document.pageCount, 3)
        XCTAssertEqual(ScreenplayPrintService.pageCount(of: pdf), document.pageCount)
    }

    func testPageCountOfGarbageIsNil() {
        XCTAssertNil(ScreenplayPrintService.pageCount(of: Data("not a pdf".utf8)))
    }

    // MARK: - MORE / CONT'D across a forced dialogue break

    func testMoreAndContdAppearAcrossDialoguePageBreak() throws {
        // One cue, then a speech far longer than a page forces the break inside dialogue.
        let draft = Self.longDraft(dialogueLines: 120)
        let pdf = try ScreenplayPrintService.makePDF(draft: draft, title: "Test")
        let document = try XCTUnwrap(PDFDocument(data: pdf))
        XCTAssertGreaterThan(document.pageCount, 1)
        let firstPage = document.page(at: 0)?.string ?? ""
        let secondPage = document.page(at: 1)?.string ?? ""
        XCTAssertTrue(firstPage.contains("(MORE)"), "page 1 should end a broken speech with (MORE)")
        XCTAssertTrue(secondPage.contains("MAYA (CONT'D)"), "page 2 should resume with the cue and (CONT'D)")
    }

    // MARK: - Format gate

    func testGatePassesSixLineSpeech() {
        let draft = """
        INT. KITCHEN - DAY

        MAYA
        One.
        Two.
        Three.
        Four.
        Five.
        Six.
        """
        XCTAssertFalse(ScreenplayDraftGate.hasFormatErrors(draft: draft))
        XCTAssertNil(ScreenplayDraftGate.firstErrorReason(draft: draft))
    }

    func testGateFailsOrphanParenthetical() {
        let draft = """
        INT. KITCHEN - DAY

        Maya sets the reel on the table.

        (quietly)
        """
        XCTAssertTrue(ScreenplayDraftGate.hasFormatErrors(draft: draft))
    }

    // MARK: - Flag

    func testHardOffKeyDisablesPrintingInEveryBuild() {
        XCTAssertTrue(ScreenplayPrintFeature.isEnabled, "DEBUG test bundle: on unless hard-off is set")
        UserDefaults.standard.set(true, forKey: ScreenplayPrintFeature.disabledKey)
        XCTAssertFalse(ScreenplayPrintFeature.isEnabled)
        UserDefaults.standard.removeObject(forKey: ScreenplayPrintFeature.disabledKey)
        XCTAssertTrue(ScreenplayPrintFeature.isEnabled)
    }

    // MARK: - Paper

    func testPaperOverrideWinsOverRegionDefault() {
        UserDefaults.standard.set(ScreenplayPrintPaper.a4.rawValue, forKey: paperKey)
        XCTAssertEqual(ScreenplayPrintMemory.effectivePaper, .a4)
        UserDefaults.standard.set(ScreenplayPrintPaper.letter.rawValue, forKey: paperKey)
        XCTAssertEqual(ScreenplayPrintMemory.effectivePaper, .letter)
    }

    // MARK: - Helpers

    private static func longDraft(dialogueLines: Int) -> String {
        var lines = ["INT. KITCHEN - DAY", "", "Maya sets the reel on the table.", "", "MAYA"]
        for i in 1...dialogueLines {
            lines.append("I watched it again, frame \(i), and it still looks like he knew.")
        }
        return lines.joined(separator: "\n")
    }
}
