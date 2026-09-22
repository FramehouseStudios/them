import Foundation

/// Decides when a spoken turn is about the script, without the exact-phrase
/// lists that used to gate it. Pattern families (question starters × story
/// nouns, verbs × script objects) plus context: a draft already in the room,
/// or recent turns that touched the script, keep her thinking like a
/// filmmaker across the small talk in between.
enum ScreenplayIntentClassifier {
    static let storyNouns: [String] = [
        "scene", "script", "screenplay", "story", "act one", "act two", "act three", "act 1", "act 2", "act 3",
        "first act", "second act", "third act", "opening act", "final act",
        "midpoint", "climax", "ending", "opening", "beat", "outline", "logline", "synopsis", "character",
        "protagonist", "antagonist", "dialogue", "line", "slugline", "page", "draft", "plot", "twist",
        "setup", "payoff", "theme", "arc", "sequence", "montage", "cold open", "final image", "first plot point",
        "inciting incident", "low point", "all is lost",
    ]

    static let helpStarters: [String] = [
        "what should", "what would", "what could", "what happens", "what comes next", "where does", "where should",
        "how do i", "how should i", "how would you", "how does", "should she", "should he", "should they",
        "is this", "does this", "any ideas", "give me an idea", "help me", "i'm stuck", "im stuck", "i am stuck",
        "not sure how", "don't know", "dont know", "what's missing", "whats missing", "what's wrong", "whats wrong",
        "not working", "feels flat", "feels slow", "feels off", "too long", "too slow", "notes on", "thoughts on",
        "talk to me about", "let's talk about", "lets talk about", "walk me through", "why does", "why doesn't",
    ]

    static let scriptVerbs: [String] = [
        "write", "writing", "draft", "drafting", "outline", "outlining", "revise", "rewrite", "rewriting",
        "edit", "editing", "polish", "finish", "build", "develop", "brainstorm", "pitch", "fix", "cut", "punch up", "tighten",
    ]

    static let characterCues: [String] = [
        " want ", " wants ", " need ", " needs ", "backstory", "motivat", "why does she", "why does he", "why do they", " arc ", "flaw", "wound",
        "hiding", "secret", "inner life", "the kind of person", "feels flat", "feels thin", "one-note", "one note",
    ]

    private static func normalize(_ text: String) -> String {
        " " + text.lowercased()
            .replacingOccurrences(of: "\u{2019}", with: "'")
            .replacingOccurrences(of: "[^a-z0-9' ]+", with: " ", options: .regularExpression)
            .split(separator: " ").joined(separator: " ") + " "
    }

    /// Does the text mention the script at all?
    static func mentionsScript(_ text: String) -> Bool {
        let t = normalize(text)
        return storyNouns.contains { t.contains(" \($0) ") || t.contains(" \($0)s ") }
    }

    /// A story-help question: a help starter and a story noun in the same breath,
    /// or a script verb with a script object.
    static func asksForStoryHelp(_ text: String) -> Bool {
        let t = normalize(text)
        let nouns = storyNouns.contains { t.contains(" \($0) ") || t.contains(" \($0)s ") }
        guard nouns else { return false }
        let starters = helpStarters.contains { t.contains(" \($0) ") || t.contains(" \($0)") }
        let verbs = scriptVerbs.contains { t.contains(" \($0) ") }
        return starters || verbs
    }

    /// The writer is asking about a character, not just mentioning one.
    static func asksAboutCharacter(_ text: String) -> Bool {
        let t = normalize(text)
        guard t.contains(" character ") || t.contains(" protagonist ") || t.contains(" antagonist ")
            || t.contains(" she ") || t.contains(" he ") || t.contains(" they ") else { return false }
        return characterCues.contains { t.contains($0) }
    }

    /// The writer read a line and wants it judged: notes on it, does it work,
    /// is it on the nose, or "she says:" followed by the line.
    static func asksForDialogueNotes(_ text: String) -> Bool {
        let t = normalize(text)
        let lineWords = [" line ", " lines ", " exchange ", " dialogue ", " speech ", " monologue ", " confession ", " apology "]
        let mentionsLine = lineWords.contains { t.contains($0) }
        let noteCues = [" notes on ", " note on ", " thoughts on ", " feedback on ", " opinion on ", " take on ", " does this ", " is this ", " on the nose ", " read this ", " check this ", " look at this ", " hear this ", " here's my ", " here is my ", " this is my ", " try this "]
        if mentionsLine, noteCues.contains(where: { t.contains($0) }) { return true }
        // "She says: ..." with a quoted or colon-introduced line.
        if text.range(of: #"\b(she|he|they|[A-Z][a-z]+) says:"#, options: .regularExpression) != nil { return true }
        return t.contains(" on the nose ")
    }

    /// Keep filmmaker mode on when the script is already in the room or the
    /// conversation has been about it, and the new turn touches story at all.
    static func shouldStayInFilmmakerMode(
        text: String,
        recentTurns: [(user: String, assistant: String)],
        hasScriptInRoom: Bool
    ) -> Bool {
        if asksForStoryHelp(text) { return true }
        let recentScriptTalk = recentTurns.suffix(3).contains { mentionsScript($0.user) || mentionsScript($0.assistant) }
        guard hasScriptInRoom || recentScriptTalk else { return false }
        return mentionsScript(text) || asksAboutCharacter(text)
    }
}
