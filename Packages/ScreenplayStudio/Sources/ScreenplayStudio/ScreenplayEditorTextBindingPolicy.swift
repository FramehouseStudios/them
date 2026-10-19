public enum ScreenplayEditorTextBindingPolicy {
    public static func shouldApplyModelText(
        incomingText: String,
        currentEditorText: String,
        lastRenderedModelText: String,
        isEditorFocused: Bool,
        documentDidChange: Bool
    ) -> Bool {
        guard incomingText != currentEditorText else { return false }
        return !isEditorFocused || documentDidChange || incomingText != lastRenderedModelText
    }
}
