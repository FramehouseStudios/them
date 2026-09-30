import Foundation

/// The cast a page write is told about. Cues carry extensions, so "BELL" and
/// "BELL (CONT'D)" each took one of eight places and DECKER, on the page for
/// thirty pages, was left out by page 31 (74-page run, 2026-09-30).
nonisolated enum ScreenplayCastFocus {
    static func names(_ cues: [String], limit: Int = 8) -> [String] {
        var names: [String] = []
        for cue in cues {
            let name = ScreenplayRenderedCharacterMentionExtractor.normalizedCharacterName(fromCueLine: cue)
                ?? cue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty,
                  !names.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) else { continue }
            names.append(name)
            if names.count >= limit { break }
        }
        return names
    }
}
