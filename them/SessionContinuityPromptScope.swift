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
    /// project at launch (no previous project) is not a switch, but memory saved
    /// for another project is still not this one's (2026-09-30).
    static func keepsAppliedMemory(memoryProjectID: String?, switchingFrom oldProjectID: String, to newProjectID: String) -> Bool {
        let old = oldProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let memory = (memoryProjectID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let new = newProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !old.isEmpty else { return memory.isEmpty || new.isEmpty || memory == new }
        return !memory.isEmpty && memory == new
    }
}

extension SessionContinuityPromptScope {
    /// The launch recap is the account's last project; its memory card belongs
    /// in Studio only when that project is the one open (or none is yet). A
    /// new blank project showed "Correction memory applied" with the previous
    /// script's cast and threads (2026-09-30). Unstamped memory still shows.
    static func showsAppliedMemory(memoryProjectID: String?, openProjectID: String) -> Bool {
        let memory = (memoryProjectID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let open = openProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        return memory.isEmpty || open.isEmpty || memory == open
    }

    static func appliesAtRestore(snapshotProjectID: String, openProjectID: String) -> Bool {
        let open = openProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        return open.isEmpty || applies(snapshotProjectID: snapshotProjectID, boundProjectID: open)
    }

    /// The "Continuity Restored" Live Intent signal is saved account-wide with
    /// no project on it, so it came back inside a new blank script reading
    /// "Act III … 74 pages drafted" from the last one (2026-09-30). It shows
    /// only when the restored memory's project is the open one; every other
    /// signal is this session's own and shows as before.
    static func visibleSignal(_ signal: CreativeCompanionSignalState, restoredMemoryProjectID: String?, openProjectID: String) -> CreativeCompanionSignalState {
        guard signal.presence.title == HomeSessionContinuityCardPolicy.restoredContinuityPresenceTitle else { return signal }
        let memory = (restoredMemoryProjectID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let open = openProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        return open.isEmpty || (!memory.isEmpty && memory == open) ? signal : .empty
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
