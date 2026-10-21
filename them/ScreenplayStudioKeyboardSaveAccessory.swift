import SwiftUI
import ScreenplayStudio
#if os(iOS)
import UIKit

extension IOSCursorInsertTextEditor.Coordinator {
    func publishEditorText(_ text: String) {
        guard parent.text != text else { return }
        pendingEditorPublications.record(text)
        parent.text = text
    }

    func shouldApplyModelText(
        incomingText: String,
        to textView: UITextView,
        documentDidChange: Bool
    ) -> Bool {
        // A Binding reads today's model, even when held by yesterday's parent.
        // Keep the previous render's value independently of that live binding.
        defer { lastRenderedModelText = incomingText }
        if documentDidChange {
            pendingEditorPublications.reset()
        } else if pendingEditorPublications.acknowledge(incomingText) {
            return false
        }
        if !documentDidChange && !shouldApplyBoundText(incomingText, currentText: textView.text ?? "") {
            return false
        }
        return ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: incomingText,
            currentEditorText: textView.text ?? "",
            lastRenderedModelText: lastRenderedModelText,
            isEditorFocused: textView.isFirstResponder,
            documentDidChange: documentDidChange
        )
    }
}
#endif

/// Keeps editor composition out of the live-draft bridge while forwarding the
/// iPhone keyboard save affordance to the native screenplay editor.
struct CursorInsertTextEditor: View {
    @Binding var text: String
    var documentID: String = ""
    @Binding var activeScreenplayElement: ScreenplayEditorElement
    @Binding var insertionRequest: ScreenplayInsertionRequest?
    @Binding var lineJumpRequest: ScreenplayLineJumpRequest?
    @Binding var lineHighlightRequest: ScreenplayLineHighlightRequest?
    @Binding var anchoredTextRectRequest: ScreenplayAnchoredTextRectRequest?
    @Binding var anchoredTextRectSnapshot: ScreenplayAnchoredTextRectSnapshot?
    @Binding var editorFocusRequest: ScreenplayEditorFocusRequest?
    @Binding var editorActionRequest: ScreenplayEditorActionRequest?
    @Binding var editorSelection: ScreenplayEditorSelectionSnapshot?
    @Binding var currentCursorLine: Int
    @Binding var lastCommittedWrite: ScreenplayCommittedWrite?
    @Binding var pendingReplacementTarget: ScreenplayPendingReplacementTarget?
    @Binding var submittedReplacementTarget: ScreenplayPendingReplacementTarget?
    var onUserEdit: (() -> Void)? = nil
    var canSaveDraft = false
    var onSaveDraft: (() -> Void)? = nil

    var body: some View {
#if os(macOS)
        MacCursorInsertTextEditor(
            text: $text,
            activeScreenplayElement: $activeScreenplayElement,
            insertionRequest: $insertionRequest,
            lineJumpRequest: $lineJumpRequest,
            lineHighlightRequest: $lineHighlightRequest,
            anchoredTextRectRequest: $anchoredTextRectRequest,
            anchoredTextRectSnapshot: $anchoredTextRectSnapshot,
            editorFocusRequest: $editorFocusRequest,
            editorActionRequest: $editorActionRequest,
            editorSelection: $editorSelection,
            currentCursorLine: $currentCursorLine,
            lastCommittedWrite: $lastCommittedWrite,
            pendingReplacementTarget: $pendingReplacementTarget,
            submittedReplacementTarget: $submittedReplacementTarget,
            onUserEdit: onUserEdit
        )
#elseif os(iOS)
        IOSCursorInsertTextEditor(
            text: $text,
            documentID: documentID,
            activeScreenplayElement: $activeScreenplayElement,
            insertionRequest: $insertionRequest,
            lineJumpRequest: $lineJumpRequest,
            lineHighlightRequest: $lineHighlightRequest,
            anchoredTextRectRequest: $anchoredTextRectRequest,
            anchoredTextRectSnapshot: $anchoredTextRectSnapshot,
            editorFocusRequest: $editorFocusRequest,
            editorActionRequest: $editorActionRequest,
            editorSelection: $editorSelection,
            currentCursorLine: $currentCursorLine,
            lastCommittedWrite: $lastCommittedWrite,
            pendingReplacementTarget: $pendingReplacementTarget,
            submittedReplacementTarget: $submittedReplacementTarget,
            onUserEdit: onUserEdit,
            canSaveDraft: canSaveDraft,
            onSaveDraft: onSaveDraft
        )
#else
        EmptyView()
#endif
    }
}
