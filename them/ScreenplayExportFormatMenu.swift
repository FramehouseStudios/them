import Foundation

nonisolated struct ScreenplayExportMenuItem: Identifiable, Equatable {
    enum Source: Equatable {
        case backend
        case fallback
        case unavailable
    }

    let format: String
    let title: String
    let fileExtension: String
    let mediaType: String
    let source: Source
    let isEnabled: Bool
    let note: String?

    var id: String { format }

    init(
        format: String,
        title: String,
        fileExtension: String,
        mediaType: String,
        source: Source,
        isEnabled: Bool = true,
        note: String? = nil
    ) {
        self.format = format
        self.title = title
        self.fileExtension = fileExtension
        self.mediaType = mediaType
        self.source = source
        self.isEnabled = isEnabled
        self.note = note
    }
}

nonisolated enum ScreenplayExportFormatMenu {
    static let fallbackItems: [ScreenplayExportMenuItem] = [
        ScreenplayExportMenuItem(
            format: "fdx",
            title: "Export FDX",
            fileExtension: "fdx",
            mediaType: "application/vnd.final-draft",
            source: .fallback
        ),
        ScreenplayExportMenuItem(
            format: "md",
            title: "Export Markdown",
            fileExtension: "md",
            mediaType: "text/markdown; charset=utf-8",
            source: .fallback
        ),
        ScreenplayExportMenuItem(
            format: "pdf",
            title: "Export PDF",
            fileExtension: "pdf",
            mediaType: "application/pdf",
            source: .fallback
        ),
    ]

    static func items(
        from backendFormats: [BackendScreenplayExportFormat],
        fallbackItems: [ScreenplayExportMenuItem] = Self.fallbackItems,
        localPDFSupported: Bool = true
    ) -> [ScreenplayExportMenuItem] {
        var seen = Set<String>()
        var unsupportedByBackend: [String: BackendScreenplayExportFormat] = [:]
        var items: [ScreenplayExportMenuItem] = []

        for backendFormat in backendFormats {
            let canonical = canonicalFormat(backendFormat.format)
            guard !canonical.isEmpty else { continue }
            if !backendFormat.supported {
                unsupportedByBackend[canonical] = backendFormat
                continue
            }
            guard !seen.contains(canonical) else { continue }
            seen.insert(canonical)
            items.append(
                ScreenplayExportMenuItem(
                    format: canonical,
                    title: title(for: canonical),
                    fileExtension: backendFormat.fileExtension,
                    mediaType: backendFormat.mediaType,
                    source: .backend
                )
            )
        }

        for fallback in fallbackItems where !seen.contains(fallback.format) {
            seen.insert(fallback.format)
            if fallback.format == "pdf", !localPDFSupported {
                items.append(unavailablePDFItem(from: unsupportedByBackend["pdf"]))
                continue
            }
            items.append(fallback)
        }

        return items.sorted { lhs, rhs in
            let lhsRank = preferredOrder[lhs.format] ?? Int.max
            let rhsRank = preferredOrder[rhs.format] ?? Int.max
            if lhsRank != rhsRank { return lhsRank < rhsRank }
            return lhs.title < rhs.title
        }
    }

    private static let preferredOrder: [String: Int] = [
        "fountain": 0,
        "fdx": 1,
        "md": 2,
        "pdf": 3,
    ]

    private static func canonicalFormat(_ format: String) -> String {
        switch format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "markdown":
            return "md"
        case "txt":
            return "fountain"
        default:
            return format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
    }

    private static func title(for format: String) -> String {
        switch format {
        case "fountain":
            return "Export Fountain"
        case "fdx":
            return "Export FDX"
        case "md":
            return "Export Markdown"
        case "pdf":
            return "Export PDF"
        default:
            return "Export \(format.uppercased())"
        }
    }

    private static func unavailablePDFItem(
        from backendFormat: BackendScreenplayExportFormat?
    ) -> ScreenplayExportMenuItem {
        let backendNote = backendFormat?.description.trimmingCharacters(in: .whitespacesAndNewlines)
        return ScreenplayExportMenuItem(
            format: "pdf",
            title: "PDF unavailable - use FDX or Markdown",
            fileExtension: "pdf",
            mediaType: "application/pdf",
            source: .unavailable,
            isEnabled: false,
            note: backendNote?.isEmpty == false ? backendNote : pdfAlternativeText
        )
    }

    static let pdfAlternativeText =
        "PDF export is not available from this backend. Export FDX for Final Draft, Markdown for Google Docs, or open Google Docs and save as PDF."

    static func pdfUnavailableText(
        from backendFormats: [BackendScreenplayExportFormat],
        localPDFSupported: Bool
    ) -> String {
        guard !localPDFSupported else { return "" }
        let pdfFormat = backendFormats.first { canonicalFormat($0.format) == "pdf" }
        guard pdfFormat?.supported != true else { return "" }
        return pdfAlternativeText
    }

    static func displayMessage(for error: Error, format: String) -> String {
        let requestedFormat = canonicalFormat(format)
        let raw = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        guard requestedFormat == "pdf" else { return raw }
        let lowercased = raw.lowercased()
        if lowercased.contains("pdf_export_not_supported_locally")
            || lowercased.contains("pdf export is not implemented")
            || lowercased.contains("pdf export is not available") {
            return pdfAlternativeText
        }
        return raw
    }
}
