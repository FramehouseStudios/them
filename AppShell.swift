import SwiftUI

// MARK: - App Sections

enum AppSection: String, CaseIterable, Identifiable, Hashable {
    case conversation = "Conversation"
    case history = "History"
    case memories = "Memories"
    case recap = "Recap"
    case insights = "Insights"
    case voice = "Voice"
    case profile = "Profile"

    var id: String { rawValue }

    var systemImage: String {
        switch self {
        case .conversation: return "waveform"
        case .history: return "clock"
        case .memories: return "square.grid.2x2"
        case .recap: return "checklist"
        case .insights: return "chart.line.uptrend.xyaxis"
        case .voice: return "speaker.wave.2"
        case .profile: return "person.crop.circle"
        }
    }
}

@MainActor
final class AppShellBackendBridge: ObservableObject {
    @Published var isConnected: Bool = false
    @Published var statusText: String = "Connecting..."
    @Published var assistantName: String = "CLEMENTINE"
    @Published var userName: String = ""
    @Published var lastError: String = ""
    @Published var presenceStatus: String = "unknown"
    @Published var sessionId: String = ""
    @Published var backendBuild: String = ""
    @Published var schemaVersion: Int = 0
    @Published var lastTurnId: String = ""
    @Published var lastUpdatedAt: TimeInterval = 0
    @Published var historyUpdatedAt: TimeInterval = 0
    @Published var memoryUpdatedAt: TimeInterval = 0
    @Published var stateVersion: String = ""
    @Published var backendBootId: String = ""

    private var isRefreshing = false

    var identityLine: String {
        userName.isEmpty ? assistantName : "\(assistantName) with \(userName)"
    }

    var statusLine: String {
        guard isConnected else { return "Backend offline" }
        var parts: [String] = [presenceStatus.capitalized]
        if schemaVersion > 0 { parts.append("schema \(schemaVersion)") }
        if !lastTurnId.isEmpty { parts.append(lastTurnId) }
        return parts.joined(separator: " · ")
    }

    func refresh(force: Bool = false) async {
        if isRefreshing { return }
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let health = try await BackendMemoryAPI.shared.fetchHealth()
            guard health.ok else {
                isConnected = false
                statusText = "Offline"
                presenceStatus = health.status
                sessionId = health.sessionId
                schemaVersion = health.schemaVersion
                backendBuild = health.backendBuild
                backendBootId = health.backendBootId
                lastTurnId = health.lastTurnId
                lastUpdatedAt = health.lastUpdatedAt
                historyUpdatedAt = health.historyUpdatedAt
                memoryUpdatedAt = health.memoryUpdatedAt
                stateVersion = health.stateVersion
                lastError = health.raw.isEmpty ? "Health check failed." : health.raw
                return
            }
            let session = try await BackendMemoryAPI.shared.bootstrapSession(force: force)
            assistantName = (session.assistantSelfName ?? session.assistantName ?? "CLEMENTINE")
            userName = session.userName ?? ""
            let sync = await BackendMemoryAPI.shared.currentSyncState()
            apply(sync: sync)
            isConnected = true
            statusText = "Connected"
            lastError = ""
        } catch {
            isConnected = false
            statusText = "Offline"
            lastError = error.localizedDescription
        }
    }

    func ingestTurnEvent(_ event: BackendTurnCommittedEvent) {
        if !event.sessionId.isEmpty { sessionId = event.sessionId }
        if !event.stateVersion.isEmpty { stateVersion = event.stateVersion }
        if !event.turnId.isEmpty { lastTurnId = event.turnId }
        if event.lastUpdatedAt > 0 { lastUpdatedAt = event.lastUpdatedAt }
        if event.historyUpdatedAt > 0 { historyUpdatedAt = event.historyUpdatedAt }
        if event.memoryUpdatedAt > 0 { memoryUpdatedAt = event.memoryUpdatedAt }
    }

    func ingestSyncNotification(_ notification: Notification) {
        guard let userInfo = notification.userInfo else { return }
        if let status = userInfo[BackendMemoryAPI.NotificationKey.status] as? String, !status.isEmpty {
            presenceStatus = status
            if status.lowercased() == "up" {
                isConnected = true
                statusText = "Connected"
            } else {
                isConnected = false
                statusText = "Reconnecting..."
            }
        }
        if let sid = userInfo[BackendMemoryAPI.NotificationKey.sessionId] as? String, !sid.isEmpty {
            sessionId = sid
        }
        if let schema = userInfo[BackendMemoryAPI.NotificationKey.schemaVersion] as? Int, schema > 0 {
            schemaVersion = schema
        }
        if let build = userInfo[BackendMemoryAPI.NotificationKey.backendBuild] as? String, !build.isEmpty {
            backendBuild = build
        }
        if let bootId = userInfo[BackendMemoryAPI.NotificationKey.backendBootId] as? String, !bootId.isEmpty {
            backendBootId = bootId
        }
        if let turn = userInfo[BackendMemoryAPI.NotificationKey.lastTurnId] as? String, !turn.isEmpty {
            lastTurnId = turn
        }
        if let updated = userInfo[BackendMemoryAPI.NotificationKey.lastUpdatedAt] as? Double, updated > 0 {
            lastUpdatedAt = updated
        }
        if let updated = userInfo[BackendMemoryAPI.NotificationKey.historyUpdatedAt] as? Double, updated > 0 {
            historyUpdatedAt = updated
        }
        if let updated = userInfo[BackendMemoryAPI.NotificationKey.memoryUpdatedAt] as? Double, updated > 0 {
            memoryUpdatedAt = updated
        }
        if let state = userInfo[BackendMemoryAPI.NotificationKey.stateVersion] as? String, !state.isEmpty {
            stateVersion = state
        }
    }

    private func apply(sync: BackendSyncState) {
        presenceStatus = sync.status
        sessionId = sync.sessionId
        schemaVersion = sync.schemaVersion
        backendBuild = sync.backendBuild
        backendBootId = sync.backendBootId
        lastTurnId = sync.lastTurnId
        lastUpdatedAt = sync.lastUpdatedAt
        historyUpdatedAt = sync.historyUpdatedAt
        memoryUpdatedAt = sync.memoryUpdatedAt
        stateVersion = sync.stateVersion
    }
}

// MARK: - App Shell

struct AppShell: View {
    @State private var selection: AppSection? = .conversation
    @State private var historyRefreshToken: Int = 0
    @State private var memoriesRefreshToken: Int = 0
    @StateObject private var backendBridge = AppShellBackendBridge()
    private let bridgeTimer = Timer.publish(every: 8, on: .main, in: .common).autoconnect()

    var body: some View {
        NavigationSplitView {
            sidebar
        } detail: {
            detailView
        }
        .navigationSplitViewStyle(.balanced)
        .frame(minWidth: 980, minHeight: 640)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 2) {
                    Text("THEM.IO")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(.primary.opacity(0.82))
                    Text(backendBridge.identityLine)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.primary.opacity(0.56))
                }
            }
            ToolbarItem(placement: .automatic) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(backendBridge.isConnected ? Color.green.opacity(0.85) : Color.orange.opacity(0.85))
                        .frame(width: 7, height: 7)
                    Text(backendBridge.statusText)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.primary.opacity(0.70))
                }
            }
        }
        .task {
            await backendBridge.refresh(force: false)
        }
        .onReceive(NotificationCenter.default.publisher(for: .themBackendSyncUpdated)) { notification in
            let previousBootId = backendBridge.backendBootId
            backendBridge.ingestSyncNotification(notification)
            let nextBootId = backendBridge.backendBootId
            if !previousBootId.isEmpty, !nextBootId.isEmpty, previousBootId != nextBootId {
                historyRefreshToken &+= 1
                memoriesRefreshToken &+= 1
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .themTurnCommitted)) { notification in
            guard let event = BackendTurnCommittedEvent(notification: notification) else { return }
            backendBridge.ingestTurnEvent(event)
        }
        .onReceive(bridgeTimer) { _ in
            Task { await backendBridge.refresh(force: false) }
        }
        .onChange(of: selection) { _, newValue in
            Task { await backendBridge.refresh(force: false) }
            switch newValue {
            case .history:
                historyRefreshToken &+= 1
            case .memories:
                memoriesRefreshToken &+= 1
            default:
                break
            }
        }
    }

    private var sidebar: some View {
        List(AppSection.allCases, selection: $selection) { section in
            Label(section.rawValue, systemImage: section.systemImage)
                .tag(section as AppSection?)
        }
        .listStyle(.sidebar)
        .navigationTitle("THEM.IO")
        .frame(minWidth: 220)
    }

    @ViewBuilder
    private var detailView: some View {
        switch selection {
        case .conversation:
            ConversationScreen(
                connectionLine: backendBridge.lastError.isEmpty
                    ? backendBridge.statusLine
                    : "Backend issue: \(backendBridge.lastError)"
            )
        case .history:
            ConversationHistoryScreen(
                goHome: { selection = .conversation },
                refreshToken: historyRefreshToken
            )
        case .memories:
            MemoriesScreen(
                goHome: { selection = .conversation },
                refreshToken: memoriesRefreshToken
            )
        case .recap:
            RecapShellScreen()
        case .insights:
            InsightsPlaceholderScreen()
        case .voice:
            VoiceSettingsPlaceholderScreen()
        case .profile:
            ProfilePlaceholderScreen()
        case .none:
            ConversationScreen(
                connectionLine: backendBridge.lastError.isEmpty
                    ? backendBridge.statusLine
                    : "Backend issue: \(backendBridge.lastError)"
            )
        }
    }
}

// MARK: - Optional Keyboard Commands
// Attach from your App scene:
// .commands { AppShellCommands(setSelection: { section in appSelection = section }) }

struct AppShellCommands: Commands {
    let setSelection: (AppSection) -> Void

    var body: some Commands {
        CommandMenu("Navigate") {
            Button("Conversation") { setSelection(.conversation) }
                .keyboardShortcut("1", modifiers: .command)
            Button("History") { setSelection(.history) }
                .keyboardShortcut("2", modifiers: .command)
            Button("Memories") { setSelection(.memories) }
                .keyboardShortcut("3", modifiers: .command)
            Button("Recap") { setSelection(.recap) }
                .keyboardShortcut("4", modifiers: .command)
            Button("Insights") { setSelection(.insights) }
                .keyboardShortcut("5", modifiers: .command)
            Button("Voice") { setSelection(.voice) }
                .keyboardShortcut("6", modifiers: .command)
            Button("Profile") { setSelection(.profile) }
                .keyboardShortcut("7", modifiers: .command)
        }
    }
}

// MARK: - Section Screens

struct ConversationScreen: View {
    var connectionLine: String? = nil
    @StateObject private var driver = OrbAudioDriver()
    @AppStorage("orb_mic_sensitivity") private var orbMicSensitivity: Double = 0.62

    var body: some View {
        ZStack {
            themHex(0x0F0F12).ignoresSafeArea()

            VStack(spacing: 16) {
                Text("Conversation")
                    .font(.system(size: 34, weight: .semibold))
                    .foregroundStyle(.white)

                OrbView(driver: driver)
                    .padding(.vertical, 10)
                    .onAppear {
                        driver.setMicSensitivity(CGFloat(orbMicSensitivity))
                        driver.startMicrophoneMonitoring()
                    }
                    .onDisappear {
                        driver.stopMicrophoneMonitoring()
                    }
                    .onChange(of: orbMicSensitivity) { _, newValue in
                        driver.setMicSensitivity(CGFloat(newValue))
                    }

                Text("Hold to speak to THEM")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(.white.opacity(0.62))

                if let connectionLine {
                    Text(connectionLine)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.white.opacity(0.44))
                        .lineLimit(1)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Mic sensitivity")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.white.opacity(0.48))
                    Slider(value: $orbMicSensitivity, in: 0...1)
                        .tint(.white.opacity(0.78))
                }
                .frame(maxWidth: 220)
            }
            .padding(24)
        }
    }
}

struct InsightsPlaceholderScreen: View {
    var body: some View {
        placeholderScreen(
            title: "Insights",
            subtitle: "Patterns, not numbers."
        )
    }
}

struct VoiceSettingsPlaceholderScreen: View {
    var body: some View {
        placeholderScreen(
            title: "Voice",
            subtitle: "Tone, speed, presence."
        )
    }
}

struct ProfilePlaceholderScreen: View {
    var body: some View {
        placeholderScreen(
            title: "Profile",
            subtitle: "Minimal. Human."
        )
    }
}

struct RecapShellScreen: View {
    @State private var payload: BackendDailyRecapResponse?
    @State private var errorText: String = ""
    @State private var isLoading = false

    var body: some View {
        ZStack {
            themHex(0x0F0F12).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Recap")
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(.white)
                    Spacer()
                    Button("Refresh") {
                        Task { await reload() }
                    }
                }
                if isLoading {
                    ProgressView()
                        .controlSize(.large)
                        .tint(.white)
                } else if let payload {
                    Text("Today • \(payload.localDay)")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.white.opacity(0.60))
                    Text(payload.recap)
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.white.opacity(0.84))
                    if !payload.nextActions.isEmpty {
                        Text("Next Actions")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.88))
                        ForEach(Array(payload.nextActions.prefix(6).enumerated()), id: \.offset) { _, line in
                            Text("• \(line)")
                                .font(.system(size: 14, weight: .regular))
                                .foregroundStyle(.white.opacity(0.78))
                        }
                    }
                } else {
                    Text("No recap available yet.")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.white.opacity(0.62))
                }
                if !errorText.isEmpty {
                    Text(errorText)
                        .font(.system(size: 13, weight: .regular))
                        .foregroundStyle(.red.opacity(0.9))
                }
                Spacer()
            }
            .padding(.horizontal, 80)
            .padding(.top, 28)
        }
        .task {
            await reload()
        }
    }

    @MainActor
    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let result = try await BackendMemoryAPI.shared.fetchDailyRecap()
            payload = result.payload
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }
}

private func placeholderScreen(title: String, subtitle: String) -> some View {
    ZStack {
        themHex(0x0F0F12).ignoresSafeArea()
        VStack(spacing: 12) {
            Text(title)
                .font(.system(size: 34, weight: .semibold))
                .foregroundStyle(.white)
            Text(subtitle)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(.white.opacity(0.60))
        }
    }
}

private func themHex(_ hex: UInt, alpha: Double = 1.0) -> Color {
    Color(
        .sRGB,
        red: Double((hex >> 16) & 0xFF) / 255.0,
        green: Double((hex >> 8) & 0xFF) / 255.0,
        blue: Double(hex & 0xFF) / 255.0,
        opacity: alpha
    )
}

#Preview {
    AppShell()
        .frame(width: 1200, height: 800)
}
