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
