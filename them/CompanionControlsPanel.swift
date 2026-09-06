// D009 I4: moved verbatim out of RootExperienceView.swift; `private` dropped. Raw fonts predate the design-system guard, see its allowlist.
import SwiftUI

struct CompanionControlsPanel: View {
    @ObservedObject var bridge: ScreenplayLiveDraftBridge
    let onDone: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        header
                        modeSection
                        analyticsSection
                        threadSection
                        controlsSection
                    }
                    .padding(24)
                    .frame(maxWidth: 980, alignment: .topLeading)
                }
            }
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Done", action: onDone)
                }
            }
        }
        .task {
            await bridge.hydrateBackendCompanionState(force: false)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Companion")
                .font(.system(size: 32, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.95))
            Text("Shared companion mode, memory lane, and recent thread across Home and Studio.")
                .font(.system(size: 14, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.72))
        }
    }

    private var modeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mode")
                .font(.system(size: 15, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.90))
            HStack(spacing: 10) {
                ForEach(StudioCompanionMode.allCases) { mode in
                    let isActive = bridge.companionMode == mode
                    Button {
                        bridge.setCompanionMode(mode)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(mode.title)
                                .font(.system(size: 13, weight: .semibold, design: .default))
                                .foregroundColor(.herText.opacity(isActive ? 0.94 : 0.76))
                            Text(mode.summary)
                                .font(.system(size: 11, weight: .regular, design: .default))
                                .foregroundColor(.herText.opacity(isActive ? 0.78 : 0.58))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(isActive ? Color.white.opacity(0.22) : Color.white.opacity(0.12))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(Color.white.opacity(isActive ? 0.26 : 0.16), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var analyticsSection: some View {
        let analytics = bridge.companionAnalytics
        return VStack(alignment: .leading, spacing: 12) {
            Text("Analytics")
                .font(.system(size: 15, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.90))
            HStack(spacing: 10) {
                metricCard("Turns", value: "\(analytics.totalTurns)")
                metricCard("Home", value: "\(analytics.homeTurns)")
                metricCard("Studio", value: "\(analytics.studioTurns)")
                metricCard("Voice", value: "\(analytics.voiceTurns)")
                metricCard("Typed", value: "\(analytics.typedTurns)")
            }
            HStack(spacing: 10) {
                metricCard("Mode Switches", value: "\(analytics.modeSwitches)")
                metricCard("Memory Clears", value: "\(analytics.memoryClears)")
                metricCard("Thread Clears", value: "\(analytics.threadClears)")
            }
            if let lastSurface = analytics.lastSurface, let lastSource = analytics.lastSource {
                Text("Last companion interaction: \(lastSurface.title) via \(lastSource.rawValue).")
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.62))
            }
        }
    }

    private var threadSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Companion Thread")
                .font(.system(size: 15, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.90))
            if bridge.companionRecentTurns.isEmpty {
                Text("No companion turns yet.")
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.62))
            } else {
                ForEach(Array(bridge.companionRecentTurns.suffix(6).reversed()), id: \.id) { turn in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(turn.user)
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundColor(.herText.opacity(0.86))
                        Text(turn.assistant)
                            .font(.system(size: 12, weight: .regular, design: .default))
                            .foregroundColor(.herText.opacity(0.70))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.white.opacity(0.12))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.white.opacity(0.14), lineWidth: 1)
                    )
                }
            }
        }
    }

    private var controlsSection: some View {
        HStack(spacing: 10) {
            Button("Clear Companion Memory") {
                bridge.clearCompanionMemory()
            }
            .buttonStyle(.borderedProminent)
            .tint(.white.opacity(0.22))

            Button("Clear Companion Thread") {
                bridge.clearCompanionPinHistory()
            }
            .buttonStyle(.bordered)
        }
        .foregroundColor(.herText.opacity(0.92))
    }

    private func metricCard(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(.system(size: 18, weight: .semibold, design: .default))
                .foregroundColor(.herText.opacity(0.90))
            Text(title)
                .font(.system(size: 10, weight: .regular, design: .default))
                .foregroundColor(.herText.opacity(0.60))
                .textCase(.uppercase)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.14), lineWidth: 1)
        )
    }
}
