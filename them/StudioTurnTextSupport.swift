import Foundation

nonisolated enum StudioTurnTextSupport {
    static func richerTurnText(confirmedTranscript: String, partialHint: String) -> String {
        let transcript = confirmedTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        let partial = partialHint.trimmingCharacters(in: .whitespacesAndNewlines)

        if transcript.isEmpty { return partial }
        if partial.isEmpty { return transcript }

        let transcriptWords = transcript.split(whereSeparator: \.isWhitespace).count
        let partialWords = partial.split(whereSeparator: \.isWhitespace).count

        // Prefer the partial hint when it clearly carries richer current-turn detail.
        if partialWords >= transcriptWords + 2 { return partial }
        if partial.count >= transcript.count + 18 { return partial }
        if transcriptWords <= 1 && partialWords >= 2 { return partial }

        return transcript
    }
}
