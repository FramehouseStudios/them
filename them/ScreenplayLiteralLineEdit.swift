import Foundation
import ScreenplayStudio

struct ScreenplayLiteralLineEdit: Equatable {
    enum Target: Equatable {
        case last
        case selected
        case quoted(String)
        case speakerLine(page: Int?, ordinal: Int?, name: String)
    }

    struct Change: Equatable {
        let line: Int
        let originalDraft: String
        let revisedDraft: String
        let saveAfterEdit: Bool

        var hasTextChange: Bool { !stillApplies(to: revisedDraft) }

        func stillApplies(to draft: String) -> Bool {
            originalDraft.utf8.elementsEqual(draft.utf8)
        }
    }

    struct Prepared: Equatable {
        private enum Source: Equatable {
            case resolved(Change)
            case addressed(ScreenplayLiteralLineEdit, draft: String)
        }

        private let source: Source
        let projectID: String
        let authContext: ScreenplayStudioAuthContext

        init(change: Change, projectID: String, authContext: ScreenplayStudioAuthContext) {
            source = .resolved(change)
            self.projectID = projectID
            self.authContext = authContext
        }

        init(edit: ScreenplayLiteralLineEdit, draft: String, projectID: String, authContext: ScreenplayStudioAuthContext) {
            source = .addressed(edit, draft: draft)
            self.projectID = projectID
            self.authContext = authContext
        }

        var confirmation: String {
            switch source {
            case .resolved(let change):
                change.hasTextChange ? "I'll change just that line." : "That line already matches."
            case .addressed:
                "I'll check that page for the requested line."
            }
        }

        func stillApplies(to draft: String) -> Bool {
            switch source {
            case .resolved(let change): change.stillApplies(to: draft)
            case .addressed(_, let original): original.utf8.elementsEqual(draft.utf8)
            }
        }

        func resolve(
            in draft: String, paragraphs: [ScreenplayDraftParagraphSnapshot], linesPerPage: Int
        ) -> Change? {
            guard stillApplies(to: draft) else { return nil }
            switch source {
            case .resolved(let change): return change
            case .addressed(let edit, _):
                return edit.addressedChange(in: draft, paragraphs: paragraphs, linesPerPage: linesPerPage)
            }
        }
    }

    let target: Target
    let replacement: String
    let saveAfterEdit: Bool

    // "Rewrite ... with more tension" remains a creative request. Only
    // these explicit literal constructions carry writer-supplied text.
    private static let command = try! NSRegularExpression(
        pattern: #"^(?:please\s+)?(replace|change|rewrite)\s+(?:the\s+)?(last\s+line|selected\s+line|this\s+line|line\s+["“'‘].+?["”'’])\s+(with|to\s+say|to)\b\s*([\s\S]*)$"#,
        options: .caseInsensitive
    )

    static func parse(_ raw: String) -> Self? {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let addressed = parseAddressedCommand(text) { return addressed }
        let ns = text as NSString
        guard let match = command.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else {
            return nil
        }

        let verb = ns.substring(with: match.range(at: 1)).lowercased()
        let separator = ns.substring(with: match.range(at: 3)).lowercased()
        guard verb == "replace" && separator == "with"
            || verb == "change" && separator == "to"
            || verb == "rewrite" && separator.hasSuffix("say") else { return nil }

        let reference = ns.substring(with: match.range(at: 2))
        let target: Target
        if reference.lowercased().hasPrefix("line") {
            let quoted = reference.drop(while: { !$0.isWhitespace })
            guard let line = unquoted(quoted.trimmingCharacters(in: .whitespaces)) else { return nil }
            target = .quoted(line)
        } else {
            target = reference.lowercased().hasPrefix("last") ? .last : .selected
        }

        return literalEdit(target: target, replacement: ns.substring(with: match.range(at: 4)))
    }

    private static func literalEdit(target: Target, replacement: String) -> Self {
        if let suffix = replacement.range(of: #"\s+and\s+save[.!?]?$"#, options: [.caseInsensitive, .regularExpression]),
           let words = unquoted(String(replacement[..<suffix.lowerBound])) {
            return Self(target: target, replacement: words, saveAfterEdit: true)
        }
        return Self(target: target, replacement: unquoted(replacement) ?? replacement, saveAfterEdit: false)
    }

    // A page address is required. A creative "rewrite ... with more tension"
    // still follows Studio's creative path.
    private static let addressedCommand = try! NSRegularExpression(
        pattern: #"^(?:(?:please|i want to)\s+)*(?:on\s+page\s+([\p{L}0-9 -]+?),?\s+)?(replace|change|rewrite)\s+(?:(?:the\s+)?([\p{L}0-9-]+)\s+line\s+by\s+([\p{L}0-9 .’'&-]+?)|([\p{L}0-9 .’'&-]+?)[’']s\s+([\p{L}0-9-]+)\s+line)(?:\s+on\s+page\s+([\p{L}0-9 -]+?))?\s+(with|to\s+say|to)\b\s*([\s\S]*)$"#,
        options: .caseInsensitive
    )

    private static func parseAddressedCommand(_ text: String) -> Self? {
        let ns = text as NSString
        guard let match = addressedCommand.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)) else {
            return nil
        }
        func group(_ index: Int) -> String? {
            let range = match.range(at: index)
            return range.location == NSNotFound ? nil : ns.substring(with: range)
        }
        let firstPage = group(1)
        let lastPage = group(7)
        guard let spokenPage = firstPage ?? lastPage, let speaker = group(4) ?? group(5),
              let spokenOrdinal = group(3) ?? group(6) else { return nil }
        switch (group(2)?.lowercased(), group(8)?.lowercased()) {
        case ("replace", "with"), ("change", "to"), ("change", "to say"), ("rewrite", "to say"): break
        default: return nil
        }
        let target = Target.speakerLine(
            page: firstPage != nil && lastPage != nil ? nil : pageNumber(spokenPage),
            ordinal: ordinalNumber(spokenOrdinal), name: speaker
        )
        let replacement = group(9) ?? ""
        if let suffix = replacement.range(of: #"(?<=[.!?])\s+then\s+save[.!?]?$"#, options: [.caseInsensitive, .regularExpression]) {
            let words = String(replacement[..<suffix.lowerBound])
            return Self(target: target, replacement: unquoted(words) ?? words, saveAfterEdit: true)
        }
        return literalEdit(target: target, replacement: replacement)
    }

    private static let cardinalWords = [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
    ]
    private static let tensWords = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

    private static func pageNumber(_ value: String) -> Int? {
        if let number = Int(value.trimmingCharacters(in: .whitespaces)) { return number }
        let words = value.lowercased().split(whereSeparator: { $0.isWhitespace || $0 == "-" }).map(String.init)
        if let hundred = words.first, words.count >= 2, words[1] == "hundred",
           let multiplier = cardinalWords.firstIndex(of: hundred == "a" ? "one" : hundred),
           (1...9).contains(multiplier) {
            let rest = words.dropFirst(2)
            if rest.isEmpty { return multiplier * 100 }
            let remainder = rest.first == "and" ? rest.dropFirst() : rest
            return numberBelowHundred(remainder).map { multiplier * 100 + $0 }
        }
        return numberBelowHundred(words[...])
    }

    private static func numberBelowHundred(_ words: ArraySlice<String>) -> Int? {
        guard let first = words.first else { return nil }
        if words.count == 1, let number = cardinalWords.firstIndex(of: first) { return number }
        guard let tens = tensWords.firstIndex(of: first) else { return nil }
        if words.count == 1 { return (tens + 2) * 10 }
        guard words.count == 2, let last = words.last,
              let units = cardinalWords.firstIndex(of: last), (1...9).contains(units) else { return nil }
        return (tens + 2) * 10 + units
    }

    private static func ordinalNumber(_ value: String) -> Int? {
        let word = value.lowercased()
        let ordinals = [
            "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
            "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
            "eighteenth", "nineteenth", "twentieth",
        ]
        if let ordinal = ordinals.firstIndex(of: word) { return ordinal + 1 }
        if let number = Int(word) { return number }
        guard let suffix = word.range(of: #"(st|nd|rd|th)$"#, options: .regularExpression),
              let number = Int(word[..<suffix.lowerBound]), number > 0 else { return nil }
        let expected = (11...13).contains(number % 100) ? "th" : [1: "st", 2: "nd", 3: "rd"][number % 10] ?? "th"
        return word[suffix] == expected ? number : nil
    }

    func prepare(
        in draft: String, selectedLine: Int?, projectID: String, authContext: ScreenplayStudioAuthContext
    ) -> Prepared? {
        if case .speakerLine = target {
            return Prepared(edit: self, draft: draft, projectID: projectID, authContext: authContext)
        }
        return change(in: draft, selectedLine: selectedLine).map {
            Prepared(change: $0, projectID: projectID, authContext: authContext)
        }
    }

    private static let pageTrimWhitespace = CharacterSet(charactersIn:
        "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}"
    ).union(CharacterSet(charactersIn: "\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}"))

    // Studio Pages counts LF rows after trimming the document and normalizing CRLF.
    // The editor snapshot also counts the empty component between CR and LF.
    private func addressedChange(
        in draft: String, paragraphs: [ScreenplayDraftParagraphSnapshot], linesPerPage: Int
    ) -> Change? {
        guard case let .speakerLine(page?, ordinal?, name) = target, page > 0, ordinal > 0,
              (24...120).contains(linesPerPage), ordinal <= linesPerPage,
              let speaker = Self.cueName(name), hasValidReplacement else { return nil }
        let rows = draft.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "\n" || $0 == "\r\n" })
        guard let first = rows.firstIndex(where: { !$0.trimmingCharacters(in: Self.pageTrimWhitespace).isEmpty }),
              let last = rows.lastIndex(where: { !$0.trimmingCharacters(in: Self.pageTrimWhitespace).isEmpty }),
              page <= (last - first) / linesPerPage + 1 else { return nil }
        let start = first + (page - 1) * linesPerPage
        let end = min(start + linesPerPage - 1, last)
        var nativeIndex = 0
        var activeSpeaker: String?
        var count = 0
        for rowIndex in 0...end {
            let row = rows[rowIndex]
            guard !row.contains(where: \.isNewline), paragraphs.indices.contains(nativeIndex) else { return nil }
            let paragraph = paragraphs[nativeIndex]
            let trimmed = row.trimmingCharacters(in: .whitespacesAndNewlines)
            guard paragraph.line == nativeIndex + 1, paragraph.text.utf8.elementsEqual(trimmed.utf8) else { return nil }
            switch paragraph.element {
            case .character:
                activeSpeaker = Self.cueName(trimmed)
            case .parenthetical:
                break
            case .dialogue where !trimmed.isEmpty:
                if rowIndex >= start, activeSpeaker == speaker {
                    count += 1
                    if count == ordinal, let range = contentRange(of: row, in: draft) {
                        return change(in: draft, line: paragraph.line, range: range)
                    }
                }
            default:
                activeSpeaker = nil
            }
            nativeIndex += row.endIndex < draft.endIndex && draft[row.endIndex] == "\r\n" ? 2 : 1
        }
        return nil
    }

    private static func cueName(_ value: String) -> String? {
        let name = value.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "’", with: "'")
            .uppercased()
        return ScreenplayRenderedCharacterMentionExtractor.normalizedCharacterName(
            fromCueLine: name.hasPrefix("@") ? String(name.dropFirst()) : name
        )
    }

    private static let quoteClosers: [Character: Character] = ["\"": "\"", "“": "”", "'": "'", "‘": "’"]

    private static func unquoted(_ text: String) -> String? {
        guard let opening = text.first, let closing = quoteClosers[opening] else { return nil }
        var body = text.dropFirst()
        if let punctuation = body.last, ".!?".contains(punctuation) {
            body = body.dropLast()
        }
        guard body.last == closing else { return nil }
        return String(body.dropLast())
    }

    private var hasValidReplacement: Bool {
        !replacement.trimmingCharacters(in: .whitespaces).isEmpty && !replacement.contains(where: \.isNewline)
    }

    private func contentRange(of row: Substring, in draft: String) -> Range<String.Index>? {
        guard let first = row.firstIndex(where: { !$0.isWhitespace }),
              let last = row.lastIndex(where: { !$0.isWhitespace }) else { return nil }
        return first..<draft.index(after: last)
    }

    func change(in draft: String, selectedLine: Int?) -> Change? {
        guard hasValidReplacement else { return nil }
        var matches: [(line: Int, range: Range<String.Index>)] = []
        var start = draft.startIndex
        var line = 1
        while start < draft.endIndex {
            let end = draft[start...].firstIndex(where: \.isNewline) ?? draft.endIndex
            let original = draft[start..<end]
            if let range = contentRange(of: original, in: draft),
               matchesTarget(line: line, text: draft[range], selectedLine: selectedLine) {
                matches.append((line, range))
            }
            start = end == draft.endIndex ? end : draft.index(after: end)
            line += 1
        }
        let match: (line: Int, range: Range<String.Index>)?
        switch target {
        case .last: match = matches.last
        case .selected, .quoted: match = matches.count == 1 ? matches.first : nil
        case .speakerLine: match = nil
        }
        return match.map { change(in: draft, line: $0.line, range: $0.range) }
    }

    private func change(in draft: String, line: Int, range: Range<String.Index>) -> Change {
        var revised = draft
        revised.replaceSubrange(range, with: replacement)
        return Change(line: line, originalDraft: draft, revisedDraft: revised, saveAfterEdit: saveAfterEdit)
    }

    private func matchesTarget(line: Int, text: Substring, selectedLine: Int?) -> Bool {
        switch target {
        case .last: return true
        case .selected: return line == selectedLine
        case .quoted(let quote): return String(text).caseInsensitiveCompare(quote) == .orderedSame
        case .speakerLine: return false
        }
    }
}
