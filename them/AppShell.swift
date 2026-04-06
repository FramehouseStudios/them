import SwiftUI
import Combine
#if os(iOS)
import UIKit
#endif

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
                openConversation: { selection = .conversation }
            )
        case .memories:
            MemoriesScreen(
                startTalkingAction: { selection = .conversation }
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
        VoiceSettingsScreen()
    }
}

struct VoiceSettingsScreen: View {
    var onDone: (() -> Void)? = nil

    @AppStorage("orb_mic_sensitivity") private var micSensitivity: Double = 0.62
    @AppStorage(ClementineVoiceSettings.endSilenceScaleKey) private var endSilenceScale: Double = 1.0
    @AppStorage(ClementineVoiceSettings.minSpeechSecondsKey) private var minSpeechSeconds: Double = 0.36
    @AppStorage(ClementineVoiceSettings.voiceSpeedKey) private var speakingPace: Double = 1.0
    @AppStorage("studio_auto_insert") private var autoInsert: Bool = true
    @AppStorage("show_live_script_preview") private var showScriptPreview: Bool = true

    @StateObject private var evolution = HerEvolutionStore.shared
    @StateObject private var liveDraftBridge = ScreenplayLiveDraftBridge.shared

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    themHex(0x090A0D),
                    themHex(0x12141A),
                    themHex(0x19161A),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    Color(red: 0.98, green: 0.72, blue: 0.65).opacity(0.18),
                    Color.clear,
                ],
                center: .topTrailing,
                startRadius: 20,
                endRadius: 420
            )
            .ignoresSafeArea()

            RadialGradient(
                colors: [
                    Color.white.opacity(0.10),
                    Color.clear,
                ],
                center: .topLeading,
                startRadius: 10,
                endRadius: 360
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .top, spacing: 16) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Voice & Studio")
                                    .font(.system(size: 28, weight: .semibold))
                                    .foregroundStyle(.white)
                                Text("How Clementine listens, responds, and tracks your arc together.")
                                    .font(.system(size: 13, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.48))
                            }

                            Spacer(minLength: 12)

                            if let onDone {
                                Button("Done") {
                                    onDone()
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(.white.opacity(0.22))
                                .foregroundColor(.white.opacity(0.92))
                            }
                        }

                        HStack(spacing: 10) {
                            settingsHeaderChip(
                                label: "Relationship-aware",
                                systemImage: "heart.text.square.fill"
                            )
                            settingsHeaderChip(
                                label: evolution.isScreenwriter ? "Writer mode remembered" : "Creative context ready",
                                systemImage: evolution.isScreenwriter ? "film.fill" : "sparkles"
                            )
                            settingsHeaderChip(
                                label: "Live controls",
                                systemImage: "slider.horizontal.3"
                            )
                        }
                    }
                    .padding(22)
                    .background(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(Color.white.opacity(0.07))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.white.opacity(0.12), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.18), radius: 24, x: 0, y: 16)
                    .padding(.horizontal, 48)
                    .padding(.top, 32)
                    .padding(.bottom, 24)

                    settingsSection("Listening") {
                        settingRow(
                            title: "Mic sensitivity",
                            subtitle: "How easily the orb reacts to your mic input. Raise it if she seems hard to wake up; lower it in noisy rooms.",
                            value: micSensitivity,
                            range: 0.1...1.0,
                            step: 0.05,
                            displayValue: String(format: "%.0f%%", micSensitivity * 100)
                        ) { micSensitivity = $0 }

                        settingRow(
                            title: "Silence threshold",
                            subtitle: "How patient turn-end detection should be after you stop talking.",
                            value: endSilenceScale,
                            range: 0.5...2.0,
                            step: 0.1,
                            displayValue: endSilenceLabel(endSilenceScale)
                        ) { endSilenceScale = $0 }

                        settingRow(
                            title: "Minimum speech length",
                            subtitle: "Captures shorter than this are ignored to filter accidental sounds and clipped starts.",
                            value: minSpeechSeconds,
                            range: 0.15...1.2,
                            step: 0.05,
                            displayValue: String(format: "%.2fs", minSpeechSeconds)
                        ) { minSpeechSeconds = $0 }
                    }

                    settingsSection("Playback") {
                        settingRow(
                            title: "Speaking pace",
                            subtitle: "Guides Clementine's delivery on the next response. Slower adds more space; faster keeps the cadence tighter.",
                            value: speakingPace,
                            range: 0.7...1.5,
                            step: 0.05,
                            displayValue: speakingPaceLabel(speakingPace)
                        ) { speakingPace = $0 }
                    }

                    settingsSection("Studio") {
                        toggleRow(
                            title: "Auto-insert voice turns",
                            subtitle: "Automatically place screenplay voice output into the draft at the cursor.",
                            isOn: $autoInsert
                        )
                        toggleRow(
                            title: "Show live script preview",
                            subtitle: "Display the home-surface live preview when Clementine is actively writing into Studio.",
                            isOn: $showScriptPreview
                        )
                    }

                    settingsSection("Relationship") {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(spacing: 12) {
                                stagePill(evolution.stage)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Relationship stage \(evolution.stage) of 5")
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundStyle(.white.opacity(0.82))
                                    Text(stageDescription(evolution.stage))
                                        .font(.system(size: 11, weight: .regular))
                                        .foregroundStyle(.white.opacity(0.46))
                                }
                                Spacer()
                            }

                            HStack(spacing: 8) {
                                Image(systemName: evolution.isScreenwriter ? "film" : "film.stack")
                                    .font(.system(size: 11))
                                    .foregroundStyle(.white.opacity(0.45))
                                Text(
                                    evolution.isScreenwriter
                                        ? "Clementine knows you're a screenwriter"
                                        : "Screenwriter identity not established yet"
                                )
                                .font(.system(size: 11, weight: .regular))
                                .foregroundStyle(.white.opacity(0.45))
                            }

                            HStack(spacing: 16) {
                                miniStat(label: "Sessions", value: "\(evolution.sessionCount)")
                                miniStat(label: "Messages", value: "\(evolution.messageCount)")
                                miniStat(label: "Depth", value: String(format: "%.1f", evolution.depthScore))
                                miniStat(label: "Tension", value: String(format: "%.1f", evolution.romanceTension))
                            }
                            .padding(.top, 4)
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 14)
                    }

                    Spacer().frame(height: 40)
                }
            }
        }
        .onAppear {
            liveDraftBridge.autoInsertEnabled = autoInsert
        }
        .onChange(of: autoInsert) { _, newValue in
            liveDraftBridge.autoInsertEnabled = newValue
        }
    }

    private func settingsSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.30))
                .kerning(1.2)
                .padding(.horizontal, 48)
                .padding(.bottom, 10)

            VStack(spacing: 1) {
                content()
            }
            .background(Color.white.opacity(0.07))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.14), radius: 18, x: 0, y: 10)
            .padding(.horizontal, 32)
        }
        .padding(.bottom, 28)
    }

    private func settingRow(
        title: String,
        subtitle: String,
        value: Double,
        range: ClosedRange<Double>,
        step: Double,
        displayValue: String,
        onChange: @escaping (Double) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.88))
                    Text(subtitle)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.white.opacity(0.38))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 16)
                Text(displayValue)
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.60))
                    .frame(minWidth: 64, alignment: .trailing)
            }

            Slider(value: Binding(get: { value }, set: onChange), in: range, step: step)
                .tint(Color(red: 0.98, green: 0.72, blue: 0.65).opacity(0.70))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.015))
    }

    private func toggleRow(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.88))
                Text(subtitle)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.white.opacity(0.38))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Toggle("", isOn: isOn)
                .toggleStyle(.switch)
                .tint(Color(red: 0.98, green: 0.72, blue: 0.65).opacity(0.80))
                .labelsHidden()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.015))
    }

    private func stagePill(_ stage: Int) -> some View {
        Text("\(stage)")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white.opacity(0.90))
            .frame(width: 34, height: 34)
            .background(
                LinearGradient(
                    colors: [
                        Color(red: 0.98, green: 0.72, blue: 0.65).opacity(0.36),
                        Color(red: 0.90, green: 0.53, blue: 0.48).opacity(0.20),
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(Circle())
            .overlay(
                Circle()
                    .stroke(Color(red: 0.98, green: 0.72, blue: 0.65).opacity(0.35), lineWidth: 1)
            )
    }

    private func miniStat(label: String, value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white.opacity(0.80))
            Text(label)
                .font(.system(size: 9, weight: .regular))
                .foregroundStyle(.white.opacity(0.32))
                .textCase(.uppercase)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(
            LinearGradient(
                colors: [
                    Color.white.opacity(0.08),
                    Color.white.opacity(0.04),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private func stageDescription(_ stage: Int) -> String {
        switch stage {
        case 1: return "Just meeting. Keep it warm."
        case 2: return "Pattern-aware. Gentle personal tone."
        case 3: return "Emotionally precise. Going deeper."
        case 4: return "Challenging patterns with care."
        default: return "Intimate. Mature. Restrained."
        }
    }

    private func endSilenceLabel(_ value: Double) -> String {
        if value < 0.85 { return "Snappy" }
        if value < 1.15 { return "Normal" }
        if value < 1.55 { return "Patient" }
        return "Very patient"
    }

    private func speakingPaceLabel(_ value: Double) -> String {
        if value < 0.85 { return "Slower" }
        if value < 1.08 { return "Natural" }
        if value < 1.28 { return "Brisk" }
        return "Fast"
    }

    private func settingsHeaderChip(label: String, systemImage: String) -> some View {
        Label(label, systemImage: systemImage)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.white.opacity(0.78))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.white.opacity(0.08))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
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
