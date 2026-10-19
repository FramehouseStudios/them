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

    func testDeferredRejectionDoesNotConsumeFreshRewrite() {
        var model = "Original draft"
        let coordinator = makeCoordinator(text: Binding(get: { model }, set: { model = $0 }))
        let editor = FocusedTextView()
        editor.text = "Original draft with typing"
        model = "Fresh rewrite"
        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: model, to: editor, documentDidChange: false, deferredAllows: false
        ))
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: model, to: editor, documentDidChange: false, deferredAllows: true
        ), "A rejected deferred update must not become an already-rendered echo.")
    }

    func testDocumentSwitchRemainsAuthoritativeDuringDeferredPublication() {
        let coordinator = makeCoordinator(text: .constant("Original draft"))
        let editor = FocusedTextView()
        editor.text = "Original draft with typing"
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: "Original draft", to: editor, documentDidChange: true, deferredAllows: false
        ))
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
