import XCTest
import SwiftUI
@testable import them
#if os(iOS)
import UIKit

@MainActor
final class ScreenplayEditorBindingIntegrationTests: XCTestCase {
    func testKeyboardSaveStyleKeepsModernAppearanceWithAnOlderSystemFallback() {
        if #available(iOS 26.0, *) {
            XCTAssertEqual(IOSCursorInsertTextEditor.keyboardSaveButtonStyle, .prominent)
        } else {
            XCTAssertEqual(IOSCursorInsertTextEditor.keyboardSaveButtonStyle, .done)
        }
    }

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

    func testStaleRewritePreservesNativeWordsInEveryWritingStartMode() {
        let raw = "Manual cafe\u{0301} words.\r\n "
        for mode in [ScreenplayInsertionRequest.Mode.insert, .streamPreview, .streamCommit, .streamInsertProgress,
            .streamInsertFinalize, .voiceRevealPrepare, .voiceRevealUpdate, .voiceRevealFinalize] {
            let coordinator = makeCoordinator(text: .constant(raw))
            let editor = FocusedTextView()
            editor.text = raw
            coordinator.textView = editor
            let request = ScreenplayInsertionRequest(text: "Do not insert this.", mode: mode,
                replacementTarget: rewriteTarget("Original words."))
            coordinator.applyInsertion(request)
            XCTAssertEqual(Array(editor.text.utf8), Array(raw.utf8), "Stale target must not mutate native text in \(mode).")
            XCTAssertEqual(coordinator.lastAppliedInsertionID, request.id, "A rejection must not leave an endlessly pending UI request.")
        }
    }

    func testValidStreamingRewriteMayFinalizeItsOwnPreview() {
        let modes: [(ScreenplayInsertionRequest.Mode, ScreenplayInsertionRequest.Mode)] = [
            (.streamPreview, .streamCommit), (.streamInsertProgress, .streamInsertFinalize)]
        for (start, finish) in modes {
            var model = "Original words."
            let coordinator = makeCoordinator(text: Binding(get: { model }, set: { model = $0 }))
            let editor = FocusedTextView()
            editor.text = model
            coordinator.textView = editor
            let target = rewriteTarget(model)
            coordinator.applyInsertion(.init(text: "First revision.", mode: start, replacementTarget: target))
            XCTAssertTrue(editor.text.contains("First revision."))
            coordinator.applyInsertion(.init(text: "Final revision.", mode: finish, replacementTarget: target))
            XCTAssertTrue(editor.text.contains("Final revision."))
            XCTAssertFalse(editor.text.contains("Original words."))
        }
    }

    func testWriterEditDuringRewriteIsNotOverwrittenOrRolledBackByLateChunks() {
        let coordinator = makeCoordinator(text: .constant("Original words."))
        let editor = FocusedTextView()
        editor.text = "Original words."
        coordinator.textView = editor
        let target = rewriteTarget(editor.text)
        coordinator.applyInsertion(.init(text: "First revision.", mode: .streamInsertProgress, replacementTarget: target))
        editor.text += "\r\nManual cafe\u{0301} words. "
        let kept = editor.text!
        coordinator.applyInsertion(.init(text: "Late final.", mode: .streamInsertFinalize, replacementTarget: target))
        XCTAssertEqual(Array(editor.text.utf8), Array(kept.utf8))
        coordinator.applyInsertion(.init(text: "", mode: .streamInsertCancel, replacementTarget: target))
        XCTAssertEqual(Array(editor.text.utf8), Array(kept.utf8), "Cancellation after refusal cannot restore the old base over writer edits.")
    }

    func testValidPartialSelectionRewritesOnlyItsOriginalUTF16Range() {
        let original = "The red door opens."
        let range = (original as NSString).range(of: "red")
        var model = original
        let coordinator = makeCoordinator(text: Binding(get: { model }, set: { model = $0 }))
        let editor = FocusedTextView()
        editor.text = original
        coordinator.textView = editor
        let selection = ScreenplayEditorSelectionSnapshot(location: range.location, length: range.length,
            startLine: 1, endLine: 1, text: "red", sceneLabel: nil)
        let captured = ScreenplayReplacementResolver.captureSelectionRange(draft: original,
            expectedText: "red", startLine: 1, endLine: 1, selection: selection)
        XCTAssertEqual(captured, range)
        let target = ScreenplayPendingReplacementTarget(id: UUID(), sourceWriteID: "write", startLine: 1, endLine: 1,
            currentText: "red", draftIdentity: .init(draft: original), projectID: "project-a",
            authContext: .current(), originalSelectionRange: captured)
        coordinator.applyInsertion(.init(text: "blue", replacementTarget: target))
        XCTAssertEqual(editor.text, "The blue door opens.")
    }

    func testRejectedRequestAcknowledgesOnlyItsOwnIDAndReportsTheRefusal() async {
        let bridge = ScreenplayLiveDraftBridge.shared
        let oldStatus = bridge.autoInsertStatusText
        let oldInterrupt = bridge.onPageGenerationInterrupted
        defer { bridge.autoInsertStatusText = oldStatus; bridge.onPageGenerationInterrupted = oldInterrupt }
        var interrupted = 0
        bridge.onPageGenerationInterrupted = { _ in interrupted += 1 }
        let request = ScreenplayInsertionRequest(text: "Do not insert.", replacementTarget: rewriteTarget("Old text"))
        var pending: ScreenplayInsertionRequest? = request
        let acknowledged = expectation(description: "Only the rejected request is acknowledged")
        let binding = Binding<ScreenplayInsertionRequest?>(get: { pending }, set: {
            pending = $0
            if $0 == nil { acknowledged.fulfill() }
        })
        let coordinator = makeCoordinator(text: .constant("New manual text"), insertionRequest: binding)
        let editor = FocusedTextView()
        editor.text = "New manual text"
        coordinator.textView = editor
        coordinator.applyInsertion(request)
        await fulfillment(of: [acknowledged], timeout: 2)
        XCTAssertNil(pending)
        XCTAssertEqual(editor.text, "New manual text")
        XCTAssertEqual(interrupted, 1)
        XCTAssertTrue(bridge.autoInsertStatusText.contains("current words were kept"))
    }

    private func rewriteTarget(_ draft: String) -> ScreenplayPendingReplacementTarget {
        .init(id: UUID(), sourceWriteID: "write", startLine: 1, endLine: 1, currentText: draft,
            draftIdentity: .init(draft: draft), projectID: "project-a", authContext: .current())
    }

    private func makeCoordinator(text: Binding<String>, insertionRequest: Binding<ScreenplayInsertionRequest?> = .constant(nil)) -> IOSCursorInsertTextEditor.Coordinator {
        IOSCursorInsertTextEditor(
            text: text, documentID: "project-a",
            activeScreenplayElement: .constant(.action),
            insertionRequest: insertionRequest, lineJumpRequest: .constant(nil),
            lineHighlightRequest: .constant(nil), anchoredTextRectRequest: .constant(nil),
            anchoredTextRectSnapshot: .constant(nil), editorFocusRequest: .constant(nil),
            editorActionRequest: .constant(nil), editorSelection: .constant(nil),
            currentCursorLine: .constant(1), lastCommittedWrite: .constant(nil),
            pendingReplacementTarget: .constant(nil), submittedReplacementTarget: .constant(nil)
        ).makeCoordinator()
    }
}
#endif
