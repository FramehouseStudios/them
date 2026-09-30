import Foundation

/// Saved screenplay versions never change, so a version this app already holds
/// need not download again. Project reads and saves name the versions held here
/// (`known_version_ids`); the backend omits their bulk (draft, write anchors,
/// bindings — each anchor carries its inserted page text), and `fill` puts the
/// held version back before any caller sees the project. At 74 pages a save
/// answered 3.2 MB and the phone spent ~26 s per page on it, so the last page
/// of a run could sit unsaved (seen live 2026-09-30).
/// A backend without the field sends every version whole, as before.
nonisolated final class ScreenplayKnownVersionDrafts: @unchecked Sendable {
    static let shared = ScreenplayKnownVersionDrafts()

    private let lock = NSLock()
    private var versionsByProject: [String: [String: BackendScreenplayVersion]] = [:]

    /// Ids of the whole versions held for this project (the backend checks membership).
    func knownVersionIDs(forProject projectID: String) -> [String] {
        lock.lock(); defer { lock.unlock() }
        return Array((versionsByProject[projectID] ?? [:]).keys.sorted().prefix(64))
    }

    func addKnownVersionIDs(to payload: inout [String: Any], projectID: String) {
        let ids = knownVersionIDs(forProject: projectID)
        if !ids.isEmpty { payload["known_version_ids"] = ids }
    }

    func queryItems(forProject projectID: String) -> [URLQueryItem] {
        let ids = knownVersionIDs(forProject: projectID)
        return ids.isEmpty ? [] : [URLQueryItem(name: "known_version_ids", value: ids.joined(separator: ","))]
    }

    /// Puts back the versions the backend sent lean and remembers the ones it
    /// sent whole. Only ids still in the project's version list are kept.
    func fill(_ project: inout BackendScreenplayProjectSummary?) {
        guard var summary = project, let versions = summary.versions else { return }
        lock.lock(); defer { lock.unlock() }
        var held = versionsByProject[summary.id] ?? [:]
        let filled: [BackendScreenplayVersion] = versions.map { version in
            if (version.draft ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return held[version.id] ?? version
            }
            held[version.id] = version
            return version
        }
        let listed = Set(filled.map(\.id))
        versionsByProject[summary.id] = held.filter { listed.contains($0.key) }
        summary.versions = filled
        project = summary
    }

    func forgetAll() {
        lock.lock(); defer { lock.unlock() }
        versionsByProject.removeAll()
    }
}
