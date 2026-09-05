import Foundation

/// Turns a `TODO: clarify …` line left in the draft into a question the writer can
/// answer, plus the line it lives on so the Studio pill can jump straight to it.
///
/// The model (or the writer) leaves such a line when the story was too vague to
/// commit a beat, e.g. `TODO: clarify [Jess's want]`. Pure and synchronous; it runs
/// on every draft change.
enum ScreenplayClarifyNudge {
    struct Nudge: Equatable {
        let question: String
        /// 1-based line number of the TODO line in the draft.
        let line: Int
    }

    static let marker = "TODO: clarify"

    private static let fallbackQuestion = "Can you clarify the story a bit more?"
    private static let leadingFunctionWords: Set<String> = [
        "what", "why", "how", "who", "whom", "where", "when", "whether", "which", "the", "if", "that",
    ]

    static func nudge(in draft: String) -> Nudge? {
        let lines = draft.components(separatedBy: .newlines)
        for (index, raw) in lines.enumerated() {
            guard let range = raw.range(of: marker, options: .caseInsensitive) else { continue }
            let rest = String(raw[range.upperBound...])
            return Nudge(question: question(from: rest), line: index + 1)
        }
        return nil
    }

    static func question(from rest: String) -> String {
        let edges = CharacterSet(charactersIn: "[](){}:;,.!?-–— \t")
        let subject = rest
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: edges)
        guard !subject.isEmpty else { return fallbackQuestion }
        let words = subject.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true)
        var phrase = subject
        if let first = words.first, leadingFunctionWords.contains(first.lowercased()) {
            phrase = first.lowercased() + subject.dropFirst(first.count)
        }
        return "Can you clarify \(phrase)?"
    }
}
