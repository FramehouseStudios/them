import Foundation

nonisolated struct ScreenplayExportMenuItem: Identifiable, Equatable {
    enum Source: Equatable {
        case backend
        case fallback
    }

    let format: String
    let title: String
    let fileExtension: String
    let mediaType: String
    let source: Source

    var id: String { format }
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
        fallbackItems: [ScreenplayExportMenuItem] = Self.fallbackItems
    ) -> [ScreenplayExportMenuItem] {
        var seen = Set<String>()
        var items: [ScreenplayExportMenuItem] = []

        for backendFormat in backendFormats where backendFormat.supported {
            let canonical = canonicalFormat(backendFormat.format)
            guard !canonical.isEmpty, !seen.contains(canonical) else { continue }
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
}
