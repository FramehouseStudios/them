import Foundation

/// Whether a draft has reached its end: one of its last three lines is
/// FADE OUT / FADE TO BLACK / THE END. The backend's draftReachedTheEnd
/// (continuity_interface_copy.js) is the same rule; keep them in step.
nonisolated enum ScreenplayDraftEnding {
    static func reachesTheEnd(_ draft: String) -> Bool {
        let tail = draft.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .suffix(3)
        return tail.contains { line in
            line.range(of: #"^(?:FADE OUT|FADE TO BLACK|THE END)[.:]?$"#, options: [.regularExpression, .caseInsensitive]) != nil
        }
    }

    /// What the Feature Compass says once the script is finished, in place of
    /// "Continue the unfinished page…" and page-writing moves that would have
    /// written past THE END (2026-09-30).
    static let finishedObligation = "The draft reaches FADE OUT."
    static let finishedDetail = "Read it through, then choose what the rewrite pass should fix."
}
