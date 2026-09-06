import XCTest
import PDFKit
import CoreText
import ScreenplayStudio
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

    func testTitlePageUsesCurrentProductBrandAndKeepsClementineNamed() {
        XCTAssertEqual(
            ScreenplayPrintService.titlePageLines(for: "Night Drive"),
            ["NIGHT DRIVE", "written by", "THEM — Clementine"]
        )
    }

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

    func testPrintedPDFPlacesShortDraftNearTheTopInReadingOrder() throws {
        let data = try ScreenplayPrintService.makePDF(
            draft: "INT. ROOM - DAY\n\nFirstLineNeedle.\nSecondLineNeedle.", title: "Reading order"
        )
        let document = try XCTUnwrap(PDFDocument(data: data))
        let page = try XCTUnwrap(document.page(at: 0))
        let heading = try screenplayPDFTestTextBounds("INT. ROOM - DAY", in: page)
        let first = try screenplayPDFTestTextBounds("FirstLineNeedle", in: page)
        let second = try screenplayPDFTestTextBounds("SecondLineNeedle", in: page)
        XCTAssertGreaterThan(heading.minY, page.bounds(for: .mediaBox).midY, "a short screenplay must start near the top, not the foot")
        XCTAssertGreaterThan(heading.minY, first.maxY)
        XCTAssertGreaterThan(first.minY, second.maxY, "in Quartz page space, later lines must be lower")
    }

    func testContinuationOnlyUsesTheCurrentContiguousDialogueBlock() {
        let text = "MAYA\nFirst speech.\n\nRORY\nSecond speech.\n\nEXT. ROAD - NIGHT"
        let map = ScreenplayPrintService.UTF16LineMap(text: text)
        let elements = ScreenplayEditorElement.inferredSequence(for: text)
        func speaker(at marker: String) -> String? {
            ScreenplayPrintService.continuationCharacter(atUTF16Offset: (text as NSString).range(of: marker).location, lineMap: map, elements: elements)
        }
        XCTAssertEqual(speaker(at: "First speech"), "MAYA")
        XCTAssertEqual(speaker(at: "Second speech"), "RORY")
        XCTAssertNil(speaker(at: "RORY"), "a new cue is not a continuation of the preceding speaker")
        XCTAssertNil(speaker(at: "EXT."))
        XCTAssertNil(ScreenplayPrintService.continuationCharacter(atUTF16Offset: map.utf16Length, lineMap: map, elements: elements))
    }

    func testUTF16LineMapLocatesLinesAfterExtendedGraphemes() {
        let text = String(repeating: "👩🏽‍🚀", count: 30) + "\nMAYA\nCafe\u{301}"
        let map = ScreenplayPrintService.UTF16LineMap(text: text)
        let source = text as NSString
        let cueOffset = source.range(of: "MAYA").location
        let finalLineOffset = source.range(of: "Cafe").location

        XCTAssertGreaterThan(cueOffset, text.count, "fixture must expose the old grapheme-count clamp")
        XCTAssertEqual(map.lineIndex(atUTF16Offset: cueOffset - 1), 0)
        XCTAssertEqual(map.lineIndex(atUTF16Offset: cueOffset), 1)
        XCTAssertEqual(map.lineIndex(atUTF16Offset: finalLineOffset), 2)
        XCTAssertEqual(map.lineIndex(atUTF16Offset: -1), 0)
        XCTAssertEqual(map.lineIndex(atUTF16Offset: Int.max), 2)
    }

    func testWidowPullbackUsesUTF16ForEmojiAndCombiningCharacters() {
        let prefix = "Header\n👩🏽‍🚀\nCafe\u{301}"
        XCTAssertEqual(
            ScreenplayPrintService.widowPullbackUTF16Length(in: prefix, prefersDialoguePair: false),
            ("\nCafe\u{301}" as NSString).length
        )
        XCTAssertEqual(
            ScreenplayPrintService.widowPullbackUTF16Length(in: prefix, prefersDialoguePair: true),
            ("\n👩🏽‍🚀\nCafe\u{301}" as NSString).length
        )
        XCTAssertEqual(ScreenplayPrintService.widowPullbackUTF16Length(in: "No break", prefersDialoguePair: true), 0)
    }

    func testPaginationCannotReturnSuccessWithoutProgressOrWithAnInvalidRange() throws {
        XCTAssertEqual(try ScreenplayPrintService.nextPageOffset(
            after: CFRange(location: 10, length: 5), currentOffset: 10, totalLength: 15
        ), 15)
        for range in [CFRange(location: 10, length: 0), CFRange(location: 9, length: 5), CFRange(location: 10, length: 6)] {
            XCTAssertThrowsError(try ScreenplayPrintService.nextPageOffset(after: range, currentOffset: 10, totalLength: 15)) {
                XCTAssertEqual($0 as? ScreenplayPrintService.PrintError, .paginationFailed)
            }
        }
    }

    #if os(iOS)
    func testPageLabelsAndContinuationBandsNeverOverlapDialogueOnLetterOrA4() throws {
        let lines = (1...180).map { String(format: "SpokenLine%04d.", $0) }
        let draft = (["INT. ROOM - DAY", "", "MAYA"] + lines).joined(separator: "\n")
        let regex = try NSRegularExpression(pattern: "SpokenLine[0-9]{4}")
        for paper in [ScreenplayPrintPaper.letter, .a4] {
            UserDefaults.standard.set(paper.rawValue, forKey: paperKey)
            let data = try ScreenplayPrintService.makePDF(draft: draft, title: "Page geometry")
            let document = try XCTUnwrap(PDFDocument(data: data))
            XCTAssertGreaterThan(document.pageCount, 1)
            var continuationCount = 0
            for index in 0..<document.pageCount {
                let page = try XCTUnwrap(document.page(at: index))
                let text = try XCTUnwrap(page.string)
                let source = text as NSString
                let markers = regex.matches(in: text, range: NSRange(location: 0, length: source.length)).map { source.substring(with: $0.range) }
                let body = try markers.map { try screenplayPDFTestTextBounds($0, in: page) }
                let highestBody = try XCTUnwrap(body.map(\.maxY).max())
                let lowestBody = try XCTUnwrap(body.map(\.minY).min())
                // Match the complete page-number line, not a numeric suffix in
                // the dialogue (for example the "1." in SpokenLine0161.).
                let header = try screenplayPDFTestTextBounds("\(index + 1).", in: page, wholeLine: true)
                XCTAssertGreaterThan(header.minY, highestBody + 4)
                XCTAssertGreaterThan(header.minX, page.bounds(for: .mediaBox).midX, "page numbers belong at the top-right")
                for (first, second) in zip(body, body.dropFirst()) {
                    XCTAssertGreaterThan(first.minY, second.maxY, "successive dialogue lines must descend without overlap")
                }
                if text.contains("MAYA (CONT'D)") {
                    continuationCount += 1
                    let cue = try screenplayPDFTestTextBounds("MAYA (CONT'D)", in: page)
                    XCTAssertGreaterThan(header.minY, cue.maxY + 4)
                    XCTAssertGreaterThan(cue.minY, highestBody + 4, "continuation requires its own space, never an overlay")
                }
                if text.contains("(MORE)") {
                    let footer = try screenplayPDFTestTextBounds("(MORE)", in: page)
                    XCTAssertLessThan(footer.maxY + 4, lowestBody, "MORE belongs below, not above or on top of the dialogue")
                }
            }
            XCTAssertGreaterThan(continuationCount, 0)
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "com.adobe.pdf")
            attachment.name = "print-\(paper.rawValue)-geometry.pdf"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    func testDraftBeyond250PagesFailsInsteadOfReturningATruncatedPDF() {
        let draft = (1...16_000).map { "She waits beside door \($0)." }.joined(separator: "\n") + "\nFINAL PAGE MUST NOT BE LOST."
        XCTAssertThrowsError(try ScreenplayPrintService.makePDF(draft: draft, title: "Long screenplay")) {
            XCTAssertEqual($0 as? ScreenplayPrintService.PrintError, .pageLimitExceeded(250))
            XCTAssertTrue($0.localizedDescription.contains("Nothing was sent to the printer"))
        }
    }

    func testUnicodePrefixDoesNotUseThePreviousSpeakerForLaterContinuation() throws {
        let prefix = Array(repeating: "She sees " + String(repeating: "🙂", count: 30) + " in the window.", count: 90)
        let firstSpeech = (1...60).map { "First speech number \($0)." }
        let secondSpeech = (1...100).map { "Second speech number \($0)." }
        let draft = (prefix + ["", "MAYA"] + firstSpeech + ["", "RORY"] + secondSpeech).joined(separator: "\n")
        let pdf = try ScreenplayPrintService.makePDF(draft: draft, title: "Unicode continuation")
        let document = try XCTUnwrap(PDFDocument(data: pdf))
        let pageTexts = (0..<document.pageCount).map { document.page(at: $0)?.string ?? "" }
        let continuation = try XCTUnwrap(pageTexts.first { $0.contains("Second speech number 50.") })

        XCTAssertTrue(continuation.contains("RORY (CONT'D)"), "the Unicode prefix must not clamp the lookup into Maya's earlier speech")
        XCTAssertFalse(continuation.contains("MAYA (CONT'D)"))
        XCTAssertTrue(pageTexts.joined().contains("Second speech number 100."), "the final dialogue must survive pagination")
        let attachment = XCTAttachment(data: pdf, uniformTypeIdentifier: "com.adobe.pdf")
        attachment.name = "print-unicode-continuation.pdf"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testCRLFAndLFRenderTheSameDialoguePagination() throws {
        let lf = Self.longDraft(dialogueLines: 120)
        let crlf = lf.replacingOccurrences(of: "\n", with: "\r\n")
        let normal = try XCTUnwrap(PDFDocument(data: ScreenplayPrintService.makePDF(draft: lf, title: "LF")))
        let windows = try XCTUnwrap(PDFDocument(data: ScreenplayPrintService.makePDF(draft: crlf, title: "CRLF")))
        XCTAssertEqual(normal.pageCount, windows.pageCount)
        for index in 0..<normal.pageCount {
            XCTAssertEqual(normal.page(at: index)?.string, windows.page(at: index)?.string)
        }
    }
    #endif

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

#if os(macOS)
@MainActor
final class ScreenplayPrintMacRenderingTests: XCTestCase {
    func testPrintAdapterDrawsEachRequestedPageInsteadOfBlankOrRepeatedPages() throws {
        let source = PDFDocument()
        for marker in ["FirstPageNeedle", "SecondPageNeedle"] {
            let data = try ScreenplayPrintService.makePDF(draft: "INT. ROOM - DAY\n\n\(marker).", title: marker)
            let document = try XCTUnwrap(PDFDocument(data: data))
            source.insert(try XCTUnwrap(document.page(at: 0)), at: source.pageCount)
        }
        let view = try XCTUnwrap(ScreenplayPrintServiceMac.PDFViewPrintAdapter(pdf: source))
        var range = NSRange(location: 0, length: 0)
        XCTAssertTrue(view.knowsPageRange(&range))
        XCTAssertEqual(range, NSRange(location: 1, length: 2))
        XCTAssertEqual(view.rectForPage(0), .zero)
        XCTAssertEqual(view.rectForPage(3), .zero)
        XCTAssertFalse(view.rectForPage(1).intersects(view.rectForPage(2)))

        for (page, marker, absent) in [(1, "FirstPageNeedle", "SecondPageNeedle"), (2, "SecondPageNeedle", "FirstPageNeedle")] {
            // AppKit invokes the same draw(_:) used by a print operation; this creates
            // only in-memory PDF data and never opens or contacts a printer.
            let rendered = view.dataWithPDF(inside: view.rectForPage(page))
            let output = try XCTUnwrap(PDFDocument(data: rendered))
            XCTAssertEqual(output.pageCount, 1)
            let text = output.string ?? ""
            XCTAssertTrue(text.contains(marker), "the real print drawing must contain this page's screenplay")
            XCTAssertFalse(text.contains(absent), "printing page two must not repeat or overlay page one")
            let renderedPage = try XCTUnwrap(output.page(at: 0))
            let headingBounds = try screenplayPDFTestTextBounds("INT. ROOM - DAY", in: renderedPage)
            let markerBounds = try screenplayPDFTestTextBounds(marker, in: renderedPage)
            XCTAssertGreaterThan(headingBounds.minY, renderedPage.bounds(for: .mediaBox).midY)
            XCTAssertGreaterThan(headingBounds.minY, markerBounds.maxY, "print adapter output must preserve top-to-bottom reading order")
            let attachment = XCTAttachment(data: rendered, uniformTypeIdentifier: "com.adobe.pdf")
            attachment.name = "mac-print-adapter-page-\(page).pdf"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    func testPrintAdapterHonorsRotatedMediaSizeAndDrawsItsContent() throws {
        let data = try ScreenplayPrintService.makePDF(draft: "EXT. ROAD - NIGHT\n\nRotatedPageNeedle.", title: "Rotated")
        let source = try XCTUnwrap(PDFDocument(data: data))
        let page = try XCTUnwrap(source.page(at: 0))
        let media = page.bounds(for: .mediaBox)
        page.rotation = 90
        // Match the production input: a PDF loaded from data, including its /Rotate.
        let rotatedData = try XCTUnwrap(source.dataRepresentation())
        let rotated = try XCTUnwrap(PDFDocument(data: rotatedData))
        let view = try XCTUnwrap(ScreenplayPrintServiceMac.PDFViewPrintAdapter(pdf: rotated))
        XCTAssertEqual(view.rectForPage(1).width, media.height)
        XCTAssertEqual(view.rectForPage(1).height, media.width)
        let rendered = view.dataWithPDF(inside: view.rectForPage(1))
        let output = try XCTUnwrap(PDFDocument(data: rendered))
        XCTAssertTrue(output.string?.contains("RotatedPageNeedle") == true)
        let outputPage = try XCTUnwrap(output.page(at: 0))
        let outputText = try XCTUnwrap(outputPage.string)
        let markerRange = (outputText as NSString).range(of: "RotatedPageNeedle")
        XCTAssertNotEqual(markerRange.location, NSNotFound)
        let selection = try XCTUnwrap(outputPage.selection(for: markerRange))
        let glyphBounds = selection.bounds(for: outputPage)
        XCTAssertGreaterThan(glyphBounds.height, glyphBounds.width, "rotated content must actually rotate, not merely fit a landscape sheet")
        let attachment = XCTAttachment(data: rendered, uniformTypeIdentifier: "com.adobe.pdf")
        attachment.name = "mac-print-adapter-rotated.pdf"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testPrintAdapterRejectsAnEmptyPDF() {
        XCTAssertNil(ScreenplayPrintServiceMac.PDFViewPrintAdapter(pdf: PDFDocument()))
    }
}
#endif

// PDFKit selections use page-space coordinates, so these assertions catch the
// reflected/overlapping output that plain PDF string extraction cannot detect.
func screenplayPDFTestTextBounds(_ marker: String, in page: PDFPage, wholeLine: Bool = false, file: StaticString = #filePath, line: UInt = #line) throws -> CGRect {
    let text = try XCTUnwrap(page.string, file: file, line: line)
    let source = text as NSString
    let range: NSRange
    if wholeLine {
        let pattern = "^" + NSRegularExpression.escapedPattern(for: marker) + "$"
        let regex = try NSRegularExpression(pattern: pattern, options: .anchorsMatchLines)
        range = regex.firstMatch(in: text, range: NSRange(location: 0, length: source.length))?.range
            ?? NSRange(location: NSNotFound, length: 0)
    } else {
        range = source.range(of: marker)
    }
    let found: NSRange = try XCTUnwrap(range.location == NSNotFound ? nil : range, "Missing PDF marker: \(marker)", file: file, line: line)
    let selection = try XCTUnwrap(page.selection(for: found), file: file, line: line)
    return selection.bounds(for: page)
}
