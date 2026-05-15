import SwiftUI
#if os(macOS)
import AppKit
#endif

private enum DataControlAction: String, Identifiable {
    case clearHistory
    case clearMemories

    var id: String { rawValue }

    var title: String {
        switch self {
        case .clearHistory:
            return "Clear History"
        case .clearMemories:
            return "Delete All Memories"
        }
    }

    var message: String {
        switch self {
        case .clearHistory:
            return "This removes stored conversation history and transcript trail for this assistant context. This cannot be undone."
        case .clearMemories:
            return "This removes remembered names, themes, and continuity memory context. This cannot be undone."
        }
    }

    var confirmLabel: String {
        switch self {
        case .clearHistory:
            return "Clear History"
        case .clearMemories:
            return "Delete Memories"
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
    @State private var isRefreshingMemoryStats = false
    @State private var memoryStats: BackendMemoryStatsResponse?
    @State private var memoryStatsError = ""
    @State private var memoryStatsRefreshedAt: Date?
    @State private var statusMessage = ""
    @State private var stateVersion = ""
    @State private var showingV1LaunchDoctor = false

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

                VStack(alignment: .leading, spacing: 20) {
                    header
                    storageExplanation
                    memoryStatus
                    voiceTransportSettings
                    realtimeProviderSettings
                    visualContextSettings
                    v1LaunchDoctorEntry
                    actionButtons
                    statusRow
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 24)
                .padding(.top, 28)
                .padding(.bottom, 18)
                .frame(maxWidth: 980, maxHeight: .infinity, alignment: .topLeading)
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
            await refreshMemoryStats(force: false)
        }
        .sheet(isPresented: $showingV1LaunchDoctor) {
            V1LaunchDoctorView {
                showingV1LaunchDoctor = false
            }
            .frame(minWidth: 760, minHeight: 680)
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
                Text("UI preferences, cached session tokens, and temporary audio files used during active voice turns.")
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
                        Text("Export Memory JSON")
                            .font(.system(size: 15, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.92))
                        Text("Saves your current memory ledger to a JSON file.")
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
        }
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
                    Image(systemName: "trash")
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
                Text("Exporting memory ledger...")
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
        runningAction != nil || isExporting
    }

    private var memoryStatsSummary: String {
        if !memoryStatsError.isEmpty {
            return "Memory shape unavailable: \(memoryStatsError)"
        }
        return memoryStats?.diagnosticsSummary ?? "Memory shape has not been refreshed yet."
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
    private func runAction(_ action: DataControlAction) {
        guard runningAction == nil else { return }
        runningAction = action
        statusMessage = ""

        Task { @MainActor in
            defer { runningAction = nil }
            do {
                let result: BackendReadResult<BackendDataControlResponse>
                switch action {
                case .clearHistory:
                    result = try await BackendMemoryAPI.shared.clearHistory()
                case .clearMemories:
                    result = try await BackendMemoryAPI.shared.clearMemories()
                }
                stateVersion = result.sync.stateVersion
                statusMessage = action == .clearHistory
                    ? "History cleared."
                    : "All memories deleted."
                _ = try? await BackendMemoryAPI.shared.fetchHistory(limit: 140, force: true, sinceTurnId: nil)
                _ = try? await BackendMemoryAPI.shared.fetchMemories(limit: 72, force: true, sinceVersion: nil)
                await refreshMemoryStats(force: true)
            } catch {
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
                let result = try await BackendMemoryAPI.shared.exportMemories()
                stateVersion = result.sync.stateVersion
                let url = try writeExportFile(
                    filename: result.payload.filename,
                    json: result.payload.exportJson
                )
                statusMessage = "Memory export saved: \(url.path)"
                #if os(macOS)
                NSWorkspace.shared.activateFileViewerSelecting([url])
                #endif
            } catch {
                statusMessage = "Export failed: \(error.localizedDescription)"
            }
        }
    }

    private func writeExportFile(filename: String, json: String) throws -> URL {
        let safeName = filename.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "clementine_memory_export.json"
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
        guard let data = json.data(using: .utf8) else {
            throw NSError(
                domain: "DataControlsScreen",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Could not encode export payload."]
            )
        }
        try data.write(to: url, options: .atomic)
        return url
    }
}

#Preview {
    DataControlsScreen()
}
