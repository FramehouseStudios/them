import Foundation

public enum DraftStudioPromptTarget: String, Codable, Hashable, Sendable {
    case automatic
    case page
    case voicePin
}

public struct DraftStudioPromptSignals: Codable, Hashable, Sendable {
    public let isExplicitStoryAdvice: Bool
    public let isForcedPageWrite: Bool
    public let isExplicitPageWrite: Bool

    public init(
        isExplicitStoryAdvice: Bool = false,
        isForcedPageWrite: Bool = false,
        isExplicitPageWrite: Bool = false
    ) {
        self.isExplicitStoryAdvice = isExplicitStoryAdvice
        self.isForcedPageWrite = isForcedPageWrite
        self.isExplicitPageWrite = isExplicitPageWrite
    }
}

public enum DraftStudioPromptRouter {
    public static func isDirectOpeningSceneRequest(_ prompt: String) -> Bool {
        let pattern = #"(?i)\A\s*(?:(?:hey\s+)?clementine[\s,]+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:write|draft)\s+(?:(?:the|an?)\s+)?(?:opening|first)\s+scene\b"#
        return prompt.range(of: pattern, options: .regularExpression) != nil
    }

    public static func shouldRouteToPage(
        _ prompt: String,
        preferredTarget: DraftStudioPromptTarget = .automatic,
        signals: DraftStudioPromptSignals = DraftStudioPromptSignals()
    ) -> Bool {
        let clean = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return false }

        switch preferredTarget {
        case .page:
            return true
        case .voicePin:
            return false
        case .automatic:
            break
        }

        if signals.isExplicitStoryAdvice {
            return false
        }
        if signals.isForcedPageWrite || signals.isExplicitPageWrite || isDirectOpeningSceneRequest(clean) {
            return true
        }
        return false
    }
}
