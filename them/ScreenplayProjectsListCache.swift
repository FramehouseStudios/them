import Foundation

/// The last project list for Studio's lightweight cross-device poll (no
/// versions, no drafts). The poll runs every 15 s and almost always finds
/// nothing new; with the list's ETag the backend answers 304 and the list is
/// served from here instead of ~18 KB of JSON (measured 2026-09-28).
/// Entries belong to one signed-in account; another account never reads them.
nonisolated struct ScreenplayProjectsListCache {
    private struct Entry {
        let owner: String
        let etag: String
        let payload: BackendScreenplayProjectsResponse
    }

    private var entries: [Int: Entry] = [:]

    static func isEligible(includeVersions: Bool, includeDrafts: Bool) -> Bool {
        !includeVersions && !includeDrafts
    }

    func etag(owner: String, limit: Int) -> String? {
        guard !owner.isEmpty, let entry = entries[limit], entry.owner == owner, !entry.etag.isEmpty else { return nil }
        return entry.etag
    }

    func payload(owner: String, limit: Int) -> BackendScreenplayProjectsResponse? {
        guard !owner.isEmpty, let entry = entries[limit], entry.owner == owner else { return nil }
        return entry.payload
    }

    mutating func store(owner: String, limit: Int, etag: String, payload: BackendScreenplayProjectsResponse) {
        guard !owner.isEmpty, !etag.isEmpty else {
            entries[limit] = nil
            return
        }
        entries[limit] = Entry(owner: owner, etag: etag, payload: payload)
    }
}
