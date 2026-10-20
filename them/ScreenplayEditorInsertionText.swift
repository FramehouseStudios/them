import Foundation
import ScreenplayStudio

/// One formatting owner for native insertion and explicit recovered-page edits.
nonisolated enum ScreenplayEditorInsertionText {
    static func preparedCore(_ raw: String, existing: String, insertionRange: NSRange,
        replacementText: String = "") -> String {
        guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "" }
        return FountainFormatter.removingDuplicateLeadingSceneHeading(
            from: raw.trimmingCharacters(in: .whitespacesAndNewlines), existingDraft: existing,
            insertionUTF16Location: insertionRange.location, replacementText: replacementText
        ).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func affixes(existing: String, selection: NSRange) -> (prefix: String, suffix: String) {
        guard !existing.isEmpty else { return ("", "") }
        let ns = existing as NSString
        let end = selection.location + selection.length
        let before = selection.location > 0 ? ns.substring(with: NSRange(location: selection.location - 1, length: 1)) : ""
        let after = end < ns.length ? ns.substring(with: NSRange(location: end, length: 1)) : ""
        return (before.isEmpty ? "" : before == "\n" ? "\n" : "\n\n",
                after.isEmpty ? "" : after == "\n" ? "\n" : "\n\n")
    }

    static func text(_ raw: String, existing: String, selection: NSRange) -> String {
        let core = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !core.isEmpty else { return "" }
        let padding = affixes(existing: existing, selection: selection)
        return padding.prefix + core + padding.suffix
    }
}

func screenplayEditorPreparedInsertionCoreText(_ raw: String, existing: String,
    insertionRange: NSRange, replacementTarget: ScreenplayPendingReplacementTarget?) -> String {
    ScreenplayEditorInsertionText.preparedCore(raw, existing: existing,
        insertionRange: insertionRange, replacementText: replacementTarget?.currentText ?? "")
}
