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

    /// A short working title from the scene the writer typed, e.g.
    /// "A night nurse finds her missing brother's coat…" -> "Night Nurse Finds Her Missing".
    static func title(fromSceneSeed seed: String) -> String {
        let skipped: Set<String> = ["a", "an", "the"]
        let words = seed
            .components(separatedBy: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "'’")).inverted)
            .filter { !$0.isEmpty }
        let trimmedLead = words.drop { skipped.contains($0.lowercased()) }
        let picked = trimmedLead.prefix(5).map { $0.prefix(1).uppercased() + $0.dropFirst().lowercased() }
        return picked.isEmpty ? "New Scene" : picked.joined(separator: " ")
    }
}
