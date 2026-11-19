import Foundation

struct ScreenplayLiteralLineEdit: Equatable {
    enum Target: Equatable {
        case last
        case selected
        case quoted(String)
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
        let change: Change
        let projectID: String
        let authContext: ScreenplayStudioAuthContext
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

        let replacement = ns.substring(with: match.range(at: 4))
        if let suffix = replacement.range(of: #"\s+and\s+save[.!?]?$"#, options: [.caseInsensitive, .regularExpression]),
           let words = unquoted(String(replacement[..<suffix.lowerBound])) {
            return Self(target: target, replacement: words, saveAfterEdit: true)
        }
        return Self(target: target, replacement: unquoted(replacement) ?? replacement, saveAfterEdit: false)
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

    func change(in draft: String, selectedLine: Int?) -> Change? {
        guard !replacement.trimmingCharacters(in: .whitespaces).isEmpty,
              !replacement.contains(where: \.isNewline) else { return nil }
        var matches: [(line: Int, range: Range<String.Index>)] = []
        var start = draft.startIndex
        var line = 1
        while start < draft.endIndex {
            let end = draft[start...].firstIndex(where: \.isNewline) ?? draft.endIndex
            let original = draft[start..<end]
            if let first = original.firstIndex(where: { !$0.isWhitespace }),
               let last = original.lastIndex(where: { !$0.isWhitespace }),
               matchesTarget(line: line, text: original[first...last], selectedLine: selectedLine) {
                matches.append((line, first..<draft.index(after: last)))
            }
            start = end == draft.endIndex ? end : draft.index(after: end)
            line += 1
        }
        let match: (line: Int, range: Range<String.Index>)?
        switch target {
        case .last: match = matches.last
        case .selected, .quoted: match = matches.count == 1 ? matches.first : nil
        }
        guard let match else { return nil }
        var revised = draft
        revised.replaceSubrange(match.range, with: replacement)
        return Change(line: match.line, originalDraft: draft, revisedDraft: revised, saveAfterEdit: saveAfterEdit)
    }

    private func matchesTarget(line: Int, text: Substring, selectedLine: Int?) -> Bool {
        switch target {
        case .last: return true
        case .selected: return line == selectedLine
        case .quoted(let quote): return String(text).caseInsensitiveCompare(quote) == .orderedSame
        }
    }
}
