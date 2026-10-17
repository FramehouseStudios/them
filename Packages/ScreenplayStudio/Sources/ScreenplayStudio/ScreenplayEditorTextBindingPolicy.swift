public enum ScreenplayEditorTextBindingPolicy {
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
