import SwiftUI
import ScreenplayStudio

struct HomeUtilitySheetBar: View {
    let title: String
    let identifier: String
    let onDone: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text(title)
                .font(IOThemTypography.UI.utilitySheetTitle)
                .foregroundColor(.herText.opacity(0.96))
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 8)

            Button(action: onDone) {
                Text("Done")
                    .font(IOThemTypography.UI.prominentCallout)
                    .frame(minWidth: 64, minHeight: 44)
            }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.22))
                .foregroundColor(.herText.opacity(0.94))
                .contentShape(Rectangle())
                .accessibilityIdentifier("\(identifier).done")
                .accessibilityHint("Returns to Clementine without starting a conversation.")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.08))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.white.opacity(0.12))
                .frame(height: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("\(identifier).navigation")
    }
}


struct CompanionControlsPanel: View {
    @ObservedObject var bridge: ScreenplayLiveDraftBridge
    let onDone: () -> Void

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 0) {
                    HomeUtilitySheetBar(
                        title: "Companion Controls",
                        identifier: "companion-controls",
                        onDone: onDone
                    )

                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            header
                            modeSection
                            analyticsSection
                            threadSection
                            controlsSection
                        }
                        .padding(contentPadding)
                        .frame(maxWidth: 980, alignment: .topLeading)
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .task {
            await bridge.hydrateBackendCompanionState(force: false)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("companion-controls.screen")
    }

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    private var contentPadding: CGFloat {
        isCompact ? 16 : 24
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Clementine")
                .font(IOThemTypography.UI.companionTitle(isCompact: isCompact))
                .foregroundColor(.herText.opacity(0.95))
            Text("Shape how your creative companion supports the shared memory lane and recent thread across Home and Studio.")
                .font(IOThemTypography.UI.supportingBody)
                .foregroundColor(.herText.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("companion-controls.header")
    }

    private var modeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mode")
                .font(IOThemTypography.UI.bodyStrong)
                .foregroundColor(.herText.opacity(0.90))
            LazyVGrid(columns: modeColumns, alignment: .leading, spacing: 10) {
                ForEach(StudioCompanionMode.allCases) { mode in
                    let isActive = bridge.companionMode == mode
                    Button {
                        bridge.setCompanionMode(mode)
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(mode.title)
                                .font(IOThemTypography.UI.calloutStrong)
                                .foregroundColor(.herText.opacity(isActive ? 0.94 : 0.76))
                            Text(mode.summary)
                                .font(IOThemTypography.UI.labelRegular)
                                .foregroundColor(.herText.opacity(isActive ? 0.78 : 0.58))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
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
                    .accessibilityIdentifier("companion-controls.mode.\(mode.rawValue)")
                    .accessibilityLabel("\(mode.title) mode")
                    .accessibilityHint(mode.summary)
                    .accessibilityAddTraits(isActive ? .isSelected : [])
                }
            }
        }
        .accessibilityIdentifier("companion-controls.modes")
    }

    private var modeColumns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 10, alignment: .top),
            count: isCompact ? 1 : max(1, StudioCompanionMode.allCases.count)
        )
    }

    private var analyticsSection: some View {
        let analytics = bridge.companionAnalytics
        return VStack(alignment: .leading, spacing: 12) {
            Text("Analytics")
                .font(IOThemTypography.UI.bodyStrong)
                .foregroundColor(.herText.opacity(0.90))
            LazyVGrid(columns: metricColumns, alignment: .leading, spacing: 10) {
                metricCard("Turns", value: "\(analytics.totalTurns)")
                metricCard("Home", value: "\(analytics.homeTurns)")
                metricCard("Studio", value: "\(analytics.studioTurns)")
                metricCard("Voice", value: "\(analytics.voiceTurns)")
                metricCard("Typed", value: "\(analytics.typedTurns)")
                metricCard("Mode Switches", value: "\(analytics.modeSwitches)")
                metricCard("Memory Clears", value: "\(analytics.memoryClears)")
                metricCard("Thread Clears", value: "\(analytics.threadClears)")
            }
            if let lastSurface = analytics.lastSurface, let lastSource = analytics.lastSource {
                Text("Last companion interaction: \(lastSurface.title) via \(lastSource.rawValue).")
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundColor(.herText.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityIdentifier("companion-controls.analytics")
    }

    private var metricColumns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 10, alignment: .top),
            count: isCompact ? 2 : 4
        )
    }

    private var threadSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Companion Thread")
                .font(IOThemTypography.UI.bodyStrong)
                .foregroundColor(.herText.opacity(0.90))
            if bridge.companionRecentTurns.isEmpty {
                Text("No companion turns yet.")
                    .font(IOThemTypography.UI.callout)
                    .foregroundColor(.herText.opacity(0.62))
            } else {
                ForEach(Array(bridge.companionRecentTurns.suffix(6).reversed()), id: \.id) { turn in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(turn.user)
                            .font(IOThemTypography.UI.captionStrong)
                            .foregroundColor(.herText.opacity(0.86))
                        Text(turn.assistant)
                            .font(IOThemTypography.UI.caption)
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
        .accessibilityIdentifier("companion-controls.thread")
    }

    @ViewBuilder
    private var controlsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Reset Clementine data")
                .font(IOThemTypography.UI.bodyStrong)
                .foregroundColor(.herText.opacity(0.90))

            if isCompact {
                VStack(spacing: 10) {
                    clearMemoryButton
                    clearThreadButton
                }
            } else {
                HStack(spacing: 10) {
                    clearMemoryButton
                    clearThreadButton
                }
            }
        }
        .accessibilityIdentifier("companion-controls.reset")
    }

    private var clearMemoryButton: some View {
        Button {
            bridge.clearCompanionMemory()
        } label: {
            Text("Clear Companion Memory")
                .frame(maxWidth: isCompact ? .infinity : nil, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(.white.opacity(0.22))
        .foregroundColor(.herText.opacity(0.92))
        .frame(maxWidth: isCompact ? .infinity : nil, minHeight: 44)
        .accessibilityIdentifier("companion-controls.clear-memory")
        .accessibilityHint("Removes Clementine's saved creative companion memory.")
    }

    private var clearThreadButton: some View {
        Button {
            bridge.clearCompanionPinHistory()
        } label: {
            Text("Clear Companion Thread")
                .frame(maxWidth: isCompact ? .infinity : nil, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .foregroundColor(.herText.opacity(0.92))
        .frame(maxWidth: isCompact ? .infinity : nil, minHeight: 44)
        .accessibilityIdentifier("companion-controls.clear-thread")
        .accessibilityHint("Removes the recent conversation shown to Clementine.")
    }

    private func metricCard(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(IOThemTypography.UI.metricValue)
                .foregroundColor(.herText.opacity(0.90))
            Text(title)
                .font(IOThemTypography.UI.microRegular)
                .foregroundColor(.herText.opacity(0.60))
                .textCase(.uppercase)
        }
        .padding(12)
        .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
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
