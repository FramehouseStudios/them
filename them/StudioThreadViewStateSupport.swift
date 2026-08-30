import Foundation

struct StudioPerceivedSpeedState: Equatable, Identifiable {
    enum Target: String, Equatable {
        case page
        case voicePin
    }

    let id: String
    let prompt: String
    let target: Target
    let sourceRaw: String
    let startedAt: Date
    let firstFeedbackAt: Date?
    let isComplete: Bool

    static let responseBudgetMilliseconds: Double = 100

    static var idle: StudioPerceivedSpeedState {
        StudioPerceivedSpeedState(
            id: "",
            prompt: "",
            target: .voicePin,
            sourceRaw: "",
            startedAt: Date(timeIntervalSince1970: 0),
            firstFeedbackAt: nil,
            isComplete: true
        )
    }

    static func start(
        requestID: String,
        prompt: String,
        target: Target,
        sourceRaw: String,
        now: Date = Date()
    ) -> StudioPerceivedSpeedState {
        StudioPerceivedSpeedState(
            id: requestID.trimmingCharacters(in: .whitespacesAndNewlines),
            prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
            target: target,
            sourceRaw: sourceRaw.trimmingCharacters(in: .whitespacesAndNewlines),
            startedAt: now,
            firstFeedbackAt: now,
            isComplete: false
        )
    }

    var isActive: Bool {
        !id.isEmpty && !isComplete
    }

    var firstFeedbackMilliseconds: Double? {
        guard let firstFeedbackAt else { return nil }
        return max(0, firstFeedbackAt.timeIntervalSince(startedAt) * 1_000)
    }

    var meetsResponseBudget: Bool {
        guard let firstFeedbackMilliseconds else { return false }
        return firstFeedbackMilliseconds <= Self.responseBudgetMilliseconds
    }

    var statusText: String {
        switch target {
        case .page:
            return "Writing to the page..."
        case .voicePin:
            return "Preparing a fast reply..."
        }
    }

    var skeletonLines: [String] {
        switch target {
        case .page:
            return ["INT. LOCATION - MOMENTS LATER", "Action arrives first.", "CHARACTER", "A line is forming."]
        case .voicePin:
            return ["Reading the draft signal.", "Finding the useful note.", "Shaping the reply."]
        }
    }

    func completing() -> StudioPerceivedSpeedState {
        StudioPerceivedSpeedState(
            id: id,
            prompt: prompt,
            target: target,
            sourceRaw: sourceRaw,
            startedAt: startedAt,
            firstFeedbackAt: firstFeedbackAt,
            isComplete: true
        )
    }
}

enum StudioThreadViewStateSource: String, Codable, Equatable {
    case none
    case local
    case backend
    case merged
}

enum StudioAcknowledgedDiffStorageSupport {
    static func normalizePersistentKey(_ value: String) -> String {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return "" }
        guard normalized.hasPrefix("write:") else { return normalized }
        let writeID = normalized
            .dropFirst("write:".count)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !writeID.isEmpty else { return "" }
        return "lineage:\(writeID)"
    }
}

struct StudioThreadViewPersistDeferralContext: Equatable {
    let hasProjectKey: Bool
    let isRestoringFullThreadBrowseState: Bool
    let isAwaitingInitialFullThreadRestore: Bool
    let isAwaitingInitialAcknowledgedDiffHydration: Bool
    let isRestoringReopenedDiffState: Bool
}

enum StudioThreadViewPersistPolicy {
    static func shouldDeferBackendPersist(
        _ context: StudioThreadViewPersistDeferralContext
    ) -> Bool {
        guard context.hasProjectKey else { return false }
        return context.isRestoringFullThreadBrowseState
            || context.isAwaitingInitialFullThreadRestore
            || context.isAwaitingInitialAcknowledgedDiffHydration
            || context.isRestoringReopenedDiffState
    }
}

enum StudioThreadFocusRestorePolicy {
    static func shouldClearPersistentFocusKey(
        _ context: StudioThreadViewPersistDeferralContext
    ) -> Bool {
        !StudioThreadViewPersistPolicy.shouldDeferBackendPersist(context)
    }
}

struct StudioFullThreadBrowseState: Codable, Equatable {
    let searchText: String
    let selectedFilterRaw: String
    let selectedSceneKey: String
    let scrollTargetKey: String
    let collapsedSectionKeys: [String]
    let focusedDiffKey: String
    let reopenedLineageKeys: [String]
    let latestReopenedWriteID: String

    private enum CodingKeys: String, CodingKey {
        case searchText
        case selectedFilterRaw
        case selectedSceneKey
        case scrollTargetKey
        case collapsedSectionKeys
        case focusedDiffKey
        case reopenedLineageKeys
        case latestReopenedWriteID
    }

    init(
        searchText: String,
        selectedFilterRaw: String,
        selectedSceneKey: String,
        scrollTargetKey: String,
        collapsedSectionKeys: [String],
        focusedDiffKey: String,
        reopenedLineageKeys: [String],
        latestReopenedWriteID: String
    ) {
        self.searchText = searchText
        self.selectedFilterRaw = selectedFilterRaw
        self.selectedSceneKey = selectedSceneKey
        self.scrollTargetKey = scrollTargetKey
        self.collapsedSectionKeys = collapsedSectionKeys
        self.focusedDiffKey = focusedDiffKey
        self.reopenedLineageKeys = reopenedLineageKeys
        self.latestReopenedWriteID = latestReopenedWriteID
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        searchText = try container.decodeIfPresent(String.self, forKey: .searchText) ?? ""
        selectedFilterRaw = try container.decodeIfPresent(String.self, forKey: .selectedFilterRaw) ?? ""
        selectedSceneKey = try container.decodeIfPresent(String.self, forKey: .selectedSceneKey) ?? ""
        scrollTargetKey = try container.decodeIfPresent(String.self, forKey: .scrollTargetKey) ?? ""
        collapsedSectionKeys = try container.decodeIfPresent([String].self, forKey: .collapsedSectionKeys) ?? []
        focusedDiffKey = try container.decodeIfPresent(String.self, forKey: .focusedDiffKey) ?? ""
        reopenedLineageKeys = try container.decodeIfPresent([String].self, forKey: .reopenedLineageKeys) ?? []
        latestReopenedWriteID = try container.decodeIfPresent(String.self, forKey: .latestReopenedWriteID) ?? ""
    }

    init?(backend state: BackendScreenplayThreadViewState?) {
        guard let state else { return nil }
        self.init(
            searchText: state.searchText ?? "",
            selectedFilterRaw: state.selectedFilterRaw ?? "",
            selectedSceneKey: state.selectedSceneKey ?? "",
            scrollTargetKey: state.scrollTargetKey ?? "",
            collapsedSectionKeys: state.collapsedSectionKeys ?? [],
            focusedDiffKey: state.focusedDiffKey ?? "",
            reopenedLineageKeys: state.reopenedLineageKeys ?? [],
            latestReopenedWriteID: state.latestReopenedWriteID ?? ""
        )
    }

    var backendPayload: BackendScreenplayThreadViewState {
        BackendScreenplayThreadViewState(
            searchText: searchText.trimmingCharacters(in: .newlines),
            selectedFilterRaw: selectedFilterRaw,
            selectedSceneKey: selectedSceneKey.trimmingCharacters(in: .whitespacesAndNewlines),
            scrollTargetKey: scrollTargetKey.trimmingCharacters(in: .whitespacesAndNewlines),
            collapsedSectionKeys: collapsedSectionKeys,
            focusedDiffKey: focusedDiffKey.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            reopenedLineageKeys: reopenedLineageKeys.map {
                $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            }.filter { !$0.isEmpty },
            latestReopenedWriteID: latestReopenedWriteID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        )
    }
}

struct StudioFullThreadBrowseStateRestoreResult: Equatable {
    let record: StudioFullThreadBrowseState?
    let source: StudioThreadViewStateSource
    let focusedDiffSource: StudioThreadViewStateSource
    let reopenedSource: StudioThreadViewStateSource

    static let empty = StudioFullThreadBrowseStateRestoreResult(
        record: nil,
        source: .none,
        focusedDiffSource: .none,
        reopenedSource: .none
    )

    static func resolve(
        local: StudioFullThreadBrowseState?,
        backend: StudioFullThreadBrowseState?
    ) -> StudioFullThreadBrowseStateRestoreResult {
        guard local != nil || backend != nil else { return .empty }

        let search = chooseString(
            local?.searchText,
            backend?.searchText,
            isMeaningful: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        let filter = chooseString(
            local?.selectedFilterRaw,
            backend?.selectedFilterRaw,
            isMeaningful: { value in
                let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
                return !normalized.isEmpty && normalized.lowercased() != defaultFilterRaw
            }
        )
        let selectedScene = chooseString(
            local?.selectedSceneKey,
            backend?.selectedSceneKey,
            isMeaningful: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        let scrollTarget = chooseString(
            local?.scrollTargetKey,
            backend?.scrollTargetKey,
            isMeaningful: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        let collapsed = chooseArray(
            local?.collapsedSectionKeys,
            backend?.collapsedSectionKeys
        )
        let focusedDiff = chooseString(
            local?.focusedDiffKey,
            backend?.focusedDiffKey,
            isMeaningful: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        var reopenedLineages = chooseArray(
            local?.reopenedLineageKeys,
            backend?.reopenedLineageKeys
        )
        var reopenedWriteID = chooseString(
            local?.latestReopenedWriteID,
            backend?.latestReopenedWriteID,
            isMeaningful: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        if let local, let backend {
            let localReopened = normalizedArray(local.reopenedLineageKeys)
            let backendReopened = normalizedArray(backend.reopenedLineageKeys)
            if !backendReopened.isEmpty && localReopened == backendReopened {
                reopenedLineages = (reopenedLineages.value, .backend)
            }
            let localWriteID = normalizedString(local.latestReopenedWriteID)
            let backendWriteID = normalizedString(backend.latestReopenedWriteID)
            if !backendWriteID.isEmpty && localWriteID == backendWriteID {
                reopenedWriteID = (reopenedWriteID.value, .backend)
            }
        }

        let record = StudioFullThreadBrowseState(
            searchText: search.value,
            selectedFilterRaw: filter.value,
            selectedSceneKey: selectedScene.value,
            scrollTargetKey: scrollTarget.value,
            collapsedSectionKeys: collapsed.value,
            focusedDiffKey: focusedDiff.value,
            reopenedLineageKeys: reopenedLineages.value,
            latestReopenedWriteID: reopenedWriteID.value
        )

        return StudioFullThreadBrowseStateRestoreResult(
            record: record,
            source: collapseSources([
                search.source,
                filter.source,
                selectedScene.source,
                scrollTarget.source,
                collapsed.source,
                focusedDiff.source,
                reopenedLineages.source,
                reopenedWriteID.source,
            ]),
            focusedDiffSource: focusedDiff.source,
            reopenedSource: collapseSources([reopenedLineages.source, reopenedWriteID.source])
        )
    }

    private static let defaultFilterRaw = "all"

    private static func collapseSources(_ sources: [StudioThreadViewStateSource]) -> StudioThreadViewStateSource {
        let active = Array(Set(sources.filter { $0 != .none }))
        if active.isEmpty { return .none }
        if active.count == 1 { return active[0] }
        return .merged
    }

    private static func chooseString(
        _ localValue: String?,
        _ backendValue: String?,
        isMeaningful: (String) -> Bool
    ) -> (value: String, source: StudioThreadViewStateSource) {
        let local = localValue ?? ""
        if isMeaningful(local) {
            return (local, .local)
        }
        let backend = backendValue ?? ""
        if isMeaningful(backend) {
            return (backend, .backend)
        }
        return ("", .none)
    }

    private static func chooseArray(
        _ localValue: [String]?,
        _ backendValue: [String]?
    ) -> (value: [String], source: StudioThreadViewStateSource) {
        let local = localValue ?? []
        if !local.isEmpty {
            return (local, .local)
        }
        let backend = backendValue ?? []
        if !backend.isEmpty {
            return (backend, .backend)
        }
        return ([], .none)
    }

    nonisolated private static func normalizedString(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    nonisolated private static func normalizedArray(_ values: [String]) -> [String] {
        values.map(normalizedString).filter { !$0.isEmpty }.sorted()
    }
}
