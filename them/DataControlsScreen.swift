import SwiftUI
import UniformTypeIdentifiers
#if os(macOS)
import AppKit
#endif

private enum DataControlAction: Identifiable, Equatable {
    case clearHistory
    case clearMemories
    case clearParkedOutbox
    case discardOutlineRecovery(
        headID: String,
        projectId: String,
        confirmedEntryIDs: [String],
        ownerScope: Set<String>
    )
    case deleteAccount

    var id: String {
        switch self {
        case .clearHistory:
            return "clear-history"
        case .clearMemories:
            return "clear-memories"
        case .clearParkedOutbox:
            return "clear-parked-outbox"
        case .discardOutlineRecovery(let headID, let projectId, _, _):
            return "discard-outline-recovery:\(projectId):\(headID)"
        case .deleteAccount:
            return "delete-account"
        }
    }

    var title: String {
        switch self {
        case .clearHistory:
            return "Clear History"
        case .clearMemories:
            return "Delete All Memories"
        case .clearParkedOutbox:
            return "Delete Parked Turns"
        case .discardOutlineRecovery:
            return "Discard Parked Outline Changes"
        case .deleteAccount:
            return "Delete Account"
        }
    }

    var message: String {
        switch self {
        case .clearHistory:
            return "This removes stored conversation history and transcript trail for this assistant context. This cannot be undone."
        case .clearMemories:
            return "This removes remembered names, themes, and continuity memory context. This cannot be undone."
        case .clearParkedOutbox:
            return "This deletes queued talk turns that could not be retried. This cannot be undone."
        case .discardOutlineRecovery(_, _, let confirmedEntryIDs, _):
            let removalCount = confirmedEntryIDs.count
            let noun = removalCount == 1 ? "saved outline snapshot" : "causally linked outline snapshots"
            return "This permanently removes \(removalCount) \(noun) from this device. Later snapshots are included so a discarded edit cannot reappear. Export first if you may need the work."
        case .deleteAccount:
            return "This requests deletion for your backend account, revokes signed-in sessions, and signs this device out. The backend may keep the account in its recovery window before hard deletion."
        }
    }

    var confirmLabel: String {
        switch self {
        case .clearHistory:
            return "Clear History"
        case .clearMemories:
            return "Delete Memories"
        case .clearParkedOutbox:
            return "Delete Parked Turns"
        case .discardOutlineRecovery(_, _, let confirmedEntryIDs, _):
            let removalCount = confirmedEntryIDs.count
            return removalCount == 1 ? "Discard Change" : "Discard \(removalCount) Changes"
        case .deleteAccount:
            return "Delete Account"
        }
    }

    var iconName: String {
        switch self {
        case .clearHistory:
            return "trash"
        case .clearMemories:
            return "trash"
        case .clearParkedOutbox:
            return "tray.and.arrow.down"
        case .discardOutlineRecovery:
            return "trash"
        case .deleteAccount:
            return "person.crop.circle.badge.xmark"
        }
    }
}

struct DataControlsScreen: View {
    var onDone: () -> Void = {}

    @AppStorage("clementine_voice_transport_mode")
    private var voiceTransportModeRaw: String = ClementineVoiceTransportMode.turnBased.rawValue
    @AppStorage(ClementineRealtimeSupplierMode.storageKey)
    private var realtimeSupplierModeRaw: String = ClementineRealtimeSupplierMode.serverDefault.rawValue
    @AppStorage("clementine_visual_context_enabled")
    private var visualContextEnabled: Bool = false
    @State private var pendingAction: DataControlAction?
    @State private var runningAction: DataControlAction?
    @State private var isExporting = false
    @State private var isRefreshingOutbox = false
    @State private var isRetryingOutbox = false
    @State private var offlineOutboxSnapshot = OfflineTalkOutboxSnapshot.empty
    @State private var offlineOutboxEntries: [OfflineTalkOutboxEntry] = []
    @State private var outlineRecoveryChains: [ScreenplayOutlineMutationRecoveryChain] = []
    @State private var outlineRecoveryError = ""
    @State private var isRefreshingOutlineRecovery = false
    @State private var runningOutlineRecoveryID: String?
    @State private var inspectingOutlineRecovery: ScreenplayOutlineMutationRecoveryChain?
    @State private var outlineRecoveryExportDocument: ScreenplayOutlineMutationRecoveryDocument?
    @State private var outlineRecoveryExportFilename = "io-them-screenplay-outline-recovery.json"
    @State private var isPresentingOutlineRecoveryExporter = false
    @State private var isRefreshingMemoryStats = false
    @State private var memoryStats: BackendMemoryStatsResponse?
    @State private var memoryStatsError = ""
    @State private var memoryStatsRefreshedAt: Date?
    @State private var statusMessage = ""
    @State private var stateVersion = ""
    @State private var showingV1LaunchDoctor = false
    #if DEBUG
    @State private var didInstallOutlineRecoveryUITestFixture = false
    #endif

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [
                        .herPeachTop,
                        .herPeachMid,
                        .herPeachBottom,
                    ]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        header
                        storageExplanation
                        offlineOutboxStatus
                        outlineRecoveryStatus
                        memoryStatus
                        voiceTransportSettings
                        realtimeProviderSettings
                        visualContextSettings
                        v1LaunchDoctorEntry
                        actionButtons
                        statusRow
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 28)
                    .padding(.bottom, 18)
                    .frame(maxWidth: 980, alignment: .topLeading)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .navigationTitle("")
            .toolbar {
                #if os(macOS)
                ToolbarItem(placement: .automatic) {
                    Button("Done", action: onDone)
                        .font(.system(size: 14, weight: .regular, design: .default))
                }
                #else
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", action: onDone)
                        .font(.system(size: 14, weight: .regular, design: .default))
                }
                #endif
            }
        }
        .alert(item: $pendingAction) { action in
            Alert(
                title: Text(action.title),
                message: Text(action.message),
                primaryButton: .destructive(Text(action.confirmLabel)) {
                    runAction(action)
                },
                secondaryButton: .cancel()
            )
        }
        .task {
            #if DEBUG
            await installOutlineRecoveryUITestFixtureIfNeeded()
            #endif
            await refreshOutlineRecovery(startMonitoring: true)
            await refreshOfflineOutbox(startMonitoring: true)
            await refreshMemoryStats(force: false)
        }
        .onReceive(NotificationCenter.default.publisher(for: .themOfflineTalkOutboxUpdated)) { notification in
            offlineOutboxSnapshot = OfflineTalkOutboxSnapshot(notification: notification)
            Task { @MainActor in
                await refreshOfflineOutbox(startMonitoring: false)
            }
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .themScreenplayOutlineMutationOutboxUpdated)
        ) { _ in
            Task { @MainActor in
                await refreshOutlineRecovery(startMonitoring: false)
            }
        }
        .onReceive(
            NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)
        ) { _ in
            clearOutlineRecoveryPresentation()
            Task { @MainActor in
                await refreshOutlineRecovery(startMonitoring: false)
            }
        }
        .accessibilityIdentifier("data.controls.screen")
        .sheet(isPresented: $showingV1LaunchDoctor) {
            V1LaunchDoctorView {
                showingV1LaunchDoctor = false
            }
            .frame(minWidth: 760, minHeight: 680)
        }
        .sheet(item: $inspectingOutlineRecovery) { chain in
            ScreenplayOutlineMutationRecoveryDetailView(
                chain: chain,
                isDisabled: isBusy,
                onExport: {
                    inspectingOutlineRecovery = nil
                    Task { @MainActor in
                        await Task.yield()
                        await exportOutlineRecovery(chain)
                    }
                },
                onDone: {
                    inspectingOutlineRecovery = nil
                }
            )
        }
        .fileExporter(
            isPresented: $isPresentingOutlineRecoveryExporter,
            document: outlineRecoveryExportDocument,
            contentType: .json,
            defaultFilename: outlineRecoveryExportFilename
        ) { result in
            switch result {
            case .success(let url):
                statusMessage = "Outline recovery export saved: \(url.lastPathComponent)"
            case .failure(let error):
                statusMessage = "Outline recovery export failed: \(error.localizedDescription)"
            }
            outlineRecoveryExportDocument = nil
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Data Controls")
                .font(.system(size: 34, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.95))
            Text("Control what is stored and reset it when you want.")
                .font(.system(size: 15, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.72))
        }
    }

    private var storageExplanation: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Data Handling")
                .font(.system(size: 18, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.92))

            VStack(alignment: .leading, spacing: 8) {
                Text("On this device (local)")
                    .font(.system(size: 14, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.86))
                Text("UI preferences, cached session tokens, recent draft state, temporary audio used during active voice turns, and a 30-day account-scoped cache of learned character voices for offline continuity.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.78))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("On backend (server)")
                    .font(.system(size: 14, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.86))
                Text("Conversation history, memory summaries, and names or details you ask io.them to remember so continuity works across sessions.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.78))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Retention window")
                    .font(.system(size: 14, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.86))
                Text("Server memory is retained until you clear it, with inactive records expiring on the backend policy window (currently up to 365 days).")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.78))
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("Sent to AI providers")
                    .font(.system(size: 14, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.86))
                Text("Mic audio is sent for speech-to-text, your text context is sent for response generation, assistant text is sent for voice synthesis, and if visual context is enabled a screenshot of the active window is sent for visual summarization.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.78))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
    }

    private var actionButtons: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                runExport()
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Download My Data")
                            .font(.system(size: 15, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.92))
                        Text("Saves your backend account archive as JSON.")
                            .font(.system(size: 13, weight: .regular, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.72))
                    }
                    Spacer()
                    if isExporting {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "square.and.arrow.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.herText.opacity(0.78))
                    }
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(Color.white.opacity(0.20))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(Color.white.opacity(0.22), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
            .disabled(isBusy)

            actionButton(
                title: "Clear History",
                subtitle: "Removes conversation thread history.",
                action: .clearHistory
            )
            actionButton(
                title: "Delete All Memories",
                subtitle: "Removes remembered names, themes, and memory context.",
                action: .clearMemories
            )
            actionButton(
                title: "Delete Account",
                subtitle: "Requests backend account deletion and signs this device out.",
                action: .deleteAccount
            )
        }
    }

    private var offlineOutboxStatus: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Queued Talk Turns")
                    .font(.system(size: 18, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.92))
                Spacer()
                Button {
                    Task { @MainActor in
                        await retryOfflineOutbox()
                    }
                } label: {
                    if isRetryingOutbox {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 14, weight: .semibold))
                    }
                }
                .buttonStyle(.plain)
                .disabled(isBusy || isRetryingOutbox)
                .accessibilityLabel("Retry queued talk turns")
            }

            Text(offlineOutboxSummary)
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.78))

            let visibleEntries = offlineOutboxEntries.prefix(3)
            if !visibleEntries.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(visibleEntries)) { entry in
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Image(systemName: outboxIconName(for: entry.status))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(outboxColor(for: entry.status))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(outboxTitle(for: entry))
                                    .font(.system(size: 13, weight: .semibold, design: .default))
                                    .foregroundStyle(Color.herText.opacity(0.86))
                                if let detail = outboxDetail(for: entry) {
                                    Text(detail)
                                        .font(.system(size: 12, weight: .regular, design: .default))
                                        .foregroundStyle(Color.herText.opacity(0.66))
                                        .lineLimit(2)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }

            if offlineOutboxSnapshot.parkedCount > 0 {
                Button {
                    pendingAction = .clearParkedOutbox
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "trash")
                        Text("Delete parked turns")
                    }
                    .font(.system(size: 13, weight: .semibold, design: .default))
                    .foregroundStyle(Color.red.opacity(0.84))
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
    }

    private var outlineRecoveryStatus: some View {
        ScreenplayOutlineMutationRecoveryPanel(
            chains: visibleOutlineRecoveryChains,
            statusText: outlineRecoverySummary,
            isRefreshing: isRefreshingOutlineRecovery,
            isDisabled: isBusy,
            runningChainID: runningOutlineRecoveryID,
            onRefresh: {
                Task { @MainActor in
                    await refreshOutlineRecovery(startMonitoring: false)
                }
            },
            onInspect: { chain in
                guard isCurrentOutlineRecoveryChain(chain) else {
                    clearOutlineRecoveryPresentation()
                    Task { @MainActor in
                        await refreshOutlineRecovery(startMonitoring: false)
                    }
                    return
                }
                inspectingOutlineRecovery = chain
            },
            onExport: { chain in
                Task { @MainActor in
                    await exportOutlineRecovery(chain)
                }
            },
            onRetry: { chain in
                Task { @MainActor in
                    await retryOutlineRecovery(chain)
                }
            },
            onDiscard: { chain in
                let ownerScope = ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope()
                guard ownerScope.contains(chain.parkedHead.ownerUserId) else {
                    clearOutlineRecoveryPresentation()
                    Task { @MainActor in
                        await refreshOutlineRecovery(startMonitoring: false)
                    }
                    return
                }
                pendingAction = .discardOutlineRecovery(
                    headID: chain.parkedHead.id,
                    projectId: chain.projectId,
                    confirmedEntryIDs: chain.entries.map(\.id),
                    ownerScope: ownerScope
                )
            }
        )
    }

    private var voiceTransportSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Voice Transport")
                .font(.system(size: 18, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.92))

            Picker("Voice Transport", selection: $voiceTransportModeRaw) {
                ForEach(ClementineVoiceTransportMode.allCases) { mode in
                    Text(mode.title).tag(mode.rawValue)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("data.voice.transport.picker")

            let selectedMode = ClementineVoiceTransportMode(rawValue: voiceTransportModeRaw) ?? .turnBased
            Text(selectedMode.subtitle)
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.78))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
    }

    private var realtimeProviderSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Realtime Provider")
                .font(.system(size: 18, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.92))

            Picker("Realtime Provider", selection: $realtimeSupplierModeRaw) {
                ForEach(ClementineRealtimeSupplierMode.allCases) { mode in
                    Text(mode.title).tag(mode.rawValue)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("data.realtime.provider.picker")

            let selectedMode = ClementineRealtimeSupplierMode.normalized(rawValue: realtimeSupplierModeRaw)
            Text(selectedMode.subtitle)
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.78))
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
    }

    private var memoryStatus: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Memory Shape")
                    .font(.system(size: 18, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.92))
                Spacer()
                Button {
                    Task { @MainActor in
                        await refreshMemoryStats(force: true)
                    }
                } label: {
                    if isRefreshingMemoryStats {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 14, weight: .semibold))
                    }
                }
                .buttonStyle(.plain)
                .disabled(isRefreshingMemoryStats)
                .accessibilityLabel("Refresh memory shape")
            }

            Text(memoryStatsSummary)
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.78))

            if let refreshed = memoryStatsRefreshedAt {
                Text("Refreshed \(refreshed.formatted(date: .omitted, time: .shortened))")
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.62))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
    }

    private var visualContextSettings: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Visual Context")
                .font(.system(size: 18, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.92))

            Toggle(isOn: $visualContextEnabled) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Use Active Window")
                        .font(.system(size: 15, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.90))
                    Text("Lets io.them look at the frontmost window before a turn so she can respond to what is on screen, not just what was said. This may add a little latency.")
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.76))
                }
            }
            .toggleStyle(.switch)

            #if os(macOS)
            Text(ClementineVisualContextCapture.permissionStatusText())
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.74))

            if visualContextEnabled && !ClementineVisualContextCapture.hasScreenAccess() {
                Button("Request Screen Access") {
                    let granted = ClementineVisualContextCapture.requestScreenAccess()
                    statusMessage = granted
                        ? "Screen access granted. io.them can use active-window context now."
                        : "Screen access is still required for visual context."
                }
                .buttonStyle(.bordered)
                .tint(.white.opacity(0.24))
            }
            #else
            Text("Visual context capture is currently available on macOS.")
                .font(.system(size: 13, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.74))
            #endif
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
    }

    private var v1LaunchDoctorEntry: some View {
        Button {
            showingV1LaunchDoctor = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "checklist.checked")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.herText.opacity(0.78))
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 4) {
                    Text("V1 Launch Doctor")
                        .font(.system(size: 16, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.92))
                    Text("Run the release smoke, mark pass/fail, and export the latest launch proof.")
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.72))
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.herText.opacity(0.58))
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white.opacity(0.20))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.22), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func actionButton(title: String, subtitle: String, action: DataControlAction) -> some View {
        Button {
            pendingAction = action
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 15, weight: .semibold, design: .default))
                        .foregroundStyle(Color.red.opacity(0.86))
                    Text(subtitle)
                        .font(.system(size: 13, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.72))
                }
                Spacer()
                if runningAction == action {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: action.iconName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.red.opacity(0.78))
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color.white.opacity(0.20))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.22), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
    }

    private var statusRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            if isExporting {
                Text("Exporting account archive...")
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.82))
            }
            if !statusMessage.isEmpty {
                Text(statusMessage)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.86))
            }
            if !stateVersion.isEmpty {
                Text("State version: \(stateVersion)")
                    .font(.system(size: 12, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.64))
            }
        }
    }

    private var isBusy: Bool {
        runningAction != nil ||
            isExporting ||
            isRefreshingOutbox ||
            isRetryingOutbox ||
            isRefreshingOutlineRecovery ||
            runningOutlineRecoveryID != nil
    }

    private var memoryStatsSummary: String {
        if !memoryStatsError.isEmpty {
            return "Memory shape unavailable: \(memoryStatsError)"
        }
        return memoryStats?.diagnosticsSummary ?? "Memory shape has not been refreshed yet."
    }

    private var offlineOutboxSummary: String {
        if isRefreshingOutbox {
            return "Refreshing queued turns..."
        }
        if let status = offlineOutboxSnapshot.userVisibleStatus {
            return status
        }
        return "No talk turns are waiting on this device."
    }

    private var outlineRecoverySummary: String {
        if isRefreshingOutlineRecovery {
            return "Refreshing parked outline changes..."
        }
        if !outlineRecoveryError.isEmpty {
            return "Recovery queue unavailable: \(outlineRecoveryError)"
        }
        let chains = visibleOutlineRecoveryChains
        guard !chains.isEmpty else {
            return "No screenplay outline changes need attention on this device."
        }
        let snapshotCount = chains.reduce(0) { $0 + $1.entries.count }
        let chainLabel = chains.count == 1 ? "project chain" : "project chains"
        let snapshotLabel = snapshotCount == 1 ? "snapshot" : "snapshots"
        return "\(snapshotCount) saved \(snapshotLabel) across \(chains.count) \(chainLabel) need attention."
    }

    private var visibleOutlineRecoveryChains: [ScreenplayOutlineMutationRecoveryChain] {
        let ownerScope = ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope()
        return outlineRecoveryChains.filter { ownerScope.contains($0.parkedHead.ownerUserId) }
    }

    private func isCurrentOutlineRecoveryChain(
        _ chain: ScreenplayOutlineMutationRecoveryChain,
        ownerScope: Set<String> = ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope()
    ) -> Bool {
        ownerScope.contains(chain.parkedHead.ownerUserId)
    }

    private func outboxTitle(for entry: OfflineTalkOutboxEntry) -> String {
        switch entry.status {
        case .pending:
            return entry.retries == 0 ? "Waiting to retry" : "Retry \(entry.retries) scheduled"
        case .inflight:
            return "Sending now"
        case .parked:
            return "Parked after retry failure"
        }
    }

    private func outboxDetail(for entry: OfflineTalkOutboxEntry) -> String? {
        let error = (entry.lastError ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if entry.status == .pending, entry.nextAttemptAt > 0 {
            let date = Date(timeIntervalSince1970: entry.nextAttemptAt)
            let retryText = date > Date()
                ? "Next retry \(date.formatted(date: .omitted, time: .shortened))"
                : "Ready to retry"
            return error.isEmpty ? retryText : "\(retryText). \(error)"
        }
        return error.isEmpty ? nil : error
    }

    private func outboxIconName(for status: OfflineTalkOutboxStatus) -> String {
        switch status {
        case .pending: return "tray"
        case .inflight: return "paperplane"
        case .parked: return "exclamationmark.triangle"
        }
    }

    private func outboxColor(for status: OfflineTalkOutboxStatus) -> Color {
        switch status {
        case .pending: return Color.herText.opacity(0.68)
        case .inflight: return Color.green.opacity(0.76)
        case .parked: return Color.orange.opacity(0.86)
        }
    }

    @MainActor
    private func refreshMemoryStats(force: Bool) async {
        if isRefreshingMemoryStats { return }
        if !force, memoryStats != nil { return }
        isRefreshingMemoryStats = true
        defer { isRefreshingMemoryStats = false }
        do {
            memoryStats = try await BackendMemoryAPI.shared.fetchMemoryStats()
            memoryStatsError = ""
            memoryStatsRefreshedAt = Date()
        } catch {
            memoryStatsError = error.localizedDescription
            memoryStatsRefreshedAt = Date()
        }
    }

    @MainActor
    private func refreshOfflineOutbox(startMonitoring: Bool) async {
        if isRefreshingOutbox { return }
        isRefreshingOutbox = true
        defer { isRefreshingOutbox = false }
        if startMonitoring {
            await OfflineTalkOutbox.shared.startNetworkMonitoring()
        }
        offlineOutboxSnapshot = await OfflineTalkOutbox.shared.snapshot()
        offlineOutboxEntries = await OfflineTalkOutbox.shared.allEntries()
    }

    @MainActor
    private func retryOfflineOutbox() async {
        if isRetryingOutbox { return }
        isRetryingOutbox = true
        defer { isRetryingOutbox = false }
        offlineOutboxSnapshot = await OfflineTalkOutbox.shared.drainDue()
        offlineOutboxEntries = await OfflineTalkOutbox.shared.allEntries()
        statusMessage = offlineOutboxSnapshot.userVisibleStatus ?? "Queued turns are clear."
    }

    @MainActor
    private func refreshOutlineRecovery(startMonitoring: Bool) async {
        if isRefreshingOutlineRecovery { return }
        isRefreshingOutlineRecovery = true
        defer { isRefreshingOutlineRecovery = false }
        if startMonitoring {
            await ScreenplayOutlineMutationOutbox.shared.startNetworkMonitoring()
        }
        for _ in 0..<2 {
            let requestedScope = ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope()
            do {
                let recoveredChains = try await ScreenplayOutlineMutationOutbox.shared.recoveryChains(
                    ownerUserIds: requestedScope
                )
                guard requestedScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                    clearOutlineRecoveryPresentation()
                    continue
                }
                outlineRecoveryChains = recoveredChains
                outlineRecoveryError = ""
                return
            } catch {
                guard requestedScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                    clearOutlineRecoveryPresentation()
                    continue
                }
                outlineRecoveryChains = []
                outlineRecoveryError = error.localizedDescription
                return
            }
        }
        clearOutlineRecoveryPresentation()
    }

    @MainActor
    private func clearOutlineRecoveryPresentation() {
        outlineRecoveryChains = []
        outlineRecoveryError = ""
        inspectingOutlineRecovery = nil
        outlineRecoveryExportDocument = nil
        isPresentingOutlineRecoveryExporter = false
    }

    @MainActor
    private func retryOutlineRecovery(
        _ chain: ScreenplayOutlineMutationRecoveryChain
    ) async {
        let ownerScope = ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope()
        guard runningOutlineRecoveryID == nil,
              runningAction == nil,
              isCurrentOutlineRecoveryChain(chain, ownerScope: ownerScope) else {
            clearOutlineRecoveryPresentation()
            return
        }
        runningOutlineRecoveryID = chain.id
        defer { runningOutlineRecoveryID = nil }
        do {
            _ = try await ScreenplayOutlineMutationOutbox.shared.retryParkedHead(
                id: chain.parkedHead.id,
                projectId: chain.projectId,
                ownerUserIds: ownerScope
            )
            guard ownerScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                clearOutlineRecoveryPresentation()
                return
            }
            statusMessage = "The exact outline request is queued with its original revision check. Open that project to sync it."
        } catch {
            guard ownerScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                clearOutlineRecoveryPresentation()
                return
            }
            statusMessage = "Outline retry failed: \(error.localizedDescription)"
        }
        await refreshOutlineRecovery(startMonitoring: false)
    }

    @MainActor
    private func exportOutlineRecovery(
        _ chain: ScreenplayOutlineMutationRecoveryChain
    ) async {
        let ownerScope = ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope()
        guard runningOutlineRecoveryID == nil,
              runningAction == nil,
              isCurrentOutlineRecoveryChain(chain, ownerScope: ownerScope) else {
            clearOutlineRecoveryPresentation()
            return
        }
        runningOutlineRecoveryID = chain.id
        defer { runningOutlineRecoveryID = nil }
        do {
            let artifact = try await ScreenplayOutlineMutationOutbox.shared.exportRecoveryChain(
                parkedHeadID: chain.parkedHead.id,
                projectId: chain.projectId,
                ownerUserIds: ownerScope
            )
            guard ownerScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                clearOutlineRecoveryPresentation()
                return
            }
            outlineRecoveryExportDocument = ScreenplayOutlineMutationRecoveryDocument(
                data: artifact.data
            )
            outlineRecoveryExportFilename = artifact.filename
            isPresentingOutlineRecoveryExporter = true
            statusMessage = "Choose where to save the owner-redacted outline recovery file."
        } catch {
            guard ownerScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                clearOutlineRecoveryPresentation()
                return
            }
            statusMessage = "Outline recovery export failed: \(error.localizedDescription)"
        }
    }

    @MainActor
    private func runAction(_ action: DataControlAction) {
        guard runningAction == nil else { return }
        runningAction = action
        statusMessage = ""

        Task { @MainActor in
            defer { runningAction = nil }
            do {
                switch action {
                case .clearHistory:
                    let result = try await BackendMemoryAPI.shared.clearHistory()
                    stateVersion = result.sync.stateVersion
                    statusMessage = "History cleared."
                    _ = try? await BackendMemoryAPI.shared.fetchHistory(limit: 140, force: true, sinceTurnId: nil)
                    _ = try? await BackendMemoryAPI.shared.fetchMemories(limit: 72, force: true, sinceVersion: nil)
                    await refreshMemoryStats(force: true)
                case .clearMemories:
                    let result = try await BackendMemoryAPI.shared.clearMemories()
                    ScreenplayLiveDraftBridge.shared.clearCharacterVoiceMemoryCache()
                    stateVersion = result.sync.stateVersion
                    statusMessage = "All memories deleted."
                    _ = try? await BackendMemoryAPI.shared.fetchHistory(limit: 140, force: true, sinceTurnId: nil)
                    _ = try? await BackendMemoryAPI.shared.fetchMemories(limit: 72, force: true, sinceVersion: nil)
                    await refreshMemoryStats(force: true)
                case .deleteAccount:
                    let result = try await BackendMemoryAPI.shared.requestAccountDeletion(reason: "Requested from Data Controls")
                    ScreenplayLiveDraftBridge.shared.clearCharacterVoiceMemoryCache()
                    clearOutlineRecoveryPresentation()
                    stateVersion = ""
                    let hardDelete = (result.hardDeleteAt ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                    let recovery = result.recoveryWindowDays.map { "\($0)-day recovery window" } ?? "backend recovery window"
                    statusMessage = hardDelete.isEmpty
                        ? "Account deletion requested. This device has been signed out."
                        : "Account deletion requested. Hard deletion is scheduled for \(hardDelete) after the \(recovery). This device has been signed out."
                    memoryStats = nil
                    memoryStatsError = ""
                    await refreshOutlineRecovery(startMonitoring: false)
                case .clearParkedOutbox:
                    offlineOutboxSnapshot = try await OfflineTalkOutbox.shared.deleteParkedEntries()
                    offlineOutboxEntries = await OfflineTalkOutbox.shared.allEntries()
                    statusMessage = "Parked queued turns deleted."
                case .discardOutlineRecovery(
                    let headID,
                    let projectId,
                    let confirmedEntryIDs,
                    let ownerScope
                ):
                    guard ownerScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                        throw ScreenplayOutlineMutationRecoveryError.entryUnavailable
                    }
                    let result = try await ScreenplayOutlineMutationOutbox.shared.discardRecoveryChain(
                        parkedHeadID: headID,
                        projectId: projectId,
                        confirmedEntryIDs: confirmedEntryIDs,
                        ownerUserIds: ownerScope
                    )
                    guard ownerScope == ScreenplayOutlineMutationOwnerPartition.currentRecoveryScope() else {
                        clearOutlineRecoveryPresentation()
                        return
                    }
                    let noun = result.removedCount == 1 ? "outline snapshot" : "linked outline snapshots"
                    statusMessage = "Discarded \(result.removedCount) \(noun) from this device."
                    await refreshOutlineRecovery(startMonitoring: false)
                }
            } catch {
                if case .discardOutlineRecovery = action {
                    await refreshOutlineRecovery(startMonitoring: false)
                }
                statusMessage = "Action failed: \(error.localizedDescription)"
            }
        }
    }

    @MainActor
    private func runExport() {
        guard !isBusy else { return }
        isExporting = true
        statusMessage = ""

        Task { @MainActor in
            defer { isExporting = false }
            do {
                let result = try await BackendMemoryAPI.shared.exportAccountData()
                stateVersion = ""
                let url = try writeExportFile(
                    filename: result.filename,
                    data: result.data
                )
                statusMessage = "Account export saved: \(url.path)"
                #if os(macOS)
                NSWorkspace.shared.activateFileViewerSelecting([url])
                #endif
            } catch {
                statusMessage = "Export failed: \(error.localizedDescription)"
            }
        }
    }

    private func writeExportFile(filename: String, data: Data) throws -> URL {
        let safeName = filename.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "io-them-account-export.json"
            : filename
        let directory: URL
        #if os(macOS)
        directory = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        #else
        directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        #endif
        let url = directory.appendingPathComponent(safeName)
        try data.write(to: url, options: .atomic)
        return url
    }

    #if DEBUG
    @MainActor
    private func installOutlineRecoveryUITestFixtureIfNeeded() async {
        guard !didInstallOutlineRecoveryUITestFixture,
              IOThemRuntime.isRunningUITests,
              ProcessInfo.processInfo.arguments.contains("--ui-outline-recovery-fixture") else {
            return
        }
        didInstallOutlineRecoveryUITestFixture = true
        let ownerUserId = ScreenplayOutlineMutationOwnerPartition.currentUser()
        let head = ScreenplayOutlineMutationOutboxEntry(
            id: "ui-stale-outline-head",
            projectId: "ui-recovery-project",
            ownerUserId: ownerUserId,
            expectedOutlineRevision: 7,
            acts: [
                BackendScreenplayAct(
                    id: "ui-act-1",
                    title: "Recovered Act One",
                    summary: "The locally parked structure.",
                    order: 0,
                    sceneIds: ["ui-scene-1"],
                    createdAt: nil,
                    updatedAt: nil
                ),
            ],
            scenes: [
                BackendScreenplayScene(
                    id: "ui-scene-1",
                    slugline: "INT. ARCHIVE - NIGHT",
                    title: "Archive",
                    objective: "Protect the missing reel.",
                    summary: nil,
                    actId: "ui-act-1",
                    order: 0,
                    status: "outlined",
                    beatIds: ["ui-beat-1"],
                    createdAt: nil,
                    updatedAt: nil
                ),
            ],
            beats: [
                BackendScreenplayBeat(
                    id: "ui-beat-1",
                    label: "Mara finds the altered negative.",
                    summary: nil,
                    sceneId: "ui-scene-1",
                    actId: "ui-act-1",
                    order: 0,
                    status: "outlined",
                    createdAt: nil,
                    updatedAt: nil
                ),
            ],
            source: "Stale outline reorder",
            createdAt: 1_725_000_000,
            updatedAt: 1_725_000_100,
            status: .parked,
            retries: 1,
            nextAttemptAt: 0,
            lastError: "The server outline changed before this reorder could be saved.",
            parkedReason: .staleRevision
        )
        let dependent = ScreenplayOutlineMutationOutboxEntry(
            id: "ui-stale-outline-dependent",
            projectId: head.projectId,
            ownerUserId: ownerUserId,
            expectedOutlineRevision: 7,
            acts: head.acts,
            scenes: head.scenes,
            beats: head.beats + [
                BackendScreenplayBeat(
                    id: "ui-beat-2",
                    label: "The archive alarm seals the exit.",
                    summary: nil,
                    sceneId: "ui-scene-1",
                    actId: "ui-act-1",
                    order: 1,
                    status: "outlined",
                    createdAt: nil,
                    updatedAt: nil
                ),
            ],
            source: "Dependent beat edit",
            createdAt: 1_725_000_200,
            updatedAt: 1_725_000_200,
            status: .parked,
            retries: 0,
            nextAttemptAt: 0,
            lastError: "Blocked by the earlier stale outline change.",
            parkedReason: .supersededByRemoteChange
        )
        do {
            try await ScreenplayOutlineMutationOutbox.shared.replaceEntriesForUITesting([
                head,
                dependent,
            ])
        } catch {
            outlineRecoveryError = "UI recovery fixture failed: \(error.localizedDescription)"
        }
    }
    #endif
}

#Preview {
    DataControlsScreen()
}
