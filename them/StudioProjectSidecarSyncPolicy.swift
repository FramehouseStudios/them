import Foundation

/// Decides whether a Studio sidecar write (thread view, acknowledged diffs,
/// Ask/Note history) would only repeat what the server already holds.
///
/// Every project switch restores these values and the restore itself
/// schedules a debounced project upsert. Writing an unchanged payload bumps the
/// project's version, and the 3 s cross-device poll then reloads the whole
/// project a second time. Skipping redundant writes removes both costs.
///
/// Comparison is semantic: `nil`, `""`, `[]` and `{}` all mean "nothing
/// here", because the client and server spell empty state differently. When
/// the check cannot prove equality the write still goes out.
enum StudioProjectSidecarSyncPolicy {
    static func threadViewMatchesServer(
        _ project: BackendScreenplayProjectSummary,
        threadView: BackendScreenplayThreadViewState,
        acknowledgedKeys: [String],
        acknowledgedEntries: [BackendScreenplayDiffAcknowledgementEntry]
    ) -> Bool {
        semanticallyEqual(project.studioThreadViewState, threadView)
            && semanticallyEqual(project.studioDiffAcknowledged?.keys, acknowledgedKeys)
            && semanticallyEqual(project.studioDiffAcknowledged?.entries, acknowledgedEntries)
    }

    static func askNoteHistoryMatchesServer(
        _ project: BackendScreenplayProjectSummary,
        history: [BackendScreenplayStudioExchange]
    ) -> Bool {
        semanticallyEqual(project.studioAskNoteHistory, history)
    }

    static func semanticallyEqual<Value: Encodable>(_ lhs: Value?, _ rhs: Value?) -> Bool {
        guard let left = normalizedJSON(lhs), let right = normalizedJSON(rhs) else { return false }
        return left.isEqual(right)
    }

    /// Returns an `NSNull` for "empty", or nil when the value cannot be encoded.
    private static func normalizedJSON<Value: Encodable>(_ value: Value?) -> NSObject? {
        guard let value else { return NSNull() }
        guard let data = try? JSONEncoder().encode(value),
              let object = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) else {
            return nil
        }
        return stripEmpty(object) ?? NSNull()
    }

    private static func stripEmpty(_ object: Any) -> NSObject? {
        switch object {
        case is NSNull:
            return nil
        case let string as String:
            return string.isEmpty ? nil : string as NSString
        case let array as [Any]:
            let items = array.compactMap(stripEmpty)
            return items.isEmpty ? nil : items as NSArray
        case let dictionary as [String: Any]:
            let pairs = dictionary.compactMapValues(stripEmpty)
            return pairs.isEmpty ? nil : pairs as NSDictionary
        case let number as NSNumber:
            return number
        default:
            return object as? NSObject
        }
    }
}

extension BackendScreenplayThreadViewState {
    /// The payload for "no browse state", sent so the server clears old state.
    static let empty = BackendScreenplayThreadViewState(
        searchText: "",
        selectedFilterRaw: "",
        selectedSceneKey: "",
        scrollTargetKey: "",
        collapsedSectionKeys: [],
        focusedDiffKey: "",
        reopenedLineageKeys: [],
        latestReopenedWriteID: ""
    )
}

/// The last sidecar payload sent per project, so an identical one is not sent
/// again. The server stores a normalized copy (it cuts `insertedText` to
/// 2,400 characters, fills a blank note title with "Clementine"), so a long
/// page write never "matches the server"; each saved response was applied,
/// the history re-persisted, and the Studio upserted the whole project about
/// once a second while open (seen live 2026-09-28: 124 upserts, ~10 MB of
/// responses, in 2.5 minutes). Cleared on relaunch, so at most one repeat
/// per project per launch.
@MainActor
enum StudioSidecarSentMemo {
    private static var sent: [String: Data] = [:]

    static func isRepeat<Payload: Encodable>(_ kind: String, projectID: String, payload: Payload) -> Bool {
        guard let data = encoded(payload) else { return false }
        return sent["\(kind)|\(projectID)"] == data
    }

    static func record<Payload: Encodable>(_ kind: String, projectID: String, payload: Payload) {
        guard let data = encoded(payload) else { return }
        sent["\(kind)|\(projectID)"] = data
    }

    static func reset() { sent = [:] }

    private static func encoded<Payload: Encodable>(_ payload: Payload) -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try? encoder.encode(payload)
    }
}

/// The thread-view sidecar as one comparable value for `StudioSidecarSentMemo`.
struct StudioThreadViewSidecar: Encodable {
    let threadView: BackendScreenplayThreadViewState
    let keys: [String]
    let entries: [BackendScreenplayDiffAcknowledgementEntry]
}
