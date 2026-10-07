import Foundation
import ScreenplayStudio

/// Typing in a long script rebuilt the structured draft (scenes, cast,
/// bindings, intelligence report) on every keystroke: ~70 ms each at 51
/// pages, so keys queued up behind each other (sampled 2026-09-30). While the
/// writer types, that rebuild waits for a short pause. The draft text itself is
/// still stored on every keystroke, so a crash loses nothing typed.
@MainActor
final class ScreenplayTypingSnapshotCoalescer {
    static let shared = ScreenplayTypingSnapshotCoalescer()
    static let pause: Duration = .milliseconds(250)

    private init() {}

    private var pending: Task<Void, Never>?
    /// The last text the editor published while typing.
    private(set) var typedText: String?

    func schedule(text: String, elements: [ScreenplayEditorElement?], bridge: ScreenplayLiveDraftBridge) {
        bridge.persistDraftText(text)
        typedText = text
        pending?.cancel()
        pending = Task { @MainActor [weak bridge] in
            try? await Task.sleep(for: Self.pause)
            guard !Task.isCancelled, let bridge else { return }
            let coalescer = ScreenplayTypingSnapshotCoalescer.shared
            coalescer.pending = nil
            // A page write or restore that replaced the text since wins.
            guard Self.appliesPending(typed: text, current: bridge.draftText) else { return }
            bridge.syncStructuredDraftSnapshot(text: text, elements: elements)
        }
    }

    private var lastIntegrityIssues: [ScreenplayPageIntegrityIssue]?

    /// The page's integrity issues. While the writer is typing, the last answer
    /// stands until the pause (a full re-read per keystroke was ~50 ms at 51
    /// pages); the pause's rebuild re-renders Studio with the exact answer.
    func integrityIssues(for draft: String) -> [ScreenplayPageIntegrityIssue] {
        if pending != nil, let lastIntegrityIssues { return lastIntegrityIssues }
        let issues = FountainFormatter.screenplayIntegrityIssues(in: draft)
        lastIntegrityIssues = issues
        return issues
    }

    private var lastPageCount: (linesPerPage: Int, count: Int)?

    /// The page count in Studio's header. While typing, the last count stands
    /// until the pause (paginating the whole script per keystroke was ~35 ms at
    /// 51 pages).
    func pageCount(for draft: String, linesPerPage: Int) -> Int {
        if pending != nil, let lastPageCount, lastPageCount.linesPerPage == linesPerPage { return lastPageCount.count }
        let count = ScreenplayPageLayout.pageCount(for: draft, linesPerPage: linesPerPage)
        lastPageCount = (linesPerPage, count)
        return count
    }

    /// The draft text this editor just typed is rebuilt by the pending pass;
    /// the draft-text observer does not rebuild it a second time.
    func owns(_ text: String) -> Bool { pending != nil && typedText == text }

    nonisolated static func appliesPending(typed: String, current: String) -> Bool {
        current.isEmpty || current == typed
    }
}
