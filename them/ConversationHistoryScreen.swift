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

    func load(force: Bool = false, sinceTurnId: String? = nil) async {
        let isDeltaFetch = !(sinceTurnId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
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
            let result = try await BackendMemoryAPI.shared.fetchHistory(
                limit: 140,
                force: force,
                sinceTurnId: sinceTurnId
            )
            let payload = result.payload
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
            if isDeltaFetch {
                switch state {
                case .loaded(let current):
                    var merged = Dictionary(uniqueKeysWithValues: current.map { ($0.id, $0) })
                    for thread in incoming {
                        merged[thread.id] = thread
                    }
                    items = merged.values.sorted { $0.lastUpdated > $1.lastUpdated }
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
        await load(force: true, sinceTurnId: nil)
    }

    func delete(_ thread: ConversationThread) {
        guard case .loaded(let items) = state else { return }
        let updated = items.filter { $0.id != thread.id }
        state = updated.isEmpty ? .empty : .loaded(updated)
        if selection?.id == thread.id {
            selection = nil
        }
    }

    func rename(_ thread: ConversationThread, to newTitle: String) {
        let clean = newTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        guard case .loaded(let items) = state else { return }

        let updated = items.map { item -> ConversationThread in
            guard item.id == thread.id else { return item }
            var copy = item
            copy.title = clean
            return copy
        }
        .sorted { $0.lastUpdated > $1.lastUpdated }

        state = updated.isEmpty ? .empty : .loaded(updated)
        if selection?.id == thread.id {
            selection = updated.first(where: { $0.id == thread.id })
        }
    }

    func export(_ thread: ConversationThread) {
        print("Export thread: \(thread.id)")
    }

    private func handleTurnCommitted(_ event: BackendTurnCommittedEvent) {
        if event.source == "optimistic" {
            applyOptimisticTurn(event)
            return
        }
        let versionKey = event.stateVersion.isEmpty ? event.turnId : event.stateVersion
        guard !versionKey.isEmpty else { return }
        if latestSeenStateVersion == versionKey { return }
        if inFlightVersions.contains(versionKey) { return }
        if event.historyUpdatedAt > 0,
           lastSync.historyUpdatedAt > 0,
           event.historyUpdatedAt <= lastSync.historyUpdatedAt {
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
                        historyLimit: 140,
                        memoriesLimit: 1
                    )
                    self.lastSync = result.sync
                    if !result.sync.stateVersion.isEmpty {
                        self.latestSeenStateVersion = result.sync.stateVersion
                    } else {
                        self.latestSeenStateVersion = versionKey
                    }
                    if result.payload.deltaNoChange == true {
                        return
                    }
                    self.applyHistoryDelta(result.payload.historyDelta)
                    return
                } catch {
                    // Fallback to endpoint-specific delta to avoid losing refreshes.
                }
            }

            let previousSync = self.lastSync
            await self.load(force: false, sinceTurnId: sinceTurnId.isEmpty ? nil : sinceTurnId)
            if !self.lastSync.stateVersion.isEmpty {
                self.latestSeenStateVersion = self.lastSync.stateVersion
            } else if self.lastSync.lastTurnId == event.turnId ||
                        self.lastSync.lastUpdatedAt > previousSync.lastUpdatedAt {
                self.latestSeenStateVersion = versionKey
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
            merged = Dictionary(uniqueKeysWithValues: current.map { ($0.id, $0) })
        }
        for thread in incoming {
            merged[thread.id] = thread
        }
        let items = merged.values.sorted { $0.lastUpdated > $1.lastUpdated }
        state = items.isEmpty ? .empty : .loaded(items)
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
    @Environment(\.dismiss) private var dismiss
    var openConversation: () -> Void = {}

    @State private var showRenameAlert = false
    @State private var renamingThread: ConversationThread?
    @State private var renameDraft = ""

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
                        .padding(.bottom, 18)

                    Divider()
                        .overlay(Color.white.opacity(0.22))

                    content
                        .padding(.top, 20)
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
                        dismiss()
                    }
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .accessibilityIdentifier("history.return")
                    .accessibilityHint("Closes conversation history.")
                }
            }
        }
        .accessibilityIdentifier("history.screen")
        .task { await vm.load() }
        .alert("Rename Conversation", isPresented: $showRenameAlert) {
            TextField("Title", text: $renameDraft)
            Button("Cancel", role: .cancel) {
                renamingThread = nil
                renameDraft = ""
            }
            Button("Save") {
                if let thread = renamingThread {
                    vm.rename(thread, to: renameDraft)
                }
                renamingThread = nil
                renameDraft = ""
            }
        } message: {
            Text("Set a short title for this thread.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("History")
                .font(.system(size: 34, weight: .semibold, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textPrimary)

            Text(vm.subtitle)
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundStyle(ConversationHistoryTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Conversation history. A quiet trail of what mattered.")
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
                onDelete: { vm.delete($0) },
                onExport: { vm.export($0) },
                onRename: { thread in
                    renamingThread = thread
                    renameDraft = thread.title
                    showRenameAlert = true
                }
            )
            .navigationDestination(item: $vm.selection) { thread in
                ConversationThreadDetailPlaceholder(thread: thread)
            }
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
    var onDelete: (ConversationThread) -> Void
    var onExport: (ConversationThread) -> Void
    var onRename: (ConversationThread) -> Void

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
                                        onOpen: { selection = thread },
                                        onDelete: { onDelete(thread) },
                                        onExport: { onExport(thread) },
                                        onRename: { onRename(thread) }
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
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.18), value: selection?.id)
    }
}

// MARK: - Row

struct HistoryRow: View {
    let thread: ConversationThread
    let isSelected: Bool
    var onOpen: () -> Void
    var onDelete: () -> Void
    var onExport: () -> Void
    var onRename: () -> Void

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
                        .lineLimit(1)

                    Text(thread.preview)
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(ConversationHistoryTheme.textSecondary)
                        .lineLimit(1)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(Color.white.opacity((isHovering || isSelected) ? 0.36 : 0))
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.16), value: isHovering)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
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
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
            Button(action: onExport) {
                Label("Export", systemImage: "square.and.arrow.up")
            }
        }
        .contextMenu {
            Button("Export", action: onExport)
            Button("Rename", action: onRename)
            Divider()
            Button(role: .destructive, action: onDelete) {
                Text("Delete")
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Conversation. \(thread.title)")
        .accessibilityHint("Opens conversation details.")
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

// MARK: - Placeholder Detail

struct ConversationThreadDetailPlaceholder: View {
    let thread: ConversationThread

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

            VStack(alignment: .leading, spacing: 12) {
                Text("Conversation")
                    .font(.system(size: 34, weight: .semibold, design: .default))
                    .foregroundStyle(ConversationHistoryTheme.textPrimary)

                Text(thread.title)
                    .font(.system(size: 16, weight: .regular, design: .default))
                    .foregroundStyle(ConversationHistoryTheme.textSecondary)

                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)
            .frame(maxWidth: 1240, maxHeight: .infinity, alignment: .topLeading)
        }
        .navigationTitle("")
        .toolbarTitleDisplayMode(.inline)
    }
}

// MARK: - Preview

#Preview {
    ConversationHistoryScreen()
        .frame(width: 1440, height: 1024)
}
