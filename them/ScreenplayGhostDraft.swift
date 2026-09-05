import Foundation
import ScreenplayStudio

/// Turns an in-flight partial transcript into the screenplay element it will most
/// likely become, so Studio can ink a faded "ghost" line before the utterance ends.
///
/// Pure and synchronous: it runs on every partial-transcript tick (80–140 ms), so it
/// must never touch the network or the model. Spoken slug fragments such as
/// "interior kitchen day" become `INT. KITCHEN - DAY`; a bare name such as "Jess"
/// becomes a centered character cue; everything else stays action.
enum ScreenplayGhostDraft {
    struct Preview: Equatable {
        let text: String
        let element: ScreenplayEditorElement
    }

    private static let sceneStarters: [String] = [
        "interior ", "exterior ", "inside ", "outside ",
        "int. ", "ext. ", "int ", "ext ", "int/ext ", "i/e ",
        "we open on ", "we open in ", "we're in ", "we are in ", "we cut to ",
        "scene ", "new scene ",
    ]

    private static let bareNameStopWords: Set<String> = [
        "I", "A", "An", "The", "And", "But", "Or", "So", "Then", "Okay", "Ok", "Yes", "No",
        "Interior", "Exterior", "Inside", "Outside", "Int", "Ext", "Cut", "Fade", "Scene",
        "Clementine", "Print", "Cancel", "Undo", "Redo", "Save", "Confirm",
    ]

    static func preview(fromPartial raw: String, knownCharacters: Set<String> = []) -> Preview? {
        let cleaned = raw
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return nil }

        let lower = cleaned.lowercased()
        let startsScene = sceneStarters.contains { lower.hasPrefix($0) } || lower == "interior" || lower == "exterior"
        guard startsScene else {
            return classify(cleaned, knownCharacters: knownCharacters)
        }

        let (slugPart, rest) = splitSlug(cleaned)
        let slug = FountainFormatter.normalizeEditorLine(slugPart, as: .sceneHeading)
            .components(separatedBy: .newlines)
            .first(where: { !$0.trimmingCharacters(in: .whitespaces).isEmpty })?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? slugPart.uppercased()

        guard let restPreview = classify(rest, knownCharacters: knownCharacters) else {
            return Preview(text: slug, element: .sceneHeading)
        }
        return Preview(text: slug + "\n" + restPreview.text, element: restPreview.element)
    }

    /// Character cues already on the page, uppercased, so a spoken "Jess" ghosts as a
    /// cue even when the recognizer lower-cases it. Memoized on the draft string because
    /// this is called on every partial tick.
    static func characterNames(in draft: String) -> Set<String> {
        if let cached = cachedCharacterNames, cached.draft == draft {
            return cached.names
        }
        var names: Set<String> = []
        for line in draft.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, ScreenplayEditorElement.looksLikeCharacterCue(trimmed) else { continue }
            let base = trimmed
                .replacingOccurrences(of: #"\s*\(.*\)\s*$"#, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            if !base.isEmpty { names.insert(base.uppercased()) }
        }
        cachedCharacterNames = (draft, names)
        return names
    }

    private static var cachedCharacterNames: (draft: String, names: Set<String>)?

    // MARK: - Helpers

    private static func splitSlug(_ text: String) -> (slug: String, rest: String) {
        // The slug ends at the first hard pause the speaker makes: a comma, period,
        // semicolon, or a spoken "and"/"then" after the time of day.
        if let range = text.range(of: #"[,.;:]\s*|\s+(?:and|then)\s+"#, options: .regularExpression) {
            let slug = String(text[..<range.lowerBound])
            let rest = String(text[range.upperBound...])
            return (slug.trimmingCharacters(in: .whitespaces), rest.trimmingCharacters(in: .whitespaces))
        }
        return (text, "")
    }

    private static func classify(_ text: String, knownCharacters: Set<String>) -> Preview? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let upper = trimmed.uppercased()

        if ScreenplayEditorElement.looksLikeSceneHeadingStart(trimmed) {
            return Preview(text: upper, element: .sceneHeading)
        }
        let transitionBody = upper.trimmingCharacters(in: CharacterSet(charactersIn: ".:"))
        if ["CUT TO", "FADE OUT", "FADE IN", "FADE TO BLACK", "SMASH CUT TO", "DISSOLVE TO", "MATCH CUT TO"]
            .contains(transitionBody) {
            let suffix = transitionBody == "FADE OUT" || transitionBody == "FADE TO BLACK" ? "." : ":"
            return Preview(text: transitionBody + suffix, element: .transition)
        }
        if trimmed.hasPrefix("(") {
            let body = trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "()")).lowercased()
            return Preview(text: "(" + body + ")", element: .parenthetical)
        }
        if isBareName(trimmed, knownCharacters: knownCharacters) {
            return Preview(text: upper, element: .character)
        }
        let action = trimmed.prefix(1).uppercased() + trimmed.dropFirst()
        return Preview(text: action, element: .action)
    }

    private static func isBareName(_ text: String, knownCharacters: Set<String>) -> Bool {
        let stripped = text.trimmingCharacters(in: CharacterSet(charactersIn: ".,!?"))
        if knownCharacters.contains(stripped.uppercased()) { return true }
        let words = stripped.split(separator: " ").map(String.init)
        guard (1...2).contains(words.count) else { return false }
        for word in words {
            guard let first = word.first, first.isUppercase else { return false }
            guard word.range(of: #"^[A-Za-z][A-Za-z'\-]*$"#, options: .regularExpression) != nil else { return false }
            if bareNameStopWords.contains(word) { return false }
        }
        return true
    }
}
