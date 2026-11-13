import SwiftUI
import ScreenplayStudio
/// Keeps editor composition out of the live-draft bridge while forwarding the
/// iPhone keyboard save affordance to the native screenplay editor.
struct CursorInsertTextEditor: View {
    @Binding var text: String
    var documentID: String = ""
    var externalMutationRevision: UInt64 = 0
    var currentModelAuthority: (() -> ScreenplayEditorModelAuthority)? = nil
    var currentReplacementSubmissionID: (() -> String)? = nil
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
        nativeIOSEditor
#else
        EmptyView()
#endif
    }
}

@MainActor
extension CursorInsertTextEditor {
    static func modelTextBinding(for model: ScreenplayStudioViewModel) -> Binding<String> {
        Binding(get: { model.fountainDraft }, set: { model.publishNativeEditorDraft($0) })
    }

    init(model: ScreenplayStudioViewModel, bridge: ScreenplayLiveDraftBridge,
         onSaveDraft: @escaping () -> Void) {
        let state = ObservedObject(wrappedValue: bridge).projectedValue
        self.init(
            text: Self.modelTextBinding(for: model), documentID: model.selectedProjectID,
            externalMutationRevision: model.editorExternalDraftMutationRevision,
            currentModelAuthority: {
                ScreenplayEditorModelAuthority(documentID: model.selectedProjectID,
                    externalMutationRevision: model.editorExternalDraftMutationRevision)
            },
            currentReplacementSubmissionID: { bridge.replacementSubmissionID },
            activeScreenplayElement: state.activeScreenplayElement,
            insertionRequest: state.pendingInsertion, lineJumpRequest: state.pendingLineJump,
            lineHighlightRequest: state.pendingLineHighlight,
            anchoredTextRectRequest: state.pendingAnchoredTextRectRequest,
            anchoredTextRectSnapshot: state.anchoredTextRectSnapshot,
            editorFocusRequest: state.pendingEditorFocus, editorActionRequest: state.pendingEditorAction,
            editorSelection: state.editorSelection, currentCursorLine: state.currentCursorLine,
            lastCommittedWrite: state.lastCommittedWrite,
            pendingReplacementTarget: state.pendingReplacementTarget,
            submittedReplacementTarget: state.submittedReplacementTarget,
            onUserEdit: model.noteManualDraftEdit, canSaveDraft: model.selectedProject != nil &&
                model.hasUnsavedDraftChanges && !model.isSaving && !model.fountainDraft.isEmpty,
            onSaveDraft: onSaveDraft
        )
    }
}

#if os(iOS)
extension CursorInsertTextEditor {
    var nativeIOSEditor: IOSCursorInsertTextEditor {
        IOSCursorInsertTextEditor(
            text: $text,
            documentID: documentID,
            externalMutationRevision: externalMutationRevision,
            currentModelAuthority: currentModelAuthority,
            currentReplacementSubmissionID: currentReplacementSubmissionID,
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
    }
}
#endif
