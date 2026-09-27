import Foundation

/// Identifies the inputs of one draft-insights pass (page layout, revision
/// colors, format lint) so the same draft is not sent three times twice.
///
/// Loading a project runs the pass, and ~0.8 s later the draft debounce fires
/// with the same text and ran it again. The debounced path now skips when the
/// inputs match the last pass and nothing on screen is showing an error.
/// Manual retries and explicit refreshes always run.
enum StudioDraftInsightsSignature {
    static func make(
        draft: String,
        title: String,
        phase: String,
        linesPerPage: Int,
        revisionBaseDraft: String,
        revisionColor: String,
        frameworkID: String
    ) -> Int {
        var hasher = Hasher()
        hasher.combine(draft.trimmingCharacters(in: .whitespacesAndNewlines))
        hasher.combine(title)
        hasher.combine(phase)
        hasher.combine(linesPerPage)
        hasher.combine(revisionBaseDraft)
        hasher.combine(revisionColor)
        hasher.combine(frameworkID.trimmingCharacters(in: .whitespacesAndNewlines))
        return hasher.finalize()
    }

    static func shouldRecompute(last: Int?, current: Int, hasVisibleError: Bool) -> Bool {
        hasVisibleError || last != current
    }
}
