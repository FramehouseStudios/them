import Foundation

/// Reconcile the provisional native preview with its original document. The
/// durable mutation replaces the original selection, never the preview itself.
@MainActor
struct ScreenplayStreamingCommitMutation {
    let before: String
    let range: NSRange
    let insertion: String
    let after: String
    let core: String
    let highlightRange: NSRange
    let caretLocation: Int

    init?(before: String, current: String, selection: NSRange, previewRange: NSRange,
          text: String, prefix: String, suffix: String, replacementTarget: ScreenplayPendingReplacementTarget?) {
        let original = before as NSString, provisional = current as NSString
        guard selection.location >= 0, selection.length >= 0, selection.location <= original.length,
              selection.length <= original.length - selection.location,
              previewRange.location >= 0, previewRange.length >= 0, previewRange.location <= provisional.length,
              previewRange.length <= provisional.length - previewRange.location else { return nil }
        let core = screenplayEditorPreparedInsertionCoreText(text, existing: before,
            insertionRange: selection, replacementTarget: replacementTarget)
        guard !core.isEmpty else { return nil }
        let insertion = prefix + core + suffix
        let after = original.replacingCharacters(in: selection, with: insertion)
        // An edit outside the preview must never be grafted onto an earlier
        // snapshot or erased by restoring that snapshot.
        guard after.utf8.elementsEqual(provisional.replacingCharacters(in: previewRange, with: insertion).utf8) else { return nil }
        self.before = before; self.range = selection; self.insertion = insertion
        self.after = after; self.core = core
        highlightRange = NSRange(location: selection.location + (prefix as NSString).length, length: (core as NSString).length)
        caretLocation = selection.location + (insertion as NSString).length
    }
}
