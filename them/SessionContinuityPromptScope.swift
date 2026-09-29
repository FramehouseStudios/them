import Foundation

/// "Where we left off" is the account's last project. It fills gaps in a
/// Studio prompt only for that same project. Merged into every prompt, it
/// carried one script's setups, arc pressure and Act III payoffs into
/// another (seen live 2026-09-28: a new hospital script was held to a
/// diner script's "key under the frog" and rejected by the page gate).
nonisolated enum SessionContinuityPromptScope {
    static func applies(snapshotProjectID: String, boundProjectID: String) -> Bool {
        snapshotProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            == boundProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
