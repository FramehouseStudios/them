// Script-intent detection for the home orb. The pure policy is shared with
// speculative preparation and contract tests, rather than inferred from memory.
import Foundation

extension RootExperienceView {
    func shouldAutoOpenStudioForScriptIntent(_ text: String) -> Bool {
        ScreenplayIntentClassifier.hasExplicitScriptIntent(text)
    }

    func containsStudioOpenCommand(_ text: String) -> Bool {
        let normalized = " \(text.lowercased()) "
        guard normalized.contains("studio") else { return false }
        return ["open", "go to", "take me to", "switch to", "bring up", "launch"].contains { normalized.contains($0) }
    }
}
