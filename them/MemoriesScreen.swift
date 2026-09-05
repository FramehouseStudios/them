import SwiftUI
import Combine

// MARK: - Model

struct MemoryItem: Identifiable, Hashable {
    let id: String
    var key: String
    var title: String
    var summary: String
    var reason: String
    var rememberedDate: Date
    var lastUsedDate: Date?
    var snippets: [String]
    var emotionalTone: String
    var salience: Double
    var confidence: Double
    var qualityScore: Double
    var qualityHitCount: Int
    var qualityCorrectionCount: Int
    var qualityLastFeedbackDate: Date?
    var stalenessDays: Int
    var stalenessBand: String
    var editable: Bool
    var source: String
    var referenceHint: String
    var characterBible: BackendCharacterBibleMemory?
    var episodicID: String
    var projectID: String
    var projectTitle: String
    var characterNames: [String]
    var memoryTags: [String]
    var isCorrectionMemory: Bool
    var isSuperseded: Bool
    var supersededDate: Date?
    var supersededByMemoryID: String
    var supersededReason: String
    var supersededTerms: [String]
    var correctionReceipt: BackendCanonCorrectionReceipt?
    var correctionAmbiguity: BackendCanonCorrectionAmbiguity?
    var referenceCount: Int
    var storySpine: BackendStorySpineMemory?
}

private extension MemoryItem {
    var hasCorrectionBible: Bool {
        guard let bible = characterBible else { return false }
        return !bible.corrections.isEmpty ||
            !bible.correctedTerms.isEmpty ||
            !bible.correctionReplacements.isEmpty
    }

    var hasRepairState: Bool {
        isSuperseded || isCorrectionMemory || hasCorrectionBible
    }

    var hasCanonCorrectionControl: Bool {
        correctionReceipt != nil || correctionAmbiguity != nil
    }

    var repairBadgeText: String {
        if isSuperseded { return "Repaired" }
        if isCorrectionMemory || hasCorrectionBible { return "Correction" }
        return "Memory"
    }

    var repairBadgeHelp: String {
        if isSuperseded {
            return "This memory is preserved for history but no longer used in prompts."
        }
        if isCorrectionMemory || hasCorrectionBible {
            return "This memory contains an authoritative correction."
        }
        return "Memory status."
    }

    var repairAccessibilityLabel: String {
        hasRepairState ? repairBadgeHelp : ""
    }

    var projectDisplayName: String {
        if !projectTitle.isEmpty { return projectTitle }
        if !projectID.isEmpty { return projectID }
        return ""
    }
}

enum MemoryForgetError: LocalizedError {
    case changed, removed, invalidReceipt, inProgress

    var errorDescription: String? {
        switch self {
        case .changed:
            return "This memory changed after you opened the confirmation. Review the latest memory, then choose Forget again."
        case .removed:
            return "This memory is no longer available. Refresh Memories to see the latest saved memories."
        case .invalidReceipt:
            return "Couldn’t confirm this memory was forgotten. Refresh Memories before trying again."
        case .inProgress:
            return "A memory is already being forgotten. Wait for it to finish before trying again."
        }
    }
}

enum MemoryForgetPresentation {
    static func confirmationMessage(for item: MemoryItem) -> String {
        let key = item.key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let id = normalizedID(item.id)
        let scope: String
        if key.hasPrefix("character:") {
            scope = "This removes remembered character details for this name across your account, not just this project."
        } else if key.hasPrefix("episode:") {
            scope = "This removes the saved creative episode from Clementine’s memory."
        } else if id.hasPrefix("history-") {
            scope = "This also removes the associated saved conversation turn from History."
        } else if id == "memory-last-recap" {
            scope = "This clears the last saved conversation recap and its snapshot."
        } else {
            scope = "This removes this saved memory from Memories. It does not erase every mention of it elsewhere."
        }
        return "“\(item.title)”\n\n\(scope) There is no undo for this action."
    }

    static func errorMessage(for error: Error) -> String {
        if let local = error as? MemoryForgetError { return local.localizedDescription }
        if let backend = error as? BackendMemoryAPIError {
            if backend.requiresUserAuthentication {
                return "Sign in to forget this memory. Return Home, sign in, then open Memories again."
            }
            if backend.isCrossDeviceMemoryConflict {
                return MemoryForgetError.changed.localizedDescription
            }
        }
        // A lost response can follow a successful or partial server write.
        return "Couldn’t confirm this memory was forgotten. You can still read the copy shown here. Check your connection and refresh Memories before trying again."
    }

    static func normalizedID(_ value: String) -> String {
        value.lowercased().filter { !$0.isWhitespace }
    }
}

// MARK: - ViewModel

@MainActor
final class MemoriesViewModel: ObservableObject {
    enum ScreenState: Equatable {
        case loading
        case empty
        case loaded([MemoryItem])
        case error(message: String)
    }

    @Published var state: ScreenState = .loading
    @Published var selection: MemoryItem?
    @Published var subtitle: String = "Moments I have remembered about you."
    @Published var qualitySnapshot: BackendMemoryQualitySnapshot?
    @Published var recentActionReceipts: [BackendActionReceipt] = []
    @Published var pendingScreenplayQuestion: BackendPendingScreenplayQuestion?
    @Published var storyMovePreferences: [BackendStoryMovePreference] = []
    @Published var updatingStoryMoveFamily = ""
    @Published var preferenceActionError = ""
    @Published var correctingStoryObligationID = ""
    @Published var storyObligationActionError = ""
    @Published private(set) var isRefreshing = false
    @Published private(set) var refreshError: String?
    @Published private(set) var actionNotice: String?

    typealias MemoriesLoader = @MainActor (Bool, String?) async throws -> BackendReadResult<BackendMemoriesResponse>
    typealias PendingQuestionLoader = @MainActor (Bool) async throws -> BackendPendingScreenplayQuestion?
    typealias ForgetLoader = @MainActor (String, String) async throws -> BackendReadResult<BackendMemoryMutationResponse>

    private let api: BackendMemoryAPI
    private let notificationCenter: NotificationCenter
    private var memoriesLoader: MemoriesLoader
    private var pendingQuestionLoader: PendingQuestionLoader
    private var forgetLoader: ForgetLoader?
    private var forgettingMemoryID: String?
    private var lastLoadedAt: Date?
    private let reloadCooldownSeconds: TimeInterval = 1.0
    private var lastSync: BackendSyncState = .empty
    private var turnObserver: NSObjectProtocol?
    private var latestSeenStateVersion = ""
    private var displayedMemoryStateVersion = ""
    private var displayedCreativeMemoryRevision = ""
    private var pendingEventVersions: Set<String> = []
    private var pendingFullRefresh = false
    private var mutationRevision = 0
    private var editingMemoryID: String?
    #if DEBUG
    private var isUITestFixture = false
    #endif

    init(
        api: BackendMemoryAPI = .shared,
        notificationCenter: NotificationCenter = .default,
        memoriesLoader: MemoriesLoader? = nil,
        pendingQuestionLoader: PendingQuestionLoader? = nil,
        forgetLoader: ForgetLoader? = nil
    ) {
        self.api = api
        self.notificationCenter = notificationCenter
        self.forgetLoader = forgetLoader
        self.memoriesLoader = memoriesLoader ?? { force, sinceVersion in
            try await api.fetchMemories(limit: 72, force: force, sinceVersion: sinceVersion)
        }
        self.pendingQuestionLoader = pendingQuestionLoader ?? { force in
            try await api.bootstrapSession(force: force).pendingScreenplayQuestion
        }
        turnObserver = notificationCenter.addObserver(
            forName: .themTurnCommitted,
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let self, let event = BackendTurnCommittedEvent(notification: note) else { return }
            Task { @MainActor [weak self] in
                self?.handleTurnCommitted(event)
            }
        }
    }

    deinit {
        if let turnObserver {
            notificationCenter.removeObserver(turnObserver)
        }
    }

    @discardableResult
    func load(
        force: Bool = false,
        sinceVersion: String? = nil,
        refreshPendingQuestion: Bool = true
    ) async -> AdaptiveBackgroundSyncOutcome {
        let isDeltaFetch = !(sinceVersion?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        if isRefreshing {
            pendingFullRefresh = pendingFullRefresh || force
            return .deferred
        }
        if !force, !isDeltaFetch, let lastLoadedAt,
           Date().timeIntervalSince(lastLoadedAt) < reloadCooldownSeconds {
            return .deferred
        }

        isRefreshing = true
        refreshError = nil
        if case .error = state { state = .loading }
        let readRevision = mutationRevision
        defer { finishRead() }

        do {
            if refreshPendingQuestion {
                _ = await refreshPendingScreenplayQuestion(force: force)
            }
            try Task.checkCancellation()
            let result = try await memoriesLoader(force, sinceVersion)
            try Task.checkCancellation()
            guard readRevision == mutationRevision else {
                pendingFullRefresh = true
                return .deferred
            }
            applyReadSnapshot(result.payload)
            lastLoadedAt = Date()
            return .succeeded
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled { return .deferred }
            switch state {
            case .loaded:
                refreshError = "Couldn’t refresh memories. You can still read the memories already loaded."
            case .empty:
                refreshError = "Couldn’t refresh memories. Try again to check for new memories."
            case .loading, .error:
                state = .error(message: error.localizedDescription)
            }
            return .failed
        }
    }

    private func applyReadSnapshot(_ payload: BackendMemoriesResponse) {
        let noChange = payload.deltaNoChange == true
        if !noChange || payload.memoryQuality != nil { qualitySnapshot = payload.memoryQuality }
        if !noChange || payload.actionReceipts != nil { recentActionReceipts = payload.actionReceipts?.items ?? [] }
        if !noChange || payload.storyMovePreferences != nil { storyMovePreferences = payload.storyMovePreferences ?? [] }
        if !noChange || payload.userName != nil {
            let name = payload.userName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            subtitle = name.isEmpty ? "Moments I have remembered about you." : "Moments I have remembered about \(name)."
        }

        // Advance only to the response this screen received, never a cursor
        // inherited from another request through the shared API sync state.
        lastSync.stateVersion = payload.stateVersion ?? ""
        lastSync.lastTurnId = payload.lastTurnId ?? ""
        lastSync.lastUpdatedAt = payload.lastUpdatedAt ?? 0
        lastSync.memoryUpdatedAt = payload.memoryUpdatedAt ?? 0
        lastSync.historyUpdatedAt = payload.historyUpdatedAt ?? 0
        latestSeenStateVersion = lastSync.stateVersion
        displayedMemoryStateVersion = payload.stateVersion?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        displayedCreativeMemoryRevision = payload.creativeMemoryRevision?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !noChange else { return }

        // Changed /memories responses contain the complete bounded snapshot.
        // Conversation samples must not recreate cards removed by a clear.
        let unique = payload.memories.map(memoryItem(from:))
            .reduce(into: [String: MemoryItem]()) { $0[$1.id] = $1 }
        let items = unique.values.sorted {
            $0.rememberedDate == $1.rememberedDate ? $0.id < $1.id : $0.rememberedDate > $1.rememberedDate
        }
        state = items.isEmpty ? .empty : .loaded(items)
        if let selected = selection, unique[selected.id] == nil, editingMemoryID != selected.id {
            selection = nil
        }
    }

    private func finishRead() {
        isRefreshing = false
        let force = pendingFullRefresh
        let needsRead = force || pendingEventVersions.contains { $0 != latestSeenStateVersion }
        pendingFullRefresh = false
        pendingEventVersions = []
        guard needsRead else { return }
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.load(
                force: force || self.latestSeenStateVersion.isEmpty,
                sinceVersion: force || self.latestSeenStateVersion.isEmpty ? nil : self.latestSeenStateVersion,
                refreshPendingQuestion: false
            )
        }
    }

    private func adoptMutationSync(_ sync: BackendSyncState) {
        mutationRevision += 1
        if isRefreshing { pendingFullRefresh = true }
        lastSync = sync
        if !sync.stateVersion.isEmpty { latestSeenStateVersion = sync.stateVersion }
    }

    func memory(forID id: String) -> MemoryItem? {
        guard case .loaded(let items) = state else { return nil }
        return items.first { $0.id == id }
    }

    func beginEditingMemory(_ item: MemoryItem) {
        editingMemoryID = item.id
    }

    func endEditingMemory() {
        editingMemoryID = nil
        if let selection, memory(forID: selection.id) == nil { self.selection = nil }
    }

    func validateMemoryEdit(_ original: MemoryItem) throws {
        guard let latest = memory(forID: original.id) else {
            throw MemoryEditConflict.removed
        }
        guard latest == original else { throw MemoryEditConflict.changed }
    }

    private enum MemoryEditConflict: LocalizedError {
        case changed, removed

        var errorDescription: String? {
            switch self {
            case .changed:
                return "This memory changed while you were correcting it. Your draft is still here. Copy any edits you want to keep, then cancel and reopen the latest memory."
            case .removed:
                return "This memory is no longer available. Your draft is still here, but it cannot be saved over a removed memory. Copy any edits you want to keep before closing."
            }
        }
    }

    @discardableResult
    func retry() async -> AdaptiveBackgroundSyncOutcome {
        await load(force: true, sinceVersion: nil)
    }

    @discardableResult
    func refreshCrossDeviceMemoriesIfNeeded() async -> AdaptiveBackgroundSyncOutcome {
        let sinceVersion = latestSeenStateVersion
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return await load(
            force: false,
            sinceVersion: sinceVersion.isEmpty ? nil : sinceVersion,
            refreshPendingQuestion: false
        )
    }

    @discardableResult
    func refreshPendingScreenplayQuestion(force: Bool) async -> AdaptiveBackgroundSyncOutcome {
        do {
            let question = try await pendingQuestionLoader(force)
            try Task.checkCancellation()
            await adoptPendingScreenplayQuestion(question)
            return .succeeded
        } catch {
            // Preserve the last known question while the backend reconnects.
            return .failed
        }
    }

    func installPendingScreenplayQuestionUITestFixtureIfNeeded() -> Bool {
        #if DEBUG
        guard IOThemRuntime.isRunningUITests,
              ProcessInfo.processInfo.arguments.contains(
                "--ui-show-pending-screenplay-question"
              ) else {
            return false
        }
        pendingScreenplayQuestion = BackendPendingScreenplayQuestion(
            id: "ui-pending-theme-question",
            projectId: "ui-project",
            projectTitle: "The Last Crossing",
            targetField: "project.theme_argument",
            targetLabel: "Theme argument",
            question: "What does Mara learn about love when control can no longer keep June safe?",
            provisionalOptions: nil,
            askedAt: Date().timeIntervalSince1970 * 1_000
        )
        isUITestFixture = true
        forgetLoader = { _, _ in throw URLError(.notConnectedToInternet) }
        let pending = pendingScreenplayQuestion
        pendingQuestionLoader = { _ in pending }
        memoriesLoader = { _, _ in
            let payload = try JSONDecoder().decode(BackendMemoriesResponse.self, from:
                Data(#"{"source":"ui-fixture","sourceIp":"","memories":[],"conversationSamples":[]}"#.utf8)
            )
            return BackendReadResult(payload: payload, sync: .empty, notModified: false)
        }
        return true
        #else
        return false
        #endif
    }

    func installMemoriesUITestFixtureIfNeeded(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        now: Date = Date()
    ) -> Bool {
        #if DEBUG
        guard arguments.contains("--ui-testing"), arguments.contains("--ui-memories-fixture") else { return false }
        isUITestFixture = true
        forgetLoader = { _, _ in throw URLError(.notConnectedToInternet) }
        pendingQuestionLoader = { _ in nil }
        var shouldFail = arguments.contains("--ui-memories-refresh-failure")
        let editable = arguments.contains("--ui-memories-editable-fixture")
        var forgottenIDs: Set<String> = []
        if arguments.contains("--ui-memories-forget-fixture") {
            var shouldFailForget = true
            forgetLoader = { id, _ in
                guard ["ui-lighthouse", "ui-causeway"].contains(id) else { throw MemoryForgetError.removed }
                if shouldFailForget {
                    shouldFailForget = false
                    throw URLError(.notConnectedToInternet)
                }
                forgottenIDs.insert(id)
                let data = try JSONSerialization.data(withJSONObject: [
                    "ok": true, "action": "forget", "status": "forgotten", "forgottenId": id,
                ])
                return BackendReadResult(
                    payload: try JSONDecoder().decode(BackendMemoryMutationResponse.self, from: data),
                    sync: .empty, notModified: false
                )
            }
        }
        memoriesLoader = { _, _ in
            if shouldFail {
                shouldFail = false
                throw URLError(.notConnectedToInternet)
            }
            return BackendReadResult(
                payload: try Self.memoriesUITestPayload(
                    now: now, refreshed: true, editable: editable, excluding: forgottenIDs
                ), sync: .empty, notModified: false
            )
        }
        do {
            applyReadSnapshot(try Self.memoriesUITestPayload(now: now, refreshed: false, editable: editable))
        } catch {
            state = .error(message: "The Memories test fixture could not load.")
        }
        return true
        #else
        return false
        #endif
    }

    #if DEBUG
    private static func memoriesUITestPayload(
        now: Date, refreshed: Bool, editable: Bool, excluding forgottenIDs: Set<String> = []
    ) throws -> BackendMemoriesResponse {
        let summary = refreshed
            ? "Mara returns to the lighthouse to tell June the truth."
            : "Mara keeps returning to the lighthouse when she needs to make a difficult choice."
        let rows: [[String: Any]] = [
            ["id": "ui-lighthouse", "key": "lighthouse", "title": "The lighthouse promise",
             "summary": summary, "reason": "A recurring image in your screenplay.",
             "emotionalTone": "hopeful", "salience": 0.7, "confidence": 0.8,
             "rememberedAt": now.timeIntervalSince1970, "snippets": ["Let the lighthouse hold the promise."],
             "referenceHint": "", "source": "theme", "editable": editable],
            ["id": "ui-causeway", "key": "causeway", "title": "The tide cuts off retreat",
             "summary": "The causeway disappears behind Mara and June as the storm arrives.",
             "emotionalTone": "tense", "salience": 0.6, "confidence": 0.75,
             "rememberedAt": now.addingTimeInterval(-3_600).timeIntervalSince1970,
             "snippets": [], "referenceHint": "", "source": "creative_memory", "editable": false],
        ]
        let data = try JSONSerialization.data(withJSONObject: [
            "source": "ui-fixture", "sourceIp": "", "stateVersion": refreshed ? "fixture-v2" : "fixture-v1",
            "memories": rows.filter { !forgottenIDs.contains($0["id"] as? String ?? "") },
            "conversationSamples": [], "deltaNoChange": false,
        ])
        return try JSONDecoder().decode(BackendMemoriesResponse.self, from: data)
    }
    #endif

    private func adoptPendingScreenplayQuestion(
        _ pending: BackendPendingScreenplayQuestion?
    ) async {
        let queuedQuestionIDs = await OfflineTalkOutbox.shared
            .pendingScreenplayQuestionResolutionIDs()
        pendingScreenplayQuestion = pending.flatMap { question in
            queuedQuestionIDs.contains(question.id) ? nil : question
        }
    }

    private func checkMutationTransport() throws {
        #if DEBUG
        // Read fixtures must never send edits or destructive writes to a live account.
        if isUITestFixture { throw URLError(.notConnectedToInternet) }
        #endif
    }

    func updateMemory(
        itemID: String,
        key: String,
        title: String,
        summary: String,
        reason: String,
        characterBible: BackendCharacterBibleMemory? = nil,
        storySpine: BackendStorySpineMemory? = nil,
        expectedItem: MemoryItem? = nil
    ) async throws -> MemoryItem {
        try checkMutationTransport()
        if let expectedItem { try validateMemoryEdit(expectedItem) }
        _ = try? await api.bootstrapSession()
        if let expectedItem { try validateMemoryEdit(expectedItem) }
        let result: BackendReadResult<BackendMemoryMutationResponse>
        do {
            if let characterBible {
                result = try await api.updateCharacterBibleMemory(
                    id: itemID,
                    key: key,
                    characterBible: characterBible
                )
            } else {
                result = try await api.updateMemoryCard(
                    id: itemID,
                    key: key,
                    title: title,
                    summary: summary,
                    reason: reason,
                    storySpine: storySpine
                )
            }
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            throw error
        }
        adoptMutationSync(result.sync)
        if let card = result.payload.memoryCard {
            let updated = memoryItem(from: card)
            replaceMemoryItem(updated)
            if selection?.id == updated.id {
                selection = updated
            }
            if result.payload.storySpineRepaired == true ||
                (result.payload.storySpineRepairCount ?? 0) > 0 {
                await load(force: true, sinceVersion: nil)
            }
            return updated
        }
        await load(force: true, sinceVersion: nil)
        if case .loaded(let items) = state,
           let updated = items.first(where: { $0.id == itemID || $0.key == key }) {
            return updated
        }
        throw NSError(domain: "MemoriesViewModel", code: -1, userInfo: [
            NSLocalizedDescriptionKey: "Memory updated, but the updated card was not found."
        ])
    }

    func forgetMemory(itemID: String, key: String, expectedItem: MemoryItem? = nil) async throws {
        guard forgettingMemoryID == nil else { throw MemoryForgetError.inProgress }
        let requestedID = MemoryForgetPresentation.normalizedID(itemID)
        guard !requestedID.isEmpty else { throw MemoryForgetError.removed }
        if let expectedItem { try validateMemoryForget(expectedItem, itemID: itemID, key: key) }
        forgettingMemoryID = requestedID
        actionNotice = nil
        defer { forgettingMemoryID = nil }
        let title = expectedItem?.title ?? memory(forID: itemID)?.title ?? "Memory"
        // Pin this action to the snapshot shown here, not another API request's newer state.
        let expectedStateVersion = displayedMemoryStateVersion
        let expectedCreativeMemoryRevision = displayedCreativeMemoryRevision
        let result: BackendReadResult<BackendMemoryMutationResponse>
        do {
            if let forgetLoader {
                result = try await forgetLoader(itemID, key)
            } else {
                try checkMutationTransport()
                guard !expectedStateVersion.isEmpty, !expectedCreativeMemoryRevision.isEmpty else {
                    throw MemoryForgetError.invalidReceipt
                }
                _ = try? await api.bootstrapSession()
                if let expectedItem { try validateMemoryForget(expectedItem, itemID: itemID, key: key) }
                result = try await api.forgetMemoryCard(
                    id: itemID, key: key,
                    expectedStateVersion: expectedStateVersion,
                    expectedCreativeMemoryRevision: expectedCreativeMemoryRevision
                )
            }
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            throw error
        }
        guard result.payload.ok,
              result.payload.action == "forget",
              result.payload.status == "forgotten",
              let forgottenID = result.payload.forgottenId,
              MemoryForgetPresentation.normalizedID(forgottenID) == requestedID else {
            throw MemoryForgetError.invalidReceipt
        }
        adoptMutationSync(result.sync)
        let characterKeyPrefix = "character:"
        if key.lowercased().hasPrefix(characterKeyPrefix) {
            ScreenplayLiveDraftBridge.shared.forgetCharacterVoiceMemory(
                named: String(key.dropFirst(characterKeyPrefix.count))
            )
        }
        removeMemoryItem(id: itemID, key: key)
        if let selected = selection,
           MemoryForgetPresentation.normalizedID(selected.id) == requestedID || selected.key == key {
            selection = nil
        }
        actionNotice = "Forgot “\(title)”."
    }

    private func validateMemoryForget(_ expected: MemoryItem, itemID: String, key: String) throws {
        guard let current = memory(forID: expected.id) else { throw MemoryForgetError.removed }
        guard current == expected, expected.id == itemID, expected.key == key else {
            throw MemoryForgetError.changed
        }
    }

    func undoCanonCorrection(receiptID: String) async throws {
        try checkMutationTransport()
        _ = try? await api.bootstrapSession()
        let result: BackendReadResult<BackendMemoryMutationResponse>
        do {
            result = try await api.undoCanonCorrection(receiptID: receiptID)
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            throw error
        }
        adoptMutationSync(result.sync)
        selection = nil
        await load(force: true, sinceVersion: nil)
    }

    func resolveCanonCorrection(ambiguityID: String, selectedFacts: [String]) async throws {
        try checkMutationTransport()
        _ = try? await api.bootstrapSession()
        let result: BackendReadResult<BackendMemoryMutationResponse>
        do {
            result = try await api.resolveCanonCorrection(
                ambiguityID: ambiguityID,
                selectedFacts: selectedFacts
            )
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            throw error
        }
        adoptMutationSync(result.sync)
        selection = nil
        await load(force: true, sinceVersion: nil)
    }

    func markMemoryQuality(
        itemID: String,
        key: String,
        signal: String
    ) async throws -> MemoryItem {
        try checkMutationTransport()
        _ = try? await api.bootstrapSession()
        let result: BackendReadResult<BackendMemoryMutationResponse>
        do {
            result = try await api.markMemoryQuality(
                id: itemID,
                key: key,
                signal: signal
            )
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            throw error
        }
        adoptMutationSync(result.sync)
        if let card = result.payload.memoryCard {
            let updated = memoryItem(from: card)
            replaceMemoryItem(updated)
            if selection?.id == updated.id {
                selection = updated
            }
            return updated
        }
        await load(force: true, sinceVersion: nil)
        if case .loaded(let items) = state,
           let updated = items.first(where: { $0.id == itemID || $0.key == key }) {
            return updated
        }
        throw NSError(domain: "MemoriesViewModel", code: -2, userInfo: [
            NSLocalizedDescriptionKey: "Memory quality updated, but the card was not found."
        ])
    }

    func promoteMemory(
        itemID: String,
        key: String,
        title: String,
        summary: String,
        reason: String
    ) async throws -> MemoryItem {
        try checkMutationTransport()
        _ = try? await api.bootstrapSession()
        let result: BackendReadResult<BackendMemoryMutationResponse>
        do {
            result = try await api.promoteMemoryCard(
                id: itemID,
                key: key.isEmpty ? nil : key,
                title: title,
                summary: summary,
                reason: reason
            )
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            throw error
        }
        adoptMutationSync(result.sync)
        if let card = result.payload.memoryCard {
            let updated = memoryItem(from: card)
            replaceMemoryItem(updated)
            if selection?.id == itemID || selection?.key == key {
                selection = updated
            }
            return updated
        }
        await load(force: true, sinceVersion: nil)
        if case .loaded(let items) = state,
           let updated = items.first(where: { $0.id == itemID || $0.key == key || $0.title == title }) {
            return updated
        }
        throw NSError(domain: "MemoriesViewModel", code: -3, userInfo: [
            NSLocalizedDescriptionKey: "Memory promoted, but the promoted card was not found."
        ])
    }

    func updateStoryMovePreference(
        _ preference: BackendStoryMovePreference,
        action: String
    ) async {
        let family = preference.family.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !family.isEmpty, updatingStoryMoveFamily.isEmpty else { return }
        updatingStoryMoveFamily = family
        preferenceActionError = ""
        defer { updatingStoryMoveFamily = "" }
        do {
            try checkMutationTransport()
            _ = try? await api.bootstrapSession()
            let result = try await api.updateStoryMovePreference(
                projectID: preference.projectId,
                projectTitle: preference.projectTitle,
                family: family,
                action: action
            )
            adoptMutationSync(result.sync)
            if let preferences = result.payload.storyMovePreferences {
                storyMovePreferences = preferences
            } else {
                await load(force: true, sinceVersion: nil)
            }
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            preferenceActionError = error.localizedDescription
        }
    }

    func resetAllStoryMovePreferences(
        projectID: String,
        projectTitle: String
    ) async {
        guard updatingStoryMoveFamily.isEmpty else { return }
        updatingStoryMoveFamily = "reset_all"
        preferenceActionError = ""
        defer { updatingStoryMoveFamily = "" }
        do {
            try checkMutationTransport()
            _ = try? await api.bootstrapSession()
            let result = try await api.updateStoryMovePreference(
                projectID: projectID,
                projectTitle: projectTitle,
                family: "",
                action: "reset_all"
            )
            adoptMutationSync(result.sync)
            storyMovePreferences = result.payload.storyMovePreferences ?? []
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            preferenceActionError = error.localizedDescription
        }
    }

    func correctStoryObligation(
        projectID: String,
        projectTitle: String,
        change: BackendStoryObligationChange,
        action: String
    ) async {
        guard correctingStoryObligationID.isEmpty else { return }
        correctingStoryObligationID = change.id
        storyObligationActionError = ""
        defer { correctingStoryObligationID = "" }
        do {
            try checkMutationTransport()
            _ = try? await api.bootstrapSession()
            let result = try await api.correctStoryObligation(
                projectID: projectID,
                projectTitle: projectTitle,
                change: change,
                action: action
            )
            adoptMutationSync(result.sync)
            await load(force: true, sinceVersion: nil)
        } catch {
            if let backendError = error as? BackendMemoryAPIError,
               backendError.isCrossDeviceMemoryConflict {
                await load(force: true, sinceVersion: nil)
            }
            storyObligationActionError = error.localizedDescription
        }
    }

    private func handleTurnCommitted(_ event: BackendTurnCommittedEvent) {
        #if DEBUG
        guard !isUITestFixture else { return }
        #endif
        // Optimistic talk notifications do not establish a saved memory.
        guard event.source != "optimistic" else { return }
        let version = event.stateVersion.isEmpty ? event.turnId : event.stateVersion
        guard !version.isEmpty, version != latestSeenStateVersion else { return }
        if isRefreshing {
            pendingEventVersions.insert(version)
            return
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            await self.load(
                force: self.latestSeenStateVersion.isEmpty,
                sinceVersion: self.latestSeenStateVersion.isEmpty ? nil : self.latestSeenStateVersion,
                refreshPendingQuestion: false
            )
        }
    }

    private func memoryItem(from card: BackendMemoryCard) -> MemoryItem {
        MemoryItem(
            id: card.id,
            key: card.key,
            title: card.title,
            summary: card.summary,
            reason: card.reason ?? "",
            rememberedDate: themDateFromEpoch(card.rememberedAt),
            lastUsedDate: themOptionalDateFromEpoch(card.lastUsedAt),
            snippets: card.snippets,
            emotionalTone: card.emotionalTone,
            salience: card.salience,
            confidence: card.confidence,
            qualityScore: min(max(card.qualityScore ?? 0.58, 0), 1),
            qualityHitCount: max(0, card.qualityHitCount ?? 0),
            qualityCorrectionCount: max(0, card.qualityCorrectionCount ?? 0),
            qualityLastFeedbackDate: themOptionalDateFromEpoch(card.qualityLastFeedbackAt),
            stalenessDays: max(0, card.stalenessDays ?? 0),
            stalenessBand: (card.stalenessBand ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            editable: card.editable ?? false,
            source: card.source,
            referenceHint: card.referenceHint.trimmingCharacters(in: .whitespacesAndNewlines),
            characterBible: card.characterBible,
            episodicID: (card.episodicId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            projectID: (card.projectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            projectTitle: (card.projectTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            characterNames: cleanList(card.characterNames ?? []),
            memoryTags: cleanList(card.tags ?? []),
            isCorrectionMemory: card.isCorrectionMemory ?? false,
            isSuperseded: card.isSuperseded ?? false,
            supersededDate: themOptionalDateFromEpoch(card.supersededAt),
            supersededByMemoryID: (card.supersededByMemoryId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            supersededReason: (card.supersededReason ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            supersededTerms: cleanList(card.supersededTerms ?? []),
            correctionReceipt: card.correctionReceipt,
            correctionAmbiguity: card.correctionAmbiguity,
            referenceCount: max(0, card.referenceCount ?? 0),
            storySpine: card.storySpine
        )
    }

    private func cleanList(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for value in values {
            let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            out.append(clean)
        }
        return out
    }

    private func replaceMemoryItem(_ memory: MemoryItem) {
        var merged = [String: MemoryItem]()
        if case .loaded(let current) = state {
            merged = Dictionary(uniqueKeysWithValues: current.map { ($0.id, $0) })
        }
        merged[memory.id] = memory
        let items = merged.values.sorted { $0.rememberedDate > $1.rememberedDate }
        state = items.isEmpty ? .empty : .loaded(items)
    }

    private func removeMemoryItem(id: String, key: String) {
        guard case .loaded(let current) = state else { return }
        let normalizedID = id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedKey = key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let filtered = current.filter { item in
            let itemID = item.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let itemKey = item.key.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if !normalizedID.isEmpty && itemID == normalizedID { return false }
            if !normalizedKey.isEmpty && itemKey == normalizedKey { return false }
            return true
        }
        state = filtered.isEmpty ? .empty : .loaded(filtered)
    }
}

// MARK: - Theme (aligned to existing io.them look)

enum MemoriesTheme {
    static let textPrimary = Color.herText.opacity(0.95)
    static let textSecondary = Color.herText.opacity(0.72)
    static let surfaceTop = Color.white.opacity(0.28)
    static let surfaceBottom = Color.white.opacity(0.16)
    static let surfaceSecondary = Color.white.opacity(0.18)
    static let stroke = Color.white.opacity(0.24)
    static let focusAccent = Color.herOrbStroke.opacity(0.72)
    static let softShadow = Color.black.opacity(0.12)
}

// MARK: - Screen

struct MemoriesScreen: View {
    private static let backgroundSyncTimer = Timer
        .publish(
            every: AdaptiveBackgroundSyncPolicy.schedulerTickInterval,
            on: .main,
            in: .common
        )
        .autoconnect()

    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @StateObject private var vm = MemoriesViewModel()
    @State private var backgroundSyncCoordinator = AdaptiveBackgroundSyncCoordinator()
    var dismissAction: () -> Void = {}
    var startTalkingAction: () -> Void = {}
    var openStudioAction: () -> Void = {}

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [
                        .herPeachTop,
                        .herPeachMid,
                        .herPeachBottom
                    ]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    header
                        .padding(.top, isCompact ? 12 : 28)
                        .padding(.bottom, 12)

                    refreshControls
                        .padding(.bottom, 12)

                    Divider()
                        .overlay(Color.white.opacity(0.22))

                    content
                        .padding(.top, isCompact ? 14 : 24)
                        .padding(.bottom, isCompact ? 16 : 28)
                }
                .padding(.horizontal, isCompact ? 16 : 24)
                .frame(maxWidth: 1240, maxHeight: .infinity, alignment: .top)
            }
            .navigationTitle("")
            .toolbarTitleDisplayMode(.inline)
            .navigationDestination(item: $vm.selection) { item in
                MemoryDetailView(
                    item: vm.memory(forID: item.id) ?? item,
                    onReturnHome: dismissAction,
                    onEditingChanged: { editing in
                        if editing { vm.beginEditingMemory(item) } else { vm.endEditingMemory() }
                    },
                    onSave: { updated, original in
                        try await vm.updateMemory(
                            itemID: updated.id,
                            key: updated.key,
                            title: updated.title,
                            summary: updated.summary,
                            reason: updated.reason,
                            characterBible: updated.characterBible,
                            storySpine: updated.storySpine,
                            expectedItem: original
                        )
                    },
                    onForget: { target in
                        try await vm.forgetMemory(
                            itemID: target.id,
                            key: target.key,
                            expectedItem: target
                        )
                    },
                    onUndoCorrection: { receipt in
                        try await vm.undoCanonCorrection(receiptID: receipt.id)
                    },
                    onResolveCorrection: { ambiguity, selectedFacts in
                        try await vm.resolveCanonCorrection(
                            ambiguityID: ambiguity.id,
                            selectedFacts: selectedFacts
                        )
                    },
                    onQualitySignal: { target, signal in
                        try await vm.markMemoryQuality(
                            itemID: target.id,
                            key: target.key,
                            signal: signal
                        )
                    },
                    onPromote: { target in
                        try await vm.promoteMemory(
                            itemID: target.id,
                            key: target.key,
                            title: target.title,
                            summary: target.summary,
                            reason: target.reason
                        )
                    }
                )
            }
        }
        .accessibilityIdentifier("memories.screen")
        .task {
            guard !vm.installMemoriesUITestFixtureIfNeeded() else { return }
            guard !vm.installPendingScreenplayQuestionUITestFixtureIfNeeded() else { return }
            let outcome = await vm.load()
            backgroundSyncCoordinator.noteImmediateRefresh(
                .memories,
                outcome: outcome,
                at: Date()
            )
        }
        .onReceive(Self.backgroundSyncTimer) { date in
            scheduleMemoriesBackgroundSync(
                trigger: .timer,
                now: date,
                isSceneActive: scenePhase == .active
            )
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            scheduleMemoriesBackgroundSync(
                trigger: .becameActive,
                now: Date(),
                isSceneActive: true
            )
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .themOfflineTalkOutboxUpdated)
        ) { _ in
            refreshPendingScreenplayQuestionImmediately()
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .themScreenplayQuestionResolved)
        ) { _ in
            refreshPendingScreenplayQuestionImmediately()
        }
    }

    private func scheduleMemoriesBackgroundSync(
        trigger: AdaptiveBackgroundSyncTrigger,
        now: Date,
        isSceneActive: Bool
    ) {
        let isTestRuntime = IOThemRuntime.isRunningTests || IOThemRuntime.isRunningUITests
        if backgroundSyncCoordinator.begin(
            .memories,
            trigger: trigger,
            now: now,
            isSceneActive: isSceneActive,
            isTestRuntime: isTestRuntime
        ) {
            Task {
                let outcome = await vm.refreshCrossDeviceMemoriesIfNeeded()
                backgroundSyncCoordinator.finish(.memories, outcome: outcome, at: Date())
            }
        }
        if backgroundSyncCoordinator.begin(
            .pendingScreenplayQuestion,
            trigger: trigger,
            now: now,
            isSceneActive: isSceneActive,
            isTestRuntime: isTestRuntime
        ) {
            Task {
                let outcome = await vm.refreshPendingScreenplayQuestion(force: false)
                backgroundSyncCoordinator.finish(
                    .pendingScreenplayQuestion,
                    outcome: outcome,
                    at: Date()
                )
            }
        }
    }

    private func refreshPendingScreenplayQuestionImmediately() {
        Task {
            let outcome = await vm.refreshPendingScreenplayQuestion(force: true)
            backgroundSyncCoordinator.noteImmediateRefresh(
                .pendingScreenplayQuestion,
                outcome: outcome,
                at: Date()
            )
        }
    }

    private var isCompact: Bool { horizontalSizeClass == .compact }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Text("Memories")
                    .font(.system(size: isCompact ? 28 : 34, weight: .semibold))
                    .foregroundStyle(MemoriesTheme.textPrimary)
                Spacer(minLength: 8)
                Button(action: dismissAction) {
                    Text("Return")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(minWidth: 74, minHeight: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(MemoriesTheme.textPrimary)
                .background(Color.white.opacity(0.18), in: Capsule())
                .accessibilityIdentifier("memories.return")
                .accessibilityLabel("Return Home")
                .accessibilityHint("Returns to Clementine and the orb.")
            }
            Text(vm.subtitle)
                .font(.system(size: 15))
                .foregroundStyle(MemoriesTheme.textSecondary)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("memories.summary")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
    }

    private var refreshControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Task { await refreshMemories() }
            } label: {
                HStack(spacing: 8) {
                    if vm.isRefreshing {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                    Text(vm.isRefreshing ? "Refreshing…" : (vm.refreshError == nil ? "Refresh memories" : "Retry refresh"))
                }
                .font(.system(size: 14, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(MemoriesTheme.textPrimary)
            .background(Color.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
            .disabled(vm.isRefreshing)
            .accessibilityIdentifier("memories.refresh")
            .accessibilityHint("Checks for the latest memories saved with Clementine.")

            if let message = vm.refreshError {
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(MemoriesTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("memories.refresh-error")
            }
            if let notice = vm.actionNotice {
                Text(notice)
                    .font(.system(size: 14))
                    .foregroundStyle(MemoriesTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("memories.action-notice")
            }
        }
    }

    private func refreshMemories() async {
        let outcome = await vm.retry()
        backgroundSyncCoordinator.noteImmediateRefresh(.memories, outcome: outcome, at: Date())
    }

    @ViewBuilder
    private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let pending = vm.pendingScreenplayQuestion {
                    PendingScreenplayQuestionMemoryCard(
                        pending: pending,
                        openStudioAction: openStudioAction
                    )
                }
                if !vm.storyMovePreferences.isEmpty {
                    CreativeStoryPreferencesCard(
                        preferences: vm.storyMovePreferences,
                        updatingFamily: vm.updatingStoryMoveFamily,
                        errorMessage: vm.preferenceActionError,
                        onUpdate: { preference, action in
                            Task {
                                await vm.updateStoryMovePreference(
                                    preference,
                                    action: action
                                )
                            }
                        },
                        onResetAll: { projectID, projectTitle in
                            Task {
                                await vm.resetAllStoryMovePreferences(
                                    projectID: projectID,
                                    projectTitle: projectTitle
                                )
                            }
                        }
                    )
                }
                if let snapshot = vm.qualitySnapshot {
                    MemoryQualityOverviewCard(snapshot: snapshot)
                }
                if !vm.recentActionReceipts.isEmpty {
                    MemoryActionReceiptsCard(receipts: vm.recentActionReceipts)
                }

                switch vm.state {
                case .loading:
                    MemoriesLoadingView()
                case .empty:
                    MemoriesEmptyView(startTalkingAction: startTalkingAction)
                case .error(let message):
                    MemoriesErrorView(message: message, retry: {
                        Task {
                            let outcome = await vm.retry()
                            backgroundSyncCoordinator.noteImmediateRefresh(
                                .memories,
                                outcome: outcome,
                                at: Date()
                            )
                        }
                    })
                case .loaded(let items):
                    if let storySpine = StorySpineSnapshot.make(from: items) {
                        StorySpineOverview(
                            snapshot: storySpine,
                            correctingObligationID: vm.correctingStoryObligationID,
                            correctionError: vm.storyObligationActionError,
                            onTap: { tapped in
                                vm.selection = tapped
                            },
                            onCorrectObligation: { change, action in
                                Task {
                                    await vm.correctStoryObligation(
                                        projectID: storySpine.projectID,
                                        projectTitle: storySpine.projectName,
                                        change: change,
                                        action: action
                                    )
                                }
                            }
                        )
                    }
                    MemoriesGrid(items: items) { tapped in
                        vm.selection = tapped
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .scrollIndicators(.automatic)
        .refreshable { await refreshMemories() }
    }
}

private struct CreativeStoryPreferencesCard: View {
    let preferences: [BackendStoryMovePreference]
    let updatingFamily: String
    let errorMessage: String
    let onUpdate: (BackendStoryMovePreference, String) -> Void
    let onResetAll: (String, String) -> Void

    @State private var showsResetConfirmation = false
    @State private var isExpanded = false

    private var projectPreferences: [BackendStoryMovePreference] {
        guard let first = preferences.first else { return [] }
        let projectID = first.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let projectTitle = first.projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return preferences
            .filter { item in
                let itemID = item.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased()
                if !projectID.isEmpty { return itemID == projectID }
                return item.projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased() == projectTitle
            }
            .sorted { left, right in
                if left.isExplicitlyCorrected != right.isExplicitlyCorrected {
                    return left.isExplicitlyCorrected
                }
                if abs(left.effectiveScore) != abs(right.effectiveScore) {
                    return abs(left.effectiveScore) > abs(right.effectiveScore)
                }
                return left.displayName < right.displayName
            }
    }

    private var projectName: String {
        let title = projectPreferences.first?.projectTitle
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return title.isEmpty ? "Current screenplay" : title
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 10) {
                Button {
                    isExpanded.toggle()
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(MemoriesTheme.focusAccent)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Creative Instincts")
                                .font(.system(size: 14, weight: .semibold, design: .default))
                                .foregroundStyle(MemoriesTheme.textPrimary)
                            Text(projectName)
                                .font(.system(size: 12, weight: .regular, design: .default))
                                .foregroundStyle(MemoriesTheme.textSecondary)
                                .lineLimit(1)
                        }

                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(MemoriesTheme.textSecondary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(
                    isExpanded ? "Collapse creative instincts" : "Expand creative instincts"
                )
                .accessibilityIdentifier("memories.story-preferences.toggle")

                Spacer()

                Button {
                    showsResetConfirmation = true
                } label: {
                    Image(systemName: "arrow.counterclockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .disabled(!updatingFamily.isEmpty)
                .help("Reset creative preference learning")
                .accessibilityLabel("Reset creative preference learning")
                .accessibilityIdentifier("memories.story-preferences.reset-all")
            }

            if isExpanded {
                ForEach(Array(projectPreferences.prefix(6))) { preference in
                    CreativeStoryPreferenceRow(
                        preference: preference,
                        isUpdating: updatingFamily == preference.family,
                        isDisabled: !updatingFamily.isEmpty,
                        onUpdate: onUpdate
                    )
                }
            } else if let leading = projectPreferences.first {
                Text(compactSummary(for: leading))
                    .font(.system(size: 12, weight: .medium, design: .default))
                    .foregroundStyle(MemoriesTheme.textSecondary)
                    .lineLimit(2)
                    .accessibilityIdentifier("memories.story-preferences.summary")
            }

            if !errorMessage.isEmpty {
                Text(errorMessage)
                    .font(.system(size: 12, weight: .medium, design: .default))
                    .foregroundStyle(Color.red.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("memories.story-preferences.error")
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.13))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.white.opacity(0.18), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("memories.story-preferences")
        .confirmationDialog(
            "Reset creative preference learning for \(projectName)?",
            isPresented: $showsResetConfirmation,
            titleVisibility: .visible
        ) {
            Button("Reset Preferences", role: .destructive) {
                guard let first = projectPreferences.first else { return }
                onResetAll(first.projectId, first.projectTitle)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Story facts and screenplay canon stay intact.")
        }
    }

    private func compactSummary(for preference: BackendStoryMovePreference) -> String {
        if preference.explicitStance == "prefer" {
            return "\(preference.displayName): corrected toward more."
        }
        if preference.explicitStance == "avoid" {
            return "\(preference.displayName): corrected toward less."
        }
        return "\(preference.displayName): \(preference.learningProvenanceSummary.lowercased())."
    }
}

private struct CreativeStoryPreferenceRow: View {
    let preference: BackendStoryMovePreference
    let isUpdating: Bool
    let isDisabled: Bool
    let onUpdate: (BackendStoryMovePreference, String) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 7) {
                    Text(preference.displayName)
                        .font(.system(size: 13, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary)
                    if preference.isExplicitlyCorrected {
                        Text("Corrected")
                            .font(.system(size: 10, weight: .semibold, design: .default))
                            .foregroundStyle(MemoriesTheme.focusAccent)
                    }
                }

                Text(preferenceSummary)
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)

                Text(evidenceLine)
                    .font(.system(size: 11, weight: .medium, design: .default))
                    .foregroundStyle(MemoriesTheme.textSecondary.opacity(0.82))
            }

            Spacer(minLength: 10)

            if isUpdating {
                ProgressView()
                    .controlSize(.small)
                    .frame(width: 28, height: 28)
            } else {
                Menu {
                    Button {
                        onUpdate(preference, "prefer")
                    } label: {
                        Label("Suggest More Like This", systemImage: "plus.circle")
                    }
                    Button {
                        onUpdate(preference, "avoid")
                    } label: {
                        Label("Suggest Less Like This", systemImage: "minus.circle")
                    }
                    Button(role: .destructive) {
                        onUpdate(preference, "reset")
                    } label: {
                        Label("Forget This Preference", systemImage: "arrow.counterclockwise")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.system(size: 16, weight: .medium))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .disabled(isDisabled)
                .help("Adjust creative preference")
                .accessibilityLabel("Adjust \(preference.displayName)")
                .accessibilityIdentifier(
                    "memories.story-preference.\(preference.family).menu"
                )
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(preference.displayName). \(preferenceSummary) \(evidenceLine)")
        .accessibilityIdentifier(
            "memories.story-preference.\(preference.family)"
        )
    }

    private var preferenceSummary: String {
        preference.creativeGuidanceSummary
    }

    private var evidenceLine: String {
        preference.learningProvenanceSummary
    }
}

private struct PendingScreenplayQuestionMemoryCard: View {
    let pending: BackendPendingScreenplayQuestion
    let openStudioAction: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: "sparkles")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(MemoriesTheme.focusAccent)
                .frame(width: 24, height: 24)

            VStack(alignment: .leading, spacing: 6) {
                Text(projectLine)
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(MemoriesTheme.textSecondary)
                    .lineLimit(1)

                Text(pending.question)
                    .font(.system(size: 15, weight: .medium, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("memories.pending-question.text")

                if let optionCount = pending.provisionalOptions?.count, optionCount > 0 {
                    Text("\(optionCount) provisional paths are waiting for your choice.")
                        .font(.system(size: 12, weight: .medium, design: .default))
                        .foregroundStyle(MemoriesTheme.focusAccent.opacity(0.88))
                        .accessibilityIdentifier("memories.pending-question.options")
                }
            }

            Spacer(minLength: 12)

            Button {
                openStudioAction()
            } label: {
                Label("Open Studio", systemImage: "arrow.up.right")
                    .font(.system(size: 13, weight: .semibold, design: .default))
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            .accessibilityIdentifier("memories.pending-question.open-studio")
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.16))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(MemoriesTheme.focusAccent.opacity(0.34), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("memories.pending-question")
    }

    private var projectLine: String {
        let title = pending.projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let target = pending.targetLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let project = title.isEmpty ? "Screenplay" : title
        return target.isEmpty ? project : "\(project) · \(target)"
    }
}

struct MemoryQualityOverviewCard: View {
    let snapshot: BackendMemoryQualitySnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Memory Quality")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))

            Text(summaryLine)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.82))
                .lineLimit(2)

            HStack(spacing: 14) {
                ledgerItem("Cards", value: intText(snapshot.totalCards))
                ledgerItem("Avg", value: percentText(snapshot.avgQualityScore))
                ledgerItem("Prompt", value: "\(intText(snapshot.promptInjectedCount))/\(intText(snapshot.promptThemeCount))")
                ledgerItem("Suppressed", value: intText(snapshot.promptSuppressedCount))
                ledgerItem("Backfill", value: intText(snapshot.backfillTotal))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(summaryLine)
    }

    private var summaryLine: String {
        let trigger = (snapshot.usefulnessLastTrigger ?? "none").trimmingCharacters(in: .whitespacesAndNewlines)
        let promptLast = relativeTime(snapshot.promptLastAt)
        let backfillLast = relativeTime(snapshot.backfillLastAt)
        return "Usefulness trigger: \(trigger). Prompt refresh: \(promptLast). Backfill: \(backfillLast)."
    }

    private func ledgerItem(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.62))
            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.88))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func intText(_ value: Int?) -> String {
        String(max(0, value ?? 0))
    }

    private func percentText(_ value: Double?) -> String {
        let normalized = min(max(value ?? 0, 0), 1)
        return "\(Int((normalized * 100).rounded()))%"
    }

    private func relativeTime(_ epoch: TimeInterval?) -> String {
        guard let epoch, epoch > 0 else { return "n/a" }
        return RelativeDateFormatter.relativeString(for: themDateFromEpoch(epoch))
    }
}

struct MemoryActionReceiptsCard: View {
    let receipts: [BackendActionReceipt]

    private var previewItems: [BackendActionReceipt] {
        Array(receipts.prefix(4))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recent Actions")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))

            ForEach(previewItems) { receipt in
                HStack(alignment: .top, spacing: 10) {
                    Text(receiptStatusTag(receipt.status))
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.80))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.white.opacity(0.16))
                        .clipShape(Capsule())

                    VStack(alignment: .leading, spacing: 2) {
                        Text(receipt.summary)
                            .font(.system(size: 13, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.90))
                            .lineLimit(2)
                        Text(RelativeDateFormatter.relativeString(for: themDateFromEpoch(receipt.createdAt)))
                            .font(.system(size: 11, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.60))
                    }
                    Spacer(minLength: 0)
                }
            }

            if receipts.count > previewItems.count {
                Text("+\(receipts.count - previewItems.count) more")
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.58))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        )
    }

    private func receiptStatusTag(_ status: String) -> String {
        let value = status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if value == "composed" || value == "created" || value == "completed" || value == "saved" {
            return "Done"
        }
        if value == "duplicate" {
            return "Skip"
        }
        if value == "failed" {
            return "Error"
        }
        return value.isEmpty ? "Action" : value.capitalized
    }
}

// MARK: - Story Spine

private struct StorySpineSnapshot: Hashable {
    let projectItem: MemoryItem
    let characterItems: [MemoryItem]
    let correctionItems: [MemoryItem]
    let spine: BackendStorySpineMemory

    static func make(from items: [MemoryItem]) -> StorySpineSnapshot? {
        let projectItems = items
            .filter { item in
                item.storySpine != nil ||
                item.source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "screenplay_project"
            }
            .sorted { $0.rememberedDate > $1.rememberedDate }
        guard let projectItem = projectItems.first else { return nil }
        let spine = projectItem.storySpine ?? BackendStorySpineMemory.emptyFallback(
            projectId: projectItem.projectID,
            projectTitle: projectItem.projectDisplayName,
            currentBeat: projectItem.summary,
            nextScenePlan: projectItem.referenceHint,
            characterFocus: projectItem.characterNames,
            updatedAt: projectItem.rememberedDate.timeIntervalSince1970
        )
        let projectKey = projectItem.projectID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let characterItems = items
            .filter { item in
                item.characterBible != nil ||
                item.source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "character_bible"
            }
            .filter { item in
                projectKey.isEmpty ||
                item.projectID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().isEmpty ||
                item.projectID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == projectKey
            }
            .sorted { $0.rememberedDate > $1.rememberedDate }
        let correctionItems = items
            .filter { $0.hasRepairState }
            .filter { item in
                projectKey.isEmpty ||
                item.projectID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().isEmpty ||
                item.projectID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == projectKey
            }
            .sorted { $0.rememberedDate > $1.rememberedDate }
        return StorySpineSnapshot(
            projectItem: projectItem,
            characterItems: Array(characterItems.prefix(4)),
            correctionItems: Array(correctionItems.prefix(3)),
            spine: spine
        )
    }

    var projectName: String {
        clean(spine.projectTitle) ??
            projectItem.projectDisplayName.nilIfBlank ??
            projectItem.title
    }

    var projectID: String {
        clean(spine.projectId) ?? projectItem.projectID
    }

    var positionText: String {
        join([spine.act, spine.featureSequence], separator: " / ") ?? "Feature"
    }

    var pageText: String {
        let current = max(0, spine.pageCount ?? 0)
        let target = max(0, spine.targetPages ?? 0)
        if current > 0 && target > 0 { return "p\(current) / \(target)" }
        if current > 0 { return "p\(current)" }
        return ""
    }

    var currentBeat: String {
        first([spine.currentBeat, spine.lastSceneOutcome, spine.sceneSummary, projectItem.summary])
    }

    var pressureText: String {
        first([spine.actPressureState, spine.featureObligation, spine.sceneObjective, spine.characterArcState])
    }

    var characterArcText: String {
        first([spine.characterArcState, cleanList(spine.characterArcTurns).first])
    }

    var nextMove: String {
        first([
            cleanList(spine.nextThreeTurns).first,
            spine.nextScenePlan,
            cleanList(spine.nextSceneMoves).first,
            projectItem.referenceHint,
        ])
    }

    var openPromise: String {
        first([
            cleanList(spine.unresolvedSetups).first,
            cleanList(spine.unresolvedStoryThreads).first,
            cleanList(spine.actThreePayoffPath).first,
            cleanList(spine.imageMotifs).first,
        ])
    }

    var characterFocusText: String {
        cleanList(spine.characterFocus).prefix(4).joined(separator: ", ")
    }

    var obligationChanges: [BackendStoryObligationChange] {
        var seen = Set<String>()
        let source = spine.storyObligationLedger ?? []
        var values = source.filter(\.isMeaningful)
        if values.isEmpty, let current = spine.currentStoryObligationChange, current.isMeaningful {
            values = [current]
        }
        return values.filter { change in
            let key = change.obligation
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            return !key.isEmpty && seen.insert(key).inserted
        }
    }

    var obligationCorrections: [BackendStoryObligationCorrection] {
        spine.storyObligationCorrections ?? []
    }

    private func first(_ values: [String?]) -> String {
        for value in values {
            if let clean = clean(value) { return clean }
        }
        return ""
    }

    private func join(_ values: [String?], separator: String) -> String? {
        let parts = values.compactMap(clean)
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: separator)
    }

    private func clean(_ value: String?) -> String? {
        let clean = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }

    private func cleanList(_ values: [String]?) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for value in values ?? [] {
            let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            out.append(clean)
        }
        return out
    }
}

private extension BackendStorySpineMemory {
    static func emptyFallback(
        projectId: String,
        projectTitle: String,
        currentBeat: String,
        nextScenePlan: String,
        characterFocus: [String],
        updatedAt: TimeInterval
    ) -> BackendStorySpineMemory {
        BackendStorySpineMemory(
            projectId: projectId,
            projectTitle: projectTitle,
            act: nil,
            featureSequence: nil,
            featureObligation: nil,
            sceneLabel: nil,
            sceneObjective: nil,
            sceneSummary: nil,
            currentBeat: currentBeat,
            logline: nil,
            themeArgument: nil,
            centralQuestion: nil,
            protagonistWant: nil,
            protagonistNeed: nil,
            antagonisticForce: nil,
            endingImage: nil,
            actPressureState: nil,
            characterArcState: nil,
            lastSceneOutcome: nil,
            nextScenePlan: nextScenePlan,
            nextSceneMoves: nil,
            nextThreeTurns: nil,
            actThreePayoffPath: nil,
            beatSequence: nil,
            characterFocus: characterFocus,
            unresolvedSetups: nil,
            unresolvedStoryThreads: nil,
            characterArcTurns: nil,
            imageMotifs: nil,
            continuityNotes: nil,
            emotionalContinuity: nil,
            pageCount: nil,
            targetPages: nil,
            updatedAt: updatedAt
        )
    }
}

private struct StorySpineOverview: View {
    let snapshot: StorySpineSnapshot
    let correctingObligationID: String
    let correctionError: String
    var onTap: (MemoryItem) -> Void
    var onCorrectObligation: (BackendStoryObligationChange, String) -> Void

    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: 235, maximum: 360), spacing: 12, alignment: .topLeading)]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Story Spine")
                        .font(.system(size: 18, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.95))
                    Text(snapshot.projectName)
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.70))
                        .lineLimit(1)
                }
                Spacer(minLength: 12)
                Button {
                    onTap(snapshot.projectItem)
                } label: {
                    Label("Open", systemImage: "rectangle.and.pencil.and.ellipsis")
                        .font(.system(size: 13, weight: .regular, design: .default))
                }
                .buttonStyle(.bordered)
            }

            HStack(spacing: 8) {
                StorySpineChip(text: snapshot.positionText)
                if !snapshot.pageText.isEmpty {
                    StorySpineChip(text: snapshot.pageText)
                }
                if !snapshot.characterFocusText.isEmpty {
                    StorySpineChip(text: snapshot.characterFocusText)
                }
            }

            LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                StorySpineSignalCard(title: "Now", value: snapshot.currentBeat, fallback: "No current beat yet.")
                StorySpineSignalCard(title: "Pressure", value: snapshot.pressureText, fallback: "No act pressure yet.")
                StorySpineSignalCard(title: "Next", value: snapshot.nextMove, fallback: "No next turn yet.")
                StorySpineSignalCard(title: "Promise", value: snapshot.openPromise, fallback: "No open setup yet.")
            }

            if !snapshot.characterArcText.isEmpty {
                StorySpineInlineNote(label: "Arc", value: snapshot.characterArcText)
            }

            if !snapshot.obligationChanges.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Setup & Payoff Movement")
                        .font(.system(size: 13, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.78))

                    ForEach(Array(snapshot.obligationChanges.prefix(3))) { change in
                        StoryObligationChangeCard(
                            change: change,
                            isSaving: correctingObligationID == change.id,
                            onCorrect: { action in
                                onCorrectObligation(change, action)
                            }
                        )
                    }
                }
                .accessibilityIdentifier("memories.story-obligations")
            }

            if !snapshot.obligationCorrections.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Writer Corrections")
                        .font(.system(size: 13, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.78))
                    ForEach(Array(snapshot.obligationCorrections.prefix(3))) { correction in
                        StoryObligationCorrectionCard(correction: correction)
                    }
                }
                .accessibilityIdentifier("memories.story-obligation-corrections")
            }

            if !correctionError.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(correctionError)
                    .font(.system(size: 11, weight: .medium, design: .default))
                    .foregroundStyle(Color.red.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("memories.story-obligation.error")
            }

            if !snapshot.characterItems.isEmpty || !snapshot.correctionItems.isEmpty {
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 180), spacing: 10, alignment: .topLeading)],
                    alignment: .leading,
                    spacing: 10
                ) {
                    StorySpineMemoryLinks(
                        title: "Characters",
                        items: snapshot.characterItems,
                        emptyText: "No character bible yet.",
                        onTap: onTap
                    )
                    StorySpineMemoryLinks(
                        title: "Corrections",
                        items: snapshot.correctionItems,
                        emptyText: "No corrections yet.",
                        onTap: onTap
                    )
                }
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .contain)
    }
}

private struct StoryObligationChangeCard: View {
    let change: BackendStoryObligationChange
    let isSaving: Bool
    let onCorrect: (String) -> Void

    private var statusColor: Color {
        switch change.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "paid_off", "paid off": return Color.green.opacity(0.86)
        case "transformed": return Color.blue.opacity(0.86)
        case "complicated": return Color.red.opacity(0.80)
        default: return Color.yellow.opacity(0.84)
        }
    }

    private var sourceLine: String {
        [change.sourceAct, change.sourceSceneHeading]
            .compactMap { value in
                let clean = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                return clean.isEmpty ? nil : clean
            }
            .joined(separator: " / ")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Label(change.statusLabel, systemImage: change.statusLabel == "Paid off" ? "checkmark.circle.fill" : "arrow.triangle.branch")
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(statusColor)
                    .accessibilityIdentifier("memories.story-obligation.\(change.accessibilityKey).status")
                Text(change.kindLabel)
                    .font(.system(size: 10, weight: .medium, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.58))
                Spacer(minLength: 8)
                if isSaving {
                    ProgressView()
                        .controlSize(.small)
                        .frame(width: 28, height: 28)
                        .accessibilityLabel("Saving story correction")
                } else {
                    Menu {
                        Button {
                            onCorrect("keep_open")
                        } label: {
                            Label("Keep Open", systemImage: "arrow.uturn.backward.circle")
                        }
                        .accessibilityIdentifier("memories.story-obligation.\(change.accessibilityKey).keep-open")

                        Button(role: .destructive) {
                            onCorrect("retire")
                        } label: {
                            Label("Retire Obligation", systemImage: "archivebox")
                        }
                        .accessibilityIdentifier("memories.story-obligation.\(change.accessibilityKey).retire")
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .font(.system(size: 15, weight: .medium, design: .default))
                            .frame(width: 28, height: 28)
                    }
                    .menuStyle(.borderlessButton)
                    .help("Correct this setup or payoff")
                    .accessibilityLabel("Correct \(change.obligation)")
                    .accessibilityIdentifier("memories.story-obligation.\(change.accessibilityKey).correct")
                }
            }

            Text(change.obligation)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.90))
                .fixedSize(horizontal: false, vertical: true)

            Text(change.result)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("memories.story-obligation.\(change.accessibilityKey).result")

            Text(change.evidence)
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.66))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("memories.story-obligation.\(change.accessibilityKey).evidence")

            if !sourceLine.isEmpty {
                Text(sourceLine)
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.50))
                    .lineLimit(2)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.09))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(statusColor.opacity(0.30), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("memories.story-obligation.\(change.accessibilityKey)")
    }
}

private struct StoryObligationCorrectionCard: View {
    let correction: BackendStoryObligationCorrection

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: correction.actionLabel == "Retired" ? "archivebox.fill" : "arrow.uturn.backward.circle.fill")
                .foregroundStyle(correction.actionLabel == "Retired" ? Color.red.opacity(0.76) : Color.green.opacity(0.82))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(correction.actionLabel)
                    .font(.system(size: 11, weight: .semibold, design: .default))
                Text(correction.obligation)
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .fixedSize(horizontal: false, vertical: true)
                if let note = correction.note,
                   !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(note)
                        .font(.system(size: 10, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.88))
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(correction.actionLabel): \(correction.obligation)")
        .accessibilityIdentifier("memories.story-obligation-correction.\(correction.accessibilityKey)")
    }
}

private struct StorySpineChip: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold, design: .default))
            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.78))
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Capsule().fill(Color.white.opacity(0.14)))
    }
}

private struct StorySpineSignalCard: View {
    let title: String
    let value: String
    let fallback: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.62))
            Text(value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : value)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.90))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 92, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.white.opacity(0.13), lineWidth: 1)
        )
    }
}

private struct StorySpineInlineNote: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.60))
            Text(value)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.86))
                .lineLimit(2)
        }
    }
}

private struct StorySpineMemoryLinks: View {
    let title: String
    let items: [MemoryItem]
    let emptyText: String
    var onTap: (MemoryItem) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.62))
            if items.isEmpty {
                Text(emptyText)
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.58))
                    .lineLimit(2)
            } else {
                ForEach(items) { item in
                    Button {
                        onTap(item)
                    } label: {
                        Text(item.characterBible?.character ?? item.title)
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.86))
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(item.title)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.08))
        )
    }
}

private extension String {
    var nilIfBlank: String? {
        let clean = trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }
}

// MARK: - Grid

struct MemoriesGrid: View {
    let items: [MemoryItem]
    var onTap: (MemoryItem) -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            memoryGrid(
                columns: [
                    GridItem(.fixed(560), spacing: 28, alignment: .topLeading),
                    GridItem(.fixed(560), spacing: 28, alignment: .topLeading)
                ]
            )
            .frame(minWidth: 1_148, alignment: .leading)

            memoryGrid(
                columns: [
                    GridItem(
                        .flexible(minimum: 0, maximum: 560),
                        alignment: .topLeading
                    )
                ]
            )
        }
    }

    private func memoryGrid(columns: [GridItem]) -> some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 28) {
            ForEach(items) { item in
                MemoryCard(item: item) {
                    onTap(item)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
    }
}

// MARK: - Card

struct MemoryCard: View {
    let item: MemoryItem
    var onTap: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var isHovering = false
    @FocusState private var isFocused: Bool

    private var cardBackground: some View {
        LinearGradient(
            colors: [MemoriesTheme.surfaceTop, MemoriesTheme.surfaceBottom],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top, spacing: 10) {
                    Text(item.title)
                        .font(.system(size: 20, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 8)

                    if item.hasRepairState {
                        MemoryRepairBadge(item: item)
                    }
                }

                Text(item.summary)
                    .font(.system(size: 15, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.9))
                    .lineSpacing(7)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)

                if !item.reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("Why: \(item.reason)")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.72))
                        .lineLimit(1)
                }

                HStack(spacing: 8) {
                    Text("Quality \(Int((min(max(item.qualityScore, 0), 1) * 100).rounded()))%")
                        .font(.system(size: 11, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.68))
                    Text("•")
                        .font(.system(size: 10, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.48))
                    Text("\(max(0, item.stalenessDays))d \(item.stalenessBand.isEmpty ? "fresh" : item.stalenessBand)")
                        .font(.system(size: 11, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.62))
                    if item.referenceCount > 0 {
                        Text("•")
                            .font(.system(size: 10, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.48))
                        Text("\(item.referenceCount)x recalled")
                            .font(.system(size: 11, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.62))
                    }
                }

                Spacer(minLength: 0)

                HStack {
                    if let lastUsed = item.lastUsedDate, lastUsed > .distantPast {
                        Text("Last used \(RelativeDateFormatter.relativeString(for: lastUsed))")
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.54))
                    }
                    Spacer()
                    Text("Remembered \(rememberedDateText)")
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.56))
                }
            }
            .padding(horizontalSizeClass == .compact ? 16 : 26)
            .frame(maxWidth: .infinity, minHeight: 200, alignment: .topLeading)
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("memories.card.\(item.id)")
        .accessibilityLabel("Memory. \(item.title). \(item.repairAccessibilityLabel). Remembered \(rememberedDateText).")
        .accessibilityHint("Opens memory details.")
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(MemoriesTheme.stroke, lineWidth: 1)
        )
        .shadow(
            color: MemoriesTheme.softShadow,
            radius: isHovering ? 28 : 22,
            x: 0,
            y: isHovering ? 12 : 8
        )
        .scaleEffect(reduceMotion ? 1 : (isHovering ? 1.015 : 1))
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.20), value: isHovering)
        .onHover { hovering in
            isHovering = hovering
        }
        .focusable(true)
        .focused($isFocused)
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(MemoriesTheme.focusAccent, lineWidth: isFocused ? 2 : 0)
        )
    }

    private var rememberedDateText: String {
        RelativeDateFormatter.relativeString(for: item.rememberedDate)
    }
}

private struct MemoryRepairBadge: View {
    let item: MemoryItem

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: item.isSuperseded ? "arrow.uturn.backward.circle.fill" : "checkmark.seal.fill")
                .font(.system(size: 11, weight: .semibold, design: .default))
            Text(item.repairBadgeText)
                .font(.system(size: 11, weight: .semibold, design: .default))
                .lineLimit(1)
        }
        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.84))
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            Capsule()
                .fill(Color.white.opacity(item.isSuperseded ? 0.12 : 0.18))
        )
        .overlay(
            Capsule()
                .stroke(Color.white.opacity(item.isSuperseded ? 0.16 : 0.24), lineWidth: 1)
        )
        .help(item.repairBadgeHelp)
        .accessibilityLabel(item.repairBadgeHelp)
    }
}

// MARK: - Detail

struct MemoryDetailView: View {
    let item: MemoryItem
    let onReturnHome: () -> Void
    let onEditingChanged: (Bool) -> Void
    let onSave: @MainActor (MemoryItem, MemoryItem) async throws -> MemoryItem
    let onForget: @MainActor (MemoryItem) async throws -> Void
    let onUndoCorrection: (BackendCanonCorrectionReceipt) async throws -> Void
    let onResolveCorrection: (BackendCanonCorrectionAmbiguity, [String]) async throws -> Void
    let onQualitySignal: (MemoryItem, String) async throws -> MemoryItem
    let onPromote: (MemoryItem) async throws -> MemoryItem

    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var currentItem: MemoryItem
    @State private var deferredItem: MemoryItem?
    @State private var showingEdit = false
    @State private var isSaving = false
    @State private var isForgetting = false
    @State private var showingForgetConfirmation = false
    @State private var forgetConfirmationItem: MemoryItem?
    @State private var forgetError: String?
    @State private var isUndoingCorrection = false
    @State private var isResolvingCorrection = false
    @State private var isSendingQuality = false
    @State private var isPromoting = false
    @State private var errorText = ""

    init(
        item: MemoryItem,
        onReturnHome: @escaping () -> Void = {},
        onEditingChanged: @escaping (Bool) -> Void = { _ in },
        onSave: @escaping @MainActor (MemoryItem, MemoryItem) async throws -> MemoryItem,
        onForget: @escaping @MainActor (MemoryItem) async throws -> Void,
        onUndoCorrection: @escaping (BackendCanonCorrectionReceipt) async throws -> Void,
        onResolveCorrection: @escaping (BackendCanonCorrectionAmbiguity, [String]) async throws -> Void,
        onQualitySignal: @escaping (MemoryItem, String) async throws -> MemoryItem,
        onPromote: @escaping (MemoryItem) async throws -> MemoryItem
    ) {
        self.item = item
        self.onReturnHome = onReturnHome
        self.onEditingChanged = onEditingChanged
        self.onSave = onSave
        self.onForget = onForget
        self.onUndoCorrection = onUndoCorrection
        self.onResolveCorrection = onResolveCorrection
        self.onQualitySignal = onQualitySignal
        self.onPromote = onPromote
        _currentItem = State(initialValue: item)
    }

    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [
                    .herPeachTop,
                    .herPeachMid,
                    .herPeachBottom
                ]),
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(currentItem.title)
                        .font(.system(size: horizontalSizeClass == .compact ? 28 : 34, weight: .semibold))
                        .foregroundStyle(MemoriesTheme.textPrimary)
                        .padding(.top, 24)
                        .accessibilityIdentifier("memories.detail.title")

                    Text(currentItem.summary)
                        .font(.system(size: 16, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.9))
                        .lineSpacing(8)
                        .accessibilityIdentifier("memories.detail.summary")

                    if isForgetting {
                        ProgressView("Forgetting memory…")
                            .accessibilityIdentifier("memories.forget.progress")
                    }
                    if let forgetError {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(forgetError)
                                .font(.system(size: 14))
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("memories.forget.error")
                            Button { beginForgetting() } label: {
                                Text("Review and retry")
                                    .font(.system(size: 14, weight: .semibold))
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .background(Color.white.opacity(0.20), in: RoundedRectangle(cornerRadius: 10))
                            .accessibilityIdentifier("memories.forget.retry")
                        }
                        .foregroundStyle(MemoriesTheme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(Color.white.opacity(0.20), in: RoundedRectangle(cornerRadius: 12))
                    }

                    if currentItem.editable {
                        Button {
                            beginEditing()
                        } label: {
                            Label("Correct memory", systemImage: "pencil")
                                .font(.system(size: 15, weight: .semibold))
                                .frame(maxWidth: .infinity, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(MemoriesTheme.textPrimary)
                        .background(Color.white.opacity(0.22), in: RoundedRectangle(cornerRadius: 12))
                        .disabled(isBusy)
                        .accessibilityIdentifier("memories.detail.correct")
                        .accessibilityHint("Edit what Clementine remembers. Changes are saved only when you choose Save.")
                    }

                    if currentItem.hasRepairState {
                        MemoryRepairDetailSection(
                            item: currentItem,
                            isUndoing: isUndoingCorrection,
                            isResolving: isResolvingCorrection,
                            onUndo: {
                                Task { await undoCurrentCorrection() }
                            },
                            onResolve: { selectedFacts in
                                Task { await resolveCurrentCorrection(selectedFacts: selectedFacts) }
                            }
                        )
                    }

                    if let characterBible = currentItem.characterBible {
                        CharacterBibleDetailSection(bible: characterBible)
                    }

                    if let storySpine = currentItem.storySpine,
                       !(storySpine.fieldProvenance ?? []).isEmpty {
                        LearnedFieldProvenanceSection(
                            title: "Story Spine Learning",
                            rows: storySpine.fieldProvenance ?? [],
                            accessibilityPrefix: "memory.story-field"
                        )
                    }

                    if !currentItem.reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Why I remembered this")
                                .font(.system(size: 14, weight: .semibold, design: .default))
                                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))
                            Text(currentItem.reason)
                                .font(.system(size: 15, weight: .regular, design: .default))
                                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.88))
                        }
                    }

                    memoryLedgerSection

                    if !currentItem.hasCanonCorrectionControl {
                        qualityActionsSection
                    }

                    Divider()
                        .overlay(Color.white.opacity(0.22))
                        .padding(.vertical, 8)

                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(currentItem.snippets.indices, id: \.self) { index in
                            ConversationSnippet(text: currentItem.snippets[index])
                        }
                    }

                    if !errorText.isEmpty {
                        Text(errorText)
                            .font(.system(size: 13, weight: .regular, design: .default))
                            .foregroundStyle(.red.opacity(0.9))
                    }

                    Spacer(minLength: 28)
                }
                .padding(.horizontal, horizontalSizeClass == .compact ? 16 : 24)
                .frame(maxWidth: 1240, alignment: .leading)
            }
        }
        .navigationTitle("")
        .toolbarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button {
                    onReturnHome()
                } label: {
                    Text(horizontalSizeClass == .compact ? "Home" : "Return Home")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(isBusy)
                .accessibilityLabel("Return Home")

                if currentItem.correctionReceipt?.canUndo == true {
                    Button {
                        Task { await undoCurrentCorrection() }
                    } label: {
                        Label("Undo Correction", systemImage: "arrow.uturn.backward")
                            .frame(minHeight: 44)
                    }
                    .disabled(isBusy)
                }

                if canPromoteCurrentItem {
                    Button {
                        Task { await promoteCurrentItem() }
                    } label: {
                        Text("Promote").frame(minWidth: 44, minHeight: 44)
                    }
                    .disabled(isBusy)
                }
                if !currentItem.hasCanonCorrectionControl {
                    Button(role: .destructive) {
                        beginForgetting()
                    } label: {
                        Text("Forget").frame(minWidth: 44, minHeight: 44)
                    }
                    .disabled(isBusy)
                    .accessibilityIdentifier("memories.detail.forget")
                    .accessibilityHint("Shows what will be removed and asks for confirmation.")
                }
            }
        }
        .alert(
            "Forget this memory?",
            isPresented: $showingForgetConfirmation,
            presenting: forgetConfirmationItem
        ) { target in
            Button("Forget memory", role: .destructive) {
                Task { await forgetCurrentItem(target) }
            }
            .accessibilityIdentifier("memories.forget.confirm")
            Button("Keep memory", role: .cancel) {}
                .accessibilityIdentifier("memories.forget.cancel")
        } message: { target in
            Text(MemoryForgetPresentation.confirmationMessage(for: target))
        }
        .sheet(isPresented: $showingEdit) {
            MemoryEditSheet(
                item: currentItem,
                isSaving: isSaving,
                errorText: errorText,
                onSave: { edited in
                    await saveEditedItem(edited)
                }
            )
            .presentationDetents([.medium, .large])
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("memories.detail.screen")
        .onChange(of: item) { _, updated in
            deferredItem = updated
            adoptDeferredItemIfIdle()
        }
        .onChange(of: isBusy) { _, _ in adoptDeferredItemIfIdle() }
        .onChange(of: showingForgetConfirmation) { _, _ in adoptDeferredItemIfIdle() }
        .onChange(of: showingEdit) { _, showing in
            if !showing { onEditingChanged(false) }
            adoptDeferredItemIfIdle()
        }
        .onDisappear { if showingEdit { onEditingChanged(false) } }
    }

    private func beginEditing() {
        errorText = ""
        onEditingChanged(true)
        showingEdit = true
    }

    private func adoptDeferredItemIfIdle() {
        guard !isBusy, !showingEdit, !showingForgetConfirmation, let deferredItem else { return }
        currentItem = deferredItem
        self.deferredItem = nil
    }

    private var isBusy: Bool {
        isSaving || isForgetting || isUndoingCorrection || isResolvingCorrection || isSendingQuality || isPromoting
    }

    private var memoryLedgerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Memory Ledger")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))
            ledgerRow("Source", value: currentItem.source)
            ledgerRow("Remembered", value: RelativeDateFormatter.relativeString(for: currentItem.rememberedDate))
            ledgerRow("Last used", value: lastUsedText)
            if !currentItem.projectDisplayName.isEmpty {
                ledgerRow("Project", value: currentItem.projectDisplayName)
            }
            if !currentItem.characterNames.isEmpty {
                ledgerRow("Characters", value: currentItem.characterNames.joined(separator: ", "))
            }
            if currentItem.referenceCount > 0 {
                ledgerRow("Recalled", value: "\(currentItem.referenceCount)x")
            }
            ledgerRow("Quality score", value: String(format: "%.0f%%", currentItem.qualityScore * 100))
            ledgerRow("Quality votes", value: "\(currentItem.qualityHitCount) helpful / \(currentItem.qualityCorrectionCount) fix")
            ledgerRow("Staleness", value: stalenessText)
            if currentItem.isSuperseded, let supersededDate = currentItem.supersededDate {
                ledgerRow("Repaired", value: RelativeDateFormatter.relativeString(for: supersededDate))
            }
            ledgerRow("Last quality", value: qualityLastFeedbackText)
            ledgerRow("Confidence", value: String(format: "%.0f%%", currentItem.confidence * 100))
            ledgerRow("Salience", value: String(format: "%.0f%%", currentItem.salience * 100))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.15), lineWidth: 1)
        )
    }

    private var lastUsedText: String {
        guard let lastUsed = currentItem.lastUsedDate, lastUsed > .distantPast else {
            return "Not used yet"
        }
        return RelativeDateFormatter.relativeString(for: lastUsed)
    }

    private var stalenessText: String {
        let band = currentItem.stalenessBand.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedBand: String
        switch band {
        case "fresh": normalizedBand = "Fresh"
        case "warm": normalizedBand = "Warm"
        case "stale": normalizedBand = "Stale"
        default: normalizedBand = "Fresh"
        }
        return "\(normalizedBand) (\(max(0, currentItem.stalenessDays))d)"
    }

    private var qualityLastFeedbackText: String {
        guard let last = currentItem.qualityLastFeedbackDate, last > .distantPast else {
            return "No feedback yet"
        }
        return RelativeDateFormatter.relativeString(for: last)
    }

    private var qualityActionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Memory Accuracy")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))
            HStack(spacing: 10) {
                Button {
                    Task { await sendQualitySignal("hit") }
                } label: {
                    Text("Helpful")
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!currentItem.editable || isBusy)

            }
            Text(currentItem.editable
                ? "Correcting a memory updates what Clementine uses next time."
                : "Quality feedback is available for theme memories.")
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.7))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func ledgerRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.74))
            Spacer(minLength: 12)
            Text(value.isEmpty ? "—" : value)
                .font(.system(size: 12, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.88))
                .multilineTextAlignment(.trailing)
        }
    }

    @MainActor
    private func saveEditedItem(_ edited: MemoryItem) async {
        guard currentItem.editable else {
            errorText = "This memory cannot be edited."
            return
        }
        isSaving = true
        defer { isSaving = false }
        do {
            let updated = try await onSave(edited, currentItem)
            currentItem = updated
            errorText = ""
            showingEdit = false
        } catch {
            if let urlError = error as? URLError, urlError.code == .notConnectedToInternet {
                errorText = "You’re offline. Your correction is still here. Reconnect, then choose Save again."
            } else if error is URLError {
                errorText = "Couldn’t confirm this correction was saved. Your draft is still here. Check your connection, then try Save again."
            } else {
                errorText = error.localizedDescription
            }
        }
    }

    @MainActor
    private func forgetCurrentItem(_ target: MemoryItem) async {
        guard !isBusy else { return }
        isForgetting = true
        forgetError = nil
        defer { isForgetting = false }
        do {
            try await onForget(target)
            errorText = ""
            // The view model clears selection only after a matching deletion receipt.
        } catch {
            forgetError = MemoryForgetPresentation.errorMessage(for: error)
        }
    }

    private func beginForgetting() {
        guard !isBusy, !showingEdit else { return }
        forgetConfirmationItem = currentItem
        showingForgetConfirmation = true
    }

    @MainActor
    private func undoCurrentCorrection() async {
        guard let receipt = currentItem.correctionReceipt, receipt.canUndo else {
            errorText = "This correction has already been undone."
            return
        }
        isUndoingCorrection = true
        defer { isUndoingCorrection = false }
        do {
            try await onUndoCorrection(receipt)
            errorText = ""
            dismiss()
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func resolveCurrentCorrection(selectedFacts: [String]) async {
        guard let ambiguity = currentItem.correctionAmbiguity, ambiguity.isPending else {
            errorText = "This correction choice is no longer pending."
            return
        }
        let cleanFacts = selectedFacts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && ambiguity.candidateFacts.contains($0) }
        guard !cleanFacts.isEmpty else {
            errorText = "Choose at least one accepted canon fact."
            return
        }
        isResolvingCorrection = true
        defer { isResolvingCorrection = false }
        do {
            try await onResolveCorrection(ambiguity, cleanFacts)
            errorText = ""
            dismiss()
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func sendQualitySignal(_ signal: String) async {
        isSendingQuality = true
        defer { isSendingQuality = false }
        do {
            let updated = try await onQualitySignal(currentItem, signal)
            currentItem = updated
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }

    private var canPromoteCurrentItem: Bool {
        let src = currentItem.source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return !currentItem.editable && (src == "history" || src == "recap")
    }

    @MainActor
    private func promoteCurrentItem() async {
        guard canPromoteCurrentItem else {
            errorText = "This memory cannot be promoted."
            return
        }
        isPromoting = true
        defer { isPromoting = false }
        do {
            let promoted = try await onPromote(currentItem)
            currentItem = promoted
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private struct MemoryRepairDetailSection: View {
    let item: MemoryItem
    let isUndoing: Bool
    let isResolving: Bool
    let onUndo: () -> Void
    let onResolve: ([String]) -> Void

    @State private var selectedFacts: Set<String> = []

    private var pendingCandidates: [String] {
        guard let ambiguity = item.correctionAmbiguity, ambiguity.isPending else { return [] }
        return ambiguity.candidateFacts
    }

    private var orderedSelection: [String] {
        pendingCandidates.filter(selectedFacts.contains)
    }

    private var allCandidatesSelected: Bool {
        !pendingCandidates.isEmpty && orderedSelection.count == pendingCandidates.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: item.isSuperseded ? "arrow.uturn.backward.circle.fill" : "checkmark.seal.fill")
                    .font(.system(size: 14, weight: .semibold, design: .default))
                Text(item.isSuperseded ? "Memory Repair" : "Authoritative Correction")
                    .font(.system(size: 14, weight: .semibold, design: .default))
            }
            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))

            Text(item.repairBadgeHelp)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)

            if let receipt = item.correctionReceipt {
                repairLine("Status", value: receipt.canUndo ? "Applied" : "Undone")
                if !receipt.matchedFacts.isEmpty {
                    repairLine("Changed canon", value: receipt.matchedFacts.joined(separator: " / "))
                }
                if let replacementFacts = receipt.replacementFacts, !replacementFacts.isEmpty {
                    repairLine("Authoritative now", value: replacementFacts.joined(separator: " / "))
                }
                if let structuredUpdates = receipt.structuredUpdates, !structuredUpdates.isEmpty {
                    repairLine("Story bible updated", value: structuredUpdates.joined(separator: " / "))
                }
                if !receipt.correctionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    repairLine("Writer correction", value: receipt.correctionText)
                }
                repairLine("Receipt", value: receipt.id)

                if receipt.canUndo {
                    Button(action: onUndo) {
                        Label(
                            isUndoing ? "Undoing Correction" : "Undo Correction",
                            systemImage: "arrow.uturn.backward"
                        )
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isUndoing)
                    .accessibilityHint("Restores the accepted canon that this correction replaced.")
                }
            }

            if let ambiguity = item.correctionAmbiguity, ambiguity.isPending {
                repairLine("Writer correction", value: ambiguity.correctionText)
                Text("Which accepted facts should this correction replace?")
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.72))

                HStack(spacing: 12) {
                    Button {
                        if allCandidatesSelected {
                            selectedFacts.removeAll()
                        } else {
                            selectedFacts = Set(pendingCandidates)
                        }
                    } label: {
                        Label(
                            allCandidatesSelected ? "Clear" : "Select All",
                            systemImage: allCandidatesSelected ? "xmark.square" : "square"
                        )
                    }
                    .buttonStyle(.borderless)
                    .disabled(isResolving)

                    Spacer(minLength: 8)

                    Text("\(orderedSelection.count) selected")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.62))
                }

                ForEach(ambiguity.candidateFacts, id: \.self) { fact in
                    Button {
                        if selectedFacts.contains(fact) {
                            selectedFacts.remove(fact)
                        } else {
                            selectedFacts.insert(fact)
                        }
                    } label: {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: selectedFacts.contains(fact) ? "checkmark.square.fill" : "square")
                                .font(.system(size: 14, weight: .semibold, design: .default))
                                .padding(.top, 1)
                            Text(fact)
                                .font(.system(size: 13, weight: .regular, design: .default))
                                .multilineTextAlignment(.leading)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                    .buttonStyle(.borderless)
                    .disabled(isResolving)
                    .accessibilityValue(selectedFacts.contains(fact) ? "Selected" : "Not selected")
                    .accessibilityHint("Includes or excludes this accepted screenplay fact from the correction.")
                }

                Button {
                    onResolve(orderedSelection)
                } label: {
                    if isResolving {
                        ProgressView("Applying correction")
                    } else {
                        Label(
                            orderedSelection.count == pendingCandidates.count && orderedSelection.count > 1
                                ? "Apply to All \(orderedSelection.count) Facts"
                                : "Apply to \(orderedSelection.count) \(orderedSelection.count == 1 ? "Fact" : "Facts")",
                            systemImage: "checkmark.seal.fill"
                        )
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(orderedSelection.isEmpty || isResolving)
                .accessibilityIdentifier("memories.canon-clarification.apply")
            }

            if !item.supersededReason.isEmpty {
                repairLine("Reason", value: item.supersededReason)
            }

            if !item.supersededTerms.isEmpty {
                repairLine("Corrected terms", value: item.supersededTerms.joined(separator: ", "))
            }

            if !item.supersededByMemoryID.isEmpty {
                repairLine("Replaced by", value: item.supersededByMemoryID)
            }

            if let bible = item.characterBible {
                let corrections = (bible.corrections + bible.correctionReplacements)
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                if !corrections.isEmpty {
                    repairLine("Corrections", value: corrections.prefix(4).joined(separator: " / "))
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(item.isSuperseded ? 0.09 : 0.13))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(item.isSuperseded ? 0.14 : 0.20), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func repairLine(_ label: String, value: String) -> some View {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.68))
                Text(clean)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.90))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct CharacterBibleDetailSection: View {
    let bible: BackendCharacterBibleMemory

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Character Bible")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))

            if let arc = bible.arc, arc.isMeaningful {
                VStack(alignment: .leading, spacing: 8) {
                    characterBibleRow("Act", value: arc.act)
                    characterBibleRow("Want", value: arc.want)
                    characterBibleRow("Need", value: arc.need)
                    characterBibleRow("Wound", value: arc.wound)
                    characterBibleRow("False belief", value: arc.falseBelief)
                    characterBibleRow("Pressure", value: arc.relationshipPressure)
                    characterBibleRow("Tactic", value: arc.currentTactic)
                    characterBibleRow("Next turn", value: arc.nextEmotionalTurn)
                }
            }

            if !fieldProvenance.isEmpty {
                LearnedFieldProvenanceRows(
                    rows: fieldProvenance,
                    accessibilityPrefix: "memory.learned-field"
                )
            }

            if !bible.canon.isEmpty {
                characterBibleList("Canon", items: bible.canon)
            }

            if fieldProvenance.isEmpty && !authoritativeFields.isEmpty {
                characterBibleList(
                    "Writer-authoritative fields",
                    items: authoritativeFields.map { "\(fieldLabel($0.field)): \($0.value)" }
                )
            }

            if !bible.corrections.isEmpty || !bible.correctionReplacements.isEmpty {
                characterBibleList("Corrections", items: bible.corrections + bible.correctionReplacements)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.white.opacity(0.15), lineWidth: 1)
        )
    }

    private var authoritativeFields: [BackendAuthoritativeCharacterField] {
        (bible.authoritativeFields ?? []).filter {
            !$0.field.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private var fieldProvenance: [BackendLearnedFieldProvenance] {
        (bible.fieldProvenance ?? []).filter {
            !$0.field.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            !$0.value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    private func fieldLabel(_ field: String) -> String {
        switch field.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "falseBelief": return "False belief"
        case "relationshipPressure": return "Relationship pressure"
        case "currentTactic": return "Current tactic"
        case "nextEmotionalTurn": return "Next emotional turn"
        default: return field.capitalized
        }
    }

    @ViewBuilder
    private func characterBibleRow(_ label: String, value: String?) -> some View {
        let clean = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(label)
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.70))
                    .frame(width: 96, alignment: .leading)
                Text(clean)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.90))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func characterBibleList(_ label: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.70))
            ForEach(items.prefix(5), id: \.self) { item in
                Text(item)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.90))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct LearnedFieldProvenanceSection: View {
    let title: String
    let rows: [BackendLearnedFieldProvenance]
    let accessibilityPrefix: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))
            LearnedFieldProvenanceRows(
                rows: rows,
                accessibilityPrefix: accessibilityPrefix
            )
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.white.opacity(0.15), lineWidth: 1)
        )
    }
}

private struct LearnedFieldProvenanceRows: View {
    let rows: [BackendLearnedFieldProvenance]
    let accessibilityPrefix: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(rows.prefix(8).enumerated()), id: \.offset) { index, row in
                if index > 0 {
                    Divider().overlay(Color.white.opacity(0.16))
                }
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(row.fieldLabel)
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.72))
                        Spacer(minLength: 8)
                        HStack(spacing: 4) {
                            Image(
                                systemName: row.isCorrected
                                    ? "arrow.triangle.2.circlepath"
                                    : "checkmark.circle"
                            )
                            .accessibilityHidden(true)
                            Text(row.statusLabel)
                                .accessibilityIdentifier(
                                    "\(accessibilityPrefix).\(row.accessibilityKey).status"
                                )
                        }
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.76))
                    }

                    Text(row.value)
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.94))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("\(accessibilityPrefix).\(row.accessibilityKey).value")

                    Text(row.sourceLabel)
                        .font(.system(size: 11, weight: .medium, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.64))
                        .accessibilityIdentifier("\(accessibilityPrefix).\(row.accessibilityKey).source")

                    let learnedValue = (row.learnedValue ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if row.isCorrected,
                       !learnedValue.isEmpty,
                       learnedValue.caseInsensitiveCompare(row.value) != .orderedSame {
                        Text("Previously learned: \(learnedValue)")
                            .font(.system(size: 11, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.56))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    let question = (row.question ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if !question.isEmpty {
                        Text(question)
                            .font(.system(size: 11, weight: .regular, design: .default))
                            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.56))
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("\(accessibilityPrefix).\(row.accessibilityKey)")
            }
        }
    }
}

private struct MemoryEditSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var summary: String
    @State private var reason: String
    @State private var character: String
    @State private var canonText: String
    @State private var correctionsText: String
    @State private var act: String
    @State private var want: String
    @State private var need: String
    @State private var wound: String
    @State private var falseBelief: String
    @State private var relationshipPressure: String
    @State private var currentTactic: String
    @State private var nextEmotionalTurn: String
    @State private var storyProjectTitle: String
    @State private var storyAct: String
    @State private var storyFeatureSequence: String
    @State private var storyCurrentBeat: String
    @State private var storyActPressure: String
    @State private var storyCharacterArc: String
    @State private var storyNextPlan: String
    @State private var storyNextTurnsText: String
    @State private var storyUnresolvedSetupsText: String
    @State private var storyUnresolvedThreadsText: String
    @State private var storyCharacterFocusText: String
    @State private var storyActThreePayoffText: String
    @State private var storyContinuityNotesText: String
    let original: MemoryItem
    let isSaving: Bool
    let errorText: String
    let onSave: @MainActor (MemoryItem) async -> Void

    init(
        item: MemoryItem,
        isSaving: Bool,
        errorText: String,
        onSave: @escaping @MainActor (MemoryItem) async -> Void
    ) {
        original = item
        _title = State(initialValue: item.title)
        _summary = State(initialValue: item.summary)
        _reason = State(initialValue: item.reason)
        let bible = item.characterBible
        _character = State(initialValue: bible?.character ?? "")
        _canonText = State(initialValue: Self.joinLines(bible?.canon ?? []))
        _correctionsText = State(initialValue: Self.joinLines(bible?.corrections ?? []))
        _act = State(initialValue: bible?.arc?.act ?? "")
        _want = State(initialValue: bible?.arc?.want ?? "")
        _need = State(initialValue: bible?.arc?.need ?? "")
        _wound = State(initialValue: bible?.arc?.wound ?? "")
        _falseBelief = State(initialValue: bible?.arc?.falseBelief ?? "")
        _relationshipPressure = State(initialValue: bible?.arc?.relationshipPressure ?? "")
        _currentTactic = State(initialValue: bible?.arc?.currentTactic ?? "")
        _nextEmotionalTurn = State(initialValue: bible?.arc?.nextEmotionalTurn ?? "")
        let spine = item.storySpine
        _storyProjectTitle = State(initialValue: spine?.projectTitle ?? item.projectDisplayName)
        _storyAct = State(initialValue: spine?.act ?? "")
        _storyFeatureSequence = State(initialValue: spine?.featureSequence ?? "")
        _storyCurrentBeat = State(initialValue: spine?.currentBeat ?? item.summary)
        _storyActPressure = State(initialValue: spine?.actPressureState ?? "")
        _storyCharacterArc = State(initialValue: spine?.characterArcState ?? "")
        _storyNextPlan = State(initialValue: spine?.nextScenePlan ?? item.referenceHint)
        _storyNextTurnsText = State(initialValue: Self.joinLines(spine?.nextThreeTurns ?? []))
        _storyUnresolvedSetupsText = State(initialValue: Self.joinLines(spine?.unresolvedSetups ?? []))
        _storyUnresolvedThreadsText = State(initialValue: Self.joinLines(spine?.unresolvedStoryThreads ?? []))
        _storyCharacterFocusText = State(initialValue: Self.joinLines(spine?.characterFocus ?? item.characterNames))
        _storyActThreePayoffText = State(initialValue: Self.joinLines(spine?.actThreePayoffPath ?? []))
        _storyContinuityNotesText = State(initialValue: Self.joinLines(spine?.continuityNotes ?? []))
        self.isSaving = isSaving
        self.errorText = errorText
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                if !errorText.isEmpty {
                    Section("Correction needs attention") {
                        Text(errorText)
                            .foregroundStyle(.red)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("memories.editor.error")
                    }
                }
                if editsStorySpine {
                    Section("Project") {
                        TextField("Feature title", text: $storyProjectTitle)
                        TextField("Act", text: $storyAct)
                        TextField("Sequence", text: $storyFeatureSequence)
                    }
                    Section("Current Story State") {
                        TextEditor(text: $storyCurrentBeat)
                            .frame(minHeight: 90)
                        TextEditor(text: $storyActPressure)
                            .frame(minHeight: 80)
                        TextEditor(text: $storyCharacterArc)
                            .frame(minHeight: 80)
                    }
                    Section("Next Movement") {
                        TextEditor(text: $storyNextPlan)
                            .frame(minHeight: 90)
                        TextEditor(text: $storyNextTurnsText)
                            .frame(minHeight: 110)
                    }
                    Section("Open Promises") {
                        TextEditor(text: $storyUnresolvedSetupsText)
                            .frame(minHeight: 80)
                        TextEditor(text: $storyUnresolvedThreadsText)
                            .frame(minHeight: 80)
                        TextEditor(text: $storyActThreePayoffText)
                            .frame(minHeight: 90)
                    }
                    if let changes = original.storySpine?.storyObligationLedger,
                       !changes.filter(\.isMeaningful).isEmpty {
                        Section("Accepted Page Movement") {
                            ForEach(Array(changes.filter(\.isMeaningful).prefix(6))) { change in
                                VStack(alignment: .leading, spacing: 5) {
                                    Text("\(change.statusLabel) / \(change.kindLabel)")
                                        .font(.system(size: 11, weight: .semibold, design: .default))
                                        .foregroundStyle(.secondary)
                                    Text(change.result)
                                        .font(.system(size: 13, weight: .regular, design: .default))
                                    Text(change.evidence)
                                        .font(.system(size: 11, weight: .regular, design: .default))
                                        .foregroundStyle(.secondary)
                                }
                                .accessibilityIdentifier(
                                    "memories.editor.story-obligation.\(change.accessibilityKey)"
                                )
                            }
                        }
                    }
                    Section("Continuity") {
                        TextEditor(text: $storyCharacterFocusText)
                            .frame(minHeight: 80)
                        TextEditor(text: $storyContinuityNotesText)
                            .frame(minHeight: 90)
                    }
                } else if original.characterBible == nil {
                    Section("Title") {
                        TextField("Memory title", text: $title)
                            .accessibilityIdentifier("memories.editor.title")
                    }
                    Section("Summary") {
                        TextEditor(text: $summary)
                            .frame(minHeight: 110)
                    }
                    Section("Why remembered") {
                        TextEditor(text: $reason)
                            .frame(minHeight: 90)
                    }
                } else {
                    Section("Character") {
                        Text(original.characterBible?.character ?? character)
                            .foregroundStyle(.secondary)
                    }
                    Section("Canon") {
                        TextEditor(text: $canonText)
                            .frame(minHeight: 100)
                    }
                    Section("Arc") {
                        TextField("Act", text: $act)
                        TextField("Want", text: $want)
                        TextField("Need", text: $need)
                        TextField("Wound", text: $wound)
                        TextField("False belief", text: $falseBelief)
                        TextField("Relationship pressure", text: $relationshipPressure)
                        TextField("Current tactic", text: $currentTactic)
                        TextField("Next emotional turn", text: $nextEmotionalTurn)
                    }
                    Section("Corrections") {
                        TextEditor(text: $correctionsText)
                            .frame(minHeight: 90)
                    }
                }
            }
            .navigationTitle("Correct Memory")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSaving)
                        .accessibilityIdentifier("memories.editor.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            var updated = original
                            if original.characterBible == nil {
                                if editsStorySpine {
                                    let spine = makeEditedStorySpine()
                                    updated.storySpine = spine
                                    updated.title = clean(storyProjectTitle).isEmpty ? original.title : clean(storyProjectTitle)
                                    updated.summary = storySummaryLine(for: spine)
                                    updated.reason = "Corrected from Story Spine."
                                } else {
                                    updated.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
                                    updated.summary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
                                    updated.reason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
                                }
                            } else {
                                let bible = makeEditedCharacterBible()
                                updated.characterBible = bible
                                updated.title = "\(bible.character) Character Memory"
                                updated.summary = summaryLine(for: bible)
                                updated.reason = "Corrected from Memories."
                            }
                            await onSave(updated)
                        }
                    }
                    .disabled(isSaving || saveDisabled)
                    .accessibilityIdentifier("memories.editor.save")
                }
            }
        }
        .interactiveDismissDisabled(isSaving)
    }

    private var saveDisabled: Bool {
        if editsStorySpine {
            return clean(storyProjectTitle).isEmpty &&
                clean(storyCurrentBeat).isEmpty &&
                clean(storyNextPlan).isEmpty
        }
        if original.characterBible == nil {
            return title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return !makeEditedCharacterBible().isMeaningful
    }

    private var editsStorySpine: Bool {
        original.storySpine != nil ||
            original.source.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "screenplay_project"
    }

    private func makeEditedStorySpine() -> BackendStorySpineMemory {
        let base = original.storySpine ?? BackendStorySpineMemory.emptyFallback(
            projectId: original.projectID,
            projectTitle: original.projectDisplayName,
            currentBeat: original.summary,
            nextScenePlan: original.referenceHint,
            characterFocus: original.characterNames,
            updatedAt: original.rememberedDate.timeIntervalSince1970
        )
        return BackendStorySpineMemory(
            projectId: base.projectId ?? original.projectID.nilIfBlank,
            projectTitle: clean(storyProjectTitle).nilIfBlank ?? base.projectTitle,
            act: clean(storyAct).nilIfBlank ?? base.act,
            featureSequence: clean(storyFeatureSequence).nilIfBlank ?? base.featureSequence,
            featureObligation: base.featureObligation,
            sceneLabel: base.sceneLabel,
            sceneObjective: base.sceneObjective,
            sceneSummary: clean(storyCurrentBeat).nilIfBlank ?? base.sceneSummary,
            currentBeat: clean(storyCurrentBeat).nilIfBlank ?? base.currentBeat,
            logline: base.logline,
            themeArgument: base.themeArgument,
            centralQuestion: base.centralQuestion,
            protagonistWant: base.protagonistWant,
            protagonistNeed: base.protagonistNeed,
            antagonisticForce: base.antagonisticForce,
            endingImage: base.endingImage,
            actPressureState: clean(storyActPressure).nilIfBlank ?? base.actPressureState,
            characterArcState: clean(storyCharacterArc).nilIfBlank ?? base.characterArcState,
            lastSceneOutcome: base.lastSceneOutcome,
            nextScenePlan: clean(storyNextPlan).nilIfBlank ?? base.nextScenePlan,
            nextSceneMoves: base.nextSceneMoves,
            nextThreeTurns: Self.cleanLines(storyNextTurnsText),
            actThreePayoffPath: Self.cleanLines(storyActThreePayoffText),
            beatSequence: base.beatSequence,
            characterFocus: Self.cleanLines(storyCharacterFocusText),
            unresolvedSetups: Self.cleanLines(storyUnresolvedSetupsText),
            unresolvedStoryThreads: Self.cleanLines(storyUnresolvedThreadsText),
            characterArcTurns: base.characterArcTurns,
            imageMotifs: base.imageMotifs,
            continuityNotes: Self.cleanLines(storyContinuityNotesText),
            emotionalContinuity: base.emotionalContinuity,
            pageCount: base.pageCount,
            targetPages: base.targetPages,
            updatedAt: Date().timeIntervalSince1970,
            fieldProvenance: base.fieldProvenance,
            storyObligationLedger: base.storyObligationLedger,
            currentStoryObligationChange: base.currentStoryObligationChange
        )
    }

    private func storySummaryLine(for spine: BackendStorySpineMemory) -> String {
        [
            spine.currentBeat.map { "Beat: \($0)" },
            spine.nextScenePlan.map { "Next: \($0)" },
            (spine.unresolvedSetups ?? []).first.map { "Setup: \($0)" },
        ].compactMap { $0 }.joined(separator: " | ")
    }

    private func makeEditedCharacterBible() -> BackendCharacterBibleMemory {
        let originalBible = original.characterBible
        let arc = BackendCharacterBibleArcMemory(
            act: clean(act),
            want: clean(want),
            need: clean(need),
            wound: clean(wound),
            falseBelief: clean(falseBelief),
            relationshipPressure: clean(relationshipPressure),
            currentTactic: clean(currentTactic),
            nextEmotionalTurn: clean(nextEmotionalTurn)
        )
        let editedCanon = Self.cleanLines(canonText)
        let editedCorrections = Self.cleanLines(correctionsText)
        let correctionAudit = correctionAuditLines(original: originalBible, editedCanon: editedCanon, editedArc: arc)
        return BackendCharacterBibleMemory(
            character: originalBible?.character ?? clean(character),
            canon: editedCanon,
            corrections: Self.uniqueLines(editedCorrections + correctionAudit.notes),
            correctedTerms: Self.uniqueLines((originalBible?.correctedTerms ?? []) + correctionAudit.terms),
            correctionReplacements: Self.uniqueLines((originalBible?.correctionReplacements ?? []) + correctionAudit.replacements),
            arc: arc.isMeaningful ? arc : nil,
            voice: originalBible?.voice,
            tags: originalBible?.tags
        )
    }

    private func correctionAuditLines(
        original: BackendCharacterBibleMemory?,
        editedCanon: [String],
        editedArc: BackendCharacterBibleArcMemory
    ) -> (notes: [String], terms: [String], replacements: [String]) {
        guard let original else { return ([], [], []) }
        var notes: [String] = []
        var terms: [String] = []
        var replacements: [String] = []

        func recordChange(_ label: String, _ oldValue: String?, _ newValue: String?) {
            let oldClean = clean(oldValue ?? "")
            let newClean = clean(newValue ?? "")
            guard oldClean != newClean else { return }
            if !oldClean.isEmpty { terms.append(oldClean) }
            if !oldClean.isEmpty || !newClean.isEmpty {
                replacements.append(newClean.isEmpty ? "\(label): remove \(oldClean)" : "\(oldClean) -> \(newClean)")
                notes.append("User corrected \(original.character)'s \(label.lowercased()).")
            }
        }

        let oldCanon = Set(Self.cleanLines(original.canon.joined(separator: "\n")))
        let newCanon = Set(editedCanon)
        for removed in oldCanon.subtracting(newCanon) {
            terms.append(removed)
            notes.append("User removed outdated canon for \(original.character): \(removed)")
        }

        recordChange("Act", original.arc?.act, editedArc.act)
        recordChange("Want", original.arc?.want, editedArc.want)
        recordChange("Need", original.arc?.need, editedArc.need)
        recordChange("Wound", original.arc?.wound, editedArc.wound)
        recordChange("False belief", original.arc?.falseBelief, editedArc.falseBelief)
        recordChange("Relationship pressure", original.arc?.relationshipPressure, editedArc.relationshipPressure)
        recordChange("Current tactic", original.arc?.currentTactic, editedArc.currentTactic)
        recordChange("Next emotional turn", original.arc?.nextEmotionalTurn, editedArc.nextEmotionalTurn)

        return (Self.uniqueLines(notes), Self.uniqueLines(terms), Self.uniqueLines(replacements))
    }

    private func summaryLine(for bible: BackendCharacterBibleMemory) -> String {
        let arc = bible.arc
        let parts = [
            arc?.want.map { "Want: \($0)" },
            arc?.need.map { "Need: \($0)" },
            arc?.nextEmotionalTurn.map { "Next turn: \($0)" },
            bible.canon.first.map { "Canon: \($0)" }
        ].compactMap { $0 }
        return parts.isEmpty ? "\(bible.character)'s corrected character memory." : parts.joined(separator: " | ")
    }

    private func clean(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func joinLines(_ lines: [String]) -> String {
        uniqueLines(lines).joined(separator: "\n")
    }

    private static func cleanLines(_ text: String) -> [String] {
        uniqueLines(text.components(separatedBy: .newlines))
    }

    private static func uniqueLines(_ lines: [String]) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for line in lines {
            let clean = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            out.append(clean)
        }
        return out
    }
}

struct ConversationSnippet: View {
    let text: String

    var body: some View {
        Text(verbatimSnippet(text))
            .font(.system(size: 15, weight: .regular, design: .default))
            .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MemoriesTheme.surfaceSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.white.opacity(0.20), lineWidth: 1)
            )
            .accessibilityLabel(text)
    }

    private func verbatimSnippet(_ source: String) -> String {
        let clean = source.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return "" }
        if clean.hasPrefix("“") || clean.hasPrefix("\"") {
            return clean
        }
        return "“\(clean)”"
    }
}

// MARK: - States

struct MemoriesLoadingView: View {
    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
            Text("Recalling...")
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .accessibilityLabel("Loading memories")
    }
}

struct MemoriesEmptyView: View {
    var startTalkingAction: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Circle()
                .stroke(Color.white.opacity(0.24), lineWidth: 1)
                .frame(width: 84, height: 84)
                .shadow(color: Color.herOrbStroke.opacity(0.16), radius: 18)

            Text("I am still getting to know you.")
                .font(.system(size: 20, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary)

            Text("The more we talk, the more I will remember what matters.")
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)

            Button(action: startTalkingAction) {
                Text("Start Talking")
                    .font(.system(size: 15, weight: .regular, design: .default))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .frame(height: 44)
            }
            .buttonStyle(SoftPrimaryButtonStyle())
            .accessibilityHint("Returns to the conversation screen.")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

struct MemoriesErrorView: View {
    let message: String
    var retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Text("I am having trouble recalling that right now.")
                .font(.system(size: 16, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary)

            Text(message)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(MemoriesTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)

            Button("Retry", action: retry)
                .buttonStyle(SoftPrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .accessibilityLabel("Error loading memories")
    }
}

// MARK: - Shared Button Style

struct SoftPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(MemoriesTheme.textPrimary)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white.opacity(configuration.isPressed ? 0.16 : 0.22))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.24), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeInOut(duration: 0.14), value: configuration.isPressed)
    }
}

// MARK: - Helpers

enum RelativeDateFormatter {
    static let shared: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter
    }()

    static func relativeString(for date: Date, relativeTo referenceDate: Date = .now) -> String {
        shared.localizedString(for: date, relativeTo: referenceDate)
    }
}

func themOptionalDateFromEpoch(_ value: TimeInterval?) -> Date? {
    guard let value else { return nil }
    let date = themDateFromEpoch(value)
    if date <= .distantPast { return nil }
    return date
}

// MARK: - Preview

#Preview {
    MemoriesScreen()
        .frame(width: 1440, height: 1024)
}
