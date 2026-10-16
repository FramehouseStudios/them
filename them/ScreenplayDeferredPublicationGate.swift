import Foundation

struct ScreenplayDeferredTextPublicationRequirement: Equatable {
    var text: String
    var requestID: UUID?
}

enum ScreenplayDeferredPublicationGate {
    /// Request IDs advance per chunk. Native text remains publishable when it
    /// still matches the editor and no external binding edit won the race.
    static func acceptsNativeTextPublication(expectedBinding: String, currentBinding: String, queuedText: String, nativeText: String?, requestID: UUID? = nil, activeRequestID: UUID? = nil) -> Bool {
        (requestID == nil || activeRequestID != nil) && currentBinding == expectedBinding && nativeText == queuedText
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
        return currentText == requirement.text && requestIsCurrent(
            requirement.requestID,
            lastAppliedInsertionID: lastAppliedInsertionID,
            activeInsertionRequestID: activeInsertionRequestID
        )
    }

    /// A deferred native edit is newer than its expected SwiftUI binding.
    /// Do not replace it with that baseline before publication catches up.
    static func shouldApplyBoundText(
        _ boundText: String, currentText: String,
        pendingExpectedText: String?, pendingText: String?, activeStreamingBaseText: String? = nil
    ) -> Bool {
        !(activeStreamingBaseText == boundText || (pendingExpectedText == boundText && pendingText == currentText))
    }
}
