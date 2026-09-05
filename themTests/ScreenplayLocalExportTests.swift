import XCTest
import PDFKit
#if os(macOS)
import CoreText
#endif
@testable import them

#if os(macOS)
final class ScreenplayLocalExportTests: XCTestCase {
    func testLocalFDXExportIncludesHollywoodParagraphTypes() throws {
        let draft = """
        INT. KITCHEN - NIGHT

        Maya crosses to the table.

        MAYA
        (quietly)
        We need to talk.

        CUT TO:
        """

        let artifact = try ScreenplayLocalExport.makeArtifact(
            draft: draft,
            title: "Kitchen Scene",
            format: "fdx"
        )
        let xml = try XCTUnwrap(String(data: artifact.data, encoding: .utf8))

        XCTAssertEqual(artifact.filename, "Kitchen Scene.fdx")
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Scene Heading\">"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Action\">"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Character\">"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Parenthetical\">"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Dialogue\">"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Transition\">"))
    }

    func testLocalFDXExportCarriesDualDialogueAsAnAttribute() throws {
        let draft = """
        INT. KITCHEN - NIGHT

        JESS
        I'm not leaving.

        MARCUS ^
        (under his breath)
        Neither am I.

        Rain against the glass.
        """

        let artifact = try ScreenplayLocalExport.makeArtifact(
            draft: draft,
            title: "Dual",
            format: "fdx"
        )
        let xml = try XCTUnwrap(String(data: artifact.data, encoding: .utf8))

        XCTAssertTrue(xml.contains("<Paragraph Type=\"Character\"><Text>JESS</Text>"), "first speaker is a plain cue")
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Character\" DualDialogue=\"Yes\"><Text>MARCUS</Text>"), "caret becomes the attribute and leaves the text")
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Parenthetical\" DualDialogue=\"Yes\">"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Dialogue\" DualDialogue=\"Yes\"><Text>Neither am I.</Text>"))
        XCTAssertFalse(xml.contains("^"), "the Fountain marker must not leak into Final Draft text")
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Action\"><Text>Rain against the glass.</Text>"), "the block ends at the next action line")
    }

    func testLocalPDFExportCreatesReadableDocument() throws {
        let draft = """
        INT. APARTMENT - DAY

        MAYA
        I should go.
        """

        let artifact = try ScreenplayLocalExport.makeArtifact(
            draft: draft,
            title: "Apartment Beat",
            format: "pdf"
        )

        XCTAssertEqual(artifact.filename, "Apartment Beat.pdf")
        XCTAssertTrue(artifact.data.starts(with: Data("%PDF".utf8)))
        let document = try XCTUnwrap(PDFDocument(data: artifact.data))
        XCTAssertGreaterThan(document.pageCount, 0)
        let page = try XCTUnwrap(document.page(at: 0))
        let heading = try screenplayPDFTestTextBounds("INT. APARTMENT - DAY", in: page)
        let dialogue = try screenplayPDFTestTextBounds("I should go.", in: page)
        XCTAssertGreaterThan(heading.minY, page.bounds(for: .mediaBox).midY)
        XCTAssertGreaterThan(heading.minY, dialogue.maxY, "the exported screenplay must read down the page, not be vertically reflected")
    }

    func testLocalPDFFailsInsteadOfReturningEarlierPagesWhenLayoutStopsMakingProgress() {
        let draft = (1...300).map { "The writer studies frame \($0) beside the window." }.joined(separator: "\n")
        var visibleRanges: [CFRange] = []
        XCTAssertThrowsError(try ScreenplayLocalExport.screenplayPDFData(for: draft) { framesetter, range, path in
            // First page uses the real production geometry. The next page's positive
            // but too-short frame cannot fit a glyph, reproducing a Core Text stall.
            let framePath = visibleRanges.isEmpty ? path : CGPath(rect: CGRect(x: 108, y: 72, width: 432, height: 1), transform: nil)
            let frame = CTFramesetterCreateFrame(framesetter, range, framePath, nil)
            visibleRanges.append(CTFrameGetVisibleStringRange(frame))
            return frame
        }) {
            XCTAssertEqual($0 as? ScreenplayLocalExportError, .incompletePDFLayout)
            XCTAssertTrue($0.localizedDescription.contains("No partial PDF was exported"))
        }
        XCTAssertEqual(visibleRanges.count, 2)
        XCTAssertGreaterThan(visibleRanges.first?.length ?? 0, 0, "failure must happen after a real page rendered")
        XCTAssertEqual(visibleRanges.last?.length, 0)
    }

    func testLocalPDFUnicodePaginationRetainsEveryLineThroughTheLastPage() throws {
        let lines = (1...180).map { index in
            String(format: "Frame%04d", index) + " — the writer sees 👩🏽‍🚀, café and cafe\u{301}."
        }
        let lf = lines.joined(separator: "\n") + "\nFinalUnicodeNeedle."
        let crlf = lf.replacingOccurrences(of: "\n", with: "\r\n")
        let artifact = try ScreenplayLocalExport.makeArtifact(draft: crlf, title: "Unicode", format: "pdf")
        let document = try XCTUnwrap(PDFDocument(data: artifact.data))
        XCTAssertGreaterThan(document.pageCount, 1)
        let allText = document.string ?? ""
        for index in 1...180 {
            let marker = String(format: "Frame%04d", index)
            XCTAssertEqual(allText.components(separatedBy: marker).count - 1, 1, "every source line must appear exactly once: \(marker)")
        }
        XCTAssertTrue(document.page(at: document.pageCount - 1)?.string?.contains("FinalUnicodeNeedle") == true)
        let regex = try NSRegularExpression(pattern: "Frame[0-9]{4}")
        for index in 0..<document.pageCount {
            let page = try XCTUnwrap(document.page(at: index))
            let text = try XCTUnwrap(page.string)
            let source = text as NSString
            let markers = regex.matches(in: text, range: NSRange(location: 0, length: source.length)).map { source.substring(with: $0.range) }
            if let first = markers.first, let last = markers.last, first != last {
                XCTAssertGreaterThan(try screenplayPDFTestTextBounds(first, in: page).minY,
                                     try screenplayPDFTestTextBounds(last, in: page).maxY,
                                     "Unicode paragraphs must run top-to-bottom on every page")
            }
        }
        let lfArtifact = try ScreenplayLocalExport.makeArtifact(draft: lf, title: "Unicode LF", format: "pdf")
        let lfDocument = try XCTUnwrap(PDFDocument(data: lfArtifact.data))
        XCTAssertEqual(document.pageCount, lfDocument.pageCount)
        for index in 0..<document.pageCount {
            XCTAssertEqual(document.page(at: index)?.string, lfDocument.page(at: index)?.string)
        }
        let attachment = XCTAttachment(data: artifact.data, uniformTypeIdentifier: "com.adobe.pdf")
        attachment.name = "mac-local-export-unicode-complete.pdf"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testLocalMarkdownExportUsesScreenplayReadableMarkup() throws {
        let draft = """
        INT. KITCHEN - NIGHT

        Maya crosses to the table.

        MAYA
        (quietly)
        We need to talk.

        CUT TO:
        """

        let artifact = try ScreenplayLocalExport.makeArtifact(
            draft: draft,
            title: "Kitchen Scene",
            format: "md"
        )
        let markdown = try XCTUnwrap(String(data: artifact.data, encoding: .utf8))

        XCTAssertEqual(artifact.format, "md")
        XCTAssertEqual(artifact.filename, "Kitchen Scene.md")
        XCTAssertEqual(artifact.contentType, "text/markdown; charset=utf-8")
        XCTAssertTrue(markdown.contains("## INT. KITCHEN - NIGHT"))
        XCTAssertTrue(markdown.contains("**MAYA**"))
        XCTAssertTrue(markdown.contains("*(quietly)*"))
        XCTAssertTrue(markdown.contains("> CUT TO:"))
        XCTAssertTrue(markdown.hasSuffix("\n"))
    }
}
#endif
