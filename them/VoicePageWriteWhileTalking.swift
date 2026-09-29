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
    /// The words the app itself heard in this utterance: a client transcript, else this turn's
    /// on-device partial. A voice turn's prepared text falls back to the previous turn's
    /// transcript until the backend transcribes the audio, so nothing may act on it locally
    /// (live 2026-09-29: a stale typed page request re-streamed every ~15 s after each offer).
    static func heardWords(clientTranscript: String, livePartial: String) -> String {
        let override = clientTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        return override.isEmpty ? livePartial.trimmingCharacters(in: .whitespacesAndNewlines) : override
    }

    /// A page streams only when the turn was routed on the words heard this time.
    static func routedOnHeardWords(heard: String, routedText: String) -> Bool {
        !heard.isEmpty && heard == routedText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// `micQuiet`: the mic is idle or armed, not capturing speech or muted.
    static func canSpeakOffer(micQuiet: Bool, assistantPlaying: Bool, replyInFlight: Bool) -> Bool {
        micQuiet && !assistantPlaying && !replyInFlight
    }
}
