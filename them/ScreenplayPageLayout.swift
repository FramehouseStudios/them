import Foundation

/// Local mirror of the backend `POST /screenplay/paginate` rules so the Studio
/// home page can show printed pages while the writer types, without a round
/// trip: normalize CRLF, trim the whole draft, split on newlines, and cut
/// every `linesPerPage` lines (55 = one screenplay page ≈ one screen minute).
/// Keep this in step with `backend/lib/screenplay_companion_routes.js`.
struct ScreenplayPageLayout {
    struct Page: Identifiable, Hashable {
        let number: Int
        let startLine: Int
        let endLine: Int
        let lines: [String]

        var id: Int { number }
        var lineCount: Int { lines.count }

        var backendPage: BackendScreenplayPaginationPage {
            BackendScreenplayPaginationPage(
                page: number,
                startLine: startLine,
                endLine: endLine,
                lineCount: lineCount,
                preview: nil,
                estMinutes: nil
            )
        }
    }

    static let defaultLinesPerPage = 55
    static let minimumLinesPerPage = 24
    static let maximumLinesPerPage = 120

    static func paginate(_ draft: String, linesPerPage requested: Int = defaultLinesPerPage) -> [Page] {
        let linesPerPage = min(max(requested, minimumLinesPerPage), maximumLinesPerPage)
        let normalized = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return [] }
        let lines = normalized.components(separatedBy: "\n")
        var pages: [Page] = []
        pages.reserveCapacity((lines.count + linesPerPage - 1) / linesPerPage)
        var cursor = 0
        while cursor < lines.count {
            let end = min(cursor + linesPerPage, lines.count)
            pages.append(
                Page(
                    number: pages.count + 1,
                    startLine: cursor + 1,
                    endLine: end,
                    lines: Array(lines[cursor..<end])
                )
            )
            cursor = end
        }
        return pages
    }

    static func pageCount(for draft: String, linesPerPage: Int = defaultLinesPerPage) -> Int {
        paginate(draft, linesPerPage: linesPerPage).count
    }

    /// Screen-time estimate at one page per minute, like the backend's est_minutes.
    static func estimatedMinutes(lineCount: Int, linesPerPage: Int = defaultLinesPerPage) -> Double {
        guard lineCount > 0 else { return 0 }
        return Double(lineCount) / Double(max(1, linesPerPage))
    }

    /// One-line summary for the Studio chip and the overview header.
    static func summaryText(pageCount: Int) -> String {
        switch pageCount {
        case 0: return "No pages yet"
        case 1: return "1 page"
        default: return "\(pageCount) pages"
        }
    }

    /// Which page the cursor line (1-based) sits on, or nil when off the page list.
    static func pageNumber(containingLine line: Int, in pages: [Page]) -> Int? {
        pages.first { line >= $0.startLine && line <= $0.endLine }?.number
    }
}

extension ScreenplayPageLayout {
    /// Coarse Fountain element read used only to indent lines on the printed
    /// page cards. Editing and export use the real formatter; this just has to
    /// look like a script page at a glance.
    enum LineKind: Equatable {
        case blank
        case sceneHeading
        case action
        case character
        case parenthetical
        case dialogue
        case transition
    }

    static func classify(_ lines: [String]) -> [LineKind] {
        var kinds: [LineKind] = []
        kinds.reserveCapacity(lines.count)
        var inDialogue = false
        for (index, rawLine) in lines.enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty {
                kinds.append(.blank)
                inDialogue = false
                continue
            }
            let upper = line.uppercased()
            if isSceneHeading(upper) {
                kinds.append(.sceneHeading)
                inDialogue = false
                continue
            }
            if isTransition(upper, original: line) {
                kinds.append(.transition)
                inDialogue = false
                continue
            }
            if inDialogue {
                kinds.append(line.hasPrefix("(") ? .parenthetical : .dialogue)
                continue
            }
            let previousBlank = index == 0 || lines[index - 1].trimmingCharacters(in: .whitespaces).isEmpty
            let nextExists = index + 1 < lines.count
                && !lines[index + 1].trimmingCharacters(in: .whitespaces).isEmpty
            if previousBlank, nextExists, isCharacterCue(line) {
                kinds.append(.character)
                inDialogue = true
                continue
            }
            kinds.append(.action)
        }
        return kinds
    }

    private static func isSceneHeading(_ upper: String) -> Bool {
        let prefixes = ["INT.", "EXT.", "INT ", "EXT ", "INT/EXT", "EXT/INT", "I/E.", "I/E ", "EST."]
        return prefixes.contains { upper.hasPrefix($0) }
    }

    private static func isTransition(_ upper: String, original: String) -> Bool {
        if upper.hasSuffix(" TO:") || upper == "CUT TO:" || upper == "FADE OUT." || upper == "FADE OUT:" {
            return original == upper
        }
        return upper.hasPrefix("FADE IN") && original == upper
    }

    private static func isCharacterCue(_ line: String) -> Bool {
        guard line.count <= 40, line == line.uppercased() else { return false }
        guard line.rangeOfCharacter(from: .letters) != nil else { return false }
        return !line.hasSuffix(".") || line.hasSuffix(")")
    }
}
