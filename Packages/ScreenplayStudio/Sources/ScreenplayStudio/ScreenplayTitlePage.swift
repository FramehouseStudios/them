import Foundation

/// The script's title page, kept the Fountain way: `Key: value` lines at the
/// very top of the draft, ended by a blank line. Living in the draft means it
/// saves, syncs, versions and exports with the pages instead of in a side
/// store that can drift.
///
/// Only the known title-page keys count, and every line of the block must be
/// one of them (or an indented continuation), so a script that opens with
/// dialogue in colon form ("SAM: Hi.") is never mistaken for a title page.
public struct ScreenplayTitlePage: Equatable, Sendable {
    public var title: String
    public var credit: String
    public var author: String
    public var source: String
    public var draftDate: String
    public var contact: String

    public static let defaultCredit = "Written by"

    public init(
        title: String = "",
        credit: String = ScreenplayTitlePage.defaultCredit,
        author: String = "",
        source: String = "",
        draftDate: String = "",
        contact: String = ""
    ) {
        self.title = title
        self.credit = credit
        self.author = author
        self.source = source
        self.draftDate = draftDate
        self.contact = contact
    }

    /// Nothing a reader would see on the page. A credit alone is not a page.
    public var isEmpty: Bool {
        [title, author, source, draftDate, contact]
            .allSatisfy { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    public var fountainBlock: String {
        guard !isEmpty else { return "" }
        var lines: [String] = []
        func add(_ key: String, _ value: String) {
            let parts = value
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            guard let first = parts.first else { return }
            if parts.count == 1 {
                lines.append("\(key): \(first)")
            } else {
                // Fountain multi-line value: key alone, then indented lines.
                lines.append("\(key):")
                lines.append(contentsOf: parts.map { "    \($0)" })
            }
        }
        add("Title", title)
        add("Credit", author.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : credit)
        add("Author", author)
        add("Source", source)
        add("Draft date", draftDate)
        add("Contact", contact)
        return lines.joined(separator: "\n")
    }

    /// Title fields for the backend exporters (`{title, credit, author,
    /// source, draftDate, contact}`), empty values left out.
    public var exportFields: [String: String] {
        let fields = [
            "title": title, "credit": author.isEmpty ? "" : credit, "author": author,
            "source": source, "draftDate": draftDate, "contact": contact,
        ]
        return fields
            .mapValues { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.value.isEmpty }
    }

    private static func field(named name: String) -> WritableKeyPath<ScreenplayTitlePage, String>? {
        switch name {
        case "title": return \.title
        case "credit": return \.credit
        case "author", "authors": return \.author
        case "source": return \.source
        case "draft date", "date": return \.draftDate
        case "contact": return \.contact
        default: return nil
        }
    }

    /// Keys a Fountain title page may carry that this page does not edit.
    /// They still belong to the block, so they are kept, not read as script.
    private static let passThroughKeys: Set<String> = ["notes", "copyright", "revision"]

    /// Splits a draft into its title page (if it opens with one) and the
    /// script that follows. `block` is the title page text exactly as written.
    public static func split(_ draft: String) -> (titlePage: ScreenplayTitlePage?, block: String, body: String) {
        let normalized = draft.replacingOccurrences(of: "\r\n", with: "\n")
        var lines = normalized.components(separatedBy: "\n")
        while let first = lines.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
            lines.removeFirst()
        }
        guard let firstLine = lines.first, key(of: firstLine) != nil else {
            return (nil, "", draft)
        }

        var page = ScreenplayTitlePage(credit: "")
        var currentKey: WritableKeyPath<ScreenplayTitlePage, String>?
        var blockLength = 0
        for line in lines {
            if line.trimmingCharacters(in: .whitespaces).isEmpty { break }
            if let (name, value) = key(of: line) {
                currentKey = field(named: name)
                if let currentKey {
                    page[keyPath: currentKey] = value
                }
            } else if line.hasPrefix("\t") || line.hasPrefix("   ") {
                if let currentKey {
                    let continued = line.trimmingCharacters(in: .whitespaces)
                    let existing = page[keyPath: currentKey]
                    page[keyPath: currentKey] = existing.isEmpty ? continued : existing + "\n" + continued
                }
            } else {
                // A line that is neither a title key nor a continuation: this
                // was never a title page (e.g. "TITLE: card" then action).
                return (nil, "", draft)
            }
            blockLength += 1
        }

        let block = lines.prefix(blockLength).joined(separator: "\n")
        let body = lines.dropFirst(blockLength)
            .drop { $0.trimmingCharacters(in: .whitespaces).isEmpty }
            .joined(separator: "\n")
        return (page, block, body)
    }

    /// The draft with this title page in place of any existing one. An empty
    /// page removes the title page and leaves the script untouched.
    public static func applying(_ page: ScreenplayTitlePage, to draft: String) -> String {
        let body = split(draft).body.trimmingCharacters(in: .newlines)
        let block = page.fountainBlock
        guard !block.isEmpty else { return body }
        return body.isEmpty ? block + "\n\n" : block + "\n\n" + body
    }

    /// Runs `transform` on the script only, keeping the title page as written.
    public static func preservingTitlePage(in draft: String, _ transform: (String) -> String) -> String {
        let parts = split(draft)
        guard parts.titlePage != nil else { return transform(draft) }
        let body = transform(parts.body)
        return body.isEmpty ? parts.block : parts.block + "\n\n" + body
    }

    private static func key(of line: String) -> (String, String)? {
        guard !line.hasPrefix(" "), !line.hasPrefix("\t"),
              let colon = line.firstIndex(of: ":") else { return nil }
        let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
        guard field(named: name) != nil || passThroughKeys.contains(name) else { return nil }
        let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        return (name, value)
    }
}
