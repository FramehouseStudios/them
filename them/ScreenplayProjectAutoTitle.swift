import Foundation
import ScreenplayStudio

/// Names a project that the app creates on the writer's behalf (a live draft
/// promoted to a Studio project). A screenplay's name is never its first line
/// of action; prefer what a writer would recognise as a title.
enum ScreenplayProjectAutoTitle {
    static let maxLength = 48

    static func title(for draft: String, pack: String, now: Date = Date()) -> String {
        let document = FountainTitlePageCodec.parse(draft)
        if let titled = cleanedTitle(document.titlePage?.title) { return titled }
        let lines = document.scriptPageText
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        if let fromHeading = lines.lazy.compactMap(sceneHeadingTitle).first { return fromHeading }

        let cleanPack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanPack.isEmpty {
            return clamp(cleanPack.replacingOccurrences(of: "_", with: " ").capitalized)
        }
        return "Studio Draft \(now.formatted(date: .abbreviated, time: .omitted))"
    }

    /// Fountain title page: `Title: The Long Night` (case-insensitive key).
    static func titlePageTitle(in lines: [String]) -> String? {
        cleanedTitle(FountainTitlePageCodec.parse(lines.joined(separator: "\n")).titlePage?.title)
    }

    private static func cleanedTitle(_ title: String?) -> String? {
        guard let title else { return nil }
        let clean = stripMarkup(title).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        // The short-label limit is for generated suggestions, not a writer's
        // chosen title. The existing server contract owns its storage limits.
        return clean.isEmpty ? nil : clean
    }

    /// `INT. KITCHEN - NIGHT` → "Kitchen at Night"; `EXT. PORCH` → "Porch".
    static func sceneHeadingTitle(_ line: String) -> String? {
        let upper = line.uppercased()
        let prefixes = ["INT./EXT.", "EXT./INT.", "INT/EXT.", "EXT/INT.", "I/E.", "INT.", "EXT.", "EST."]
        guard let prefix = prefixes.first(where: { upper.hasPrefix($0) }) else { return nil }
        var body = String(line.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
        var time = ""
        if let dash = body.range(of: " - ", options: .backwards) {
            time = String(body[dash.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
            body = String(body[..<dash.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        let place = titleCase(body)
        guard place.count >= 2 else { return nil }
        let timeWord = titleCase(time)
        let joined = timeWord.isEmpty ? place : "\(place) at \(timeWord)"
        return clamp(joined)
    }

    private static func stripMarkup(_ text: String) -> String {
        text.replacingOccurrences(of: "(?<![\\w\\\\])_([^_]+)_(?!\\w)", with: "$1", options: .regularExpression)
            .replacingOccurrences(of: "(?<!\\\\)\\*{1,3}([^*]+)\\*{1,3}", with: "$1", options: .regularExpression)
    }

    private static func titleCase(_ text: String) -> String {
        text.lowercased()
            .split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
            .joined(separator: " ")
    }

    private static func clamp(_ text: String) -> String {
        let squashed = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard squashed.count > maxLength else { return squashed }
        return String(squashed.prefix(maxLength)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
