import XCTest
import ScreenplayStudio
@testable import them

/// Typing restyled every line of a long script per keystroke; a keystroke now
/// restyles only the lines that changed. The page must look exactly as if the
/// whole page had been restyled (2026-09-30).
final class ScreenplayTypingRestyleTests: XCTestCase {
    private let font = UIFont(name: "Courier", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)

    private func styled(_ text: String, into storage: NSTextStorage? = nil, typing: Bool) -> NSTextStorage {
        let target = storage ?? NSTextStorage(string: text)
        if storage != nil {
            // An edit touches only the changed characters, as typing does;
            // the rest keep the attributes they already had.
            let old = target.string as NSString
            let new = text as NSString
            var prefix = 0
            while prefix < min(old.length, new.length), old.character(at: prefix) == new.character(at: prefix) { prefix += 1 }
            var suffix = 0
            while suffix < min(old.length, new.length) - prefix,
                  old.character(at: old.length - 1 - suffix) == new.character(at: new.length - 1 - suffix) { suffix += 1 }
            let replaced = NSRange(location: prefix, length: old.length - prefix - suffix)
            target.replaceCharacters(in: replaced, with: new.substring(with: NSRange(location: prefix, length: new.length - prefix - suffix)))
        }
        let elements = bootstrapScreenplayParagraphElements(for: text)
        let apply = {
            applyScreenplayParagraphAttributes(to: target, fullText: text, elements: elements, containerWidth: 360, font: self.font, foregroundColor: UIColor.black)
        }
        if typing { ScreenplayTypingRestyle.typing(apply) } else { apply() }
        return target
    }

    private func assertSameAttributes(_ lhs: NSAttributedString, _ rhs: NSAttributedString, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(lhs.string, rhs.string, file: file, line: line)
        let keys: [NSAttributedString.Key] = [.paragraphStyle, .font, .foregroundColor, .screenplayElementRaw]
        for index in 0..<lhs.length {
            for key in keys {
                let a = lhs.attribute(key, at: index, effectiveRange: nil) as? NSObject
                let b = rhs.attribute(key, at: index, effectiveRange: nil) as? NSObject
                XCTAssertEqual(a, b, "\(key.rawValue) differs at \(index)", file: file, line: line)
                if a != b { return }
            }
        }
    }

    private let base = "FADE IN:\n\nINT. SENATE CORRIDOR - NIGHT\n\nA clock reads 8:02.\n\nNORA\nAbernathy, Baptiste, Cole.\n\nDANNY\n(quietly)\nCole's a maybe.\n\nCUT TO:\n\nEXT. STATE CAPITOL - NIGHT\n\nRain."

    func testAKeystrokeRestyleMatchesAFullRestyle() {
        let edits = [
            base.replacingOccurrences(of: "8:02.", with: "8:02. Nora waits."),                     // typing in action
            base.replacingOccurrences(of: "Cole's a maybe.", with: "Cole's a maybe.\n\nNORA\nNo."),  // new dialogue block
            base.replacingOccurrences(of: "\n\nCUT TO:", with: ""),                                  // deleted transition
            base.replacingOccurrences(of: "NORA\n", with: "NORA\n(beat)\n"),                         // parenthetical inserted
            "Title: SINE DIE\nAuthor: A. Writer\n\n" + base,                                          // title page appears
        ]
        for edited in edits {
            let incremental = styled(base, typing: false)
            _ = styled(edited, into: incremental, typing: true)
            let full = styled(edited, typing: false)
            assertSameAttributes(incremental, full)
        }
    }

    func testOnlyChangedLinesAndTheirNeighboursAreInTheWindow() {
        let old = ["A", "B", "C", "D", "E"]
        let window = ScreenplayTypingRestyle.changedLines(
            from: (old, Array(repeating: .action, count: 5)),
            to: (["A", "B", "Cx", "D", "E"], Array(repeating: .action, count: 5))
        )
        XCTAssertEqual(window, 1..<4)
        XCTAssertEqual(ScreenplayTypingRestyle.changedLines(from: (old, []), to: (old, [])), 0..<0, "nothing changed")
    }
}
