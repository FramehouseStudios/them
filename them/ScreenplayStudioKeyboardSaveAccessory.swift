import SwiftUI
import ScreenplayStudio
#if os(iOS)
import UIKit

func hollywoodScreenplayEditorUIFont() -> UIFont {
    UIFont(name: "Courier", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
}

extension IOSCursorInsertTextEditor.Coordinator {
    func shouldApplyModelText(
        incomingText: String,
        to textView: UITextView,
        documentDidChange: Bool,
        deferredAllows: Bool = true
    ) -> Bool {
        // A Binding reads today's model, even when held by yesterday's parent.
        // Keep the previous render's value independently of that live binding.
        let shouldApply = ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: incomingText,
            currentEditorText: textView.text ?? "",
            lastRenderedModelText: lastRenderedModelText,
            isEditorFocused: textView.isFirstResponder,
            documentDidChange: documentDidChange,
            deferredAllows: deferredAllows
        )
        // A deferred rejection is not a render: keep its rewrite eligible
        // when the pending local publication finishes.
        if shouldApply || ScreenplayDraftTextIdentity.matches(incomingText, textView.text ?? "") {
            lastRenderedModelText = incomingText
        }
        return shouldApply
    }

    func traceParentReplacementChanges(
        previousPendingID: UUID?, previousSubmittedID: UUID?, previousInsertionID: UUID?
    ) {
        let currentPendingID = parent.pendingReplacementTarget?.id
        let currentSubmittedID = parent.submittedReplacementTarget?.id
        let currentInsertionID = parent.insertionRequest?.id
        guard previousPendingID != currentPendingID ||
            previousSubmittedID != currentSubmittedID ||
            previousInsertionID != currentInsertionID else { return }
        traceReplacementTarget(
            kind: "ios-update-parent-sync",
            target: parent.submittedReplacementTarget ?? parent.pendingReplacementTarget,
            detail: "Synced representable parent. pending=\(previousPendingID?.uuidString.lowercased() ?? "nil")->\(currentPendingID?.uuidString.lowercased() ?? "nil") submitted=\(previousSubmittedID?.uuidString.lowercased() ?? "nil")->\(currentSubmittedID?.uuidString.lowercased() ?? "nil") insertion=\(previousInsertionID?.uuidString.lowercased() ?? "nil")->\(currentInsertionID?.uuidString.lowercased() ?? "nil")"
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
