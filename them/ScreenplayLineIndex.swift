import Foundation
import ScreenplayStudio

/// Line numbers for UTF-16 offsets in a script. Studio asks for them for every
/// note anchor on every render and counted newlines from the top each time:
/// seconds of main-thread work while typing in a 51-page script
/// (sampled 2026-09-30). The line starts are kept for the current text.
nonisolated enum ScreenplayLineIndex {
    private static let memo = LastValueMemo<[Int]>()

    /// The 1-based line holding `location` (clamped to the text).
    static func lineNumber(at location: Int, in text: String) -> Int {
        let starts = memo.value(for: text) { lineStarts(in: $0) }
        let clamped = max(0, min(location, (text as NSString).length))
        var low = 0
        var high = starts.count
        while low < high {
            let middle = (low + high) / 2
            if starts[middle] <= clamped { low = middle + 1 } else { high = middle }
        }
        return max(1, low)
    }

    /// Lines `startLine...endLine` (1-based, clamped to the text), trimmed.
    /// Studio's page-diff check sliced the whole script into lines for every
    /// note on every render.
    static func text(fromLine startLine: Int, toLine endLine: Int, in text: String) -> String {
        let starts = memo.value(for: text) { lineStarts(in: $0) }
        let length = (text as NSString).length
        let first = max(1, min(startLine, starts.count))
        let last = max(first, min(endLine, starts.count))
        let from = starts[first - 1]
        let to = last < starts.count ? starts[last] - 1 : length
        return (text as NSString).substring(with: NSRange(location: from, length: max(0, to - from)))
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// UTF-16 offsets where each line begins; the first is always 0.
    static func lineStarts(in text: String) -> [Int] {
        let utf16 = text as NSString
        var starts = [0]
        for offset in 0..<utf16.length where utf16.character(at: offset) == 10 {
            starts.append(offset + 1)
        }
        return starts
    }
}
