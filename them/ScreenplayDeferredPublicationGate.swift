import Foundation

private func screenplayEditorUTF8Equal(_ lhs: String, _ rhs: String) -> Bool {
    lhs.utf8.elementsEqual(rhs.utf8)
}

struct ScreenplayDeferredTextPublicationRequirement: Equatable {
    var text: String
    var requestID: UUID?
}

struct ScreenplayEditorBoundTextTracker {
    // SwiftUI normally acknowledges within a render turn. Keep a bounded
    // recent window; an evicted value fails open as an external rewrite.
    static let pendingPublicationLimit = 64

    private var lastRenderedText: String
    private var pendingNativePublications: [String] = []

    var pendingPublicationCount: Int { pendingNativePublications.count }

    init(initialText: String) {
        lastRenderedText = initialText
    }

    mutating func recordNativePublication(_ text: String) {
        guard pendingNativePublications.last.map({ !screenplayEditorUTF8Equal($0, text) }) ?? true else { return }
        pendingNativePublications.append(text)
        if pendingNativePublications.count > Self.pendingPublicationLimit {
            pendingNativePublications.removeFirst(pendingNativePublications.count - Self.pendingPublicationLimit)
        }
    }

    mutating func shouldApplyBoundText(
        _ boundText: String,
        currentEditorText: String,
        isEditorFocused: Bool,
        documentDidChange: Bool,
        externalMutationDidChange: Bool = false,
        pendingExpectedText: String?,
        pendingText: String?,
        activeStreamingBaseText: String?
    ) -> Bool {
        let previousRenderedText = lastRenderedText
        lastRenderedText = boundText

        if documentDidChange || externalMutationDidChange {
            pendingNativePublications.removeAll()
        } else if let index = pendingNativePublications.lastIndex(where: {
            screenplayEditorUTF8Equal($0, boundText)
        }) {
            pendingNativePublications.removeFirst(index + 1)
            return false
        }

        guard ScreenplayDeferredPublicationGate.shouldApplyBoundText(
            boundText,
            currentText: currentEditorText,
            pendingExpectedText: pendingExpectedText,
            pendingText: pendingText,
            activeStreamingBaseText: activeStreamingBaseText
        ) else { return false }

        guard !screenplayEditorUTF8Equal(boundText, currentEditorText) else { return false }
        return !isEditorFocused || documentDidChange || externalMutationDidChange ||
            !screenplayEditorUTF8Equal(boundText, previousRenderedText)
    }
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
        pendingExpectedText: String?, pendingText: String?, activeStreamingBaseText: String? = nil
    ) -> Bool {
        let isStreamingBaseline = activeStreamingBaseText.map {
            screenplayEditorUTF8Equal($0, boundText)
        } ?? false
        let isPendingBaseline = pendingExpectedText.map {
            screenplayEditorUTF8Equal($0, boundText)
        } == true && pendingText.map {
            screenplayEditorUTF8Equal($0, currentText)
        } == true
        return !(isStreamingBaseline || isPendingBaseline)
    }
}
