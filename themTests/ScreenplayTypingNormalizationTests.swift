import XCTest
import ScreenplayStudio
@testable import them

final class ScreenplayTypingNormalizationTests: XCTestCase {
    /// Replays the editor's per-keystroke loop: insert at the cursor, rewrite
    /// the line, keep the cursor at the same offset (clamped to the new line).
    private func typeLine(_ typed: String, rewrite: (String) -> String) -> String {
        var line = ""
        var cursor = 0
        for character in typed {
            let index = line.index(line.startIndex, offsetBy: cursor)
            line.insert(character, at: index)
            cursor += 1
            let rewritten = rewrite(line)
            line = rewritten
            cursor = min(cursor, rewritten.count)
        }
        return line
    }

    func testTypingAHeadingLetterByLetterComesOutIntact() {
        XCTAssertEqual(typeLine("INT. PIER - NIGHT", rewrite: ScreenplayTypingNormalization.lineWhileTyping), "INT. PIER - NIGHT")
        XCTAssertEqual(typeLine("int. pier - night", rewrite: ScreenplayTypingNormalization.lineWhileTyping), "INT. PIER - NIGHT")
    }

    func testTheFullNormalizerPerKeystrokeWasTheCorruption() {
        let old = typeLine("INT. PIER - NIGHT") { FountainFormatter.normalizeEditorLine($0, as: .sceneHeading) }
        XCTAssertNotEqual(old, "INT. PIER - NIGHT", "documents the bug this replaces")
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("I", as: .sceneHeading), "INT. I")
    }

    func testCharacterCuesAreJustUppercasedWhileTyping() {
        XCTAssertEqual(typeLine("Nora", rewrite: ScreenplayTypingNormalization.lineWhileTyping), "NORA")
    }
}

final class ScreenplayNormalizedCursorTests: XCTestCase {
    func testReturnAtTheEndOfAParentheticalLandsAfterTheClosingParen() {
        let offset = ScreenplayTypingNormalization.cursorOffset(afterNormalizing: "Whispering", to: "(whispering)", originalOffset: 10)
        XCTAssertEqual(offset, 12)
    }

    func testMidWordCursorFollowsTheWordInsideAddedParens() {
        // Cursor between "Whisper" and "ing".
        let offset = ScreenplayTypingNormalization.cursorOffset(afterNormalizing: "Whispering", to: "(whispering)", originalOffset: 7)
        XCTAssertEqual(offset, 8)
        XCTAssertEqual(("(whispering)" as NSString).substring(to: offset), "(whisper")
    }

    func testHeadingThatOnlyChangesCaseKeepsTheOffset() {
        XCTAssertEqual(ScreenplayTypingNormalization.cursorOffset(afterNormalizing: "int. dock - day", to: "INT. DOCK - DAY", originalOffset: 4), 4)
    }

    func testUnrelatedRewriteClampsInsteadOfOverflowing() {
        XCTAssertEqual(ScreenplayTypingNormalization.cursorOffset(afterNormalizing: "cut to", to: "CUT TO:", originalOffset: 2), 2)
        XCTAssertEqual(ScreenplayTypingNormalization.cursorOffset(afterNormalizing: "abcdefgh", to: "XY", originalOffset: 5), 2)
    }
}
