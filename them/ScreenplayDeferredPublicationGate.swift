import Foundation

private func screenplayEditorUTF8Equal(_ lhs: String, _ rhs: String) -> Bool {
    lhs.utf8.elementsEqual(rhs.utf8)
}

struct ScreenplayDeferredTextPublicationRequirement: Equatable {
    var text: String
    var requestID: UUID?
}

enum ScreenplayDeferredPublicationGate {
    /// Request IDs advance per chunk. Native text remains publishable when it
    /// still matches the editor and no external binding edit won the race.
    static func acceptsNativeTextPublication(expectedBinding: String, currentBinding: String, queuedText: String, nativeText: String?, requestID: UUID? = nil, activeRequestID: UUID? = nil) -> Bool {
        (requestID == nil || activeRequestID != nil) &&
            screenplayEditorUTF8Equal(currentBinding, expectedBinding) &&
            nativeText.map { screenplayEditorUTF8Equal($0, queuedText) } == true
    }

    static func requestIsCurrent(
        _ requestID: UUID?,
        lastAppliedInsertionID: UUID?,
        activeInsertionRequestID: UUID?
    ) -> Bool {
        guard let requestID else { return true }
        return lastAppliedInsertionID == requestID && activeInsertionRequestID == requestID
    }

    static func acceptsTextGeneration(
        _ generation: Int,
        requirements: [Int: ScreenplayDeferredTextPublicationRequirement],
        currentText: String,
        lastAppliedInsertionID: UUID?,
        activeInsertionRequestID: UUID?
    ) -> Bool {
        guard let requirement = requirements[generation] else { return true }
        return screenplayEditorUTF8Equal(currentText, requirement.text) && requestIsCurrent(
            requirement.requestID,
            lastAppliedInsertionID: lastAppliedInsertionID,
            activeInsertionRequestID: activeInsertionRequestID
        )
    }

    /// A deferred native edit is newer than its expected SwiftUI binding.
    /// Do not replace it with that baseline before publication catches up.
    static func shouldApplyBoundText(
        _ boundText: String, currentText: String,
        documentDidChange: Bool, externalMutationDidChange: Bool
    ) -> Bool {
        guard !screenplayEditorUTF8Equal(boundText, currentText) else { return false }
        // Native editor publications update the model through a dedicated
        // binding without advancing the external mutation revision. Any later
        // mismatching render with the same document/revision is therefore an
        // echo, regardless of how many intermediate values SwiftUI coalesced.
        // An explicit model rewrite or document replacement is authoritative.
        // Deferred native work remains fenced at publication time by its
        // expected binding, native text and request identity checks above.
        return documentDidChange || externalMutationDidChange
    }
}
