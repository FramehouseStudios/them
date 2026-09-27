import Foundation

/// Adopting a lighter project payload without losing the open project's
/// version history.
///
/// Activation, metadata upserts and the project list return projects without
/// `versions` (the backend omits the key unless asked). Assigning one of those
/// to `selectedProject` emptied the Studio Saved tab ("No saved versions yet")
/// for a project with dozens of saves. That used to be hidden because the next
/// cross-device poll re-read the whole project; once own writes stopped
/// triggering that re-read (#713/#714), the empty list stayed.
enum ScreenplayProjectSummaryMerge {
    static func keepingVersions(
        _ incoming: BackendScreenplayProjectSummary,
        from current: BackendScreenplayProjectSummary?
    ) -> BackendScreenplayProjectSummary {
        guard incoming.versions == nil,
              let current,
              current.id == incoming.id,
              let versions = current.versions else { return incoming }
        var merged = incoming
        merged.versions = versions
        return merged
    }
}
