import XCTest
@testable import them

/// Studio counted newlines from the top of the script for every anchor on every
/// render (2026-09-30); the index must give the same line numbers.
final class ScreenplayLineIndexTests: XCTestCase {
    private func naive(_ location: Int, _ text: String) -> Int {
        let ns = text as NSString
        let prefix = ns.substring(to: max(0, min(location, ns.length)))
        return max(1, prefix.reduce(into: 1) { count, character in if character == "\n" { count += 1 } })
    }

    func testMatchesCountingFromTheTopAtEveryOffset() {
        let text = "FADE IN:\n\nINT. HALL - NIGHT\n\nNORA\nWho’s there? 🕰️\n\n\nDANNY\n(quietly)\nMe.\n"
        for location in -2...((text as NSString).length + 2) {
            XCTAssertEqual(ScreenplayLineIndex.lineNumber(at: location, in: text), naive(location, text), "offset \(location)")
        }
    }

    func testEmptyAndSingleLineTexts() {
        XCTAssertEqual(ScreenplayLineIndex.lineNumber(at: 0, in: ""), 1)
        XCTAssertEqual(ScreenplayLineIndex.lineNumber(at: 5, in: "Nora."), 1)
        XCTAssertEqual(ScreenplayLineIndex.lineStarts(in: "a\nb\n"), [0, 2, 4])
    }

    func testLineSlicesMatchSplittingTheWholeText() {
        func naiveSlice(_ start: Int, _ end: Int, _ draft: String) -> String {
            let lines = draft.components(separatedBy: .newlines)
            let safeStart = max(1, min(start, lines.count))
            let safeEnd = max(safeStart, min(end, lines.count))
            return Array(lines[(safeStart - 1)...(safeEnd - 1)]).joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        for draft in ["", "Nora.", "FADE IN:\n\nINT. HALL - NIGHT\n\nNORA\nWho’s there? 🕰️\n\nDANNY\nMe.\n", "a\n\n\nb"] {
            let count = draft.components(separatedBy: .newlines).count
            for start in -1...(count + 2) {
                for end in (start - 1)...(count + 2) {
                    XCTAssertEqual(ScreenplayLineIndex.text(fromLine: start, toLine: end, in: draft), naiveSlice(start, end, draft), "\(start)-\(end) in \(draft.debugDescription)")
                }
            }
        }
    }
}
