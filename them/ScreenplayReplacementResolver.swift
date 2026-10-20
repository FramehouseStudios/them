import Foundation
import ScreenplayStudio

nonisolated struct ScreenplayPendingReplacementTarget: Identifiable, Equatable {
    let id: UUID
    let sourceWriteID: String
    let startLine: Int
    let endLine: Int
    let currentText: String
    let draftIdentity: ScreenplayDraftContentIdentity
    let projectID: String
    let authContext: ScreenplayStudioAuthContext
    var originalSelectionRange: NSRange? = nil

    func matchesContext(projectID: String, authContext: ScreenplayStudioAuthContext) -> Bool {
        self.projectID == projectID && ScreenplayStudioAuthContextPolicy.matches(expected: self.authContext, current: authContext)
    }
}

nonisolated struct ScreenplayReplacementResolution {
    let range: NSRange
    let isReplacement: Bool
    var isRejected: Bool = false
    let traceKind: String
}

/// A captured rewrite may edit only its exact original document and range.
/// No text search or cursor fallback can authorize another block.
nonisolated enum ScreenplayReplacementResolver {
    static func resolve(existing: String, candidateRange: NSRange, fallbackSelection: NSRange,
        target: ScreenplayPendingReplacementTarget?, projectID: String,
        authContext: ScreenplayStudioAuthContext) -> ScreenplayReplacementResolution {
        guard let target else {
            return .init(range: fallbackSelection, isReplacement: false, traceKind: "resolve-miss-no-target")
        }
        let rejected = ScreenplayReplacementResolution(range: NSRange(location: 0, length: 0),
            isReplacement: false, isRejected: true, traceKind: "resolve-rejected-stale-target")
        guard target.matchesContext(projectID: projectID, authContext: authContext),
              target.draftIdentity.matches(existing) else { return rejected }
        let ns = existing as NSString
        guard candidateRange.location >= 0, candidateRange.length > 0,
              candidateRange.location <= ns.length,
              candidateRange.length <= ns.length - candidateRange.location else { return rejected }
        let range = target.originalSelectionRange ?? candidateRange
        guard range.location >= candidateRange.location, range.length > 0,
              range.location <= candidateRange.location + candidateRange.length,
              range.length <= candidateRange.location + candidateRange.length - range.location else { return rejected }
        let cleanTarget = target.currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        let text = ns.substring(with: range).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTarget.isEmpty, ScreenplayDraftTextIdentity.matches(text, cleanTarget) else { return rejected }
        return .init(range: range, isReplacement: true, traceKind: "resolve-match-line-range")
    }

    @MainActor
    static func captureSelectionRange(draft: String, expectedText: String, startLine: Int, endLine: Int,
        selection: ScreenplayEditorSelectionSnapshot?) -> NSRange? {
        guard let selection, selection.startLine == startLine, selection.endLine == endLine,
              selection.location >= 0, selection.length > 0 else { return nil }
        let ns = draft as NSString
        guard selection.location <= ns.length, selection.length <= ns.length - selection.location else { return nil }
        let range = NSRange(location: selection.location, length: selection.length)
        guard ScreenplayDraftTextIdentity.matches(ns.substring(with: range).trimmingCharacters(in: .whitespacesAndNewlines),
            expectedText.trimmingCharacters(in: .whitespacesAndNewlines)) else { return nil }
        return range
    }
}
