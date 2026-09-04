import SwiftUI
import Combine

// MARK: - Model

struct ConversationThread: Identifiable, Hashable {
    let id: String
    var turn: Int
    var title: String
    var lastUpdated: Date
    var preview: String
    var userMessage: String
    var assistantMessage: String
}

struct ConversationThreadPresentation: Equatable {
    let title: String
    let writerMessage: String
    let clementineMessage: String
    let turnLabel: String
    let updatedLabel: String

    init(thread: ConversationThread) {
        title = Self.nonEmpty(thread.title, fallback: "Untitled conversation")
        writerMessage = Self.nonEmpty(
            thread.userMessage,
            fallback: "The writer's message was not saved for this turn."
        )
        clementineMessage = Self.nonEmpty(
            thread.assistantMessage,
            fallback: "Clementine's reply was not saved for this turn."
        )
        turnLabel = thread.turn > 0 ? "Turn \(thread.turn)" : "Saved conversation"
        updatedLabel = thread.lastUpdated.formatted(date: .abbreviated, time: .shortened)
    }

    private static func nonEmpty(_ value: String, fallback: String) -> String {
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? fallback : cleaned
    }
}

// MARK: - ViewModel

@MainActor
final class ConversationHistoryViewModel: ObservableObject {
    enum ScreenState: Equatable {
        case loading
        case empty
        case loaded([ConversationThread])
        case error(message: String)
    }

    @Published var state: ScreenState = .loading
    @Published var selection: ConversationThread?
    @Published var subtitle: String = "A quiet trail of what mattered."
    @Published private(set) var isRefreshing = false
    @Published private(set) var refreshError: String?

    typealias HistoryLoader = @MainActor (Bool, String?) async throws -> BackendReadResult<BackendHistoryResponse>
    typealias DeltaLoader = @MainActor (String, String?) async throws -> BackendReadResult<BackendStateDeltaResponse>

    private var historyLoader: HistoryLoader
    private let deltaLoader: DeltaLoader
    private let notificationCenter: NotificationCenter
    private var lastLoadedAt: Date?
    private let reloadCooldownSeconds: TimeInterval = 1.0
    private var lastSync: BackendSyncState = .empty
    private var turnObserver: NSObjectProtocol?
    private var latestSeenStateVersion = ""
    private var pendingEvents: [String: BackendTurnCommittedEvent] = [:]
    private var optimisticUpdatesDuringRead: [String: ConversationThread] = [:]
    #if DEBUG
    private var isUITestFixture = false
    #endif

    init(
        notificationCenter: NotificationCenter = .default,
        historyLoader: @escaping HistoryLoader = { force, sinceTurnId in
            try await BackendMemoryAPI.shared.fetchHistory(limit: 140, force: force, sinceTurnId: sinceTurnId)
        },
        deltaLoader: @escaping DeltaLoader = { version, turnId in
            try await BackendMemoryAPI.shared.fetchStateDelta(
                sinceVersion: version, sinceTurnId: turnId, historyLimit: 140, memoriesLimit: 1
            )
        }
    ) {
        self.notificationCenter = notificationCenter
        self.historyLoader = historyLoader
        self.deltaLoader = deltaLoader
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

    func load(force: Bool = false, sinceTurnId: String? = nil) async {
        let isDeltaFetch = !(sinceTurnId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        if isRefreshing { return }
        if !force, !isDeltaFetch, let lastLoadedAt,
           Date().timeIntervalSince(lastLoadedAt) < reloadCooldownSeconds {
            return
        }

        beginRead()
        defer { finishRead() }

        do {
            try await readHistory(force: force, sinceTurnId: sinceTurnId)
        } catch {
            presentReadFailure(error)
        }
    }

    private func readHistory(force: Bool, sinceTurnId: String?) async throws {
        let result = try await historyLoader(force, sinceTurnId)
        try Task.checkCancellation()
        let payload = result.payload
        let requestedDelta = !(sinceTurnId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
        if requestedDelta, payload.isDelta ?? true,
           payload.threads.isEmpty,
           historyCursorChanged(updatedAt: payload.historyUpdatedAt, turnId: payload.lastTurnId) {
            try await readHistory(force: true, sinceTurnId: nil)
            return
        }
        let incoming = payload.threads.map { item in
            ConversationThread(
                id: item.id,
                turn: item.turn,
                title: item.title,
                lastUpdated: themDateFromEpoch(item.updatedAt),
                preview: item.preview,
                userMessage: item.user,
                assistantMessage: item.assistant
            )
        }

        if let recap = payload.lastConversationRecap, !recap.isEmpty {
            subtitle = recap
        } else if let userName = payload.userName, !userName.isEmpty {
            subtitle = "Recent moments with \(userName)."
        } else {
            subtitle = "A quiet trail of what mattered."
        }

        let items: [ConversationThread]
        if payload.isDelta ?? requestedDelta {
            switch state {
            case .loaded(let current):
                var merged = current.reduce(into: [String: ConversationThread]()) { $0[$1.id] = $1 }
                for thread in incoming {
                    merged[thread.id] = thread
                }
                items = Array(merged.values)
            case .empty, .error, .loading:
                items = incoming
            }
        } else {
            items = incoming
        }

        adoptReadCursor(
            version: payload.stateVersion, turnId: payload.lastTurnId,
            historyUpdatedAt: payload.historyUpdatedAt, lastUpdatedAt: payload.lastUpdatedAt
        )
        publishThreads(items)
        lastLoadedAt = Date()
    }

    private func beginRead() {
        isRefreshing = true
        refreshError = nil
        optimisticUpdatesDuringRead = [:]
        if case .error = state { state = .loading }
    }

    private func finishRead() {
        isRefreshing = false
        optimisticUpdatesDuringRead = [:]
        let events = pendingEvents
        pendingEvents = [:]
        if let next = events.first(where: { $0.key != latestSeenStateVersion })?.value {
            handleTurnCommitted(next)
        }
    }

    private func presentReadFailure(_ error: Error) {
        guard !(error is CancellationError), (error as? URLError)?.code != .cancelled else { return }
        switch state {
        case .loaded:
            refreshError = "Couldn’t refresh history. You can still read these conversations."
        case .empty:
            refreshError = "Couldn’t refresh history. Try again to check for new conversations."
        case .loading, .error:
            state = .error(message: error.localizedDescription)
        }
    }

    private func adoptReadCursor(
        version: String?, turnId: String?, historyUpdatedAt: TimeInterval?, lastUpdatedAt: TimeInterval?
    ) {
        // The shared API sync state may describe a different read. Only advance
        // past data this screen actually received, including a cleared cursor.
        lastSync.stateVersion = version ?? ""
        lastSync.lastTurnId = turnId ?? ""
        lastSync.historyUpdatedAt = historyUpdatedAt ?? 0
        lastSync.lastUpdatedAt = lastUpdatedAt ?? 0
        latestSeenStateVersion = lastSync.stateVersion
    }

    private func historyCursorChanged(updatedAt: TimeInterval?, turnId: String?) -> Bool {
        (updatedAt ?? 0) != lastSync.historyUpdatedAt || (turnId ?? "") != lastSync.lastTurnId
    }

    func thread(forID id: String) -> ConversationThread? {
        guard case .loaded(let items) = state else { return nil }
        return items.first { $0.id == id }
    }

    private func publishThreads(_ items: [ConversationThread]) {
        var merged = items.reduce(into: [String: ConversationThread]()) { $0[$1.id] = $1 }
        for (id, optimistic) in optimisticUpdatesDuringRead {
            if let saved = merged[id], saved.lastUpdated >= optimistic.lastUpdated { continue }
            merged[id] = optimistic
        }
        let sorted = merged.values.sorted {
            if $0.lastUpdated != $1.lastUpdated { return $0.lastUpdated > $1.lastUpdated }
            if $0.turn != $1.turn { return $0.turn > $1.turn }
            return $0.id < $1.id
        }
        state = sorted.isEmpty ? .empty : .loaded(sorted)
        if let selection, merged[selection.id] == nil { self.selection = nil }
    }

    func retry() async {
        await load(force: true, sinceTurnId: nil)
    }

    func installUITestFixtureIfNeeded(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        now: Date = Date()
    ) -> Bool {
        #if DEBUG
        guard arguments.contains("--ui-testing"),
              arguments.contains("--ui-history-fixture") else {
            return false
        }
        isUITestFixture = true
        subtitle = "A clear record of the pages you shaped with Clementine."
        state = .loaded([
            ConversationThread(
                id: "history-fixture-lighthouse",
                turn: 18,
                title: "The lighthouse door",
                lastUpdated: now.addingTimeInterval(-900),
                preview: "Mara chooses the storm over another safe answer.",
                userMessage: "Make the choice feel physical before Mara admits why she came back.",
                assistantMessage: "Mara braces both hands against the salt-swollen door. It gives only after she stops trying to look unafraid."
            ),
            ConversationThread(
                id: "history-fixture-causeway",
                turn: 17,
                title: "Crossing the causeway",
                lastUpdated: now.addingTimeInterval(-3_600),
                preview: "The tide cuts off the last easy retreat.",
                userMessage: "Let the causeway disappear behind them.",
                assistantMessage: ""
            ),
        ])
        if case .loaded(let threads) = state {
            var shouldFail = arguments.contains("--ui-history-refresh-failure")
            let recap = subtitle
            historyLoader = { _, _ in
                if shouldFail {
                    shouldFail = false
                    throw URLError(.notConnectedToInternet)
                }
                let rows: [[String: Any]] = threads.map { thread in
                    ["id": thread.id, "turn": thread.turn, "title": thread.title,
                     "preview": thread.preview, "user": thread.userMessage,
                     "assistant": thread.assistantMessage, "updatedAt": thread.lastUpdated.timeIntervalSince1970]
                }
                let data = try JSONSerialization.data(withJSONObject: [
                    "source": "ui-fixture", "sourceIp": "", "rememberedNames": [],
                    "conversationCount": threads.count, "lastConversationRecap": recap,
                    "stateVersion": "history-fixture-refreshed", "lastTurnId": "turn-18",
                    "isDelta": false, "threads": rows,
                ])
                let payload = try JSONDecoder().decode(BackendHistoryResponse.self, from: data)
                return BackendReadResult(payload: payload, sync: .empty, notModified: false)
            }
        }
        return true
        #else
        return false
        #endif
    }

    private func handleTurnCommitted(_ event: BackendTurnCommittedEvent) {
        #if DEBUG
        guard !isUITestFixture else { return }
        #endif
        if event.source == "optimistic" {
            applyOptimisticTurn(event)
            return
        }
        let versionKey = event.stateVersion.isEmpty ? event.turnId : event.stateVersion
        guard !versionKey.isEmpty else { return }
        if latestSeenStateVersion == versionKey { return }
        if isRefreshing {
            pendingEvents[versionKey] = event
            return
        }
        beginRead()
        let sinceVersion = lastSync.stateVersion
        let sinceTurnId = lastSync.lastTurnId
        Task { @MainActor [weak self] in
            guard let self else { return }
            defer { self.finishRead() }

            if !sinceVersion.isEmpty {
                do {
                    let result = try await self.deltaLoader(sinceVersion, sinceTurnId.isEmpty ? nil : sinceTurnId)
                    try Task.checkCancellation()
                    // Turn-number deltas cannot represent a cleared history or
                    // edits to an existing turn. Re-read the complete snapshot.
                    if result.payload.deltaNoChange != true,
                       result.payload.historyDelta.isEmpty,
                       self.historyCursorChanged(
                        updatedAt: result.payload.historyUpdatedAt, turnId: result.payload.lastTurnId
                       ) {
                        do {
                            try await self.readHistory(force: true, sinceTurnId: nil)
                        } catch {
                            self.presentReadFailure(error)
                        }
                        return
                    }
                    self.adoptReadCursor(
                        version: result.payload.stateVersion, turnId: result.payload.lastTurnId,
                        historyUpdatedAt: result.payload.historyUpdatedAt, lastUpdatedAt: result.payload.lastUpdatedAt
                    )
                    if result.payload.deltaNoChange == true {
                        return
                    }
                    self.applyHistoryDelta(result.payload.historyDelta)
                    return
                } catch {
                    if error is CancellationError || (error as? URLError)?.code == .cancelled { return }
                    // Fallback to endpoint-specific delta to avoid losing refreshes.
                }
            }

            do {
                try await self.readHistory(force: false, sinceTurnId: sinceTurnId.isEmpty ? nil : sinceTurnId)
            } catch {
                self.presentReadFailure(error)
            }
        }
    }

    private func applyOptimisticTurn(_ event: BackendTurnCommittedEvent) {
        guard let user = event.userMessage, !user.isEmpty else { return }
        let assistant = event.assistantMessage ?? ""
        let title = String(user.prefix(120))
        let preview = assistant.isEmpty ? String(user.prefix(170)) : String(assistant.prefix(170))
        let optimisticTurn = ConversationThread(
            id: event.turnId,
            turn: parseTurnNumber(event.turnId),
            title: title,
            lastUpdated: themDateFromEpoch(event.lastUpdatedAt),
            preview: preview,
            userMessage: user,
            assistantMessage: assistant
        )
        var current: [ConversationThread]
        switch state {
        case .loaded(let items):
            current = items
        case .empty, .error, .loading:
            current = []
        }
        current.removeAll { $0.id == optimisticTurn.id }
        current.insert(optimisticTurn, at: 0)
        if isRefreshing { optimisticUpdatesDuringRead[optimisticTurn.id] = optimisticTurn }
        state = .loaded(current)
    }

    private func applyHistoryDelta(_ delta: [BackendHistoryThread]) {
        guard !delta.isEmpty else { return }
        let incoming = delta.map { item in
            ConversationThread(
                id: item.id,
                turn: item.turn,
                title: item.title,
                lastUpdated: themDateFromEpoch(item.updatedAt),
                preview: item.preview,
                userMessage: item.user,
                assistantMessage: item.assistant
            )
        }

        var merged = [String: ConversationThread]()
        if case .loaded(let current) = state {
            merged = current.reduce(into: [String: ConversationThread]()) { $0[$1.id] = $1 }
        }
        for thread in incoming {
            merged[thread.id] = thread
        }
        publishThreads(Array(merged.values))
    }

    private func parseTurnNumber(_ turnId: String) -> Int {
        let raw = turnId.lowercased().replacingOccurrences(of: "turn-", with: "")
        return Int(raw) ?? 0
    }
}

// MARK: - Theme (aligned to existing io.them visual language)

enum ConversationHistoryTheme {
    static let textPrimary = Color.herText.opacity(0.95)
    static let textSecondary = Color.herText.opacity(0.72)
    static let rowSurface = Color.white.opacity(0.20)
    static let rowSurfaceHover = Color.white.opacity(0.24)
    static let rowSurfaceSelected = Color.white.opacity(0.28)
    static let stroke = Color.white.opacity(0.24)
    static let accent = Color.herOrbStroke.opacity(0.78)
    static let shadow = Color.black.opacity(0.12)
}

// MARK: - Screen

struct ConversationHistoryScreen: View {
    @StateObject private var vm = ConversationHistoryViewModel()
    var openConversation: () -> Void = {}
    var dismissAction: (() -> Void)?

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    init(
        openConversation: @escaping () -> Void = {},
        dismissAction: (() -> Void)? = nil
    ) {
        self.openConversation = openConversation
        self.dismissAction = dismissAction
    }

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
                    topBar
                        .padding(.top, isCompact ? 12 : 28)
                        .padding(.bottom, isCompact ? 12 : 18)

                    refreshControls
                        .padding(.bottom, 12)

                    Divider()
                        .overlay(Color.white.opacity(0.22))

                    content
                        .padding(.top, isCompact ? 14 : 20)
                        .padding(.bottom, isCompact ? 16 : 28)
                }
                .padding(.horizontal, isCompact ? 16 : 24)
                .frame(maxWidth: 1240, maxHeight: .infinity, alignment: .top)
            }
            .navigationTitle("")
            .toolbarTitleDisplayMode(.inline)
            .navigationDestination(item: $vm.selection) { thread in
                ConversationThreadDetailView(thread: vm.thread(forID: thread.id) ?? thread)
            }
        }
        .task {
            guard !vm.installUITestFixtureIfNeeded() else { return }
            await vm.load()
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("history.screen")
    }

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    private var topBar: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("History")
                    .font(.system(size: isCompact ? 28 : 34, weight: .semibold, design: .default))
                    .foregroundStyle(ConversationHistoryTheme.textPrimary)

                Text(vm.subtitle)
                    .font(.system(size: 15, weight: .regular, design: .default))
                    .foregroundStyle(ConversationHistoryTheme.textSecondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("history.summary")
            }

            Spacer(minLength: 8)

            if let dismissAction {
                Button(action: dismissAction) {
                    Text("Done")
                        .font(.system(size: 14, weight: .semibold, design: .default))
                        .frame(minWidth: 64, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.22))
                .foregroundStyle(ConversationHistoryTheme.textPrimary)
                .contentShape(Rectangle())
                .accessibilityIdentifier("history.done")
                .accessibilityHint("Returns to Clementine and the orb.")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("history.navigation")
    }

    private var refreshControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Task { await vm.retry() }
            } label: {
                HStack(spacing: 8) {
                    if vm.isRefreshing {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                    Text(vm.isRefreshing ? "Refreshing…" : (vm.refreshError == nil ? "Refresh history" : "Retry refresh"))
                }
                .font(.system(size: 14, weight: .semibold))
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(ConversationHistoryTheme.textPrimary)
            .background(Color.white.opacity(0.18), in: RoundedRectangle(cornerRadius: 12))
            .disabled(vm.isRefreshing)
            .accessibilityIdentifier("history.refresh")
            .accessibilityHint("Checks for the latest saved conversations with Clementine.")

            if let message = vm.refreshError {
                Text(message)
                    .font(.system(size: 14))
                    .foregroundStyle(ConversationHistoryTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("history.refresh-error")
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch vm.state {
        case .loading:
            HistoryLoadingView()
        case .empty:
            HistoryEmptyView(openConversation: openConversation)
        case .error(let message):
            HistoryErrorView(message: message, retry: {
                Task { await vm.retry() }
            })
        case .loaded(let items):
            HistoryList(
                items: items,
                selection: $vm.selection,
                refresh: { await vm.retry() }
            )
        }
    }
}

// MARK: - Date Grouping

private enum HistorySectionKey: Hashable {
    case today
    case yesterday
    case last7Days
    case earlier
}

private func sectionKey(for date: Date) -> HistorySectionKey {
    let calendar = Calendar.current
    if calendar.isDateInToday(date) { return .today }
    if calendar.isDateInYesterday(date) { return .yesterday }
    if let days = calendar.dateComponents([.day], from: date, to: .now).day, days <= 7 {
        return .last7Days
    }
    return .earlier
}

private func sectionTitle(_ key: HistorySectionKey) -> String {
    switch key {
    case .today: return "Today"
    case .yesterday: return "Yesterday"
    case .last7Days: return "Last Week"
    case .earlier: return "Earlier"
    }
}

// MARK: - List

struct HistoryList: View {
    let items: [ConversationThread]
    @Binding var selection: ConversationThread?
    var refresh: () async -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let grouped = Dictionary(grouping: items, by: { sectionKey(for: $0.lastUpdated) })
        let order: [HistorySectionKey] = [.today, .yesterday, .last7Days, .earlier]

        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ForEach(order, id: \.self) { key in
                    if let sectionItems = grouped[key], !sectionItems.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(sectionTitle(key))
                                .font(.system(size: 13, weight: .semibold, design: .default))
                                .foregroundStyle(ConversationHistoryTheme.textSecondary)
                                .padding(.top, key == .today ? 0 : 10)

                            VStack(spacing: 10) {
                                ForEach(sectionItems) { thread in
                                    HistoryRow(
                                        thread: thread,
                                        isSelected: selection?.id == thread.id,
                                        onOpen: { selection = thread }
                                    )
                                }
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6)
        }
        .scrollIndicators(.automatic)
        .refreshable { await refresh() }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: selection?.id)
    }
}

// MARK: - Row

struct HistoryRow: View {
    let thread: ConversationThread
    let isSelected: Bool
    var onOpen: () -> Void

    @State private var isHovering = false
    @FocusState private var isFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 14) {
                Circle()
                    .fill(ConversationHistoryTheme.accent.opacity(isSelected ? 0.78 : 0.24))
                    .frame(width: 8, height: 8)
                    .padding(.leading, 2)

                VStack(alignment: .leading, spacing: 6) {
                    Text(thread.title)
                        .font(.system(size: 15, weight: .regular, design: .default))
                        .foregroundStyle(ConversationHistoryTheme.textPrimary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(thread.preview)
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(ConversationHistoryTheme.textSecondary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(Color.white.opacity((isHovering || isSelected) ? 0.68 : 0.42))
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.16), value: isHovering)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("history.thread.\(thread.id)")
        .accessibilityLabel("Conversation. \(thread.title)")
        .accessibilityValue(thread.preview)
        .accessibilityHint("Opens the writer and Clementine transcript.")
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    isSelected
                    ? ConversationHistoryTheme.rowSurfaceSelected
                    : (isHovering ? ConversationHistoryTheme.rowSurfaceHover : ConversationHistoryTheme.rowSurface)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(
                    isSelected ? ConversationHistoryTheme.accent.opacity(0.52) : ConversationHistoryTheme.stroke,
                    lineWidth: 1
                )
        )
        .shadow(
            color: ConversationHistoryTheme.shadow,
            radius: isHovering ? 18 : 14,
            x: 0,
            y: isHovering ? 8 : 6
        )
        .scaleEffect(reduceMotion ? 1 : (isHovering ? 1.01 : 1))
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.22), value: isHovering)
        .onHover { isHovering = $0 }
        .focusable(true)
        .focused($isFocused)
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(ConversationHistoryTheme.accent, lineWidth: isFocused ? 2 : 0)
        )
        .frame(minHeight: 44)
    }
}

// MARK: - States

struct HistoryLoadingView: View {
    var body: some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)
            Text("Loading...")
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityLabel("Loading conversation history")
    }
}

struct HistoryEmptyView: View {
    var openConversation: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Circle()
                .stroke(Color.white.opacity(0.24), lineWidth: 1)
                .frame(width: 84, height: 84)
                .shadow(color: ConversationHistoryTheme.accent.opacity(0.14), radius: 18)

            Text("Nothing saved yet.")
                .font(.system(size: 20, weight: .semibold, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textPrimary)

            Text("When a moment matters, it will appear here.")
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)

            Button("Go to Conversation", action: openConversation)
                .buttonStyle(SoftPrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct HistoryErrorView: View {
    let message: String
    var retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Text("I am having trouble loading that right now.")
                .font(.system(size: 16, weight: .semibold, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textPrimary)

            Text(message)
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 520)

            Button("Retry", action: retry)
                .buttonStyle(SoftPrimaryButtonStyle())
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Thread Detail

struct ConversationThreadDetailView: View {
    let thread: ConversationThread

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    private var presentation: ConversationThreadPresentation {
        ConversationThreadPresentation(thread: thread)
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
                VStack(alignment: .leading, spacing: isCompact ? 16 : 20) {
                    detailHeader
                    transcriptCard(
                        role: "Writer",
                        text: presentation.writerMessage,
                        identifier: "history.detail.writer"
                    )
                    transcriptCard(
                        role: "Clementine",
                        text: presentation.clementineMessage,
                        identifier: "history.detail.clementine"
                    )
                }
                .padding(.horizontal, isCompact ? 16 : 24)
                .padding(.top, isCompact ? 18 : 28)
                .padding(.bottom, 32)
                .frame(maxWidth: 880, alignment: .topLeading)
                .frame(maxWidth: .infinity, alignment: .top)
            }
        }
        .navigationTitle("")
        .toolbarTitleDisplayMode(.inline)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("history.detail.screen")
    }

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    private var detailHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Conversation")
                .font(.system(size: isCompact ? 28 : 34, weight: .semibold, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textPrimary)

            Text(presentation.title)
                .font(.system(size: isCompact ? 20 : 22, weight: .semibold, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textPrimary.opacity(0.92))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("history.detail.title")

            HStack(spacing: 8) {
                Label(presentation.turnLabel, systemImage: "text.bubble")
                Text("•")
                    .accessibilityHidden(true)
                Text(presentation.updatedLabel)
            }
            .font(.system(size: 13, weight: .medium, design: .default))
            .foregroundStyle(ConversationHistoryTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("history.detail.metadata")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func transcriptCard(
        role: String,
        text: String,
        identifier: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(role)
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textPrimary)

            Text(text)
                .font(.system(size: 16, weight: .regular, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textPrimary.opacity(0.88))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(isCompact ? 16 : 20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(role == "Clementine" ? 0.22 : 0.14))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.24), lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
        .accessibilityLabel("\(role) message")
        .accessibilityValue(text)
    }
}

// MARK: - Preview

#Preview {
    ConversationHistoryScreen()
        .frame(width: 1440, height: 1024)
}
