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
        /// Rendered lines as they would print: wrapped to the element width,
        /// with space-before blanks, (MORE) and CUE (CONT'D) where a speech splits.
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

    /// US Letter, 1-inch top and bottom margins, 12-point lines.
    static let defaultLinesPerPage = 54
    static let minimumLinesPerPage = 24
    static let maximumLinesPerPage = 120

    /// Final Draft indents at 10.33 characters per inch.
    static func charsPerLine(_ kind: LineKind) -> Int {
        switch kind {
        case .sceneHeading, .action, .blank: return 62
        case .character: return 41
        case .dialogue: return 36
        case .parenthetical: return 26
        case .transition: return 21
        }
    }

    /// Blank lines before a block; nothing at the top of a page.
    static func spaceBefore(_ kind: LineKind) -> Int {
        switch kind {
        case .sceneHeading: return 2
        case .action, .character, .transition: return 1
        case .dialogue, .parenthetical, .blank: return 0
        }
    }

    /// Greedy monospace word wrap; a word longer than the width is cut at it.
    static func wrap(_ text: String, width: Int) -> [String] {
        let clean = text.trimmingCharacters(in: .whitespaces)
        guard !clean.isEmpty else { return [""] }
        var out: [String] = []
        var current = ""
        for word in clean.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init) {
            var piece = word
            while piece.count > width {
                if !current.isEmpty { out.append(current); current = "" }
                out.append(String(piece.prefix(width)))
                piece = String(piece.dropFirst(width))
            }
            if current.isEmpty {
                current = piece
            } else if current.count + 1 + piece.count <= width {
                current += " " + piece
            } else {
                out.append(current)
                current = piece
            }
        }
        if !current.isEmpty { out.append(current) }
        return out.isEmpty ? [""] : out
    }

    private struct Piece {
        let text: String
        let sourceLine: Int
    }

    private struct Block {
        let kind: LineKind
        let cue: String
        let pieces: [Piece]
    }

    private static func buildBlocks(lines: [String], kinds: [LineKind]) -> [Block] {
        var blocks: [Block] = []
        var index = 0
        while index < lines.count {
            if kinds[index] == .blank { index += 1; continue }
            let start = index
            var pieces: [Piece] = []
            while index < lines.count, kinds[index] != .blank {
                for text in wrap(lines[index], width: charsPerLine(kinds[index])) {
                    pieces.append(Piece(text: text, sourceLine: index + 1))
                }
                index += 1
            }
            let cue = kinds[start] == .character ? lines[start].trimmingCharacters(in: .whitespaces) : ""
            blocks.append(Block(kind: kinds[start], cue: cue, pieces: pieces))
        }
        return blocks
    }

    /// Mirrors backend/lib/screenplay_pagination.js line for line; both are
    /// pinned to docs/pagination/fixtures.json.
    static func paginate(_ draft: String, linesPerPage requested: Int = defaultLinesPerPage) -> [Page] {
        let linesPerPage = min(max(requested, minimumLinesPerPage), maximumLinesPerPage)
        let normalized = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return [] }
        let lines = normalized.components(separatedBy: "\n")
        let kinds = classify(lines)
        let blocks = buildBlocks(lines: lines, kinds: kinds)

        var pages: [Page] = []
        var currentLines: [String] = []
        var currentSources: [Int] = []
        func closePage() {
            pages.append(Page(
                number: pages.count + 1,
                startLine: currentSources.min() ?? 0,
                endLine: currentSources.max() ?? 0,
                lines: currentLines
            ))
            currentLines = []
            currentSources = []
        }
        func place(_ piece: Piece) {
            currentLines.append(piece.text)
            if piece.sourceLine > 0 { currentSources.append(piece.sourceLine) }
        }
        func placeBlanks(_ n: Int) {
            for _ in 0..<max(0, n) { currentLines.append("") }
        }
        func blockNeed(_ block: Block, atTop: Bool) -> Int {
            (atTop ? 0 : spaceBefore(block.kind)) + block.pieces.count
        }

        for (b, block) in blocks.enumerated() {
            let atTop = currentLines.isEmpty
            let sb = atTop ? 0 : spaceBefore(block.kind)
            var need = sb + block.pieces.count
            if block.kind == .sceneHeading, b + 1 < blocks.count {
                need += blockNeed(blocks[b + 1], atTop: false)
            }
            let remaining = linesPerPage - currentLines.count

            if !atTop, need > remaining {
                let isSpeech = block.kind == .character && block.pieces.count >= 5
                let fit = remaining - sb - 1
                if isSpeech, fit >= 3, block.pieces.count - fit >= 2 {
                    placeBlanks(sb)
                    for piece in block.pieces.prefix(fit) { place(piece) }
                    currentLines.append("(MORE)")
                    closePage()
                    place(Piece(text: "\(block.cue) (CONT'D)", sourceLine: block.pieces[0].sourceLine))
                    for piece in block.pieces.dropFirst(fit) { place(piece) }
                    continue
                }
                closePage()
            }

            var pieces = block.pieces
            if currentLines.isEmpty, pieces.count > linesPerPage {
                while pieces.count > linesPerPage {
                    for piece in pieces.prefix(linesPerPage) { place(piece) }
                    closePage()
                    pieces = Array(pieces.dropFirst(linesPerPage))
                }
                for piece in pieces { place(piece) }
                continue
            }
            if !currentLines.isEmpty {
                let sbNow = spaceBefore(block.kind)
                if currentLines.count + sbNow + pieces.count > linesPerPage {
                    closePage()
                } else {
                    placeBlanks(sbNow)
                }
            }
            if currentLines.isEmpty, pieces.count > linesPerPage {
                while pieces.count > linesPerPage {
                    for piece in pieces.prefix(linesPerPage) { place(piece) }
                    closePage()
                    pieces = Array(pieces.dropFirst(linesPerPage))
                }
            }
            for piece in pieces { place(piece) }
        }
        if !currentLines.isEmpty || pages.isEmpty { closePage() }
        return pages
    }

    static func pageCount(for draft: String, linesPerPage: Int = defaultLinesPerPage) -> Int {
        paginate(draft, linesPerPage: linesPerPage).count
    }

    /// Screen-time estimate at one page per minute, from rendered lines.
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
