import Foundation
import ScreenplayStudio

/// Where the phone editor must put a blank line so the saved text is real
/// Fountain. The editor lays out elements from its own paragraph map, which is
/// not saved; only the text is. Seen live 2026-09-27: a cue and dialogue typed
/// with the element bar were saved as `…door.\nMARA\nWho's there?`, so every
/// classifier (page layout, backend paginator, exports, the non-screenplay
/// detector) read the dialogue as action prose, and the detector offered to
/// remove it. Fountain needs a blank line before a scene heading, character
/// cue or transition, after a heading or transition, and when action follows
/// dialogue.
enum FountainElementSpacing {
    static func needsBlankLineBefore(
        _ element: ScreenplayEditorElement,
        after previous: ScreenplayEditorElement?
    ) -> Bool {
        guard let previous else { return false }
        switch element {
        case .sceneHeading, .character, .transition:
            return true
        case .action:
            return [.sceneHeading, .transition, .character, .dialogue, .parenthetical].contains(previous)
        case .dialogue, .parenthetical:
            return previous == .sceneHeading || previous == .transition
        }
    }

    /// The UTF-16 offset at which to insert one "\n" so the empty line at
    /// `cursor` becomes `element` with Fountain-correct spacing, or nil when
    /// no blank line is needed (the cursor's line has text, is the first line,
    /// or already sits under a blank line).
    static func blankLineInsertionOffset(
        in text: String,
        cursor: Int,
        element: ScreenplayEditorElement,
        elementAbove: ScreenplayEditorElement?
    ) -> Int? {
        let ns = text as NSString
        let safe = max(0, min(cursor, ns.length))
        let lineRange = ns.lineRange(for: NSRange(location: safe, length: 0))
        let lineText = ns.substring(with: lineRange).trimmingCharacters(in: .whitespacesAndNewlines)
        guard lineText.isEmpty, lineRange.location > 0 else { return nil }
        let above = ns.lineRange(for: NSRange(location: lineRange.location - 1, length: 0))
        let aboveText = ns.substring(with: above).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !aboveText.isEmpty, needsBlankLineBefore(element, after: elementAbove) else { return nil }
        return lineRange.location
    }
}
