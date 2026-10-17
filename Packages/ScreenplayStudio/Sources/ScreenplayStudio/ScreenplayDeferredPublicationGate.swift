import Foundation

public struct ScreenplayDeferredTextPublicationRequirement: Equatable {
    public var text: String
    public var requestID: UUID?

    public init(text: String, requestID: UUID?) {
        self.text = text
        self.requestID = requestID
    }
}

public enum ScreenplayDeferredPublicationGate {
    /// Request IDs advance per chunk. Native text remains publishable when it
    /// still matches the editor and no external binding edit won the race.
    public static func acceptsNativeTextPublication(expectedBinding: String, currentBinding: String, queuedText: String, nativeText: String?, requestID: UUID? = nil, activeRequestID: UUID? = nil) -> Bool {
        (requestID == nil || activeRequestID != nil)
            && ScreenplayDraftTextIdentity.matches(currentBinding, expectedBinding)
            && nativeText.map { ScreenplayDraftTextIdentity.matches($0, queuedText) } == true
    }

    /// A deferred native edit is newer than its expected SwiftUI binding.
    /// Do not replace it with that baseline before publication catches up.
    public static func shouldApplyBoundText(
        _ boundText: String, currentText: String,
        pendingExpectedText: String?, pendingText: String?, activeStreamingBaseText: String? = nil
    ) -> Bool {
        let isStreamBaseline = activeStreamingBaseText.map { ScreenplayDraftTextIdentity.matches($0, boundText) } == true
        let hasPendingBaseline = pendingExpectedText.map { ScreenplayDraftTextIdentity.matches($0, boundText) } == true
        let hasPendingText = pendingText.map { ScreenplayDraftTextIdentity.matches($0, currentText) } == true
        return !(isStreamBaseline || (hasPendingBaseline && hasPendingText))
    }

    public static func requestIsCurrent(
        _ requestID: UUID?,
        lastAppliedInsertionID: UUID?,
        activeInsertionRequestID: UUID?
    ) -> Bool {
        guard let requestID else { return true }
        return lastAppliedInsertionID == requestID && activeInsertionRequestID == requestID
    }

    public static func acceptsTextGeneration(
        _ generation: Int,
        requirements: [Int: ScreenplayDeferredTextPublicationRequirement],
        currentText: String,
        lastAppliedInsertionID: UUID?,
        activeInsertionRequestID: UUID?
    ) -> Bool {
        guard let requirement = requirements[generation] else { return true }
        return ScreenplayDraftTextIdentity.matches(currentText, requirement.text) && requestIsCurrent(
            requirement.requestID,
            lastAppliedInsertionID: lastAppliedInsertionID,
            activeInsertionRequestID: activeInsertionRequestID
        )
    }
}
