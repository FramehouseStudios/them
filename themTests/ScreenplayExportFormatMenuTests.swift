import XCTest
@testable import them

final class ScreenplayExportFormatMenuTests: XCTestCase {
    func testMenuUsesSupportedBackendFormatsAndFiltersAliases() {
        let backendFormats = [
            makeFormat("markdown", ext: "md", supported: true),
            makeFormat("fountain", ext: "fountain", supported: true),
            makeFormat("txt", ext: "fountain", supported: true),
            makeFormat("pdf", ext: "pdf", supported: false),
            makeFormat("fdx", ext: "fdx", supported: true),
        ]

        let items = ScreenplayExportFormatMenu.items(from: backendFormats)

        XCTAssertEqual(items.map(\.format), ["fountain", "fdx", "md", "pdf"])
        XCTAssertEqual(items.first(where: { $0.format == "fountain" })?.source, .backend)
        XCTAssertEqual(items.first(where: { $0.format == "md" })?.source, .backend)
        XCTAssertEqual(items.first(where: { $0.format == "pdf" })?.source, .fallback)
    }

    func testMenuFallsBackWhenBackendFormatsAreEmpty() {
        let items = ScreenplayExportFormatMenu.items(from: [])

        XCTAssertEqual(items.map(\.format), ["fdx", "md", "pdf"])
        XCTAssertTrue(items.allSatisfy { $0.source == .fallback })
    }

    func testMenuTurnsUnsupportedBackendPDFIntoDisabledAlternativeWhenNoLocalPDF() throws {
        let backendFormats = [
            makeFormat("fdx", ext: "fdx", supported: true),
            makeFormat("pdf", ext: "pdf", supported: false),
        ]

        let items = ScreenplayExportFormatMenu.items(
            from: backendFormats,
            localPDFSupported: false
        )

        XCTAssertEqual(items.map(\.format), ["fdx", "md", "pdf"])
        let fdx = try XCTUnwrap(items.first { $0.format == "fdx" })
        XCTAssertEqual(fdx.source, .backend)
        XCTAssertEqual(fdx.isEnabled, true)
        let pdf = try XCTUnwrap(items.first { $0.format == "pdf" })
        XCTAssertEqual(pdf.source, .unavailable)
        XCTAssertEqual(pdf.isEnabled, false)
        XCTAssertTrue(pdf.title.contains("PDF unavailable"))
    }

    func testPDFUnavailableStatusHonorsBackendSupportedPDF() {
        XCTAssertEqual(
            ScreenplayExportFormatMenu.pdfUnavailableText(
                from: [makeFormat("pdf", ext: "pdf", supported: true)],
                localPDFSupported: false
            ),
            ""
        )
        XCTAssertTrue(
            ScreenplayExportFormatMenu.pdfUnavailableText(
                from: [makeFormat("pdf", ext: "pdf", supported: false)],
                localPDFSupported: false
            )
            .contains("Export FDX")
        )
    }

    func testPDFBackendErrorDisplaysAlternativesInsteadOfRawCode() {
        let error = BackendMemoryAPIError.server(
            status: 400,
            message: "screenplay_export: pdf_export_not_supported_locally"
        )

        let message = ScreenplayExportFormatMenu.displayMessage(for: error, format: "pdf")

        XCTAssertFalse(message.contains("pdf_export_not_supported_locally"))
        XCTAssertTrue(message.contains("Export FDX"))
        XCTAssertEqual(
            ScreenplayExportFormatMenu.displayMessage(for: error, format: "fdx"),
            error.localizedDescription
        )
    }

    private func makeFormat(
        _ format: String,
        ext fileExtension: String,
        supported: Bool
    ) -> BackendScreenplayExportFormat {
        BackendScreenplayExportFormat(
            format: format,
            fileExtension: fileExtension,
            mediaType: "text/plain; charset=utf-8",
            description: "\(format) description",
            supported: supported
        )
    }
}
