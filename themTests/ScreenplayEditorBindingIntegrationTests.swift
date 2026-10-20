import XCTest
import SwiftUI
@testable import them
#if os(iOS)
import UIKit

@MainActor
final class ScreenplayEditorBindingIntegrationTests: XCTestCase {
    private final class FocusedTextView: UITextView {
        override var isFirstResponder: Bool { true }
    }

    func testFreshModelValueUsesHistoricalRenderNotLiveBinding() {
        var model = "Original draft"
        let coordinator = makeCoordinator(text: Binding(get: { model }, set: { model = $0 }))
        let editor = FocusedTextView()
        editor.text = "Original draft with local typing"
        model = "A genuinely new rewrite"

        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: model, to: editor, documentDidChange: false
        ), "The old parent Binding already reads the new model; it is not a historical snapshot.")
    }

    func testUnchangedEchoDoesNotOverwriteFocusedTyping() {
        let coordinator = makeCoordinator(text: .constant("motel sig"))
        let editor = FocusedTextView()
        editor.text = "motel sign"

        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: "motel sig", to: editor, documentDidChange: false
        ))
    }

    func testSnapshotAdvancesAfterNewModelThenProtectsLaterTyping() {
        var model = "Original draft"
        let coordinator = makeCoordinator(text: Binding(get: { model }, set: { model = $0 }))
        let editor = FocusedTextView()
        editor.text = "Original draft"
        model = "Rewritten draft"
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: model, to: editor, documentDidChange: false
        ))
        editor.text = "Rewritten draft with newer typing"
        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: model, to: editor, documentDidChange: false
        ))
    }

    func testDelayedPublishedEchoDoesNotReplaceNewerNativeTyping() {
        let (coordinator, editor) = typingTwoValues()
        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: "motel sig", to: editor, documentDidChange: false
        ), "An older published keystroke is not a genuinely new rewrite.")
    }

    func testDelayedEchoRemainsLocalAfterFocusLeavesThePage() {
        let (coordinator, editor) = typingTwoValues(focused: false)
        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: "motel sig", to: editor, documentDidChange: false
        ))
    }

    func testGenuineRewriteStillAppliesWithUnacknowledgedTyping() {
        let (coordinator, editor) = typingTwoValues()
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: "The genuine replacement scene.", to: editor, documentDidChange: false
        ))
    }

    func testProjectSwitchStillAppliesEvenWhenTextMatchesAPendingEcho() {
        let (coordinator, editor) = typingTwoValues()
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: "motel sig", to: editor, documentDidChange: true
        ))
    }

    func testLaterAcknowledgedLocalTextCanBecomeAGenuineUndo() {
        let (coordinator, editor) = typingTwoValues()
        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: "motel sign", to: editor, documentDidChange: false
        ))
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: "motel sig", to: editor, documentDidChange: false
        ), "Acknowledged local history must not block a later explicit undo.")
    }

    func testUnrelatedRewriteDoesNotConsumeAnOlderUnacknowledgedEcho() {
        let (coordinator, editor) = typingTwoValues()
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: "The genuine replacement scene.", to: editor, documentDidChange: false
        ))
        editor.text = "The genuine replacement scene."
        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: "motel sig", to: editor, documentDidChange: false
        ))
    }

    private func typingTwoValues(focused: Bool = true)
        -> (IOSCursorInsertTextEditor.Coordinator, UITextView) {
        var model = "motel si"
        let coordinator = makeCoordinator(text: Binding(get: { model }, set: { model = $0 }))
        let editor: UITextView = focused ? FocusedTextView() : UITextView()
        editor.text = model
        coordinator.textView = editor
        coordinator.primeParagraphElements(for: model, attributedText: editor.attributedText)
        for value in ["motel sig", "motel sign"] {
            editor.text = value
            editor.selectedRange = NSRange(location: (value as NSString).length, length: 0)
            coordinator.textViewDidChange(editor)
        }
        XCTAssertEqual(model, "motel sign")
        return (coordinator, editor)
    }

    private func makeCoordinator(text: Binding<String>) -> IOSCursorInsertTextEditor.Coordinator {
        IOSCursorInsertTextEditor(
            text: text, documentID: "project-a",
            activeScreenplayElement: .constant(.action),
            insertionRequest: .constant(nil), lineJumpRequest: .constant(nil),
            lineHighlightRequest: .constant(nil), anchoredTextRectRequest: .constant(nil),
            anchoredTextRectSnapshot: .constant(nil), editorFocusRequest: .constant(nil),
            editorActionRequest: .constant(nil), editorSelection: .constant(nil),
            currentCursorLine: .constant(1), lastCommittedWrite: .constant(nil),
            pendingReplacementTarget: .constant(nil), submittedReplacementTarget: .constant(nil)
        ).makeCoordinator()
    }
}
#endif
