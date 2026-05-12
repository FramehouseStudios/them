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
