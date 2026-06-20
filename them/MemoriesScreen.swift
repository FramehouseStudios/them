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
    var characterBible: BackendCharacterBibleMemory?
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

    private var isLoading = false
    private var lastLoadedAt: Date?
    private let reloadCooldownSeconds: TimeInterval = 1.0
    private var lastSync: BackendSyncState = .empty
    private var turnObserver: NSObjectProtocol?
    private var latestSeenStateVersion = ""
    private var inFlightVersions: Set<String> = []

    init() {
        turnObserver = NotificationCenter.default.addObserver(
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
            NotificationCenter.default.removeObserver(turnObserver)
        }
    }

    func load(force: Bool = false, sinceVersion: String? = nil) async {
        let isDeltaFetch = !(sinceVersion?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        if isLoading { return }
        if !force, !isDeltaFetch, let lastLoadedAt,
           Date().timeIntervalSince(lastLoadedAt) < reloadCooldownSeconds {
            return
        }

        isLoading = true
        let shouldShowLoading: Bool
        switch state {
        case .loaded:
            shouldShowLoading = force && !isDeltaFetch
        case .empty, .error, .loading:
            shouldShowLoading = true
        }
        if shouldShowLoading {
            state = .loading
        }
        defer {
            isLoading = false
            lastLoadedAt = Date()
        }

        do {
            _ = try? await BackendMemoryAPI.shared.bootstrapSession()
            var result = try await BackendMemoryAPI.shared.fetchMemories(
                limit: 72,
                force: force,
                sinceVersion: sinceVersion
            )
            var payload = result.payload
            qualitySnapshot = payload.memoryQuality
            recentActionReceipts = payload.actionReceipts?.items ?? []

            if let userName = payload.userName, !userName.isEmpty {
                subtitle = "Moments I have remembered about \(userName)."
            } else {
                subtitle = "Moments I have remembered about you."
            }

            if isDeltaFetch, payload.deltaNoChange == true {
                lastSync = result.sync
                if !result.sync.stateVersion.isEmpty {
                    latestSeenStateVersion = result.sync.stateVersion
                }
                return
            }

            var incoming = payload.memories.map(memoryItem(from:))
            if incoming.isEmpty && !payload.conversationSamples.isEmpty {
                incoming = payload.conversationSamples.map(memoryItem(fromFallbackThread:))
            }

            let hasServerMemory = result.sync.memoryUpdatedAt > 0 ||
                result.sync.historyUpdatedAt > 0 ||
                !result.sync.lastTurnId.isEmpty
            if !isDeltaFetch, !force, incoming.isEmpty, hasServerMemory {
                await BackendMemoryAPI.shared.hardResync()
                result = try await BackendMemoryAPI.shared.fetchMemories(
                    limit: 72,
                    force: true,
                    sinceVersion: nil
                )
                payload = result.payload
                qualitySnapshot = payload.memoryQuality
                recentActionReceipts = payload.actionReceipts?.items ?? []
                incoming = payload.memories.map(memoryItem(from:))
                if incoming.isEmpty && !payload.conversationSamples.isEmpty {
                    incoming = payload.conversationSamples.map(memoryItem(fromFallbackThread:))
                }
            }

            let items: [MemoryItem]
            if isDeltaFetch {
                switch state {
                case .loaded(let current):
                    var merged = Dictionary(uniqueKeysWithValues: current.map { ($0.id, $0) })
                    for memory in incoming {
                        merged[memory.id] = memory
                    }
                    items = merged.values.sorted { $0.rememberedDate > $1.rememberedDate }
                case .empty, .error, .loading:
                    items = incoming
                }
            } else {
                items = incoming
            }

            lastSync = result.sync
            if !result.sync.stateVersion.isEmpty {
                latestSeenStateVersion = result.sync.stateVersion
            }
            state = items.isEmpty ? .empty : .loaded(items)

            if let selected = selection, !items.contains(where: { $0.id == selected.id }) {
                self.selection = nil
            }
        } catch {
            if isDeltaFetch {
                if case .loading = state {
                    state = .error(message: error.localizedDescription)
                }
                return
            }
            state = .error(message: error.localizedDescription)
        }
    }

    func retry() async {
        await load(force: true, sinceVersion: nil)
    }

    func updateMemory(
        itemID: String,
        key: String,
        title: String,
        summary: String,
        reason: String,
        characterBible: BackendCharacterBibleMemory? = nil
    ) async throws -> MemoryItem {
        _ = try? await BackendMemoryAPI.shared.bootstrapSession()
        let result: BackendReadResult<BackendMemoryMutationResponse>
        if let characterBible {
            result = try await BackendMemoryAPI.shared.updateCharacterBibleMemory(
                id: itemID,
                key: key,
                characterBible: characterBible
            )
        } else {
            result = try await BackendMemoryAPI.shared.updateMemoryCard(
                id: itemID,
                key: key,
                title: title,
                summary: summary,
                reason: reason
            )
        }
        lastSync = result.sync
        if !result.sync.stateVersion.isEmpty {
            latestSeenStateVersion = result.sync.stateVersion
        }
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
        throw NSError(domain: "MemoriesViewModel", code: -1, userInfo: [
            NSLocalizedDescriptionKey: "Memory updated, but the updated card was not found."
        ])
    }

    func forgetMemory(itemID: String, key: String) async throws {
        _ = try? await BackendMemoryAPI.shared.bootstrapSession()
        let result = try await BackendMemoryAPI.shared.forgetMemoryCard(
            id: itemID,
            key: key
        )
        lastSync = result.sync
        if !result.sync.stateVersion.isEmpty {
            latestSeenStateVersion = result.sync.stateVersion
        }
        let forgottenID = (result.payload.forgottenId ?? itemID).trimmingCharacters(in: .whitespacesAndNewlines)
        removeMemoryItem(id: forgottenID, key: key)
        if let selected = selection,
           selected.id == forgottenID || selected.key == key {
            selection = nil
        }
    }

    func markMemoryQuality(
        itemID: String,
        key: String,
        signal: String
    ) async throws -> MemoryItem {
        _ = try? await BackendMemoryAPI.shared.bootstrapSession()
        let result = try await BackendMemoryAPI.shared.markMemoryQuality(
            id: itemID,
            key: key,
            signal: signal
        )
        lastSync = result.sync
        if !result.sync.stateVersion.isEmpty {
            latestSeenStateVersion = result.sync.stateVersion
        }
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
        _ = try? await BackendMemoryAPI.shared.bootstrapSession()
        let result = try await BackendMemoryAPI.shared.promoteMemoryCard(
            id: itemID,
            key: key.isEmpty ? nil : key,
            title: title,
            summary: summary,
            reason: reason
        )
        lastSync = result.sync
        if !result.sync.stateVersion.isEmpty {
            latestSeenStateVersion = result.sync.stateVersion
        }
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

    private func handleTurnCommitted(_ event: BackendTurnCommittedEvent) {
        let versionKey = event.stateVersion.isEmpty ? event.turnId : event.stateVersion
        guard !versionKey.isEmpty else { return }
        if latestSeenStateVersion == versionKey { return }
        if inFlightVersions.contains(versionKey) { return }
        if event.memoryUpdatedAt > 0, lastSync.memoryUpdatedAt > 0, event.memoryUpdatedAt <= lastSync.memoryUpdatedAt {
            latestSeenStateVersion = versionKey
            return
        }

        inFlightVersions.insert(versionKey)
        let sinceVersion = lastSync.stateVersion
        let sinceTurnId = lastSync.lastTurnId

        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.inFlightVersions.remove(versionKey) }

            if !sinceVersion.isEmpty {
                do {
                    let result = try await BackendMemoryAPI.shared.fetchStateDelta(
                        sinceVersion: sinceVersion,
                        sinceTurnId: sinceTurnId.isEmpty ? nil : sinceTurnId,
                        historyLimit: 1,
                        memoriesLimit: 72
                    )
                    self.lastSync = result.sync
                    if !result.sync.stateVersion.isEmpty {
                        self.latestSeenStateVersion = result.sync.stateVersion
                    } else {
                        self.latestSeenStateVersion = versionKey
                    }
                    if result.payload.deltaNoChange == true {
                        if case .loaded(let items) = self.state, !items.isEmpty {
                            return
                        }
                        await self.load(force: true, sinceVersion: nil)
                        return
                    }
                    self.applyMemoriesDelta(result.payload.memoriesDelta)
                    return
                } catch {
                    // Fall back to endpoint-specific delta if aggregate path fails.
                }
            }

            await self.load(force: false, sinceVersion: sinceVersion.isEmpty ? nil : sinceVersion)
            if !self.lastSync.stateVersion.isEmpty {
                self.latestSeenStateVersion = self.lastSync.stateVersion
            } else {
                self.latestSeenStateVersion = versionKey
            }
        }
    }

    private func applyMemoriesDelta(_ delta: [BackendMemoryCard]) {
        guard !delta.isEmpty else { return }
        let incoming = delta.map(memoryItem(from:))

        var merged = [String: MemoryItem]()
        if case .loaded(let current) = state {
            merged = Dictionary(uniqueKeysWithValues: current.map { ($0.id, $0) })
        }
        for memory in incoming {
            merged[memory.id] = memory
        }
        let items = merged.values.sorted { $0.rememberedDate > $1.rememberedDate }
        state = items.isEmpty ? .empty : .loaded(items)
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
            characterBible: card.characterBible
        )
    }

    private func memoryItem(fromFallbackThread thread: BackendHistoryThread) -> MemoryItem {
        let userSnippet = thread.user.trimmingCharacters(in: .whitespacesAndNewlines)
        let assistantSnippet = thread.assistant.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = thread.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? String(userSnippet.prefix(64))
            : thread.title
        let summary: String
        if !assistantSnippet.isEmpty {
            summary = assistantSnippet
        } else if !thread.preview.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            summary = thread.preview
        } else {
            summary = userSnippet
        }
        return MemoryItem(
            id: "history-\(thread.id)",
            key: "turn_\(thread.turn)",
            title: title.isEmpty ? "Conversation moment" : title,
            summary: summary.isEmpty ? "A remembered conversation moment." : summary,
            reason: "Captured from a previous conversation turn.",
            rememberedDate: themDateFromEpoch(thread.updatedAt),
            lastUsedDate: nil,
            snippets: [userSnippet, assistantSnippet].filter { !$0.isEmpty },
            emotionalTone: "",
            salience: 0.42,
            confidence: 0.48,
            qualityScore: 0.58,
            qualityHitCount: 0,
            qualityCorrectionCount: 0,
            qualityLastFeedbackDate: nil,
            stalenessDays: 0,
            stalenessBand: "fresh",
            editable: false,
            source: "history_fallback",
            characterBible: nil
        )
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
    @StateObject private var vm = MemoriesViewModel()
    var startTalkingAction: () -> Void = {}

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
                        .padding(.top, 28)
                        .padding(.bottom, 20)

                    Divider()
                        .overlay(Color.white.opacity(0.22))

                    content
                        .padding(.top, 24)
                        .padding(.bottom, 28)
                }
                .padding(.horizontal, 24)
                .frame(maxWidth: 1240, maxHeight: .infinity, alignment: .top)
            }
            .navigationTitle("")
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Return") {
                        startTalkingAction()
                    }
                    .font(.system(size: 14, weight: .regular, design: .default))
                }
            }
        }
        .task { await vm.load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Memories")
                        .font(.system(size: 34, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary)

                    Text(vm.subtitle)
                        .font(.system(size: 15, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textSecondary)
                }
                Spacer()
                Button {
                    startTalkingAction()
                } label: {
                    Text("Return Home")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.white.opacity(0.18))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Return Home")
                .accessibilityHint("Returns to the conversation screen.")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Memories. Moments I have remembered about you.")
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 16) {
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
                    Task { await vm.retry() }
                })
            case .loaded(let items):
                MemoriesGrid(items: items) { tapped in
                    vm.selection = tapped
                }
                .navigationDestination(item: $vm.selection) { item in
                    MemoryDetailView(
                        item: item,
                        onReturnHome: startTalkingAction,
                        onSave: { updated in
                            try await vm.updateMemory(
                                itemID: updated.id,
                                key: updated.key,
                                title: updated.title,
                                summary: updated.summary,
                                reason: updated.reason,
                                characterBible: updated.characterBible
                            )
                        },
                        onForget: { target in
                            try await vm.forgetMemory(
                                itemID: target.id,
                                key: target.key
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
        }
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

// MARK: - Grid

struct MemoriesGrid: View {
    let items: [MemoryItem]
    var onTap: (MemoryItem) -> Void

    var body: some View {
        GeometryReader { geo in
            let columns = columnsFor(width: geo.size.width)

            ScrollView {
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
            .scrollIndicators(.automatic)
        }
    }

    private func columnsFor(width: CGFloat) -> [GridItem] {
        let targetCardWidth: CGFloat = 560
        let gutter: CGFloat = 28
        let canFitTwo = width >= ((targetCardWidth * 2) + gutter)

        if canFitTwo {
            return [
                GridItem(.fixed(targetCardWidth), spacing: gutter, alignment: .topLeading),
                GridItem(.fixed(targetCardWidth), spacing: gutter, alignment: .topLeading)
            ]
        }

        return [
            GridItem(
                .flexible(minimum: min(320, max(320, width)), maximum: targetCardWidth),
                spacing: gutter,
                alignment: .topLeading
            )
        ]
    }
}

// MARK: - Card

struct MemoryCard: View {
    let item: MemoryItem
    var onTap: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
                Text(item.title)
                    .font(.system(size: 20, weight: .semibold, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary)
                    .lineLimit(1)

                Text(item.summary)
                    .font(.system(size: 15, weight: .regular, design: .default))
                    .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.9))
                    .lineSpacing(7)
                    .lineLimit(3)
                    .mask(
                        LinearGradient(
                            colors: [.black, .black, .black.opacity(0)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .offset(y: 16)
                    )

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
            .padding(26)
            .frame(maxWidth: .infinity, minHeight: 200, maxHeight: 200, alignment: .topLeading)
            .contentShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        }
        .buttonStyle(.plain)
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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Memory. \(item.title). Remembered \(rememberedDateText).")
        .accessibilityHint("Opens memory details.")
    }

    private var rememberedDateText: String {
        RelativeDateFormatter.relativeString(for: item.rememberedDate)
    }
}

// MARK: - Detail

struct MemoryDetailView: View {
    let onReturnHome: () -> Void
    let onSave: (MemoryItem) async throws -> MemoryItem
    let onForget: (MemoryItem) async throws -> Void
    let onQualitySignal: (MemoryItem, String) async throws -> MemoryItem
    let onPromote: (MemoryItem) async throws -> MemoryItem

    @Environment(\.dismiss) private var dismiss
    @State private var currentItem: MemoryItem
    @State private var showingEdit = false
    @State private var isSaving = false
    @State private var isForgetting = false
    @State private var isSendingQuality = false
    @State private var isPromoting = false
    @State private var errorText = ""

    init(
        item: MemoryItem,
        onReturnHome: @escaping () -> Void = {},
        onSave: @escaping (MemoryItem) async throws -> MemoryItem,
        onForget: @escaping (MemoryItem) async throws -> Void,
        onQualitySignal: @escaping (MemoryItem, String) async throws -> MemoryItem,
        onPromote: @escaping (MemoryItem) async throws -> MemoryItem
    ) {
        self.onReturnHome = onReturnHome
        self.onSave = onSave
        self.onForget = onForget
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
                        .font(.system(size: 34, weight: .semibold, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary)
                        .padding(.top, 24)

                    Text(currentItem.summary)
                        .font(.system(size: 16, weight: .regular, design: .default))
                        .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.9))
                        .lineSpacing(8)

                    if let characterBible = currentItem.characterBible {
                        CharacterBibleDetailSection(bible: characterBible)
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

                    qualityActionsSection

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
                .padding(.horizontal, 24)
                .frame(maxWidth: 1240, alignment: .leading)
            }
        }
        .navigationTitle("")
        .toolbarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .automatic) {
                Button("Return Home") {
                    onReturnHome()
                }
                .disabled(isSaving || isForgetting || isSendingQuality || isPromoting)

                if currentItem.editable {
                    Button("Correct") {
                        showingEdit = true
                    }
                    .disabled(isSaving || isForgetting || isSendingQuality || isPromoting)
                } else if canPromoteCurrentItem {
                    Button("Promote") {
                        Task { await promoteCurrentItem() }
                    }
                    .disabled(isSaving || isForgetting || isSendingQuality || isPromoting)
                }
                Button("Forget", role: .destructive) {
                    Task { await forgetCurrentItem() }
                }
                .disabled(isSaving || isForgetting || isSendingQuality || isPromoting)
            }
        }
        .sheet(isPresented: $showingEdit) {
            MemoryEditSheet(
                item: currentItem,
                isSaving: isSaving,
                onSave: { edited in
                    await saveEditedItem(edited)
                }
            )
            .presentationDetents([.medium, .large])
        }
        .accessibilityElement(children: .contain)
    }

    private var memoryLedgerSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Memory Ledger")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(MemoriesTheme.textPrimary.opacity(0.92))
            ledgerRow("Source", value: currentItem.source)
            ledgerRow("Remembered", value: RelativeDateFormatter.relativeString(for: currentItem.rememberedDate))
            ledgerRow("Last used", value: lastUsedText)
            ledgerRow("Quality score", value: String(format: "%.0f%%", currentItem.qualityScore * 100))
            ledgerRow("Quality votes", value: "\(currentItem.qualityHitCount) helpful / \(currentItem.qualityCorrectionCount) fix")
            ledgerRow("Staleness", value: stalenessText)
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
                .disabled(!currentItem.editable || isSaving || isForgetting || isSendingQuality || isPromoting)

                Button {
                    showingEdit = true
                } label: {
                    Text("Correct Memory")
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.bordered)
                .disabled(!currentItem.editable || isSaving || isForgetting || isSendingQuality || isPromoting)
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
            let updated = try await onSave(edited)
            currentItem = updated
            errorText = ""
            showingEdit = false
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func forgetCurrentItem() async {
        isForgetting = true
        defer { isForgetting = false }
        do {
            try await onForget(currentItem)
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

            if !bible.canon.isEmpty {
                characterBibleList("Canon", items: bible.canon)
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
    let original: MemoryItem
    let isSaving: Bool
    let onSave: (MemoryItem) async -> Void

    init(
        item: MemoryItem,
        isSaving: Bool,
        onSave: @escaping (MemoryItem) async -> Void
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
        self.isSaving = isSaving
        self.onSave = onSave
    }

    var body: some View {
        NavigationStack {
            Form {
                if original.characterBible == nil {
                    Section("Title") {
                        TextField("Memory title", text: $title)
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
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            var updated = original
                            if original.characterBible == nil {
                                updated.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
                                updated.summary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
                                updated.reason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
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
                }
            }
        }
    }

    private var saveDisabled: Bool {
        if original.characterBible == nil {
            return title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        return !makeEditedCharacterBible().isMeaningful
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
