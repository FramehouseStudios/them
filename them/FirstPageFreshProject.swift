import Foundation

/// "Start your first page" is a new story. On an account that already has a
/// script open (a reinstall, a second phone), the first page used to land in
/// that script: its memory, binding facts and arc came along, and the page
/// gate rejected the new scene for not continuing someone else's story
/// (seen live 2026-09-28: a hospital scene checked against a diner script).
/// The first page gets a project of its own instead.
nonisolated enum FirstPageFreshProject {
    /// Posted to the Studio screen, which creates the project the same way
    /// the drawer's Create does. `userInfo[titleKey]` is the project title.
    static let requested = Notification.Name("io.them.them.firstPageFreshProjectRequested")
    static let titleKey = "title"
    /// Posted back by the Studio with `userInfo[projectIDKey]`: the project
    /// the first page goes into, or "" when none could be opened.
    static let ready = Notification.Name("io.them.them.firstPageProjectReady")
    static let projectIDKey = "projectID"

    /// An open project whose page is still empty is used as is, so a retry
    /// after a failed first page does not leave an empty project behind.
    static func canReuse(selectedProjectID: String, draft: String) -> Bool {
        !selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Decided by the Studio after its own load: right after sign-in it may
    /// still be loading the old script, whose page would look empty here.
    /// Writes are ready once they target the project the Studio chose and
    /// its page is empty.
    static func isBound(to projectID: String, boundProjectID: String, draft: String) -> Bool {
        let expected = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        return !expected.isEmpty
            && boundProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == expected
            && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// A working title a script already has gets the next number ("Clerk
    /// Stops The Clock 2"): the drawer listed "Senate Staffer Counts Votes On"
    /// four times (2026-09-30). Titles the writer types into Create are theirs.
    static func uniqueTitle(_ title: String, among existing: [String]) -> String {
        let taken = Set(existing.map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() })
        guard taken.contains(title.lowercased()) else { return title }
        var number = 2
        while taken.contains("\(title) \(number)".lowercased()) { number += 1 }
        return "\(title) \(number)"
    }

    private static let phraseBreaks: Set<String> = [
        "on", "in", "at", "to", "for", "with", "from", "by", "of", "into", "onto", "over", "under",
        "after", "before", "during", "while", "as", "and", "but", "or", "when", "where", "because",
        "who", "which", "that", "through", "across", "behind", "near", "inside", "outside", "without",
        "until", "about", "against", "between", "among", "toward", "towards", "than", "if", "so", "then",
    ]
    private static let danglingWords: Set<String> = phraseBreaks.union([
        "a", "an", "the", "her", "his", "their", "its", "my", "your", "our", "this", "these", "those",
    ])

    /// A short working title: the lead phrase of the scene the writer typed,
    /// e.g. "A night nurse finds her missing brother's coat…" ->
    /// "Night Nurse Finds Her Missing Brother's Coat". Five words cut mid-phrase
    /// ("Senate Staffer Counts Votes On", "Clerk Stops The Clock On", seen in
    /// the projects drawer 2026-09-30).
    static func title(fromSceneSeed seed: String) -> String {
        let clause = seed.components(separatedBy: CharacterSet(charactersIn: ".,;:!?—–…()\n")).first { !$0.trimmingCharacters(in: .whitespaces).isEmpty } ?? ""
        let wordCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "'’"))
        var words: [(text: String, range: Range<String.Index>)] = []
        var start: String.Index?
        for index in clause.indices {
            let isWord = clause[index].unicodeScalars.allSatisfy { wordCharacters.contains($0) }
            if isWord, start == nil { start = index }
            if !isWord, let open = start { words.append((String(clause[open..<index]), open..<index)); start = nil }
        }
        if let open = start { words.append((String(clause[open...]), open..<clause.endIndex)) }
        let leading: Set<String> = ["a", "an", "the"]
        var picked = Array(words.drop { leading.contains($0.text.lowercased()) }.prefix(7))
        // The title is the lead phrase: it stops where a preposition or
        // conjunction starts the next one ("…the clock | on the senate floor").
        // A fixed word list, not a language model: NLTagger returned no tags on
        // a freshly erased simulator, so titles differed from device to device.
        if let cut = picked.indices.first(where: { $0 >= 2 && phraseBreaks.contains(picked[$0].text.lowercased()) }) {
            picked = Array(picked.prefix(cut))
        }
        while picked.count > 1, let last = picked.last {
            let word = last.text.lowercased()
            guard danglingWords.contains(word) || word.hasSuffix("'s") || word.hasSuffix("’s") else { break }
            picked.removeLast()
        }
        let titled = picked.map { $0.text.prefix(1).uppercased() + $0.text.dropFirst().lowercased() }
        return titled.isEmpty ? "New Scene" : titled.joined(separator: " ")
    }
}
