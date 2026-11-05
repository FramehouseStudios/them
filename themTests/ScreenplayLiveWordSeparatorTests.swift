import XCTest
import SwiftUI
import ScreenplayStudio
@testable import them
#if os(iOS)
import UIKit

@MainActor
final class ScreenplayLiveWordSeparatorTests: XCTestCase {
    private final class Draft {
        var text: String
        init(_ text: String) { self.text = text }
    }

    func testCharacterTypingPreservesTheSeparatorBetweenNames() async {
        let (editor, coordinator, draft) = fixture("JOHN", element: .character)
        for fragment in [" ", "DOE"] {
            editor.text += fragment
            editor.selectedRange = NSRange(location: (editor.text as NSString).length, length: 0)
            coordinator.textViewDidChange(editor)
        }
        XCTAssertEqual(editor.text, "JOHN DOE")
        XCTAssertEqual(draft.text, "JOHN DOE")
    }

    func testSceneHeadingTypingKeepsItsNextWordSeparator() async {
        let raw = "EXT. PIER - NIGHT "
        let (editor, coordinator, draft) = fixture(raw, element: .sceneHeading)
        coordinator.textViewDidChange(editor)
        XCTAssertEqual(editor.text, raw)
        XCTAssertEqual(draft.text, raw)
    }

    func testActionBindingRefreshDoesNotConsumeTheNextWordSeparator() async {
        let raw = "She counts seven red lights "
        let (editor, coordinator, draft) = fixture(raw, element: .action)
        coordinator.applyActiveElementFromBinding(.action)
        XCTAssertEqual(editor.text, raw)
        XCTAssertEqual(draft.text, raw)
    }

    func testDialogueBindingRefreshPreservesTrailingSpacesAndTab() async {
        let raw = "We still have time.  \t"
        let (editor, coordinator, draft) = fixture(raw, element: .dialogue)
        coordinator.applyActiveElementFromBinding(.dialogue)
        XCTAssertEqual(editor.text, raw)
        XCTAssertEqual(draft.text, raw)
    }

    func testOrdinaryActionDelegateAlreadyPreservesItsSeparator() async {
        let raw = "She counts seven red lights "
        let (editor, coordinator, draft) = fixture(raw, element: .action)
        coordinator.textViewDidChange(editor)
        XCTAssertEqual(editor.text, raw)
        XCTAssertEqual(draft.text, raw)
    }

    func testCompletedLineFormattingStillHasItsExistingTrimContract() async {
        XCTAssertEqual(FountainFormatter.normalizeEditorLine("JOHN ", as: .character), "JOHN")
    }

    private func fixture(_ text: String, element: ScreenplayEditorElement)
        -> (UITextView, IOSCursorInsertTextEditor.Coordinator, Draft) {
        let draft = Draft(text)
        let coordinator = IOSCursorInsertTextEditor(
            text: Binding(get: { draft.text }, set: { draft.text = $0 }),
            documentID: "word-separator-project", activeScreenplayElement: .constant(element),
            insertionRequest: .constant(nil), lineJumpRequest: .constant(nil),
            lineHighlightRequest: .constant(nil), anchoredTextRectRequest: .constant(nil),
            anchoredTextRectSnapshot: .constant(nil), editorFocusRequest: .constant(nil),
            editorActionRequest: .constant(nil), editorSelection: .constant(nil),
            currentCursorLine: .constant(1), lastCommittedWrite: .constant(nil),
            pendingReplacementTarget: .constant(nil), submittedReplacementTarget: .constant(nil)
        ).makeCoordinator()
        let editor = UITextView(frame: CGRect(x: 0, y: 0, width: 227, height: 200))
        editor.text = text
        editor.selectedRange = NSRange(location: (text as NSString).length, length: 0)
        coordinator.textView = editor
        coordinator.primeParagraphElements(for: text, attributedText: editor.attributedText)
        return (editor, coordinator, draft)
    }
}
#endif
