public enum ScreenplayEditorTextBindingPolicy {
    /// Values published by the native editor but not yet acknowledged by a
    /// render. A coalesced render can carry an older value than the next key.
    public struct PendingPublications {
        private var values: [String] = []

        public init() {}

        public mutating func record(_ text: String) {
            if values.last.map({ !ScreenplayDraftTextIdentity.matches($0, text) }) ?? true { values.append(text) }
        }

        public mutating func acknowledge(_ text: String) -> Bool {
            guard let index = values.lastIndex(where: { ScreenplayDraftTextIdentity.matches($0, text) }) else { return false }
            values.removeFirst(index + 1)
            return true
        }

        public mutating func reset() { values.removeAll() }
    }

    public static func shouldApplyModelText(
        incomingText: String,
        currentEditorText: String,
        lastRenderedModelText: String,
        isEditorFocused: Bool,
        documentDidChange: Bool,
        deferredAllows: Bool = true
    ) -> Bool {
        guard !ScreenplayDraftTextIdentity.matches(incomingText, currentEditorText) else { return false }
        guard documentDidChange || deferredAllows else { return false }
        return !isEditorFocused || documentDidChange || !ScreenplayDraftTextIdentity.matches(incomingText, lastRenderedModelText)
    }
}
