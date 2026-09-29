import Foundation
import ScreenplayStudio

/// After Clementine writes onto the page she does not read it back unasked.
/// She offers, casually: what she just wrote, the page, or the whole script,
/// and keeps listening. The writer's next words answer the offer before any
/// other command routing ("yes" is not a new page-write approval here).
nonisolated enum PageWriteReadBackOffer {
    enum Choice: Equatable {
        case lastWrite
        case page
        case script
        case decline
    }

    /// An unanswered offer lapses; later words are ordinary requests.
    static let lifetime: TimeInterval = 180

    static let lines = [
        "It's on the page. Want me to read back what I just wrote, the whole page, or the full script?",
        "That's down. Should I read you what I just wrote, the page, or the whole script?",
        "Done. Want to hear the new part, the whole page, or the entire script?",
    ]

    /// A stable pick per write, so the same write never reads two ways.
    static func line(seed: String) -> String {
        pick(lines, seed: seed)
    }

    static func pick(_ options: [String], seed: String) -> String {
        let sum = seed.unicodeScalars.reduce(0) { ($0 &+ Int($1.value)) % 9_973 }
        return options[sum % options.count]
    }

    /// The writer's own words: the composer sends "<intent instruction>\n\n
    /// Writer request: the page".
    static func writerWords(_ text: String) -> String {
        guard let range = text.range(of: "Writer request:", options: [.caseInsensitive, .backwards]) else { return text }
        return String(text[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func choice(for answer: String) -> Choice? {
        let clean = writerWords(answer)
            .lowercased()
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: #"[^a-z' ]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard !clean.isEmpty else { return nil }
        let words = clean.split(separator: " ").count
        func has(_ pattern: String) -> Bool {
            clean.range(of: pattern, options: .regularExpression) != nil
        }

        if has(#"\b(whole|entire|full) (script|screenplay|thing|story)\b"#)
            || has(#"\b(the script|everything|all of it|from the top)\b"#) {
            return .script
        }
        if has(#"\b(whole|full|entire|the|this) page\b"#) || clean == "page" {
            return .page
        }
        if has(#"\b(what you (just )?wrote|just wrote|the new (part|bit|lines?)|that part|the last part|read (it|that)( back)?)\b"#) {
            return .lastWrite
        }
        // A short yes means the natural default: what she just wrote.
        if words <= 3, has(#"^(yes|yeah|yep|sure|ok|okay|please|go ahead|yes please|sure thing|do it)\b"#) {
            return .lastWrite
        }
        if words <= 4, has(#"^(no|nope|nah|not now|i'm good|im good|skip|that's ok|thats ok|all good|keep going|never ?mind)\b"#) {
            return .decline
        }
        return nil
    }

    /// A real new request moves on from the offer; one or two stray words
    /// (or mic noise) leave it open for the actual answer.
    static func closesOffer(_ text: String) -> Bool {
        writerWords(text).split(whereSeparator: \.isWhitespace).count >= 3
    }

    /// The printed page that holds `line` (1-based draft line), as it reads
    /// aloud. The old "read this page" read the first 520 characters of the
    /// whole script instead.
    static func pageText(in draft: String, containingLine line: Int, linesPerPage: Int = ScreenplayPageLayout.defaultLinesPerPage) -> String {
        let body = ScreenplayTitlePage.split(draft).body
        let offset = ScreenplayTitlePage.leadingLineCount(in: draft) > 0
            ? draft.components(separatedBy: "\n").count - body.components(separatedBy: "\n").count
            : 0
        let pages = ScreenplayPageLayout.paginate(body, linesPerPage: linesPerPage)
        let target = max(1, line - offset)
        let page = pages.first { target >= $0.startLine && target <= $0.endLine } ?? pages.last
        return speakable(page?.lines.joined(separator: "\n") ?? "")
    }

    static func speakable(_ text: String) -> String {
        text.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && $0 != "(MORE)" }
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
    }
}

extension ScreenplayLiveDraftBridge {
    /// The read-back for an answer to the offer.
    func readBackOfferFeedback(_ choice: PageWriteReadBackOffer.Choice) -> ScreenplayLocalStudioCommandFeedback {
        switch choice {
        case .decline:
            return ScreenplayLocalStudioCommandFeedback(
                confirmation: "Okay. I'm listening.",
                shouldSpeakConfirmation: true,
                isError: false,
                spokenText: "Okay."
            )
        case .lastWrite:
            let text = PageWriteReadBackOffer.speakable(lastCommittedWrite?.insertedText ?? "")
            return readBack(text, confirmation: "Reading back what I just wrote.", empty: "I haven't written anything this session yet.")
        case .page:
            let line = lastCommittedWrite?.startLine ?? currentCursorLine
            let text = PageWriteReadBackOffer.pageText(in: draftText, containingLine: line)
            return readBack(text, confirmation: "Reading back the page.", empty: "The page is still empty.")
        case .script:
            let text = PageWriteReadBackOffer.speakable(ScreenplayTitlePage.split(draftText).body)
            return readBack(text, confirmation: "Reading the whole script from the top.", empty: "The script is still empty.")
        }
    }

    private func readBack(_ text: String, confirmation: String, empty: String) -> ScreenplayLocalStudioCommandFeedback {
        ScreenplayLocalStudioCommandFeedback(
            confirmation: text.isEmpty ? empty : confirmation,
            shouldSpeakConfirmation: true,
            isError: text.isEmpty,
            spokenText: text.isEmpty ? nil : text
        )
    }
}
