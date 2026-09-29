import Foundation

/// A spoken page request no longer holds the conversation: the page streams
/// onto the paper while the mic stays open, so the writer keeps talking ideas
/// through with Clementine as it types. When it lands she offers the read-back
/// (PageWriteReadBackOffer) — out loud only if nobody is mid-sentence.
nonisolated enum VoicePageWriteWhileTalking {
    static let startLines = [
        "On it. I'll type while we talk, so keep going.",
        "Putting it down now. Talk to me while I write.",
        "Writing it down. What else are you seeing?",
    ]

    /// A second page request while the first is still typing waits its turn.
    static let queuedLine = "Still typing. I'll take that one next."

    /// The page did not pass the quality check; the notice on screen says the
    /// draft is unchanged, and a writer on voice hears it too.
    static let heldBackLine = "I held that one back, so your draft is unchanged. Say it again and I'll take another pass."

    static func startLine(seed: String) -> String {
        PageWriteReadBackOffer.pick(startLines, seed: seed)
    }

    /// Turn-based voice only; the realtime transport already writes silently
    /// while its model talks.
    static func streams(
        useScreenplayMode: Bool,
        shouldWriteToPage: Bool,
        autoInsertEnabled: Bool,
        studioActive: Bool
    ) -> Bool {
        useScreenplayMode && shouldWriteToPage && autoInsertEnabled && studioActive
    }

    /// She never talks over the writer, over herself, or over a reply that is
    /// on its way; the offer then waits on screen.
    /// `micQuiet`: the mic is idle or armed, not capturing speech or muted.
    static func canSpeakOffer(micQuiet: Bool, assistantPlaying: Bool, replyInFlight: Bool) -> Bool {
        micQuiet && !assistantPlaying && !replyInFlight
    }
}
