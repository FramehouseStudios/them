import SwiftUI

struct MemoryItem: Identifiable, Hashable {
    let id: String
    let key: String
    let title: String
    let summary: String
    let emotionalTone: String
    let snippets: [String]
    let rememberedAt: Date
    let source: String
}

@MainActor
final class MemoriesViewModel: ObservableObject {
    enum ScreenState {
        case loading
        case empty
        case loaded([MemoryItem])
        case error(String)
    }

    @Published var state: ScreenState = .loading
    @Published var selection: MemoryItem?
    @Published var subtitle: String = "Moments I've remembered about you."

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
            let result = try await BackendMemoryAPI.shared.fetchMemories(limit: 36, force: force)
            let payload = result.payload
            if let userName = payload.userName, !userName.isEmpty {
                subtitle = "What I remember about \(userName)."
            } else {
                subtitle = "Moments I've remembered about you."
            }

            var items = payload.memories.map { card in
                MemoryItem(
                    id: card.id,
                    key: card.key,
                    title: card.title,
                    summary: card.summary,
                    emotionalTone: card.emotionalTone,
                    snippets: card.snippets.filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
                    rememberedAt: themDateFromEpoch(card.rememberedAt),
                    source: card.source
                )
            }

            if items.isEmpty {
                items = payload.conversationSamples.map { sample in
                    MemoryItem(
                        id: "sample-\(sample.id)",
                        key: "turn_\(sample.turn)",
                        title: sample.title,
                        summary: sample.preview,
                        emotionalTone: "",
                        snippets: [sample.user, sample.assistant].filter { !$0.isEmpty },
                        rememberedAt: themDateFromEpoch(sample.updatedAt),
                        source: "history"
                    )
                }
            }

            lastSync = result.sync
            state = items.isEmpty ? .empty : .loaded(items)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    private func handleTurnCommitted(_ event: BackendTurnCommittedEvent) {
        guard event.source == "authoritative" else { return }
        let memoryChanged = event.memoryUpdatedAt > 0 && event.memoryUpdatedAt != lastSync.memoryUpdatedAt
        let stateChanged = !event.stateVersion.isEmpty && event.stateVersion != lastSync.stateVersion
        let turnChanged = !event.turnId.isEmpty && event.turnId != lastSync.lastTurnId
        if memoryChanged || ((stateChanged || turnChanged) && event.memoryUpdatedAt <= 0) {
            Task { await load(force: false) }
        }
    }
}

struct MemoriesScreen: View {
    var goHome: (() -> Void)? = nil
    var refreshToken: Int = 0
    @StateObject private var vm = MemoriesViewModel()

    var body: some View {
        NavigationStack {
            ZStack {
                memoriesHex(0x0F0F12).ignoresSafeArea()
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
                        .padding(.top, 20)
                        .padding(.bottom, 20)
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
            .navigationDestination(item: $vm.selection) { item in
                MemoryDetailScreen(item: item, goHome: goHome)
            }
        }
        .task(id: refreshToken) { await vm.load(force: refreshToken > 0) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Memories")
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.white)
            Text(vm.subtitle)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.white.opacity(0.62))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var content: some View {
        switch vm.state {
        case .loading:
            VStack(spacing: 14) {
                ProgressView()
                Text("Recalling memory...")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.white.opacity(0.62))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

        case .empty:
            VStack(spacing: 14) {
                Text("No memories saved yet.")
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(.white)
                Text("The more you talk, the more details appear here.")
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
                Text("Couldn't load memories.")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                Text(message)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(.white.opacity(0.62))
                    .multilineTextAlignment(.center)
                Button("Retry") {
                    Task { await vm.load(force: true) }
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.14))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

        case .loaded(let items):
            MemoriesGrid(items: items) { tapped in
                vm.selection = tapped
            }
        }
    }
}

private struct MemoriesGrid: View {
    let items: [MemoryItem]
    var onTap: (MemoryItem) -> Void

    private var columns: [GridItem] {
        [
            GridItem(.adaptive(minimum: 320, maximum: 520), spacing: 18, alignment: .top)
        ]
    }

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(items) { item in
                    MemoryCard(item: item) {
                        onTap(item)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 8)
        }
    }
}

private struct MemoryCard: View {
    let item: MemoryItem
    var onTap: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 12) {
                Text(item.title)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                Text(item.summary)
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.white.opacity(0.88))
                    .lineLimit(4)

                if !item.emotionalTone.isEmpty {
                    Text(item.emotionalTone)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white.opacity(0.55))
                }

                Spacer(minLength: 0)

                HStack {
                    Text(relativeMemoryDate(item.rememberedAt))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.white.opacity(0.42))
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(.white.opacity(hovering ? 0.35 : 0.16))
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 200, alignment: .topLeading)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Color.white.opacity(hovering ? 0.11 : 0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

private struct MemoryDetailScreen: View {
    let item: MemoryItem
    var goHome: (() -> Void)? = nil

    var body: some View {
        ZStack {
            memoriesHex(0x0F0F12).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(item.title)
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(.white)

                    if !item.emotionalTone.isEmpty {
                        Text(item.emotionalTone)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white.opacity(0.55))
                    }

                    Text(item.summary)
                        .font(.system(size: 16, weight: .regular))
                        .foregroundStyle(.white.opacity(0.90))
                        .lineSpacing(6)

                    if !item.snippets.isEmpty {
                        Divider().overlay(Color.white.opacity(0.08))
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(item.snippets.enumerated()), id: \.offset) { _, snippet in
                                Text("\"\(snippet)\"")
                                    .font(.system(size: 14, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.90))
                                    .padding(12)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(
                                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .fill(Color.white.opacity(0.07))
                                    )
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                                            .stroke(Color.white.opacity(0.09), lineWidth: 1)
                                    )
                            }
                        }
                    }

                    if let goHome {
                        Button("Back to Conversation", action: goHome)
                            .buttonStyle(.borderedProminent)
                            .tint(.white.opacity(0.14))
                            .padding(.top, 6)
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

private func relativeMemoryDate(_ date: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .full
    let text = formatter.localizedString(for: date, relativeTo: .now)
    return "Remembered \(text)"
}

private func memoriesHex(_ hex: UInt, alpha: Double = 1.0) -> Color {
    Color(
        .sRGB,
        red: Double((hex >> 16) & 0xFF) / 255.0,
        green: Double((hex >> 8) & 0xFF) / 255.0,
        blue: Double(hex & 0xFF) / 255.0,
        opacity: alpha
    )
}

#Preview {
    MemoriesScreen()
        .frame(width: 1200, height: 800)
}
