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
        return currentText == requirement.text && requestIsCurrent(
            requirement.requestID,
            lastAppliedInsertionID: lastAppliedInsertionID,
            activeInsertionRequestID: activeInsertionRequestID
        )
    }
}
