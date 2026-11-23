import SwiftUI
import ScreenplayStudio
#if os(iOS)
import UIKit

extension IOSCursorInsertTextEditor.Coordinator {
    func publishEditorText(_ text: String) {
        guard !parent.text.utf8.elementsEqual(text.utf8) else { return }
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
        let externalMutationDidChange = parent.externalMutationRevision != lastRenderedExternalMutationRevision
        defer {
            lastRenderedModelText = incomingText
            lastRenderedExternalMutationRevision = parent.externalMutationRevision
        }
        // An external revision wins now, but keep known native receipts until
        // acknowledged: a late old echo must not roll that restore forward.
        if documentDidChange {
            pendingEditorPublications.reset()
        } else if !externalMutationDidChange, pendingEditorPublications.acknowledge(incomingText) {
            return false
        }
        return ScreenplayEditorTextBindingPolicy.shouldApplyModelText(
            incomingText: incomingText,
            currentEditorText: textView.text ?? "",
            lastRenderedModelText: lastRenderedModelText,
            isEditorFocused: textView.isFirstResponder,
            documentDidChange: documentDidChange || externalMutationDidChange
        )
    }

    func canPublishDeferredControl<Value: Equatable>(
        _ pending: DeferredBindingValue<Value?>, current: Value?, generationAccepted: Bool
    ) -> Bool {
        guard current == pending.expected else { return false }
        let authority = parent.modelAuthority
        if pending.value == nil {
            let submissionID = parent.currentReplacementSubmissionID?() ?? ""
            guard submissionID == pending.replacementSubmissionID else { return false }
            // A nil cleanup can retire only this same operation's unchanged
            // control. A reused target UUID does not authorize clearing B.
            if pending.expected != nil, !submissionID.isEmpty,
               pending.authority.documentID == authority.documentID { return true }
        }
        return pending.authority == authority && generationAccepted
    }

    func coalesce<Value: Equatable>(
        _ pending: inout DeferredBindingValue<Value>?,
        current: Value,
        value: Value,
        requestID: UUID? = nil
    ) {
        let generation = activeRepresentableUpdateGeneration ?? representableUpdateGeneration
        let authority = parent.renderedModelAuthority
        let submissionID = parent.currentReplacementSubmissionID?() ?? ""
        if var existing = pending, existing.generation == generation,
           existing.authority == authority, existing.replacementSubmissionID == submissionID {
            existing.value = value
            existing.requestID = requestID ?? existing.requestID
            pending = existing
        } else {
            pending = DeferredBindingValue(
                expected: current,
                value: value,
                generation: generation,
                requestID: requestID, authority: authority,
                replacementSubmissionID: submissionID
            )
        }
        scheduleDeferredPublicationFlush()
    }
}

extension IOSCursorInsertTextEditor {
    var renderedModelAuthority: ScreenplayEditorModelAuthority {
        ScreenplayEditorModelAuthority(documentID: documentID,
            externalMutationRevision: externalMutationRevision)
    }

    var modelAuthority: ScreenplayEditorModelAuthority {
        currentModelAuthority?() ?? renderedModelAuthority
    }
}
#endif
