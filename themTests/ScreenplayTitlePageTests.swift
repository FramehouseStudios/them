import XCTest
import PDFKit
import ScreenplayStudio
@testable import them

final class ScreenplayTitlePageTests: XCTestCase {
    private let draft = """
    Title: The Long Night
    Credit: Written by
    Author: Sam Rivera
    Contact:
        sam@example.com
        555-0100

    INT. DINER - NIGHT

    MAE
    You came back.
    """

    func testSplitReadsTheTitlePageAndLeavesTheScript() {
        let parts = ScreenplayTitlePage.split(draft)
        XCTAssertEqual(parts.titlePage?.title, "The Long Night")
        XCTAssertEqual(parts.titlePage?.author, "Sam Rivera")
        XCTAssertEqual(parts.titlePage?.contact, "sam@example.com\n555-0100")
        XCTAssertTrue(parts.body.hasPrefix("INT. DINER - NIGHT"))
    }

    func testLeadingLineCountCoversTheBlockOnly() {
        XCTAssertEqual(ScreenplayTitlePage.leadingLineCount(in: draft), 6)
        XCTAssertEqual(ScreenplayTitlePage.leadingLineCount(in: "\n" + draft), 7)
        XCTAssertEqual(ScreenplayTitlePage.leadingLineCount(in: "INT. DINER - NIGHT\n\nMae waits."), 0)
    }

    func testDialogueInColonFormIsNeverATitlePage() {
        XCTAssertNil(ScreenplayTitlePage.split("SAM: Hi.\nMAE: Hello.").titlePage)
        XCTAssertNil(ScreenplayTitlePage.split("TITLE: NEW YORK, 1979\nTraffic crawls past the diner.").titlePage)
    }

    func testApplyingInsertsReplacesAndRemoves() {
        let body = "INT. DINER - NIGHT\n\nMae waits."
        let page = ScreenplayTitlePage(title: "Diner", author: "Sam")
        let inserted = ScreenplayTitlePage.applying(page, to: body)
        XCTAssertEqual(inserted, "Title: Diner\nCredit: Written by\nAuthor: Sam\n\nINT. DINER - NIGHT\n\nMae waits.")

        var renamed = page
        renamed.title = "Last Diner"
        let replaced = ScreenplayTitlePage.applying(renamed, to: inserted)
        XCTAssertTrue(replaced.hasPrefix("Title: Last Diner\n"))
        XCTAssertEqual(replaced.components(separatedBy: "Title:").count, 2)

        XCTAssertEqual(ScreenplayTitlePage.applying(ScreenplayTitlePage(credit: ""), to: replaced), body)
    }

    func testFormatterKeepsTheTitlePageInsteadOfMakingCues() {
        // Seen before this change: "Title: X" became the cue TITLE with dialogue "X".
        let normalized = FountainFormatter.normalizeHollywoodDraft(draft, fromWriter: true)
        XCTAssertTrue(normalized.hasPrefix("Title: The Long Night\nCredit: Written by\nAuthor: Sam Rivera"))
        XCTAssertFalse(normalized.contains("\nTITLE\n"))
        XCTAssertFalse(normalized.contains("\nAUTHOR\n"))
        XCTAssertTrue(normalized.contains("INT. DINER - NIGHT"))
    }

    func testNewTitlePageStartsFromTheProjectAndWriter() {
        let today = Date(timeIntervalSince1970: 1_790_640_000)
        let page = ScreenplayTitlePageSheet.startingPage(existing: nil, projectTitle: "Diner", writerName: " Sam ", today: today)
        XCTAssertEqual(page.title, "Diner")
        XCTAssertEqual(page.author, "Sam")
        XCTAssertEqual(page.credit, ScreenplayTitlePage.defaultCredit)
        XCTAssertFalse(page.draftDate.isEmpty)
        XCTAssertEqual(ScreenplayTitlePageSheet.startingPage(existing: nil, projectTitle: "Live Draft", writerName: "").title, "")
    }

    func testPrintedTitlePageCreditsTheWriterNeverTheApp() {
        let blocks = ScreenplayPrintService.titlePageBlocks(for: ScreenplayTitlePage(title: "Diner", author: "Sam", draftDate: "September 28, 2026", contact: "sam@example.com"))
        XCTAssertEqual(blocks.centered, ["DINER", "Written by", "Sam"])
        XCTAssertEqual(blocks.contact, "sam@example.com")
        XCTAssertEqual(blocks.draftDate, "September 28, 2026")
        XCTAssertFalse(blocks.centered.joined().contains("Clementine"))
    }

    #if os(iOS)
    func testPrintedPDFGetsOneTitleSheetAndKeepsTheScriptPages() throws {
        let body = String(repeating: "INT. DINER - NIGHT\n\nMae waits by the window.\n\n", count: 40)
        let withTitle = "Title: Diner\nCredit: Written by\nAuthor: Sam\n\n" + body
        let plain = try ScreenplayPrintService.makePDF(draft: body, title: "Diner")
        let titled = try ScreenplayPrintService.makePDF(draft: withTitle, title: "Diner")
        let plainPages = try XCTUnwrap(ScreenplayPrintService.pageCount(of: plain))
        XCTAssertEqual(ScreenplayPrintService.pageCount(of: titled), plainPages + 1)

        let document = try XCTUnwrap(PDFDocument(data: titled))
        let titleText = document.page(at: 0)?.string ?? ""
        XCTAssertTrue(titleText.contains("DINER"))
        XCTAssertTrue(titleText.contains("Sam"))
        XCTAssertFalse(titleText.contains("Title:"), "the keys are not printed")
        XCTAssertFalse(document.page(at: 1)?.string?.contains("Author:") ?? true)
        // Printed right side up: the title sits above the writer's name
        // (PDF space: larger y is higher on the page).
        let titlePage = try XCTUnwrap(document.page(at: 0))
        let pageText = titlePage.string ?? ""
        let titleIndex = try XCTUnwrap(pageText.range(of: "DINER")).lowerBound.utf16Offset(in: pageText)
        let writerIndex = try XCTUnwrap(pageText.range(of: "Sam")).lowerBound.utf16Offset(in: pageText)
        XCTAssertGreaterThan(titlePage.characterBounds(at: titleIndex).midY, titlePage.characterBounds(at: writerIndex).midY)
        XCTAssertGreaterThan(titlePage.characterBounds(at: titleIndex).midY, titlePage.bounds(for: .mediaBox).midY, "title in the upper half")
        XCTAssertNil(ScreenplayPrintService.pageNumberLabel(for: 1))
        XCTAssertEqual(ScreenplayPrintService.pageNumberLabel(for: 2), "2.")
        let secondScriptPage = try XCTUnwrap(document.page(at: 2))
        let number = try XCTUnwrap((secondScriptPage.string ?? "").range(of: "2."))
        let numberBounds = secondScriptPage.characterBounds(at: number.lowerBound.utf16Offset(in: secondScriptPage.string ?? ""))
        let media = secondScriptPage.bounds(for: .mediaBox)
        XCTAssertGreaterThan(numberBounds.minX, media.midX, "page number sits top right")
        XCTAssertGreaterThan(numberBounds.minY, media.maxY - 72, "page number sits in the top margin")
        XCTAssertFalse((document.page(at: 1)?.string ?? "").hasPrefix("1."), "first script page is unnumbered")
        for index in 0..<3 {
            let image = document.page(at: index)?.thumbnail(of: CGSize(width: 612, height: 792), for: .mediaBox)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("title-page-\(index).png")
            try image?.pngData()?.write(to: url)
            print("TITLE_PAGE_PREVIEW \(url.path)")
        }
    }
    #endif

    func testExportFieldsLeaveOutEmptyValues() {
        let fields = ScreenplayTitlePage(title: "Diner", author: "Sam").exportFields
        XCTAssertEqual(fields, ["title": "Diner", "credit": "Written by", "author": "Sam"])
        XCTAssertEqual(ScreenplayTitlePage(title: "Diner").exportFields, ["title": "Diner"])
    }
}
