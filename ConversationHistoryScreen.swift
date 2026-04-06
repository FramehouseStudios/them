import SwiftUI

struct ConversationThread: Identifiable, Hashable {
    let id: String
    let turn: Int
    let title: String
    let preview: String
    let userMessage: String
    let assistantMessage: String
    let updatedAt: Date
}

@MainActor
final class ConversationHistoryViewModel: ObservableObject {
    enum ScreenState {
        case loading
        case empty
        case loaded([ConversationThread])
        case error(String)
    }

    @Published var state: ScreenState = .loading
    @Published var selection: ConversationThread?
    @Published var subtitle: String = "A quiet trail of what mattered."

    private var isLoading = false
    private var lastLoadedAt: Date?
    private let reloadCooldownSeconds: TimeInterval = 2.0
    private var lastSync: BackendSyncState = .empty
    private var turnObserver: NSObjectProtocol?

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

    func load(force: Bool = false) async {
        if isLoading { return }
        if !force, let lastLoadedAt,
           Date().timeIntervalSince(lastLoadedAt) < reloadCooldownSeconds {
            return
        }
        isLoading = true
        let shouldShowLoading: Bool
        switch state {
        case .loaded:
            shouldShowLoading = force
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
            let result = try await BackendMemoryAPI.shared.fetchHistory(limit: 140, force: force)
            let payload = result.payload
            let threads = payload.threads.map { item in
                ConversationThread(
                    id: item.id,
                    turn: item.turn,
                    title: item.title,
                    preview: item.preview,
                    userMessage: item.user,
                    assistantMessage: item.assistant,
                    updatedAt: themDateFromEpoch(item.updatedAt)
                )
            }

            if let recap = payload.lastConversationRecap, !recap.isEmpty {
                subtitle = recap
            } else if let userName = payload.userName, !userName.isEmpty {
                subtitle = "Recent moments with \(userName)."
            } else {
                subtitle = "A quiet trail of what mattered."
            }

            lastSync = result.sync
            state = threads.isEmpty ? .empty : .loaded(threads)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    private func handleTurnCommitted(_ event: BackendTurnCommittedEvent) {
        if event.source == "optimistic" {
            applyOptimisticTurn(event)
            return
        }
        let historyChanged = event.historyUpdatedAt > 0 && event.historyUpdatedAt != lastSync.historyUpdatedAt
        let stateChanged = !event.stateVersion.isEmpty && event.stateVersion != lastSync.stateVersion
        let turnChanged = !event.turnId.isEmpty && event.turnId != lastSync.lastTurnId
        if historyChanged || stateChanged || turnChanged {
            Task { await load(force: false) }
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
            preview: preview,
            userMessage: user,
            assistantMessage: assistant,
            updatedAt: themDateFromEpoch(event.lastUpdatedAt)
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

    private func parseTurnNumber(_ turnId: String) -> Int {
        let raw = turnId.lowercased().replacingOccurrences(of: "turn-", with: "")
        return Int(raw) ?? 0
    }
}

struct ConversationHistoryScreen: View {
    var goHome: (() -> Void)? = nil
    var refreshToken: Int = 0
    @StateObject private var vm = ConversationHistoryViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                historyHex(0x0F0F12).ignoresSafeArea()
                VStack(spacing: 0) {
                    header
                        .padding(.horizontal, 28)
                        .padding(.top, 24)
                        .padding(.bottom, 16)

                    Divider()
                        .overlay(Color.white.opacity(0.07))
                        .padding(.horizontal, 28)

                    content
                        .padding(.horizontal, 28)
                        .padding(.top, 18)
                        .padding(.bottom, 22)
                }
            }
            .navigationTitle("")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await vm.load(force: true) }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                }
                if let goHome {
                    ToolbarItem(placement: .automatic) {
                        Button {
                            goHome()
                        } label: {
                            Label("Conversation", systemImage: "waveform")
                        }
                    }
                }
            }
            .navigationDestination(item: $vm.selection) { thread in
                ConversationThreadDetailView(thread: thread, goHome: goHome)
            }
        }
        .task(id: refreshToken) { await vm.load(force: refreshToken > 0) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Conversation History")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.white)

            Text(vm.subtitle)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.white.opacity(0.62))
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var content: some View {
        switch vm.state {
        case .loading:
            VStack(spacing: 14) {
                ProgressView()
                Text("Loading conversation history...")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.white.opacity(0.64))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

        case .empty:
            VStack(spacing: 14) {
                Text("No saved conversations yet.")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Start talking and your recent turns will appear here.")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.white.opacity(0.62))
                if let goHome {
                    Button("Back to Conversation", action: goHome)
                        .buttonStyle(.borderedProminent)
                        .tint(.white.opacity(0.14))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

        case .error(let message):
            VStack(spacing: 12) {
                Text("Couldn't load history.")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                Text(message)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.white.opacity(0.64))
                    .multilineTextAlignment(.center)
                Button("Retry") {
                    Task { await vm.load(force: true) }
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.14))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

        case .loaded(let threads):
            ConversationHistoryList(threads: threads) { selected in
                vm.selection = selected
            }
        }
    }
}

private enum ConversationHistorySection: CaseIterable {
    case today
    case yesterday
    case lastWeek
    case earlier

    var title: String {
        switch self {
        case .today: return "Today"
        case .yesterday: return "Yesterday"
        case .lastWeek: return "Last Week"
        case .earlier: return "Earlier"
        }
    }
}

private func sectionForHistoryDate(_ date: Date) -> ConversationHistorySection {
    let cal = Calendar.current
    if cal.isDateInToday(date) { return .today }
    if cal.isDateInYesterday(date) { return .yesterday }
    if let dayDelta = cal.dateComponents([.day], from: date, to: .now).day, dayDelta <= 7 {
        return .lastWeek
    }
    return .earlier
}

private struct ConversationHistoryList: View {
    let threads: [ConversationThread]
    var onSelect: (ConversationThread) -> Void

    var body: some View {
        let grouped = Dictionary(grouping: threads, by: { sectionForHistoryDate($0.updatedAt) })
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                ForEach(ConversationHistorySection.allCases, id: \.self) { section in
                    if let items = grouped[section], !items.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(section.title)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.56))
                            ForEach(items) { thread in
                                ConversationHistoryRow(thread: thread) {
                                    onSelect(thread)
                                }
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 8)
        }
    }
}

private struct ConversationHistoryRow: View {
    let thread: ConversationThread
    var onTap: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color.white.opacity(hovering ? 0.50 : 0.18))
                    .frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 5) {
                    Text(thread.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(thread.preview)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.white.opacity(0.62))
                        .lineLimit(1)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(hovering ? 0.30 : 0.14))
            }
            .padding(.horizontal, 15)
            .padding(.vertical, 13)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(hovering ? 0.10 : 0.07))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.09), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

private struct ConversationThreadDetailView: View {
    let thread: ConversationThread
    var goHome: (() -> Void)? = nil

    var body: some View {
        ZStack {
            historyHex(0x0F0F12).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Turn \(max(1, thread.turn))")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.48))
                    Text(thread.title)
                        .font(.system(size: 28, weight: .semibold))
                        .foregroundStyle(.white)

                    ConversationBubble(
                        speaker: "You",
                        text: thread.userMessage.isEmpty ? "No user transcript captured for this turn." : thread.userMessage
                    )
                    ConversationBubble(
                        speaker: "Clementine",
                        text: thread.assistantMessage.isEmpty ? "No assistant response captured for this turn." : thread.assistantMessage
                    )

                    if let goHome {
                        Button("Back to Conversation", action: goHome)
                            .buttonStyle(.borderedProminent)
                            .tint(.white.opacity(0.16))
                            .padding(.top, 8)
                    }
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 24)
            }
        }
        .toolbar {
            if let goHome {
                ToolbarItem(placement: .automatic) {
                    Button {
                        goHome()
                    } label: {
                        Label("Conversation", systemImage: "waveform")
                    }
                }
            }
        }
    }
}

private struct ConversationBubble: View {
    let speaker: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(speaker)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.54))
            Text(text)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.white.opacity(0.90))
                .lineSpacing(5)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }
}

private func historyHex(_ hex: UInt, alpha: Double = 1.0) -> Color {
    Color(
        .sRGB,
        red: Double((hex >> 16) & 0xFF) / 255.0,
        green: Double((hex >> 8) & 0xFF) / 255.0,
        blue: Double(hex & 0xFF) / 255.0,
        opacity: alpha
    )
}

#Preview {
    ConversationHistoryScreen()
        .frame(width: 1200, height: 800)
}
