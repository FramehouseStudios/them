import Foundation

/// What the phone editor does to a scene heading, character cue or
/// transition line while the writer is still typing it.
///
/// It used to run the full line normalizer on every keystroke. For a heading
/// that normalizer adds "INT. " to anything not starting with INT/EXT, so the
/// first letter "I" became "INT. I" with the cursor after the "I", the next
/// letter landed inside it, and a heading typed in Scene mode came out as
/// "INT. PIER - NIGHT. INTT. INNT. I" (seen live 2026-09-27, before and after
/// other editor changes). While typing, these lines are only uppercased; the
/// full normalization still runs when the line is finished (Return or an
/// element change).
enum ScreenplayTypingNormalization {
    static func lineWhileTyping(_ line: String) -> String {
        line.uppercased()
    }

    /// Where the cursor belongs after a finished line is normalized.
    ///
    /// Normalizing can add text around the writer's words: a parenthetical
    /// "Whispering" becomes "(whispering)". Keeping the raw offset put the
    /// cursor one character short, so the Return that triggered the
    /// normalization split the word and the next line was typed inside the
    /// parentheses ("(whisperin" / "Who's there?g)", seen live 2026-09-27).
    /// A cursor at the end stays at the end; otherwise it follows the
    /// original text inside the normalized line.
    static func cursorOffset(afterNormalizing original: String, to normalized: String, originalOffset: Int) -> Int {
        let old = original as NSString
        let new = normalized as NSString
        if originalOffset >= old.length { return new.length }
        let trimmed = original.trimmingCharacters(in: .whitespaces)
        let located = new.range(of: trimmed, options: [.caseInsensitive])
        if !trimmed.isEmpty, located.location != NSNotFound {
            let leading = (original as NSString).range(of: trimmed).location
            return min(max(0, located.location + originalOffset - leading), new.length)
        }
        return min(originalOffset, new.length)
    }
}
