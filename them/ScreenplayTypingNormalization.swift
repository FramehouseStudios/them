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
}
