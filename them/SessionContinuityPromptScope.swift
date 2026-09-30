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

extension SessionContinuityPromptScope {
    /// Switching from one project to another drops Studio memory learned on the
    /// old one; memory stamped with the new project stays. Restoring the saved
    /// project at launch (no previous project) is not a switch.
    static func keepsAppliedMemory(memoryProjectID: String?, switchingFrom oldProjectID: String, to newProjectID: String) -> Bool {
        let old = oldProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !old.isEmpty else { return true }
        let memory = (memoryProjectID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return !memory.isEmpty && memory == newProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

extension ScreenplayLiveDraftBridge {
    /// A new blank project showed the previous script's "Project memory applied"
    /// card (and its brief went into the new project's prompts) until the first write.
    func dropAppliedMemoryIfItBelongsElsewhere(switchingFrom oldProjectID: String) {
        guard latestAppliedMemory.hasContent,
              !SessionContinuityPromptScope.keepsAppliedMemory(
                memoryProjectID: latestAppliedMemory.projectId,
                switchingFrom: oldProjectID,
                to: preferredProjectID
              ) else { return }
        latestAppliedMemory = .empty
    }
}
