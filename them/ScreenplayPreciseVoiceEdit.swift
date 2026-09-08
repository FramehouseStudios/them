import CryptoKit
import Foundation

nonisolated struct ScreenplayPreciseEditIntent: Equatable, Sendable {
    let transactionID: UUID
    let page: Int
    let dialogueOrdinal: Int
    let character: String
    let replacementText: String
    let saveRequested: Bool
}

nonisolated enum ScreenplayPreciseEditCommandParser {
    enum ParseError: Error, Equatable {
        case unsupportedCommand
        case invalidPage
        case invalidOrdinal
        case missingCharacter
        case missingReplacement
    }

    static func parse(
        _ command: String,
        transactionID: UUID = UUID()
    ) -> Result<ScreenplayPreciseEditIntent, ParseError> {
        let text = command.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return .failure(.unsupportedCommand) }

        let actionPattern = #"(?i)^\s*(.+?)\s*[,;:]?\s*(?:change|replace)(?:\s+it)?\s+with\s+(.+)$"#
        guard let actionRegex = try? NSRegularExpression(pattern: actionPattern),
              let actionMatch = actionRegex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              actionMatch.range.location != NSNotFound,
              let locationRange = Range(actionMatch.range(at: 1), in: text),
              let replacementRange = Range(actionMatch.range(at: 2), in: text) else {
            return .failure(.unsupportedCommand)
        }
        let location = String(text[locationRange])
        guard let pagePrefix = location.range(of: #"(?i)^\s*page\s+"#, options: .regularExpression) else {
            return .failure(.unsupportedCommand)
        }
        let pageAndTarget = String(location[pagePrefix.upperBound...])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let address = parsedAddress(pageAndTarget) else { return .failure(.invalidOrdinal) }
        guard address.page > 0 else { return .failure(.invalidPage) }
        guard address.ordinal > 0 else { return .failure(.invalidOrdinal) }
        let character = normalizedCharacter(address.character)
        guard !character.isEmpty else { return .failure(.missingCharacter) }

        guard let replacement = parsedReplacement(String(text[replacementRange])), !replacement.text.isEmpty else {
            return .failure(.missingReplacement)
        }

        return .success(
            ScreenplayPreciseEditIntent(
                transactionID: transactionID,
                page: address.page,
                dialogueOrdinal: address.ordinal,
                character: character,
                replacementText: replacement.text,
                saveRequested: replacement.saveRequested
            )
        )
    }

    private static func parsedAddress(_ raw: String) -> (page: Int, ordinal: Int, character: String)? {
        if let separator = raw.firstIndex(where: { $0 == "," || $0 == ";" || $0 == ":" }) {
            let pageText = String(raw[..<separator])
            let targetText = String(raw[raw.index(after: separator)...])
            guard let page = spokenNumber(pageText), let target = parsedTarget(targetText) else { return nil }
            return (page, target.ordinal, target.character)
        }

        let words = raw.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard words.count >= 3 else { return nil }
        for split in 1..<words.count {
            let pageText = words[..<split].joined(separator: " ")
            let targetText = words[split...].joined(separator: " ")
            if let page = spokenNumber(pageText), let target = parsedTarget(targetText) {
                return (page, target.ordinal, target.character)
            }
        }
        return nil
    }

    private static func parsedTarget(_ raw: String) -> (ordinal: Int, character: String)? {
        let target = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"(?i)^the\s+"#, with: "", options: .regularExpression)
        let patterns = [
            #"(?i)^(.+?)\s+line\s+(?:by|from)\s+(.+?)\s*$"#,
            #"(?i)^(.+?)\s+(.+?)['’]s\s+(?:line|dialogue)\s*$"#
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: target, range: NSRange(target.startIndex..., in: target)),
                  let ordinalRange = Range(match.range(at: 1), in: target),
                  let characterRange = Range(match.range(at: 2), in: target),
                  let ordinal = spokenOrdinal(String(target[ordinalRange])) else { continue }
            return (ordinal, String(target[characterRange]))
        }

        guard let lineRange = target.range(of: #"(?i)\s+(?:line|dialogue)\s*$"#, options: .regularExpression) else {
            return nil
        }
        let ordinalAndCharacter = String(target[..<lineRange.lowerBound])
        let words = ordinalAndCharacter.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard words.count >= 2 else { return nil }
        for split in stride(from: words.count - 1, through: 1, by: -1) {
            let ordinalText = words[..<split].joined(separator: " ")
            if let ordinal = spokenOrdinal(ordinalText) {
                return (ordinal, words[split...].joined(separator: " "))
            }
        }
        return nil
    }

    private static func parsedReplacement(_ raw: String) -> (text: String, saveRequested: Bool)? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }

        let quotePairs: [Character: Character] = ["\"": "\"", "“": "”", "'": "'"]
        if let opener = value.first, let closer = quotePairs[opener] {
            let contentStart = value.index(after: value.startIndex)
            guard let closeIndex = value[contentStart...].lastIndex(of: closer) else { return nil }
            let replacement = String(value[contentStart..<closeIndex])
            let suffix = value[value.index(after: closeIndex)...]
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .trimmingCharacters(in: CharacterSet(charactersIn: "."))
            guard suffix.isEmpty || suffix.range(of: #"(?i)^and\s+save(?:\s+(?:it|the\s+draft))?$"#, options: .regularExpression) != nil else {
                return nil
            }
            return (replacement, !suffix.isEmpty)
        }

        let savePattern = #"(?i)\s+and\s+save(?:\s+(?:it|the\s+draft))?\s*[.]?$"#
        if let range = value.range(of: savePattern, options: .regularExpression) {
            return (String(value[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines), true)
        }
        return (value, false)
    }

    private static func normalizedCharacter(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"(?i)^the\s+character\s+"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .uppercased()
    }

    private static func spokenOrdinal(_ raw: String) -> Int? {
        let normalized = normalizedNumberText(raw)
        if let numeric = normalized.range(of: #"^\d+(?:st|nd|rd|th)?$"#, options: .regularExpression) {
            return Int(normalized[numeric].replacingOccurrences(of: #"(?:st|nd|rd|th)$"#, with: "", options: .regularExpression))
        }

        let direct: [String: Int] = [
            "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
            "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
            "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
            "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18,
            "nineteenth": 19, "twentieth": 20, "thirtieth": 30, "fortieth": 40,
            "fiftieth": 50, "sixtieth": 60, "seventieth": 70, "eightieth": 80,
            "ninetieth": 90, "hundredth": 100
        ]
        if let value = direct[normalized] { return value }

        let pieces = normalized.split(separator: " ").map(String.init)
        guard let last = pieces.last, let final = direct[last], final < 20, pieces.count > 1,
              let prefix = spokenNumber(pieces.dropLast().joined(separator: " ")) else { return nil }
        return prefix + final
    }

    private static func spokenNumber(_ raw: String) -> Int? {
        let normalized = normalizedNumberText(raw)
        if let value = Int(normalized), value > 0 { return value }

        let units: [String: Int] = [
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
            "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19
        ]
        let tens: [String: Int] = [
            "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
            "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
        ]
        var total = 0
        var current = 0
        for word in normalized.split(separator: " ").map(String.init) {
            if word == "and" { continue }
            if let value = units[word] { current += value }
            else if let value = tens[word] { current += value }
            else if word == "hundred", current > 0 { current *= 100 }
            else if word == "thousand", current > 0 { total += current * 1_000; current = 0 }
            else { return nil }
        }
        let value = total + current
        return value > 0 ? value : nil
    }

    private static func normalizedNumberText(_ raw: String) -> String {
        raw.lowercased()
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

nonisolated struct ScreenplayPreciseEditDocumentSnapshot: Equatable, Sendable {
    static let spokenLinesPerPage = 55

    struct Line: Equatable, Sendable {
        let number: Int
        let text: String
        let contentRange: NSRange
    }

    struct Page: Equatable, Sendable {
        let number: Int
        let startLine: Int
        let endLine: Int
    }

    let projectID: String
    let baseVersionID: String
    let draft: String
    let draftHash: String
    let revision: UInt64
    let lines: [Line]
    let pages: [Page]

    init(projectID: String, baseVersionID: String, draft: String, revision: UInt64) {
        let indexedLines = Self.indexedLines(in: draft)
        self.projectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.baseVersionID = baseVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.draft = draft
        self.draftHash = ScreenplayPreciseEditHash.sha256(draft)
        self.revision = revision
        self.lines = indexedLines
        self.pages = stride(from: 0, to: indexedLines.count, by: Self.spokenLinesPerPage)
            .enumerated()
            .map { pageIndex, startIndex in
                Page(
                    number: pageIndex + 1,
                    startLine: startIndex + 1,
                    endLine: min(startIndex + Self.spokenLinesPerPage, indexedLines.count)
                )
            }
    }

    func page(number: Int) -> Page? {
        pages.first(where: { $0.number == number })
    }

    private static func indexedLines(in draft: String) -> [Line] {
        let source = draft as NSString
        guard source.length > 0 else { return [Line(number: 1, text: "", contentRange: NSRange(location: 0, length: 0))] }
        var result: [Line] = []
        var cursor = 0
        while cursor < source.length {
            let fullRange = source.lineRange(for: NSRange(location: cursor, length: 0))
            var contentLength = fullRange.length
            while contentLength > 0 {
                let character = source.character(at: fullRange.location + contentLength - 1)
                guard character == 10 || character == 13 else { break }
                contentLength -= 1
            }
            let contentRange = NSRange(location: fullRange.location, length: contentLength)
            result.append(Line(number: result.count + 1, text: source.substring(with: contentRange), contentRange: contentRange))
            cursor = NSMaxRange(fullRange)
        }
        if let last = draft.unicodeScalars.last, last == "\n" || last == "\r" {
            result.append(Line(number: result.count + 1, text: "", contentRange: NSRange(location: source.length, length: 0)))
        }
        return result
    }
}

nonisolated struct ScreenplayPreciseEditAnchor: Equatable, Sendable {
    let transactionID: UUID
    let snapshotDraftHash: String
    let snapshotRevision: UInt64
    let page: Int
    let character: String
    let dialogueOrdinal: Int
    let cueLine: Int
    let startLine: Int
    let endLine: Int
    let replacementRange: NSRange
    let expectedOldText: String
    let expectedTargetHash: String
    let replacementText: String
    let saveRequested: Bool
}

nonisolated enum ScreenplayPreciseEditResolution: Equatable, Sendable {
    case resolved(ScreenplayPreciseEditAnchor)
    case notFound
    case ambiguous(candidateRanges: [NSRange])
}

nonisolated enum ScreenplayPreciseEditResolver {
    private struct DialogueBlock {
        let character: String
        let cueLine: Int
        let startLine: Int
        let endLine: Int
        let range: NSRange
        let oldText: String
        let identityHash: String
    }

    static func resolve(
        _ intent: ScreenplayPreciseEditIntent,
        in snapshot: ScreenplayPreciseEditDocumentSnapshot
    ) -> ScreenplayPreciseEditResolution {
        guard let page = snapshot.page(number: intent.page) else { return .notFound }
        let blocks = dialogueBlocks(in: page, snapshot: snapshot)
            .filter { $0.character == intent.character }
        guard intent.dialogueOrdinal <= blocks.count else { return .notFound }
        let selected = blocks[intent.dialogueOrdinal - 1]
        let collisions = blocks.filter { $0.identityHash == selected.identityHash }
        guard collisions.count == 1 else {
            return .ambiguous(candidateRanges: collisions.map(\.range))
        }
        return .resolved(
            ScreenplayPreciseEditAnchor(
                transactionID: intent.transactionID,
                snapshotDraftHash: snapshot.draftHash,
                snapshotRevision: snapshot.revision,
                page: intent.page,
                character: intent.character,
                dialogueOrdinal: intent.dialogueOrdinal,
                cueLine: selected.cueLine,
                startLine: selected.startLine,
                endLine: selected.endLine,
                replacementRange: selected.range,
                expectedOldText: selected.oldText,
                expectedTargetHash: selected.identityHash,
                replacementText: intent.replacementText,
                saveRequested: intent.saveRequested
            )
        )
    }

    private static func dialogueBlocks(
        in page: ScreenplayPreciseEditDocumentSnapshot.Page,
        snapshot: ScreenplayPreciseEditDocumentSnapshot
    ) -> [DialogueBlock] {
        let pageLines = Array(snapshot.lines[(page.startLine - 1)..<page.endLine])
        var blocks: [DialogueBlock] = []
        var index = 0
        while index < pageLines.count {
            let cue = pageLines[index]
            let followsBlankLine = index == 0 || pageLines[index - 1].text.trimmingCharacters(in: .whitespaces).isEmpty
            guard followsBlankLine, let character = normalizedCue(cue.text) else { index += 1; continue }
            var cursor = index + 1
            while cursor < pageLines.count, isParenthetical(pageLines[cursor].text) { cursor += 1 }
            let dialogueStart = cursor
            while cursor < pageLines.count {
                let text = pageLines[cursor].text.trimmingCharacters(in: .whitespaces)
                if text.isEmpty || isStructuralLine(text) { break }
                cursor += 1
            }
            guard cursor > dialogueStart else { index += 1; continue }

            let first = pageLines[dialogueStart]
            let last = pageLines[cursor - 1]
            let range = NSRange(location: first.contentRange.location, length: NSMaxRange(last.contentRange) - first.contentRange.location)
            let oldText = (snapshot.draft as NSString).substring(with: range)
            let parentheticals = pageLines[(index + 1)..<dialogueStart].map(\.text).joined(separator: "\n")
            let identity = [character, parentheticals, oldText].joined(separator: "\u{1F}")
            blocks.append(
                DialogueBlock(
                    character: character,
                    cueLine: cue.number,
                    startLine: first.number,
                    endLine: last.number,
                    range: range,
                    oldText: oldText,
                    identityHash: ScreenplayPreciseEditHash.sha256(identity)
                )
            )
            index = cursor
        }
        return blocks
    }

    private static func normalizedCue(_ raw: String) -> String? {
        var cue = raw.trimmingCharacters(in: .whitespaces)
        guard !cue.isEmpty else { return nil }
        if cue.hasPrefix("@") { cue.removeFirst() }
        if cue.hasSuffix("^") { cue.removeLast() }
        cue = cue.replacingOccurrences(of: #"\s*\([^)]*\)\s*$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard !cue.isEmpty, cue == cue.uppercased(), cue.count <= 64 else { return nil }
        let upper = cue.uppercased()
        guard !isStructuralLine(upper), !upper.hasSuffix(" TO:") else { return nil }
        return upper.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    private static func isParenthetical(_ raw: String) -> Bool {
        let text = raw.trimmingCharacters(in: .whitespaces)
        return text.hasPrefix("(") && text.hasSuffix(")")
    }

    private static func isStructuralLine(_ text: String) -> Bool {
        let upper = text.uppercased()
        return upper.hasPrefix("INT.") || upper.hasPrefix("EXT.") || upper.hasPrefix("INT/EXT.") ||
            upper.hasPrefix("I/E.") || upper.hasPrefix(".") || upper.hasPrefix("#") ||
            upper.hasPrefix(">") || upper.hasPrefix("=") || upper.hasPrefix("~")
    }
}

nonisolated private enum ScreenplayPreciseEditHash {
    static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
