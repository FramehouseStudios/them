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

    func testManualReturnRevealsItsNewLineWithoutChangingTheWords() async {
        let (scroll, textView, coordinator) = fixture()
        XCTAssertFalse(coordinator.textView(textView,
            shouldChangeTextIn: textView.selectedRange, replacementText: "\n"))
        XCTAssertTrue(scroll.bounds.contains(
            textView.convert(textView.caretRect(for: textView.selectedTextRange!.end), to: scroll)))
        XCTAssertEqual(textView.text, "The page keeps this line.\n")
    }

    func testAlreadyVisibleCaretDoesNotMoveThePaper() async {
        let (scroll, textView, coordinator) = fixture()
        textView.frame.origin.y = 20
        let selection = textView.selectedRange
        coordinator.textViewDidChange(textView)
        XCTAssertEqual(scroll.contentOffset, .zero)
        XCTAssertEqual(textView.selectedRange, selection)
    }

    func testFollowingDoesNotChangeHorizontalPaperPosition() async {
        let (scroll, textView, coordinator) = fixture()
        scroll.contentSize.width = 800
        scroll.contentOffset.x = 120
        coordinator.textViewDidChange(textView)
        XCTAssertEqual(scroll.contentOffset.x, 120)
        XCTAssertTrue(scroll.bounds.contains(
            textView.convert(textView.caretRect(for: textView.selectedTextRange!.end), to: scroll)))
    }

    func testTypingRevealsCaretThroughNestedScrollViewports() async {
        let (inner, textView, coordinator) = fixture()
        let outer = UIScrollView(frame: CGRect(x: 0, y: 0, width: 375, height: 180))
        outer.contentInsetAdjustmentBehavior = .never
        outer.contentSize = CGSize(width: 375, height: 1_500)
        inner.frame.origin.y = 400
        outer.addSubview(inner)
        coordinator.textViewDidChange(textView)
        let caret = textView.caretRect(for: textView.selectedTextRange!.end)
        XCTAssertTrue(inner.bounds.contains(textView.convert(caret, to: inner)))
        XCTAssertTrue(outer.bounds.contains(textView.convert(caret, to: outer)))
        XCTAssertGreaterThan(inner.contentOffset.y, 0)
        XCTAssertGreaterThan(outer.contentOffset.y, 0)
    }

    func testExistingLineJumpDoesNotTakeFocusOrHijackOuterPaperPosition() async {
        let (scroll, textView, coordinator) = fixture()
        textView.editing = false
        coordinator.applyLineJump(.init(id: UUID(), line: 1))
        XCTAssertEqual(textView.selectedRange, NSRange(location: 0, length: 0))
        XCTAssertFalse(textView.isFirstResponder)
        XCTAssertEqual(scroll.contentOffset, .zero)
        XCTAssertEqual(textView.text, "The page keeps this line.")
    }

    func testGeneratedInsertionDoesNotStealPaperWhileTheEditorRemainsFocused() async {
        let (scroll, textView, coordinator) = fixture()
        coordinator.applyInsertion(.init(text: "She watches the doorway."))
        await Task.yield()
        XCTAssertTrue(textView.isFirstResponder)
        XCTAssertEqual(scroll.contentOffset, .zero)
        XCTAssertTrue(textView.text.hasPrefix("The page keeps this line."))
        XCTAssertTrue(textView.text.contains("She watches the doorway."))
        XCTAssertEqual(coordinator.lastAppliedInsertionID != nil, true)
    }

    func testFocusRequestRevealsAnAlreadyEditingCaretWithoutChangingSelection() async {
        let (scroll, textView, coordinator) = fixture()
        let selection = textView.selectedRange
        coordinator.applyEditorFocus(.init(id: UUID()))
        XCTAssertEqual(textView.selectedRange, selection)
        XCTAssertTrue(scroll.bounds.contains(
            textView.convert(textView.caretRect(for: textView.selectedTextRange!.end), to: scroll)))
        XCTAssertEqual(textView.text, "The page keeps this line.")
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
