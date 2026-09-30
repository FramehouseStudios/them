import Foundation

/// What the Live Intent card says after a relaunch ("Restored Continuity").
/// Seen live 2026-09-30: "Act-aware target: Act I / Act I - Opening Image /
/// Ordinary World (p1-p12). Last live thread: INT. BUS DEPOT - NIGHT Rain on
/// the roof. ..." and "Try this ask: Say: write the next page where Act I -
/// Opening Image / Ordinary World: Plant the emotional question ...".
nonisolated enum RestoredContinuityCopy {
    /// "Act I" and "Act I - Opening Image / ..." read once.
    static func position(act: String, featureSequence: String) -> String {
        let act = act.trimmingCharacters(in: .whitespacesAndNewlines)
        let sequence = featureSequence.trimmingCharacters(in: .whitespacesAndNewlines)
        if act.isEmpty { return sequence }
        if sequence.isEmpty { return act }
        if sequence.lowercased().hasPrefix(act.lowercased()) { return sequence }
        return "\(act) / \(sequence)"
    }

    /// The planner's own wording is not the writer's next move: its plan
    /// ("Act I - Opening Image / Ordinary World: Plant ...") and its move
    /// titles ("Write the next scene: ...", "Sequence move: ...").
    static func writerMove(_ move: String) -> String {
        let clean = move.trimmingCharacters(in: .whitespacesAndNewlines)
        let plannerPlan = #"^act\s+(i{1,3}|[1-3])\b[^:]*\s-\s[^:]*:"#
        let plannerTitles = ["write the next scene", "pay off the next story turn", "advance ", "sharpen the act turn", "sequence move:", "next scene:"]
        let lower = clean.lowercased()
        if lower.range(of: plannerPlan, options: .regularExpression) != nil { return "" }
        if plannerTitles.contains(where: { lower.hasPrefix($0) }) { return "" }
        return clean
    }

    /// A remembered thread is a story sentence, not the page itself.
    static func threads(_ candidates: [String]) -> [String] {
        candidates.filter { candidate in
            let clean = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
            let opensWithHeading = clean.range(of: #"^(INT|EXT|INT\./EXT|I/E)[\.\s]"#, options: [.regularExpression, .caseInsensitive]) != nil
            // "... MAE Last one tonight? DRIVER" is script text: a cue in capitals before a line.
            let carriesACue = clean.range(of: #"\b[A-Z][A-Z'\-]{1,}\s+[A-Z][a-z]"#, options: .regularExpression) != nil
            return !clean.isEmpty && !opensWithHeading && !carriesACue && clean.count <= 220
        }
    }
}
