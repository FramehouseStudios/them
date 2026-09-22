// Script-intent detection for the home orb: when a spoken turn should open the Studio or be answered as a filmmaker.
import Foundation
import SwiftUI
import Combine
import ScreenplayStudio

extension RootExperienceView {
    func shouldAutoOpenStudioForScriptIntent(_ text: String) -> Bool {
        let normalized = " \(text.lowercased()) "
        guard !normalized.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        if containsStudioOpenCommand(text) { return true }

        let directIntentPhrases = [
            " write a script ",
            " write the script ",
            " write my script ",
            " write a screenplay ",
            " work on my script ",
            " work on the script ",
            " work on a script ",
            " help me write a script ",
            " help me write my script ",
            " help me write a screenplay ",
            " let's write a script ",
            " lets write a script ",
            " let's write my script ",
            " lets write my script ",
            " let's write a screenplay ",
            " lets write a screenplay ",
            " start a script ",
            " start my script ",
            " start a screenplay ",
            " draft a scene ",
            " write a scene ",
            " outline my script ",
            " outline a screenplay ",
            " build this scene ",
            " develop this scene "
        ]
        if directIntentPhrases.contains(where: normalized.contains) {
            return true
        }

        let writingVerbs = [
            " write ",
            " drafting ",
            " draft ",
            " outline ",
            " outlining ",
            " revise ",
            " rewriting ",
            " rewrite ",
            " edit ",
            " editing ",
            " polish ",
            " finish ",
            " build ",
            " develop ",
            " brainstorming ",
            " brainstorm "
        ]
        let scriptObjects = [
            " script ",
            " screenplay ",
            " scene ",
            " beat ",
            " slugline ",
            " dialogue ",
            " pilot ",
            " short film ",
            " feature ",
            " movie ",
            " film "
        ]
        return writingVerbs.contains(where: normalized.contains) &&
            scriptObjects.contains(where: normalized.contains)
    }

    func containsStudioOpenCommand(_ text: String) -> Bool {
        let normalized = " \(text.lowercased()) "
        guard normalized.contains("studio") else { return false }
        let commandCues = [
            "open",
            "go to",
            "take me to",
            "switch to",
            "bring up",
            "launch"
        ]
        return commandCues.contains { normalized.contains($0) }
    }
}
