import Foundation
import ScreenplayStudio

/// Names a project that the app creates on the writer's behalf (a live draft
/// promoted to a Studio project). A screenplay's name is never its first line
/// of action; prefer what a writer would recognise as a title.
nonisolated enum ScreenplayProjectAutoTitle {
    static let maxLength = 48

    static func title(for draft: String, pack: String, now: Date = Date()) -> String {
        let document = FountainTitlePageCodec.parse(draft)
        if let titled = displayTitle(document.titlePage) { return titled }
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

    /// Use the document codec's leading title-page boundary, never scan action.
    static func titlePageTitle(in lines: [String]) -> String? {
        displayTitle(FountainTitlePageCodec.parse(lines.joined(separator: "\n")).titlePage)
    }

    private static func displayTitle(_ titlePage: FountainTitlePage?) -> String? {
        guard let titlePage else { return nil }
        let cleaned = clamp(stripMarkup(titlePage.title))
        return cleaned.isEmpty ? nil : cleaned
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
        text.replacingOccurrences(of: "[*_]+", with: "", options: .regularExpression)
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
