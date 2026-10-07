import XCTest
import PDFKit
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

    func testLocalFDXExportHonorsFountainForceMarkersWithoutLeakingThem() throws {
        let artifact = try ScreenplayLocalExport.makeArtifact(
            draft: ".INT. STAGE - NIGHT\n!THE LIGHTS FAIL.\n@McCLANE\nYippee-ki-yay.\n>FADE OUT.",
            title: "Markers",
            format: "fdx"
        )
        let xml = try XCTUnwrap(String(data: artifact.data, encoding: .utf8))

        XCTAssertTrue(xml.contains("<Paragraph Type=\"Scene Heading\"><Text>INT. STAGE - NIGHT</Text>"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Action\"><Text>THE LIGHTS FAIL.</Text>"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Character\"><Text>McCLANE</Text>"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Dialogue\"><Text>Yippee-ki-yay.</Text>"))
        XCTAssertTrue(xml.contains("<Paragraph Type=\"Transition\"><Text>FADE OUT.</Text>"))
        XCTAssertFalse(xml.contains("<Text>!"))
        XCTAssertFalse(xml.contains("<Text>@"))
        XCTAssertFalse(xml.contains("<Text>.INT."))
        XCTAssertFalse(xml.contains("<Text>>"))
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
