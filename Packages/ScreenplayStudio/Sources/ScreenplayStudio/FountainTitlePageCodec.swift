import Foundation

/// A standard Fountain title-page field that the Studio does not interpret itself.
/// Keeping these fields lets a writer round-trip metadata such as Source, Copyright,
/// or a production-specific field without losing it when a known field changes.
public struct FountainTitlePageAdditionalField: Equatable, Sendable {
    public var key: String
    public var values: [String]

    public init(key: String, values: [String]) {
        self.key = key
        self.values = values
    }
}

/// The title metadata understood by the Studio. The screenplay title is represented
/// once here and can be projected into a project record by higher-level code.
public struct FountainTitlePage: Equatable, Sendable {
    public static let provisionalTitle = "UNTITLED SCREENPLAY"

    public var title: String
    public var credit: String
    public var authors: [String]
    public var draftDate: String?
    public var contact: String?
    public var additionalFields: [FountainTitlePageAdditionalField]

    public init(
        title: String = FountainTitlePage.provisionalTitle,
        credit: String = "Written by",
        authors: [String] = [],
        draftDate: String? = nil,
        contact: String? = nil,
        additionalFields: [FountainTitlePageAdditionalField] = []
    ) {
        self.title = title
        self.credit = credit
        self.authors = authors
        self.draftDate = draftDate
        self.contact = contact
        self.additionalFields = additionalFields
    }
}

/// A lossless view of the screenplay portion of a Fountain document.
/// `screenplayBody` begins at the first script character, excluding only the title
/// page and the blank-line separator before the script.
public struct FountainDocumentParts: Equatable, Sendable {
    public let titlePage: FountainTitlePage?
    public let screenplayBody: String
    public let screenplayBodyStartLine: Int?
    public let lineEnding: String

    public var hasTitlePage: Bool { titlePage != nil }

    /// Text callers should paginate when a title page must not count as script page 1.
    public var scriptPageText: String { screenplayBody }
}

public enum FountainTitlePageCodecError: Error, Equatable, Sendable {
    case emptyFirstScene
    case screenplayBodyAlreadyPresent
}

/// Parses and materializes the leading metadata block defined by Fountain's title
/// page syntax. This type deliberately knows nothing about UI, persistence, or voice.
public enum FountainTitlePageCodec {
    /// Splits a document only when its first physical line is a `Title:` field.
    /// This conservative boundary prevents screenplay action containing a colon from
    /// being mistaken for metadata.
    public static func parse(_ document: String) -> FountainDocumentParts {
        let physicalLines = lines(in: document)
        let lineEnding = detectedLineEnding(in: physicalLines) ?? "\n"
        guard let first = physicalLines.first,
              let firstHeader = fieldHeader(in: first.content),
              canonicalKey(firstHeader.key) == "title" else {
            return FountainDocumentParts(
                titlePage: nil,
                screenplayBody: document,
                screenplayBodyStartLine: document.isEmpty ? nil : 1,
                lineEnding: lineEnding
            )
        }

        var fields: [ParsedField] = []
        var lineIndex = 0
        var bodyStart: String.Index?

        while lineIndex < physicalLines.count {
            if physicalLines[lineIndex].content.isEmpty {
                repeat {
                    lineIndex += 1
                } while lineIndex < physicalLines.count && physicalLines[lineIndex].content.isEmpty
                if lineIndex < physicalLines.count {
                    bodyStart = physicalLines[lineIndex].start
                }
                break
            }
            guard let header = fieldHeader(in: physicalLines[lineIndex].content) else {
                bodyStart = physicalLines[lineIndex].start
                break
            }

            let key = header.key
            var values: [String] = []
            if !header.inlineValue.isEmpty {
                values.append(header.inlineValue)
            }
            lineIndex += 1

            while lineIndex < physicalLines.count {
                let line = physicalLines[lineIndex]
                if isIndented(line.content) {
                    values.append(unindented(line.content))
                    lineIndex += 1
                    continue
                }
                break
            }
            fields.append(ParsedField(key: key, values: values))
        }

        let body: String
        if let bodyStart {
            body = String(document[bodyStart...])
        } else {
            body = ""
        }

        guard let parsedTitlePage = titlePage(from: fields) else {
            return FountainDocumentParts(
                titlePage: nil,
                screenplayBody: document,
                screenplayBodyStartLine: document.isEmpty ? nil : 1,
                lineEnding: lineEnding
            )
        }

        return FountainDocumentParts(
            titlePage: parsedTitlePage,
            screenplayBody: body,
            screenplayBodyStartLine: bodyStart.map { start in
                physicalLines.firstIndex(where: { $0.start == start }).map { $0 + 1 }
            } ?? nil,
            lineEnding: lineEnding
        )
    }

    /// Creates a title-page-only Fountain document. Blank titles intentionally become
    /// the visible provisional title instead of producing an invalid empty field.
    public static func materialize(
        _ titlePage: FountainTitlePage,
        lineEnding: String = "\n"
    ) -> String {
        let newline = safeLineEnding(lineEnding)
        let normalized = normalized(titlePage)
        var blocks: [String] = []
        blocks.append(block(key: "Title", values: [normalized.title], newline: newline))

        if !normalized.credit.isEmpty {
            blocks.append(block(key: "Credit", values: [normalized.credit], newline: newline))
        }
        if !normalized.authors.isEmpty {
            let key = normalized.authors.count == 1 ? "Author" : "Authors"
            blocks.append(block(key: key, values: normalized.authors, newline: newline))
        }
        if let draftDate = normalized.draftDate {
            blocks.append(block(key: "Draft date", values: valueLines(draftDate), newline: newline))
        }
        if let contact = normalized.contact {
            blocks.append(block(key: "Contact", values: valueLines(contact), newline: newline))
        }
        for field in normalized.additionalFields {
            blocks.append(block(key: field.key, values: field.values, newline: newline))
        }
        return blocks.joined(separator: newline)
    }

    /// Replaces the leading title metadata and preserves the screenplay body exactly.
    /// Unmodeled metadata already in the document is retained unless the replacement
    /// supplies a field with the same key.
    public static func updating(
        _ document: String,
        with replacement: FountainTitlePage
    ) -> String {
        let parts = parse(document)
        let metadata = retainingExistingAdditionalFields(
            replacement,
            existing: parts.titlePage?.additionalFields ?? []
        )
        let header = materialize(metadata, lineEnding: parts.lineEnding)
        guard !parts.screenplayBody.isEmpty else { return header }
        return header + parts.lineEnding + parts.lineEnding + parts.screenplayBody
    }

    /// Renames only the standard Title field while retaining every other parsed value.
    public static func renamingTitle(in document: String, to title: String) -> String {
        let parts = parse(document)
        var metadata = parts.titlePage ?? FountainTitlePage()
        metadata.title = title
        return updating(document, with: metadata)
    }

    /// Adds the first scene after a title page with exactly one blank line between the
    /// final metadata line and the first scene line. The scene itself is otherwise
    /// preserved, including Unicode and its trailing newline.
    public static func appendingFirstScene(
        _ scene: String,
        to document: String
    ) throws -> String {
        let parts = parse(document)
        guard parts.screenplayBody.isEmpty else {
            throw FountainTitlePageCodecError.screenplayBodyAlreadyPresent
        }
        let sceneWithoutLeadingLineBreaks = droppingLeadingLineBreaks(from: scene)
        guard !sceneWithoutLeadingLineBreaks.isEmpty else {
            throw FountainTitlePageCodecError.emptyFirstScene
        }

        let titlePage = parts.titlePage ?? FountainTitlePage()
        let header = materialize(titlePage, lineEnding: parts.lineEnding)
        return header + parts.lineEnding + parts.lineEnding + sceneWithoutLeadingLineBreaks
    }

    // MARK: - Parsing

    private struct PhysicalLine {
        let content: String
        let start: String.Index
        let terminator: String
    }

    private struct ParsedField {
        let key: String
        let values: [String]
    }

    private static func lines(in text: String) -> [PhysicalLine] {
        guard !text.isEmpty else { return [] }
        let source = text as NSString
        var result: [PhysicalLine] = []
        var location = 0

        while location < source.length {
            var lineStart = 0
            var lineEnd = 0
            var contentEnd = 0
            source.getLineStart(
                &lineStart,
                end: &lineEnd,
                contentsEnd: &contentEnd,
                for: NSRange(location: location, length: 0)
            )
            guard lineEnd > location else { break }
            let start = String.Index(utf16Offset: lineStart, in: text)
            let contentEndIndex = String.Index(utf16Offset: contentEnd, in: text)
            let end = String.Index(utf16Offset: lineEnd, in: text)
            result.append(PhysicalLine(
                content: String(text[start..<contentEndIndex]),
                start: start,
                terminator: String(text[contentEndIndex..<end])
            ))
            location = lineEnd
        }
        return result
    }

    private static func detectedLineEnding(in lines: [PhysicalLine]) -> String? {
        lines.lazy.map(\.terminator).first(where: { !$0.isEmpty })
    }

    private static func fieldHeader(in rawLine: String) -> (key: String, inlineValue: String)? {
        var line = rawLine
        if line.first == "\u{feff}" {
            line.removeFirst()
        }
        guard let first = line.first, !first.isWhitespace,
              let colon = line.firstIndex(of: ":") else { return nil }
        let rawKey = String(line[..<colon])
        let key = rawKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty, key == rawKey, key.count <= 64,
              key.unicodeScalars.allSatisfy(isAllowedKeyScalar) else { return nil }
        let valueStart = line.index(after: colon)
        let inlineValue = String(line[valueStart...])
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (key, inlineValue)
    }

    private static func isAllowedKeyScalar(_ scalar: UnicodeScalar) -> Bool {
        CharacterSet.alphanumerics.contains(scalar)
            || CharacterSet(charactersIn: " -_()/&.'").contains(scalar)
    }

    private static func isIndented(_ line: String) -> Bool {
        guard let first = line.first else { return false }
        return first == " " || first == "\t"
    }

    private static func unindented(_ line: String) -> String {
        String(line.drop(while: { $0 == " " || $0 == "\t" }))
            .trimmingCharacters(in: .whitespaces)
    }

    private static func titlePage(from fields: [ParsedField]) -> FountainTitlePage? {
        guard canonicalKey(fields.first?.key ?? "") == "title" else { return nil }
        var title = ""
        var credit = ""
        var authors: [String] = []
        var draftDate: String?
        var contact: String?
        var additionalFields: [FountainTitlePageAdditionalField] = []

        for field in fields {
            let values = field.values.filter { !$0.isEmpty }
            switch canonicalKey(field.key) {
            case "title":
                title = values.joined(separator: "\n")
            case "credit":
                credit = values.joined(separator: "\n")
            case "author", "authors":
                authors.append(contentsOf: values)
            case "draftdate":
                draftDate = optionalJoined(values)
            case "contact":
                contact = optionalJoined(values)
            default:
                additionalFields.append(.init(key: field.key, values: values))
            }
        }
        return FountainTitlePage(
            title: title,
            credit: credit,
            authors: authors,
            draftDate: draftDate,
            contact: contact,
            additionalFields: additionalFields
        )
    }

    // MARK: - Materialization

    private static func normalized(_ metadata: FountainTitlePage) -> FountainTitlePage {
        let title = clean(metadata.title) ?? FountainTitlePage.provisionalTitle
        let credit = clean(metadata.credit) ?? ""
        let authors = metadata.authors.compactMap(clean)
        let draftDate = clean(metadata.draftDate)
        let contact = clean(metadata.contact)
        let knownKeys = Set(["title", "credit", "author", "authors", "draftdate", "contact"])
        let additionalFields = metadata.additionalFields.compactMap { field -> FountainTitlePageAdditionalField? in
            guard let key = clean(field.key), !knownKeys.contains(canonicalKey(key)),
                  fieldHeader(in: key + ":") != nil else { return nil }
            return .init(key: key, values: field.values.compactMap(clean))
        }
        return FountainTitlePage(
            title: title,
            credit: credit,
            authors: authors,
            draftDate: draftDate,
            contact: contact,
            additionalFields: additionalFields
        )
    }

    private static func block(key: String, values: [String], newline: String) -> String {
        let cleanValues = values.flatMap(valueLines).compactMap(clean)
        guard !cleanValues.isEmpty else { return "\(key):" }
        return (["\(key):"] + cleanValues.map { "    \($0)" }).joined(separator: newline)
    }

    private static func valueLines(_ value: String) -> [String] {
        value
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
    }

    private static func retainingExistingAdditionalFields(
        _ replacement: FountainTitlePage,
        existing: [FountainTitlePageAdditionalField]
    ) -> FountainTitlePage {
        var result = replacement
        let replacementKeys = Set(replacement.additionalFields.map { canonicalKey($0.key) })
        result.additionalFields += existing.filter { !replacementKeys.contains(canonicalKey($0.key)) }
        return result
    }

    private static func droppingLeadingLineBreaks(from text: String) -> String {
        var result = text[...]
        while !result.isEmpty {
            if result.hasPrefix("\r\n") {
                result = result.dropFirst(2)
            } else if result.hasPrefix("\r") || result.hasPrefix("\n") {
                result = result.dropFirst()
            } else {
                break
            }
        }
        return String(result)
    }

    private static func safeLineEnding(_ candidate: String) -> String {
        candidate == "\r\n" || candidate == "\r" ? candidate : "\n"
    }

    private static func canonicalKey(_ key: String) -> String {
        key.lowercased().filter { $0.isLetter || $0.isNumber }
    }

    private static func optionalJoined(_ values: [String]) -> String? {
        clean(values.joined(separator: "\n"))
    }

    private static func clean(_ value: String?) -> String? {
        guard let value else { return nil }
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }
}
