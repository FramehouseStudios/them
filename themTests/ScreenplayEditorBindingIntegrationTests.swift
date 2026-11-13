import XCTest
import SwiftUI
import ScreenplayStudio
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

    func testRealModelRestoreMatchingPendingNativeTextHasExternalAuthority() {
        let model = makeModel()
        model.fountainDraft = "motel si"
        let revision = model.editorExternalDraftMutationRevision
        let coordinator = makeModelNativeEditor(model).makeCoordinator()
        let editor = FocusedTextView()
        editor.text = model.fountainDraft
        coordinator.textView = editor
        coordinator.primeParagraphElements(for: editor.text, attributedText: editor.attributedText)
        for value in ["motel sig", "motel sign"] {
            editor.text = value
            editor.selectedRange = NSRange(location: (value as NSString).length, length: 0)
            coordinator.textViewDidChange(editor)
        }
        XCTAssertEqual(model.fountainDraft, "motel sign")
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision,
                       "Real native binding publications must not masquerade as restores.")

        model.fountainDraft = "motel sig"
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision + 1)
        coordinator.parent = makeModelNativeEditor(model)
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: model.fountainDraft, to: editor, documentDidChange: false
        ), "An explicit restore must win even when its bytes equal an unacknowledged native value.")
        editor.text = model.fountainDraft
        XCTAssertFalse(coordinator.shouldApplyModelText(
            incomingText: "motel sign", to: editor, documentDidChange: false
        ), "Late native acknowledgements must not roll the restored page forward again.")
    }

    func testRealNativeUnicodeEditAndExternalUnicodeRestoreKeepExactBytes() {
        let model = makeModel()
        let composed = "Caf\u{00e9} hums."
        let decomposed = "Cafe\u{0301} hums."
        XCTAssertEqual(composed, decomposed)
        XCTAssertNotEqual(Data(composed.utf8), Data(decomposed.utf8))
        model.fountainDraft = composed
        let revision = model.editorExternalDraftMutationRevision
        let coordinator = makeModelNativeEditor(model).makeCoordinator()
        let editor = FocusedTextView()
        editor.text = composed
        coordinator.textView = editor
        coordinator.primeParagraphElements(for: composed, attributedText: editor.attributedText)
        editor.text = decomposed
        editor.selectedRange = NSRange(location: (decomposed as NSString).length, length: 0)
        coordinator.textViewDidChange(editor)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(decomposed.utf8))
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision)

        model.fountainDraft = composed
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision + 1)
        coordinator.parent = makeModelNativeEditor(model)
        XCTAssertTrue(coordinator.shouldApplyModelText(
            incomingText: model.fountainDraft, to: editor, documentDidChange: false
        ))
    }

    func testNativeMarkerCannotAuthorizeALaterExternalAssignment() {
        let model = makeModel()
        let binding = CursorInsertTextEditor.modelTextBinding(for: model)
        let revision = model.editorExternalDraftMutationRevision
        binding.wrappedValue = "Native words"
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision)
        model.fountainDraft = "An explicit rewrite"
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision + 1)
        binding.wrappedValue = "More native words"
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision + 1)
        model.fountainDraft = "Native words"
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision + 2)
    }

    func testDeferredNativePublicationCannotWinAfterExternalAwayAndBack() async {
        let model = makeModel()
        model.fountainDraft = "Original page."
        let (coordinator, editor) = prepareDeferredTyping(model: model)
        let revision = model.editorExternalDraftMutationRevision
        coordinator.beginRepresentableUpdate()
        editor.text = "Queued native page."
        coordinator.textViewDidChange(editor)
        coordinator.endRepresentableUpdate()
        model.fountainDraft = "Explicit replacement."
        model.fountainDraft = "Original page."
        await drainDeferredPublication()
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision + 2)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data("Original page.".utf8),
                       "Equal bytes cannot authorize a write queued before two external mutations.")
    }

    func testDeferredNativePublicationCannotCrossProjectAwayAndBack() async {
        let model = makeModel()
        model.fountainDraft = "Original page."
        let (coordinator, editor) = prepareDeferredTyping(model: model)
        let revision = model.editorExternalDraftMutationRevision
        coordinator.beginRepresentableUpdate()
        editor.text = "Queued native page."
        coordinator.textViewDidChange(editor)
        coordinator.endRepresentableUpdate()
        model.selectedProjectID = "project-b"
        model.selectedProjectID = "project-a"
        await drainDeferredPublication()
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision + 2)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data("Original page.".utf8))
    }

    func testCurrentDeferredNativePublicationStillReachesTheRealModel() async {
        let model = makeModel()
        model.fountainDraft = "Original page."
        let (coordinator, editor) = prepareDeferredTyping(model: model)
        let revision = model.editorExternalDraftMutationRevision
        coordinator.beginRepresentableUpdate()
        editor.text = "Queued native page."
        coordinator.textViewDidChange(editor)
        coordinator.endRepresentableUpdate()
        await drainDeferredPublication()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data("Queued native page.".utf8))
        XCTAssertEqual(model.editorExternalDraftMutationRevision, revision)
    }

    func testInterruptedRewriteCleanupRetiresOnlyItsOriginalTargetAfterExternalEdit() async {
        await exerciseInterruptedRewriteCleanup(startNewSubmission: false)
    }

    func testInterruptedRewriteCleanupPreservesNewSubmissionReusingTheSameTarget() async {
        await exerciseInterruptedRewriteCleanup(startNewSubmission: true)
    }

    private func exerciseInterruptedRewriteCleanup(startNewSubmission: Bool) async {
        let bridge = ScreenplayLiveDraftBridge.shared
        let oldPending = bridge.pendingReplacementTarget
        let oldSubmitted = bridge.submittedReplacementTarget
        let oldSubmission = bridge.replacementSubmissionID
        let oldInterruption = bridge.onPageGenerationInterrupted
        bridge.onPageGenerationInterrupted = nil
        defer {
            bridge.pendingReplacementTarget = oldPending
            bridge.capturePendingPageWriteReplacementForSubmission(requestID: oldSubmission)
            bridge.submittedReplacementTarget = oldSubmitted
            bridge.onPageGenerationInterrupted = oldInterruption
        }
        bridge.prepareNextPageWriteReplacement(startLine: 1, currentText: "Original page.")
        bridge.capturePendingPageWriteReplacementForSubmission(requestID: "operation-a")
        let target = bridge.pendingReplacementTarget
        XCTAssertNotNil(target)
        let model = makeModel()
        model.fountainDraft = "Original page."
        let (coordinator, editor) = prepareDeferredTyping(model: model)
        coordinator.streamingInsertRange = NSRange(location: 0, length: 1)
        coordinator.beginRepresentableUpdate()
        editor.text = "Manual interruption."
        coordinator.textViewDidChange(editor)
        coordinator.endRepresentableUpdate()
        model.fountainDraft = "Explicit replacement."
        if startNewSubmission {
            bridge.capturePendingPageWriteReplacementForSubmission(requestID: "operation-b")
            XCTAssertEqual(bridge.submittedReplacementTarget, target,
                           "The newer request deliberately reuses the identical target UUID.")
        }
        await drainDeferredPublication()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data("Explicit replacement.".utf8))
        if startNewSubmission {
            XCTAssertEqual(bridge.pendingReplacementTarget, target)
            XCTAssertEqual(bridge.submittedReplacementTarget, target)
            XCTAssertEqual(bridge.replacementSubmissionID, "operation-b")
        } else {
            XCTAssertNil(bridge.pendingReplacementTarget,
                         "A stale text receipt must not strand its unchanged retired rewrite target.")
            XCTAssertNil(bridge.submittedReplacementTarget)
        }
    }

    private func prepareDeferredTyping(model: ScreenplayStudioViewModel)
        -> (IOSCursorInsertTextEditor.Coordinator, UITextView) {
        let coordinator = makeModelNativeEditor(model).makeCoordinator()
        let editor = FocusedTextView()
        editor.text = model.fountainDraft
        coordinator.textView = editor
        coordinator.primeParagraphElements(for: editor.text, attributedText: editor.attributedText)
        return (coordinator, editor)
    }

    private func drainDeferredPublication() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            DispatchQueue.main.async { continuation.resume() }
        }
    }

    private func makeModelNativeEditor(_ model: ScreenplayStudioViewModel) -> IOSCursorInsertTextEditor {
        CursorInsertTextEditor(model: model, bridge: .shared, onSaveDraft: {}).nativeIOSEditor
    }

    private func makeModel() -> ScreenplayStudioViewModel {
        let suite = "ScreenplayEditorBindingIntegrationTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "local-draft"))
        model.autosaveEnabled = false
        model.selectedProjectID = "project-a"
        return model
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

    private func makeCoordinator(text: Binding<String>, externalRevision: UInt64 = 0)
        -> IOSCursorInsertTextEditor.Coordinator {
        makeNativeEditor(text: text, externalRevision: externalRevision).makeCoordinator()
    }

    private func makeNativeEditor(text: Binding<String>, externalRevision: UInt64 = 0,
                                  documentID: String = "project-a",
                                  currentModelAuthority: (() -> ScreenplayEditorModelAuthority)? = nil,
                                  currentReplacementSubmissionID: (() -> String)? = nil)
        -> IOSCursorInsertTextEditor {
        IOSCursorInsertTextEditor(
            text: text, documentID: documentID, externalMutationRevision: externalRevision,
            currentModelAuthority: currentModelAuthority,
            currentReplacementSubmissionID: currentReplacementSubmissionID,
            activeScreenplayElement: .constant(.action),
            insertionRequest: .constant(nil), lineJumpRequest: .constant(nil),
            lineHighlightRequest: .constant(nil), anchoredTextRectRequest: .constant(nil),
            anchoredTextRectSnapshot: .constant(nil), editorFocusRequest: .constant(nil),
            editorActionRequest: .constant(nil), editorSelection: .constant(nil),
            currentCursorLine: .constant(1), lastCommittedWrite: .constant(nil),
            pendingReplacementTarget: .constant(nil), submittedReplacementTarget: .constant(nil)
        )
    }
}
#endif
