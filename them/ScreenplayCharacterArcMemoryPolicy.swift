import Foundation

/// The character arc memory sent with a Studio page write.
///
/// The backend's page-quality gate requires new pages to reuse words from
/// this memory, so it may only hold what the writer said about the character
/// (the story spine's want, need and opposition). It used to fall back to
/// Feature Compass guidance, and a two-page write was rejected for not
/// echoing "Force the protagonist into a choice that makes Act II
/// unavoidable" and "Write the next scene: DINER" (seen 2026-09-28).
/// Without writer facts there is no arc memory, and the gate skips the check.
nonisolated enum ScreenplayCharacterArcMemoryPolicy {
    static func memory(
        character: String,
        act: String,
        want: String,
        need: String,
        opposition: String
    ) -> BackendScreenplayCharacterArcMemory? {
        let memory = BackendScreenplayCharacterArcMemory(
            character: character,
            act: act,
            want: want,
            need: need,
            relationshipPressure: opposition
        )
        return memory.isMeaningful ? memory : nil
    }
}
