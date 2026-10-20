import XCTest
import SwiftUI
@testable import them
#if os(iOS)
import UIKit

@MainActor
final class ScreenplayEditorViewportIntegrationTests: XCTestCase {
    private final class EditingTextView: UITextView {
        var editing = true
        override var isFirstResponder: Bool { editing }
    }

    func testManualTypingRevealsCaretThroughTheOuterPaperScrollViewport() async {
        let (scroll, textView, coordinator) = fixture()
        let initialCaret = textView.convert(textView.caretRect(for: textView.selectedTextRange!.end), to: scroll)
        XCTAssertFalse(scroll.bounds.contains(initialCaret), "The fixture must begin with a genuinely clipped caret.")

        coordinator.textViewDidChange(textView)
        scroll.layoutIfNeeded()

        let visibleCaret = textView.convert(textView.caretRect(for: textView.selectedTextRange!.end), to: scroll)
        XCTAssertTrue(scroll.bounds.contains(visibleCaret),
            "Manual typing left the actual UIKit caret outside the paper viewport: caret=\(visibleCaret), viewport=\(scroll.bounds).")
        XCTAssertGreaterThan(scroll.contentOffset.y, 0)
        XCTAssertEqual(textView.text, "The page keeps this line.")
    }

    func testProgrammaticTextChangesDoNotStealTheWritersPaperScrollPosition() async {
        let (scroll, textView, coordinator) = fixture()
        coordinator.isApplyingProgrammaticChange = true
        coordinator.textViewDidChange(textView)
        XCTAssertEqual(scroll.contentOffset, .zero)
        XCTAssertEqual(textView.text, "The page keeps this line.")
    }

    func testInactiveEditorDoesNotForcePaperFollowing() async {
        let (scroll, textView, coordinator) = fixture()
        textView.editing = false
        coordinator.textViewDidChange(textView)
        XCTAssertEqual(scroll.contentOffset, .zero)
    }

    private func fixture() -> (UIScrollView, EditingTextView, IOSCursorInsertTextEditor.Coordinator) {
        let scroll = UIScrollView(frame: CGRect(x: 0, y: 0, width: 375, height: 200))
        scroll.contentInsetAdjustmentBehavior = .never
        scroll.contentSize = CGSize(width: 375, height: 1_000)
        let textView = EditingTextView(frame: CGRect(x: 28, y: 320, width: 319, height: 660))
        textView.font = .preferredFont(forTextStyle: .body)
        textView.text = "The page keeps this line."
        textView.selectedRange = NSRange(location: (textView.text as NSString).length, length: 0)
        scroll.addSubview(textView)
        textView.layoutIfNeeded()
        let coordinator = IOSCursorInsertTextEditor(
            text: .constant(textView.text), activeScreenplayElement: .constant(.action),
            insertionRequest: .constant(nil), lineJumpRequest: .constant(nil),
            lineHighlightRequest: .constant(nil), anchoredTextRectRequest: .constant(nil),
            anchoredTextRectSnapshot: .constant(nil), editorFocusRequest: .constant(nil),
            editorActionRequest: .constant(nil), editorSelection: .constant(nil),
            currentCursorLine: .constant(1), lastCommittedWrite: .constant(nil),
            pendingReplacementTarget: .constant(nil), submittedReplacementTarget: .constant(nil)
        ).makeCoordinator()
        coordinator.textView = textView
        coordinator.primeParagraphElements(for: textView.text, attributedText: textView.attributedText)
        return (scroll, textView, coordinator)
    }
}
#endif
