import SwiftUI
import Combine
import AuthenticationServices
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
        guard !IOThemRuntime.isRunningTests else { return }
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
                    Text("io.them")
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
        .navigationTitle("io.them")
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
                dismissAction: { selection = .conversation },
                startTalkingAction: { selection = .conversation }
            )
        case .recap:
            RecapShellScreen()
        case .insights:
            InsightsPlaceholderScreen()
        case .voice:
            VoiceSettingsPlaceholderScreen()
        case .profile:
            ProfileAccountScreen(onSessionChanged: {
                ScreenplayLiveDraftBridge.shared.reconcileAccountStorage()
                Task { await backendBridge.refresh(force: true) }
            })
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

                Text("Hold to speak to io.them")
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

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @AppStorage("orb_mic_sensitivity") private var micSensitivity: Double = 0.62
    @AppStorage(ClementineVoiceSettings.endSilenceScaleKey) private var endSilenceScale: Double = 1.0
    @AppStorage(ClementineVoiceSettings.minSpeechSecondsKey) private var minSpeechSeconds: Double = 0.36
    @AppStorage(ClementineVoiceSettings.voiceSpeedKey) private var speakingPace: Double = 1.0
    @AppStorage("studio_auto_insert") private var autoInsert: Bool = true
    @AppStorage("show_live_script_preview") private var showScriptPreview: Bool = true
    @AppStorage(ClementineRealtimeSupplierMode.storageKey)
    private var realtimeSupplierModeRaw: String = ClementineRealtimeSupplierMode.serverDefault.rawValue

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
                    settingsHeader
                    .padding(isCompactWidth ? 18 : 22)
                    .background(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .fill(Color.white.opacity(0.07))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .stroke(Color.white.opacity(0.12), lineWidth: 1)
                    )
                    .shadow(color: .black.opacity(0.18), radius: 24, x: 0, y: 16)
                    .padding(.horizontal, pageHorizontalPadding)
                    .padding(.top, isCompactWidth ? 16 : 32)
                    .padding(.bottom, 24)

                    settingsSection("Listening") {
                        settingRow(
                            identifier: "voice-settings.mic-sensitivity",
                            title: "Mic sensitivity",
                            subtitle: "How easily the orb reacts to your mic input. Raise it if Clementine seems hard to wake; lower it in noisy rooms.",
                            value: micSensitivity,
                            range: 0.1...1.0,
                            step: 0.05,
                            displayValue: String(format: "%.0f%%", micSensitivity * 100)
                        ) { micSensitivity = $0 }

                        settingRow(
                            identifier: "voice-settings.silence-threshold",
                            title: "Silence threshold",
                            subtitle: "How patient turn-end detection should be after you stop talking.",
                            value: endSilenceScale,
                            range: 0.5...2.0,
                            step: 0.1,
                            displayValue: endSilenceLabel(endSilenceScale)
                        ) { endSilenceScale = $0 }

                        settingRow(
                            identifier: "voice-settings.minimum-speech-length",
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
                            identifier: "voice-settings.speaking-pace",
                            title: "Speaking pace",
                            subtitle: "Guides Clementine's delivery on the next response. Slower adds more space; faster keeps the cadence tighter.",
                            value: speakingPace,
                            range: 0.7...1.5,
                            step: 0.05,
                            displayValue: speakingPaceLabel(speakingPace)
                        ) { speakingPace = $0 }
                    }

                    settingsSection("Companion TTS") {
                        CompanionTtsVoiceSettingsSection()
                    }

                    settingsSection("Clementine packs") {
                        ClementinePackStoreSettingsSection()
                    }

                    settingsSection("Realtime") {
                        realtimeSupplierPicker
                    }

                    settingsSection("Studio") {
                        toggleRow(
                            identifier: "voice-settings.auto-insert",
                            title: "Auto-insert voice turns",
                            subtitle: "Automatically place screenplay voice output into the draft at the cursor.",
                            isOn: $autoInsert
                        )
                        toggleRow(
                            identifier: "voice-settings.live-script-preview",
                            title: "Show live script preview",
                            subtitle: "Display the home-surface live preview while Clementine is writing into Studio.",
                            isOn: $showScriptPreview
                        )
                    }

                    settingsSection("Print") {
                        printSettingsSection
                    }

                    settingsSection("Relationship") {
                        relationshipSummary
                    }

                    Spacer().frame(height: 40)
                }
                .frame(maxWidth: 820)
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("voice-settings.screen")
        .onAppear {
            liveDraftBridge.autoInsertEnabled = autoInsert
        }
        .onChange(of: autoInsert) { _, newValue in
            liveDraftBridge.autoInsertEnabled = newValue
        }
    }

    private var settingsHeader: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 12) {
                Label(VoiceSettingsPresentation.companionName, systemImage: "waveform.circle.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.74))
                    .lineLimit(1)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("voice-settings.companion-name")
                    .accessibilityLabel(VoiceSettingsPresentation.companionName)

                Spacer(minLength: 8)

                if let onDone {
                    Button("Done") {
                        onDone()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.white.opacity(0.22))
                    .foregroundColor(.white.opacity(0.92))
                    .frame(minWidth: 64, minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("voice-settings.done")
                    .accessibilityHint("Returns to Clementine without starting a conversation.")
                }
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(VoiceSettingsPresentation.title)
                    .font(.system(size: isCompactWidth ? 28 : 30, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)

                Text(VoiceSettingsPresentation.subtitle)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundStyle(.white.opacity(0.58))
                    .fixedSize(horizontal: false, vertical: true)
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    ForEach(VoiceSettingsPresentation.headerSignals(isScreenwriter: evolution.isScreenwriter)) { signal in
                        settingsHeaderChip(signal)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    ForEach(VoiceSettingsPresentation.headerSignals(isScreenwriter: evolution.isScreenwriter)) { signal in
                        settingsHeaderChip(signal)
                    }
                }
            }
        }
    }

    private var relationshipSummary: some View {
        VStack(alignment: .leading, spacing: 14) {
            if isCompactWidth {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        stagePill(evolution.stage)
                        Text(VoiceSettingsPresentation.relationshipStageTitle(evolution.stage))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.86))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Text(VoiceSettingsPresentation.stageDescription(evolution.stage))
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.white.opacity(0.52))
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                HStack(spacing: 12) {
                    stagePill(evolution.stage)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(VoiceSettingsPresentation.relationshipStageTitle(evolution.stage))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white.opacity(0.82))
                        Text(VoiceSettingsPresentation.stageDescription(evolution.stage))
                            .font(.system(size: 11, weight: .regular))
                            .foregroundStyle(.white.opacity(0.46))
                    }
                    Spacer()
                }
            }

            Label(
                VoiceSettingsPresentation.screenwriterIdentity(isScreenwriter: evolution.isScreenwriter),
                systemImage: evolution.isScreenwriter ? "film" : "film.stack"
            )
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(.white.opacity(0.52))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("voice-settings.relationship-identity")

            LazyVGrid(
                columns: Array(
                    repeating: GridItem(.flexible(), spacing: 10),
                    count: isCompactWidth ? 2 : 4
                ),
                spacing: 10
            ) {
                ForEach(
                    VoiceSettingsPresentation.relationshipMetrics(
                        sessionCount: evolution.sessionCount,
                        messageCount: evolution.messageCount,
                        depthScore: evolution.depthScore,
                        romanceTension: evolution.romanceTension
                    )
                ) { metric in
                    miniStat(metric)
                }
            }
        }
        .padding(.horizontal, rowHorizontalPadding)
        .padding(.vertical, 16)
    }

    private var realtimeSupplierPicker: some View {
        let selected = ClementineRealtimeSupplierMode.normalized(rawValue: realtimeSupplierModeRaw)
        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Realtime supplier")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.88))
                Text(selected.subtitle)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.white.opacity(0.48))
                    .fixedSize(horizontal: false, vertical: true)
            }

            if isCompactWidth {
                VStack(spacing: 8) {
                    ForEach(ClementineRealtimeSupplierMode.allCases) { mode in
                        Button {
                            realtimeSupplierModeRaw = mode.rawValue
                        } label: {
                            HStack(spacing: 10) {
                                Text(mode.title)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(.white.opacity(0.90))
                                    .lineLimit(1)
                                Spacer(minLength: 8)
                                Image(systemName: selected == mode ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 17, weight: .medium))
                                    .foregroundStyle(
                                        selected == mode
                                            ? Color(red: 0.98, green: 0.72, blue: 0.65)
                                            : Color.white.opacity(0.32)
                                    )
                            }
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Color.white.opacity(selected == mode ? 0.10 : 0.04))
                            .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("voice-settings.realtime-supplier.\(mode.rawValue)")
                        .accessibilityLabel(mode.title)
                        .accessibilityHint(mode.subtitle)
                        .accessibilityAddTraits(selected == mode ? .isSelected : [])
                    }
                }
            } else {
                Picker("Realtime supplier", selection: $realtimeSupplierModeRaw) {
                    ForEach(ClementineRealtimeSupplierMode.allCases) { mode in
                        Text(mode.title).tag(mode.rawValue)
                    }
                }
                .pickerStyle(.segmented)
                .frame(minHeight: 44)
                .accessibilityIdentifier("voice-settings.realtime-supplier")
            }
        }
        .padding(.horizontal, rowHorizontalPadding)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.015))
    }

    private func settingsSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.30))
                .kerning(1.2)
                .padding(.horizontal, pageHorizontalPadding)
                .padding(.bottom, 10)
                .accessibilityIdentifier("voice-settings.section.\(title.lowercased())")

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
            .padding(.horizontal, sectionHorizontalPadding)
        }
        .padding(.bottom, isCompactWidth ? 22 : 28)
    }

    private func settingRow(
        identifier: String,
        title: String,
        subtitle: String,
        value: Double,
        range: ClosedRange<Double>,
        step: Double,
        displayValue: String,
        onChange: @escaping (Double) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if isCompactWidth {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.90))
                            .fixedSize(horizontal: false, vertical: true)

                        Spacer(minLength: 8)

                        valuePill(displayValue)
                    }

                    Text(subtitle)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.white.opacity(0.48))
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                HStack(alignment: .top, spacing: 16) {
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
                    valuePill(displayValue)
                }
            }

            Slider(value: Binding(get: { value }, set: onChange), in: range, step: step)
                .tint(Color(red: 0.98, green: 0.72, blue: 0.65).opacity(0.70))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityIdentifier(identifier)
                .accessibilityLabel(title)
                .accessibilityHint(subtitle)
                .accessibilityValue(displayValue)
        }
        .padding(.horizontal, rowHorizontalPadding)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.015))
    }

    private func valuePill(_ displayValue: String) -> some View {
        Text(displayValue)
            .font(.system(size: 12, weight: .semibold, design: .monospaced))
            .foregroundStyle(.white.opacity(0.72))
            .lineLimit(1)
            .padding(.horizontal, 9)
            .frame(minHeight: 28)
            .background(Color.white.opacity(0.07))
            .clipShape(Capsule())
    }

    private func toggleRow(
        identifier: String,
        title: String,
        subtitle: String,
        isOn: Binding<Bool>
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 12) {
                Text(title)
                    .font(.system(size: isCompactWidth ? 14 : 13, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.90))
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 8)

                Toggle(title, isOn: isOn)
                    .toggleStyle(.switch)
                    .tint(Color(red: 0.98, green: 0.72, blue: 0.65).opacity(0.80))
                    .labelsHidden()
                    .frame(minWidth: 51, minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier(identifier)
                    .accessibilityLabel(title)
                    .accessibilityHint(subtitle)
            }

            Text(subtitle)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.white.opacity(0.48))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, rowHorizontalPadding)
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

    // Same key as ScreenplayPrintFeature.enabledKey; @AppStorage needs a literal.
    @AppStorage("io.them.printEnabled") private var printingEnabled = false

    private var printSettingsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Printing")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.88))
                    Text("Voice and Siri printing. Off by default in release builds; turn on for this device.")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.white.opacity(0.38))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Toggle("Printing", isOn: $printingEnabled)
                    .labelsHidden()
                    .tint(.white.opacity(0.35))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            Divider().overlay(Color.white.opacity(0.07))
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Paper size")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.88))
                    Text("Letter in US, A4 elsewhere — auto by device region. Override here, never at print time.")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.white.opacity(0.38))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Picker("", selection: Binding(
                    get: { ScreenplayPrintMemory.paperOverride },
                    set: { ScreenplayPrintMemory.paperOverride = $0 }
                )) {
                    ForEach(ScreenplayPrintPaper.allCases, id: \.rawValue) { p in
                        Text(p == .system ? "Auto" : p == .letter ? "Letter" : "A4").tag(p)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 200)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            Divider().overlay(Color.white.opacity(0.07))
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Printer")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white.opacity(0.88))
                    Text(ScreenplayPrintMemory.rememberedPrinterName.map { "Remembered: \($0)" } ?? "No printer remembered — you'll pick one on first print. After that, \"print the script\" goes straight to paper.")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.white.opacity(0.38))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                if ScreenplayPrintMemory.rememberedPrinterURL != nil {
                    Button("Forget") { ScreenplayPrintMemory.forgetPrinter() }
                        .buttonStyle(.bordered)
                        .tint(.white.opacity(0.18))
                        .font(.system(size: 12, weight: .medium))
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(Color.white.opacity(0.015))
            Divider().overlay(Color.white.opacity(0.07))
            HStack(spacing: 8) {
                Image(systemName: "printer.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.45))
                Text("Say \"print the script\" or \"print somewhere else\" to choose another printer. Works from Siri and Shortcuts too.")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.white.opacity(0.45))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            #if DEBUG
            HStack(spacing: 8) {
                Image(systemName: "doc.richtext")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.30))
                Text("Debug: \(ScreenplayPrintMemory.effectivePaper == .a4 ? "A4" : "Letter") · \(ScreenplayPrintMemory.rememberedPrinterName ?? "no printer")")
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.30))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            #endif
        }
        .background(Color.white.opacity(0.015))
    }

    private func miniStat(_ metric: VoiceSettingsRelationshipMetric) -> some View {
        VStack(spacing: 2) {
            Text(metric.value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white.opacity(0.80))
                .lineLimit(1)
            Text(metric.label)
                .font(.system(size: 9, weight: .regular))
                .foregroundStyle(.white.opacity(0.32))
                .textCase(.uppercase)
                .lineLimit(1)
                .minimumScaleFactor(0.82)
        }
        .frame(maxWidth: .infinity, minHeight: 54)
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
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("voice-settings.metric.\(metric.id)")
        .accessibilityLabel("\(metric.label): \(metric.value)")
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

    private func settingsHeaderChip(_ signal: VoiceSettingsHeaderSignal) -> some View {
        Label(signal.title, systemImage: signal.systemImage)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(.white.opacity(0.78))
            .lineLimit(1)
            .minimumScaleFactor(0.82)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.white.opacity(0.08))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
            .accessibilityIdentifier("voice-settings.header-chip.\(signal.id)")
    }

    private var isCompactWidth: Bool {
        horizontalSizeClass == .compact
    }

    private var pageHorizontalPadding: CGFloat {
        isCompactWidth ? 16 : 48
    }

    private var sectionHorizontalPadding: CGFloat {
        isCompactWidth ? 16 : 32
    }

    private var rowHorizontalPadding: CGFloat {
        isCompactWidth ? 16 : 20
    }
}

private enum ProfileAuthMode: String, CaseIterable, Identifiable {
    case signIn = "Sign In"
    case signUp = "Create Account"

    var id: String { rawValue }

    var actionTitle: String {
        switch self {
        case .signIn: return "Sign In"
        case .signUp: return "Create Account"
        }
    }
}

nonisolated enum ProfileAppleSignInErrorPolicy {
    static func userMessage(for backendDescription: String) -> String? {
        if backendDescription.contains("apple_sign_in_not_configured")
            || backendDescription.contains("user_auth_not_configured") {
            return "Apple sign in is not configured on this backend yet."
        }
        if backendDescription.contains("invalid_apple_identity_token") {
            return "Apple sign in returned an invalid identity token. Please try again."
        }
        if backendDescription.contains("apple_nonce_required")
            || backendDescription.contains("invalid_apple_nonce") {
            return "Apple sign in could not complete its security check. Please try again."
        }
        if backendDescription.contains("apple_jwks_unavailable") {
            return "Apple sign in is temporarily unavailable while Apple’s verification service reconnects. Please try again."
        }
        if backendDescription.contains("apple_email_required")
            || backendDescription.contains("email_required") {
            return "Apple did not provide a verified email for this new identity. Use email sign-in for that account, or retry Apple only if Apple can share the email."
        }
        if backendDescription.contains("apple_subject_taken") {
            return "This email is already linked to a different Apple identity. Use the original Apple account or sign in with email."
        }
        if backendDescription.contains("email_taken") {
            return "This Apple identity conflicts with an email that is already attached to another account."
        }
        return nil
    }
}

struct ProfileAccountScreen: View {
    let onSessionChanged: () -> Void

    private static let rememberedLoginUnavailableMessage =
        "Remembered login is waiting for Apple Keychain to become available."

    @AppStorage("auth_signed_in") private var authSignedIn: Bool = false
    @AppStorage("auth_user_email") private var authUserEmail: String = ""
    @AppStorage("auth_user_verified") private var authUserVerified: Bool = false

    @State private var authMode: ProfileAuthMode = .signIn
    // Hydrated from Keychain-backed storage in `.task`. Avoid synchronously
    // entering the auth queue while SwiftUI is constructing the view tree.
    @State private var sessionState: BackendAuthSessionState = .signedOut
    @State private var email: String = ""
    @State private var password: String = ""
    @State private var confirmPassword: String = ""
    @State private var resetEmail: String = ""
    @State private var resetToken: String = ""
    @State private var newPassword: String = ""
    @State private var verifyToken: String = ""
    @State private var debugPasswordResetToken: String = ""
    @State private var debugEmailVerificationToken: String = ""
    @State private var rememberMe = false
    @State private var savePassword = false
    @State private var statusMessage: String = ""
    @State private var errorMessage: String = ""
    @State private var isWorking = false
    @State private var isLoadingSessions = false
    @State private var isAppleSigningIn = false
    @State private var appleSignInRawNonce: String?
    @State private var appleAuthSessionGeneration: Int?
    @State private var managedSessions: [BackendAuthManagedSession] = []

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    themHex(0x08090C),
                    themHex(0x11131A),
                    themHex(0x17151A),
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
                startRadius: 10,
                endRadius: 420
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(sessionState.isAuthenticated ? "Account" : "Profile")
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(.white)
                        Text(
                            sessionState.isAuthenticated
                                ? (sessionState.emailVerified ? "You’re signed in and the live backend is running on your account." : "You’re signed in. Verify your email to finish account setup.")
                                : "Sign in to keep your projects, preferences, and writing sessions connected."
                        )
                        .font(.system(size: 14, weight: .regular))
                        .foregroundStyle(.white.opacity(0.62))

                        if !statusMessage.isEmpty {
                            feedbackPill(text: statusMessage, tint: Color.green.opacity(0.20))
                        }
                        if !errorMessage.isEmpty {
                            feedbackPill(text: errorMessage, tint: Color.red.opacity(0.18))
                        }
                    }
                    .padding(.horizontal, 48)
                    .padding(.top, 32)

                    accountCard(
                        title: "Account Status",
                        subtitle: sessionState.isAuthenticated ? "Your account is connected." : "You can explore in guest mode, then sign in when you’re ready to protect and sync your work."
                    ) {
                        HStack(spacing: 10) {
                            statusChip(sessionState.isAuthenticated ? "Signed In" : "Signed Out")
                            statusChip(sessionState.emailVerified ? "Verified" : (sessionState.pendingEmailVerification ? "Verify Email" : "Unverified"))
                            if let authProviderStatusLabel {
                                statusChip(authProviderStatusLabel)
                            }
                            if sessionState.refreshTokenPresent {
                                statusChip("Refresh Ready")
                            }
                        }

                        VStack(alignment: .leading, spacing: 12) {
                            metricRow(label: "Email", value: sessionState.email.isEmpty ? "Not signed in" : sessionState.email)
                            metricRow(label: "Profile", value: sessionState.isAuthenticated ? "Connected" : "Guest")
                            metricRow(label: "Session", value: sessionState.isAuthenticated ? "Active" : "Starts after sign-in")
                            metricRow(label: "Workspace", value: "Personal")
                        }
                    }

                    if sessionState.isAuthenticated {
                        accountCard(
                            title: "Account Actions",
                            subtitle: "Refresh tokens, resend verification, and sign out cleanly."
                        ) {
                            HStack(spacing: 12) {
                                primaryActionButton(title: isWorking ? "Working…" : "Refresh Session", disabled: isWorking) {
                                    Task { await refreshSession() }
                                }
                                secondaryActionButton(title: isWorking ? "Working…" : "Sign Out", disabled: isWorking) {
                                    Task { await signOut() }
                                }
                            }

                            if !sessionState.emailVerified {
                                Divider().overlay(Color.white.opacity(0.10))
                                    .padding(.vertical, 2)

                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Email Verification")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(.white.opacity(0.90))
                                    Text("Request a verification link. In local debug mode, the token appears below so you can finish the flow inside the app.")
                                        .font(.system(size: 12, weight: .regular))
                                        .foregroundStyle(.white.opacity(0.54))

                                    HStack(spacing: 12) {
                                        secondaryActionButton(title: isWorking ? "Working…" : "Send Verification", disabled: isWorking) {
                                            Task { await requestVerification() }
                                        }
                                        if managedSessions.count > 1 {
                                            secondaryActionButton(title: isWorking ? "Working…" : "Sign Out Other Sessions", disabled: isWorking) {
                                                Task { await revokeOtherSessions() }
                                            }
                                        }
                                    }

                                    if !debugEmailVerificationToken.isEmpty {
                                        tokenBlock(title: "Debug verification token", token: debugEmailVerificationToken)
                                    }

                                    accountField(title: "Verification token", prompt: "Paste emailed or debug token", text: $verifyToken)

                                    primaryActionButton(title: isWorking ? "Working…" : "Verify Email", disabled: isWorking) {
                                        Task { await verifyEmail() }
                                    }
                                }
                            } else if managedSessions.count > 1 {
                                Divider().overlay(Color.white.opacity(0.10))
                                    .padding(.vertical, 2)

                                secondaryActionButton(title: isWorking ? "Working…" : "Sign Out Other Sessions", disabled: isWorking) {
                                    Task { await revokeOtherSessions() }
                                }
                            }
                        }
                    } else {
                        accountCard(
                            title: authMode == .signIn ? "Sign In" : "Create Account",
                            subtitle: "Use email auth or continue with Apple directly from the live app shell."
                        ) {
                            Picker("Auth Mode", selection: $authMode) {
                                ForEach(ProfileAuthMode.allCases) { mode in
                                    Text(mode.rawValue).tag(mode)
                                }
                            }
                            .pickerStyle(.segmented)

                            accountField(
                                title: "Email",
                                prompt: "you@example.com",
                                text: $email,
                                identifier: "profile-auth-email"
                            )
                            accountField(
                                title: "Password",
                                prompt: "Enter password",
                                text: $password,
                                secure: true,
                                identifier: "profile-auth-password"
                            )

                            if authMode == .signUp {
                                accountField(title: "Confirm Password", prompt: "Repeat password", text: $confirmPassword, secure: true)
                            }

                            VStack(alignment: .leading, spacing: 10) {
                                Toggle("Remember me", isOn: rememberMeBinding)
                                    .accessibilityIdentifier("profile-auth-remember-me")
                                Toggle("Save password in Apple Keychain", isOn: savePasswordBinding)
                                    .accessibilityIdentifier("profile-auth-save-password")

                                Text("Signed-in sessions already restore securely on this device. Saving the password is optional and keeps it in Apple Keychain, never app preferences.")
                                    .font(.system(size: 11, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.44))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white.opacity(0.82))
                            .tint(Color.white.opacity(0.72))

                            primaryActionButton(title: isWorking ? "Working…" : authMode.actionTitle, disabled: authInteractionDisabled) {
                                Task {
                                    if authMode == .signIn {
                                        await signIn()
                                    } else {
                                        await signUp()
                                    }
                                }
                            }

#if DEBUG
                            if let demoAccount = BackendAuthClient.localDemoAccount() {
                                Divider().overlay(Color.white.opacity(0.10))
                                    .padding(.vertical, 2)

                                VStack(alignment: .leading, spacing: 12) {
                                    Text("Local Demo Account")
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(.white.opacity(0.90))
                                    Text("Debug builds on a local backend only. This uses normal email signup and login; it is not an Apple ID or a production backdoor.")
                                        .font(.system(size: 12, weight: .regular))
                                        .foregroundStyle(.white.opacity(0.54))

                                    tokenBlock(title: "Demo email", token: demoAccount.email)
                                    tokenBlock(title: "Demo password", token: demoAccount.password)

                                    secondaryActionButton(title: isWorking ? "Working…" : "Create or Sign In Demo", disabled: authInteractionDisabled) {
                                        Task { await useLocalDemoAccount(demoAccount) }
                                    }
                                    .accessibilityIdentifier("profile-auth-use-local-demo")

                                    Text("The Remember me choices above apply to this account too.")
                                        .font(.system(size: 11, weight: .regular))
                                        .foregroundStyle(.white.opacity(0.42))
                                }
                            }
#endif

                            Divider().overlay(Color.white.opacity(0.10))
                                .padding(.vertical, 2)

                            VStack(alignment: .leading, spacing: 12) {
                                Text("Sign in with Apple")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(.white.opacity(0.90))
                                Text("Uses an Apple-issued identity token and creates the backend account automatically on first sign in. Apple never gives this app your Apple ID password.")
                                    .font(.system(size: 12, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.54))

                                SignInWithAppleButton(.signIn, onRequest: configureAppleIDRequest, onCompletion: handleAppleAuthorizationResult)
                                    .signInWithAppleButtonStyle(.white)
                                    .frame(maxWidth: 360)
                                    .frame(height: 46)
                                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                                    .disabled(authInteractionDisabled)

                                if isAppleSigningIn {
                                    HStack(spacing: 10) {
                                        ProgressView()
                                            .controlSize(.regular)
                                            .tint(.white)
                                        Text("Waiting for Apple authorization…")
                                            .font(.system(size: 12, weight: .regular))
                                            .foregroundStyle(.white.opacity(0.58))
                                    }
                                }

                                Text("The local demo email/password cannot be used in the Apple button. A new Apple identity needs a verified email from Apple; if Apple does not share one, use email sign-in for that account.")
                                    .font(.system(size: 11, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.42))
                            }
                        }
                    }

                    accountCard(
                        title: "Password Reset",
                        subtitle: "Request a reset email and finish the token flow here. In local debug mode, the reset token appears inline."
                    ) {
                        accountField(title: "Reset Email", prompt: "you@example.com", text: $resetEmail)

                        secondaryActionButton(title: isWorking ? "Working…" : "Request Reset", disabled: isWorking) {
                            Task { await requestPasswordReset() }
                        }

                        if !debugPasswordResetToken.isEmpty {
                            tokenBlock(title: "Debug reset token", token: debugPasswordResetToken)
                        }

                        accountField(title: "Reset Token", prompt: "Paste emailed or debug token", text: $resetToken)
                        accountField(title: "New Password", prompt: "Choose a new password", text: $newPassword, secure: true)

                        primaryActionButton(title: isWorking ? "Working…" : "Update Password", disabled: isWorking) {
                            Task { await resetPassword() }
                        }
                    }

                    if sessionState.isAuthenticated {
                        accountCard(
                            title: "Current Sessions",
                            subtitle: "These are the active backend auth sessions for your account."
                        ) {
                            HStack(spacing: 12) {
                                secondaryActionButton(title: isLoadingSessions ? "Loading…" : "Refresh Sessions", disabled: isLoadingSessions || isWorking) {
                                    Task { await reloadManagedSessions() }
                                }
                            }

                            if isLoadingSessions {
                                ProgressView()
                                    .controlSize(.large)
                                    .tint(.white)
                            } else if managedSessions.isEmpty {
                                Text("Only this device is signed in right now.")
                                    .font(.system(size: 13, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.56))
                            } else {
                                VStack(spacing: 10) {
                                    ForEach(managedSessions.prefix(6)) { session in
                                        VStack(alignment: .leading, spacing: 8) {
                                            HStack(alignment: .firstTextBaseline, spacing: 10) {
                                                Text(sessionTitle(session))
                                                    .font(.system(size: 14, weight: .semibold))
                                                    .foregroundStyle(.white.opacity(0.92))
                                                Spacer(minLength: 12)
                                                statusChip(session.state.capitalized)
                                                if session.sessionId == sessionState.currentSessionId {
                                                    statusChip("Current")
                                                }
                                            }
                                            Text(sessionDetailLine(session))
                                                .font(.system(size: 12, weight: .regular))
                                                .foregroundStyle(.white.opacity(0.54))
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(14)
                                        .background(
                                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                .fill(Color.white.opacity(session.sessionId == sessionState.currentSessionId ? 0.12 : 0.07))
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                                .stroke(Color.white.opacity(0.10), lineWidth: 1)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .task {
            restoreRememberedLoginCredentials()
            await reloadScreen(forceRefresh: false, reloadSessions: true)
        }
        .onChange(of: authSignedIn) { _, _ in
            syncFromStorage()
        }
        .onChange(of: authUserEmail) { _, _ in
            syncFromStorage()
        }
        .onChange(of: authUserVerified) { _, _ in
            syncFromStorage()
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .themRememberedLoginKeychainAvailable)
        ) { _ in
            restoreRememberedLoginCredentials()
        }
    }

    private var authProviderStatusLabel: String? {
        let provider = (sessionState.user?.authProvider ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard !provider.isEmpty else { return nil }
        return provider == "apple" ? "Apple Linked" : nil
    }

    private var authInteractionDisabled: Bool {
        isWorking || isAppleSigningIn
    }

    private var rememberMeBinding: Binding<Bool> {
        Binding(
            get: { rememberMe },
            set: { updateRememberMe($0) }
        )
    }

    private var savePasswordBinding: Binding<Bool> {
        Binding(
            get: { savePassword },
            set: { updateSavePassword($0) }
        )
    }

    private func clearFeedback() {
        statusMessage = ""
        errorMessage = ""
    }

    private func syncFromStorage() {
        let current = BackendAuthClient.currentAuthSessionState()
        sessionState = current
        if email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            email = current.email.isEmpty ? authUserEmail : current.email
        }
        if resetEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            resetEmail = current.email.isEmpty ? authUserEmail : current.email
        }
    }

    private func restoreRememberedLoginCredentials(force: Bool = false) {
        switch BackendAuthClient.rememberedLoginCredentialLoadResult() {
        case .notRemembered:
            rememberMe = false
            savePassword = false
            if statusMessage == Self.rememberedLoginUnavailableMessage {
                statusMessage = ""
            }
        case .unavailable(let savedPassword):
            rememberMe = true
            savePassword = savedPassword
            if statusMessage.isEmpty {
                statusMessage = Self.rememberedLoginUnavailableMessage
            }
        case .loaded(let remembered):
            rememberMe = true
            savePassword = remembered.hasSavedPassword
            if statusMessage == Self.rememberedLoginUnavailableMessage {
                statusMessage = ""
            }
            if force || email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                email = remembered.email
            }
            if force || password.isEmpty {
                password = remembered.password ?? ""
            }
        }
    }

    private func updateRememberMe(_ enabled: Bool) {
        rememberMe = enabled
        guard !enabled else { return }
        savePassword = false
        if !BackendAuthClient.clearRememberedLoginCredentials() {
            errorMessage = "Remembered login is disabled. Apple Keychain will retry deleting the saved credential when Keychain becomes available."
        }
    }

    private func updateSavePassword(_ enabled: Bool) {
        savePassword = enabled
        if enabled {
            rememberMe = true
            return
        }
        guard rememberMe else { return }
        switch BackendAuthClient.disableRememberedLoginPassword() {
        case .saved:
            break
        case .unchanged:
            rememberMe = false
        case .disabled:
            rememberMe = false
            errorMessage = "Remember me was turned off so the unavailable saved password can be deleted safely."
        case .failed:
            rememberMe = false
            errorMessage = "Apple Keychain could not update the remembered login."
        case .superseded:
            rememberMe = false
            errorMessage = "A newer account action kept remembered login disabled."
        }
    }

    @discardableResult
    private func applyRememberedLoginResult(
        _ result: BackendRememberedLoginMutationResult,
        requestedRemember: Bool
    ) -> Bool {
        if requestedRemember && result != .saved {
            rememberMe = false
            savePassword = false
        }
        return result == .saved
    }

    private func reloadScreen(forceRefresh: Bool, reloadSessions: Bool) async {
        let current = BackendAuthClient.currentAuthSessionState()
        if current.refreshTokenPresent && (forceRefresh || current.accessExpired || (!current.isAuthenticated && authSignedIn)) {
            do {
                sessionState = try await BackendAuthClient.refreshAuthSession(force: forceRefresh)
            } catch {
                sessionState = BackendAuthClient.currentAuthSessionState()
            }
        } else {
            sessionState = current
        }

        if email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            email = sessionState.email.isEmpty ? authUserEmail : sessionState.email
        }
        if resetEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            resetEmail = sessionState.email.isEmpty ? authUserEmail : sessionState.email
        }

        if reloadSessions {
            await reloadManagedSessions()
        }
    }

    private func reloadManagedSessions() async {
        guard sessionState.isAuthenticated else {
            managedSessions = []
            return
        }
        isLoadingSessions = true
        defer { isLoadingSessions = false }
        do {
            managedSessions = try await BackendMemoryAPI.shared.fetchAuthSessions(limit: 24, includeRevoked: false)
        } catch {
            managedSessions = []
            if errorMessage.isEmpty {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func configureAppleIDRequest(_ request: ASAuthorizationAppleIDRequest) {
        clearFeedback()
        request.requestedScopes = [.fullName, .email]
        appleSignInRawNonce = nil
        appleAuthSessionGeneration = BackendAuthClient.reserveAuthSessionIntent()
        isAppleSigningIn = true
        do {
            let rawNonce = try BackendAppleSignInNonce.generateRawNonce()
            appleSignInRawNonce = rawNonce
            request.nonce = BackendAppleSignInNonce.sha256Base64URL(rawNonce)
        } catch {
            appleAuthSessionGeneration = nil
            isAppleSigningIn = false
            errorMessage = error.localizedDescription
        }
    }

    private func handleAppleAuthorizationResult(_ result: Result<ASAuthorization, Error>) {
        Task {
            await completeAppleAuthorization(result)
        }
    }

    private func completeAppleAuthorization(_ result: Result<ASAuthorization, Error>) async {
        let rawNonce = appleSignInRawNonce
        let sessionGeneration = appleAuthSessionGeneration
        appleSignInRawNonce = nil
        appleAuthSessionGeneration = nil
        switch result {
        case .success(let authorization):
            guard let rawNonce, !rawNonce.isEmpty else {
                isAppleSigningIn = false
                errorMessage = "Apple sign in could not complete its security check. Please try again."
                return
            }
            guard let sessionGeneration else {
                isAppleSigningIn = false
                errorMessage = "Apple sign in was superseded by a newer account action."
                return
            }
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                isAppleSigningIn = false
                errorMessage = "Apple sign in returned an unexpected credential."
                return
            }
            guard let identityTokenData = credential.identityToken,
                  let identityToken = String(data: identityTokenData, encoding: .utf8),
                  !identityToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                isAppleSigningIn = false
                errorMessage = "Apple sign in did not provide a usable identity token."
                return
            }

            clearFeedback()
            isWorking = true
            defer {
                isWorking = false
                isAppleSigningIn = false
            }

            do {
                sessionState = try await BackendAuthClient.signInWithApple(
                    identityToken: identityToken,
                    authorizationCode: decodedAppleAuthorizationCode(credential.authorizationCode),
                    userIdentifier: credential.user,
                    rawNonce: rawNonce,
                    expectedSessionGeneration: sessionGeneration,
                    email: normalizedCredentialString(credential.email),
                    givenName: normalizedCredentialString(credential.fullName?.givenName),
                    familyName: normalizedCredentialString(credential.fullName?.familyName)
                )
                password = ""
                confirmPassword = ""
                debugEmailVerificationToken = ""
                debugPasswordResetToken = ""
                statusMessage = sessionState.email.isEmpty ? "Signed in with Apple." : "Signed in with Apple as \(sessionState.email)."
                onSessionChanged()
                await reloadScreen(forceRefresh: false, reloadSessions: true)
            } catch {
                errorMessage = appleSignInErrorMessage(from: error)
            }
        case .failure(let error):
            isAppleSigningIn = false
            if let authError = error as? ASAuthorizationError, authError.code == .canceled {
                clearFeedback()
                statusMessage = "Apple sign in canceled."
                return
            }
            errorMessage = appleSignInErrorMessage(from: error)
        }
    }

    private func normalizedCredentialString(_ value: String?) -> String? {
        let normalized = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }

    private func decodedAppleAuthorizationCode(_ data: Data?) -> String? {
        guard let data, !data.isEmpty else { return nil }
        if let utf8 = String(data: data, encoding: .utf8) {
            let normalized = utf8.trimmingCharacters(in: .whitespacesAndNewlines)
            if !normalized.isEmpty {
                return normalized
            }
        }
        let base64 = data.base64EncodedString().trimmingCharacters(in: .whitespacesAndNewlines)
        return base64.isEmpty ? nil : base64
    }

    private func appleSignInErrorMessage(from error: Error) -> String {
        if let authError = error as? ASAuthorizationError {
            switch authError.code {
            case .failed, .notInteractive:
                return "Apple sign in failed. Please try again."
            case .invalidResponse:
                return "Apple sign in returned an invalid response."
            case .notHandled:
                return "Apple sign in could not be completed."
            case .canceled:
                return "Apple sign in canceled."
            default:
                let fallback = authError.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
                return fallback.isEmpty ? "Apple sign in could not be completed." : fallback
            }
        }

        let message = error.localizedDescription
        return ProfileAppleSignInErrorPolicy.userMessage(for: message) ?? message
    }

    private func signIn() async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty, !password.isEmpty else {
            errorMessage = "Email and password are required."
            return
        }
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        let authIntent = BackendAuthClient.reserveAuthenticationIntent()
        do {
            let submittedPassword = password
            let requestedRemember = rememberMe
            let requestedSavePassword = savePassword
            let result = try await BackendAuthClient.login(
                email: normalizedEmail,
                password: submittedPassword,
                intent: authIntent,
                rememberEmail: requestedRemember,
                savePassword: requestedSavePassword
            )
            sessionState = result.sessionState
            let remembered = applyRememberedLoginResult(
                result.rememberedLoginResult,
                requestedRemember: requestedRemember
            )
            password = ""
            confirmPassword = ""
            debugEmailVerificationToken = ""
            debugPasswordResetToken = ""
            statusMessage = requestedRemember && !remembered
                ? "Signed in, but Apple Keychain could not save the remembered login."
                : "Signed in to the live backend."
            onSessionChanged()
            await reloadScreen(forceRefresh: false, reloadSessions: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func signUp() async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty, !password.isEmpty else {
            errorMessage = "Email and password are required."
            return
        }
        guard password == confirmPassword else {
            errorMessage = "Passwords do not match."
            return
        }
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        let authIntent = BackendAuthClient.reserveAuthenticationIntent()
        do {
            let submittedPassword = password
            let requestedRemember = rememberMe
            let requestedSavePassword = savePassword
            let result = try await BackendAuthClient.signUp(
                email: normalizedEmail,
                password: submittedPassword,
                intent: authIntent,
                rememberEmail: requestedRemember,
                savePassword: requestedSavePassword
            )
            sessionState = result.sessionState
            let remembered = applyRememberedLoginResult(
                result.rememberedLoginResult,
                requestedRemember: requestedRemember
            )
            password = ""
            confirmPassword = ""
            statusMessage = requestedRemember && !remembered
                ? "Account created, but Apple Keychain could not save the remembered login."
                : (sessionState.emailVerified
                    ? "Account created and signed in."
                    : "Account created. Check verification status below to finish setup.")
            onSessionChanged()
            await reloadScreen(forceRefresh: false, reloadSessions: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshSession() async {
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        do {
            sessionState = try await BackendAuthClient.refreshAuthSession(force: true)
            statusMessage = "Session refreshed."
            onSessionChanged()
            await reloadScreen(forceRefresh: false, reloadSessions: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func signOut() async {
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        do {
            let tokensDeleted = try await BackendAuthClient.logout()
            await finishLocalSignOut(
                status: tokensDeleted
                    ? "Signed out."
                    : "Signed out. Apple Keychain cleanup will retry when Keychain is available."
            )
        } catch {
            await finishLocalSignOut(
                status: "Signed out locally. Backend session revocation could not be confirmed."
            )
            errorMessage = error.localizedDescription
        }
    }

    private func finishLocalSignOut(status: String) async {
        sessionState = .signedOut
        managedSessions = []
        password = ""
        confirmPassword = ""
        verifyToken = ""
        resetToken = ""
        debugEmailVerificationToken = ""
        debugPasswordResetToken = ""
        restoreRememberedLoginCredentials(force: true)
        statusMessage = status
        onSessionChanged()
        await reloadScreen(forceRefresh: false, reloadSessions: false)
    }

    private func requestVerification() async {
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        do {
            let payload = try await BackendAuthClient.requestEmailVerification()
            debugEmailVerificationToken = payload.debugEmailVerificationToken ?? ""
            if verifyToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                verifyToken = debugEmailVerificationToken
            }
            statusMessage = deliveryMessage(payload, fallback: "Verification request accepted")
            await reloadScreen(forceRefresh: false, reloadSessions: false)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verifyEmail() async {
        let normalizedToken = verifyToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedToken.isEmpty else {
            errorMessage = "A verification token is required."
            return
        }
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        do {
            sessionState = try await BackendAuthClient.verifyEmail(token: normalizedToken)
            verifyToken = ""
            debugEmailVerificationToken = ""
            statusMessage = "Email verified."
            onSessionChanged()
            await reloadScreen(forceRefresh: false, reloadSessions: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func requestPasswordReset() async {
        let normalizedEmail = resetEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty else {
            errorMessage = "An email is required to request a reset."
            return
        }
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        do {
            let payload = try await BackendAuthClient.requestPasswordReset(email: normalizedEmail)
            debugPasswordResetToken = payload.debugPasswordResetToken ?? ""
            if resetToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                resetToken = debugPasswordResetToken
            }
            statusMessage = deliveryMessage(payload, fallback: "Password reset request accepted")
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func resetPassword() async {
        let normalizedToken = resetToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedToken.isEmpty else {
            errorMessage = "A reset token is required."
            return
        }
        guard !newPassword.isEmpty else {
            errorMessage = "Enter a new password to finish the reset."
            return
        }
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        do {
            let submittedNewPassword = newPassword
            let resetResult = try await BackendAuthClient.resetPassword(
                token: normalizedToken,
                newPassword: submittedNewPassword
            )
            sessionState = resetResult.sessionState
            var rememberedLoginStatusOverride: String?
            switch resetResult.rememberedLoginResult {
            case .saved:
                rememberMe = true
                savePassword = true
            case .disabled, .failed:
                rememberMe = false
                savePassword = false
                rememberedLoginStatusOverride = "Password updated. The old remembered login was disabled and queued for secure deletion."
            case .superseded:
                rememberedLoginStatusOverride = "Password updated. A newer account action superseded the remembered-login update."
            case .unchanged:
                break
            }
            authMode = .signIn
            password = ""
            confirmPassword = ""
            newPassword = ""
            resetToken = ""
            debugPasswordResetToken = ""
            statusMessage = rememberedLoginStatusOverride
                ?? "Password updated. Sign in with the new password when you’re ready."
            onSessionChanged()
            await reloadScreen(forceRefresh: false, reloadSessions: false)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

#if DEBUG
    private func useLocalDemoAccount(_ account: BackendLocalDemoAccount) async {
        authMode = .signIn
        email = account.email
        password = account.password
        confirmPassword = account.password
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        let authIntent = BackendAuthClient.reserveAuthenticationIntent()

        do {
            var created = false
            let requestedRemember = rememberMe
            let requestedSavePassword = savePassword
            let result: BackendEmailAuthenticationResult
            do {
                result = try await BackendAuthClient.login(
                    email: account.email,
                    password: account.password,
                    intent: authIntent,
                    rememberEmail: requestedRemember,
                    savePassword: requestedSavePassword
                )
            } catch {
                guard shouldCreateLocalDemoAccount(after: error) else { throw error }
                result = try await BackendAuthClient.signUp(
                    email: account.email,
                    password: account.password,
                    intent: authIntent,
                    rememberEmail: requestedRemember,
                    savePassword: requestedSavePassword
                )
                created = true
            }

            sessionState = result.sessionState
            let remembered = applyRememberedLoginResult(
                result.rememberedLoginResult,
                requestedRemember: requestedRemember
            )
            password = ""
            confirmPassword = ""
            debugEmailVerificationToken = ""
            debugPasswordResetToken = ""
            if requestedRemember && !remembered {
                statusMessage = "Demo signed in, but Apple Keychain could not save the remembered login."
            } else {
                statusMessage = created ? "Local demo account created and signed in." : "Signed in with the local demo account."
            }
            onSessionChanged()
            await reloadScreen(forceRefresh: false, reloadSessions: true)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func shouldCreateLocalDemoAccount(after error: Error) -> Bool {
        guard let backendError = error as? BackendMemoryAPIError,
              case .server(let status, let message) = backendError else {
            return false
        }
        return status == 401 && message.localizedCaseInsensitiveContains("invalid_credentials")
    }
#endif

    private func revokeOtherSessions() async {
        guard !sessionState.currentSessionId.isEmpty else {
            errorMessage = "The current session is not available yet."
            return
        }
        clearFeedback()
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await BackendMemoryAPI.shared.revokeOtherAuthSessions(currentSessionId: sessionState.currentSessionId)
            statusMessage = "Other active sessions were revoked."
            await reloadManagedSessions()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func deliveryMessage(_ payload: BackendAuthEnvelope, fallback: String) -> String {
        let transport = (payload.emailDelivery?.transport ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if transport == "inline_debug" {
            return "\(fallback). Debug token is available below."
        }
        if transport.isEmpty || transport == "none" {
            return fallback + "."
        }
        return "\(fallback). Delivery: \(transport)."
    }

    private func sessionTitle(_ session: BackendAuthManagedSession) -> String {
        let label = (session.device?.label ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !label.isEmpty { return label }
        let name = (session.device?.clientName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let platform = (session.device?.clientPlatform ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty && !platform.isEmpty {
            return "\(name) on \(platform)"
        }
        if !platform.isEmpty { return platform }
        return "Session"
    }

    private func sessionDetailLine(_ session: BackendAuthManagedSession) -> String {
        var parts: [String] = []
        if let updatedAt = session.updatedAt, updatedAt > 0 {
            parts.append("Seen \(themDateFromEpoch(updatedAt).formatted(date: .abbreviated, time: .shortened))")
        }
        if let version = session.device?.clientVersion, !version.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("v\(version)")
        }
        if let transport = session.device?.authTransport, !transport.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            parts.append("via \(transport)")
        }
        if parts.isEmpty {
            return session.sessionId
        }
        return parts.joined(separator: " · ")
    }

    @ViewBuilder
    private func accountCard<Content: View>(
        title: String,
        subtitle: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.94))
                Text(subtitle)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.white.opacity(0.54))
            }
            content()
        }
        .padding(22)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white.opacity(0.07))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.white.opacity(0.11), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.18), radius: 24, x: 0, y: 14)
        .padding(.horizontal, 48)
    }

    @ViewBuilder
    private func feedbackPill(text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(.white.opacity(0.90))
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(tint)
            )
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
    }

    @ViewBuilder
    private func statusChip(_ label: String) -> some View {
        Text(label)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.white.opacity(0.84))
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.09))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
    }

    @ViewBuilder
    private func metricRow(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.42))
            Text(value)
                .font(.system(size: 14, weight: .regular))
                .foregroundStyle(.white.opacity(0.86))
                .textSelection(.enabled)
        }
    }

    @ViewBuilder
    private func accountField(
        title: String,
        prompt: String,
        text: Binding<String>,
        secure: Bool = false,
        identifier: String = ""
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.62))
            Group {
                if secure {
                    SecureField(prompt, text: text)
                } else {
                    TextField(prompt, text: text)
                }
            }
            .accessibilityIdentifier(identifier)
            .font(.system(size: 14, weight: .regular))
            .foregroundStyle(.white.opacity(0.90))
            .textFieldStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(0.07))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.white.opacity(0.10), lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private func tokenBlock(title: String, token: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.62))
            Text(token)
                .font(.system(size: 12, weight: .regular, design: .monospaced))
                .foregroundStyle(.white.opacity(0.88))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Color.white.opacity(0.07))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Color.white.opacity(0.10), lineWidth: 1)
                )
        }
    }

    @ViewBuilder
    private func primaryActionButton(title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.borderedProminent)
            .tint(Color.white.opacity(0.20))
            .foregroundStyle(.white.opacity(disabled ? 0.48 : 0.92))
            .disabled(disabled)
    }

    @ViewBuilder
    private func secondaryActionButton(title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(.bordered)
            .tint(Color.white.opacity(0.22))
            .foregroundStyle(.white.opacity(disabled ? 0.48 : 0.84))
            .disabled(disabled)
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
