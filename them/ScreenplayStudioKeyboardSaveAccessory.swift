import SwiftUI
import ScreenplayStudio
#if os(iOS)
import UIKit

func hollywoodScreenplayEditorUIFont() -> UIFont {
    UIFont(name: "Courier", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
}

extension IOSCursorInsertTextEditor {
    func shouldApplyModelText(to textView: UITextView, previous: (text: String, documentID: String), deferredAllows: Bool) -> Bool {
        let documentDidChange = previous.documentID != documentID
        return ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: text, currentEditorText: textView.text ?? "",
            lastRenderedModelText: previous.text,
            isEditorFocused: textView.isFirstResponder, documentDidChange: documentDidChange,
            deferredAllows: deferredAllows
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
