public struct ScreenplayEditorModelAuthority: Equatable {
    public var documentID: String
    public var externalMutationRevision: UInt64

    public init(documentID: String, externalMutationRevision: UInt64) {
        self.documentID = documentID
        self.externalMutationRevision = externalMutationRevision
    }
}

public enum ScreenplayEditorTextBindingPolicy {
    /// Values published by the native editor but not yet acknowledged by a
    /// render. A coalesced render can carry an older value than the next key.
    public struct PendingPublications {
        private var values: [String] = []

        public init() {}

        public mutating func record(_ text: String) {
            if values.last.map({ !$0.utf8.elementsEqual(text.utf8) }) ?? true { values.append(text) }
        }

        public mutating func acknowledge(_ text: String) -> Bool {
            guard let index = values.lastIndex(where: { $0.utf8.elementsEqual(text.utf8) }) else { return false }
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
        documentDidChange: Bool
    ) -> Bool {
        guard !incomingText.utf8.elementsEqual(currentEditorText.utf8) else { return false }
        return !isEditorFocused || documentDidChange || !incomingText.utf8.elementsEqual(lastRenderedModelText.utf8)
    }
}
