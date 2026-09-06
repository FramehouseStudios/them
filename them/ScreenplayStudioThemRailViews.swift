import SwiftUI
import ScreenplayStudio

struct ScreenplayStudioThemRailOverviewPresentation: Equatable {
    let title: String
    let subtitle: String
    let detail: String

    static let standard = ScreenplayStudioThemRailOverviewPresentation(
        title: "THEM",
        subtitle: "Keep THEM's instincts, memory, and craft signals together.",
        detail: "The rail should feel like one creative partner. Companion context, live asks, and screenplay intelligence now move through the same calmer surface."
    )
}

struct ScreenplayStudioLiveIntentPresentation: Equatable {
    let isVisible: Bool
    let presenceTitle: String
    let intentLabel: String?
    let presenceDetail: String?
    let proactivePrompt: String?
    let proactiveIntentKind: CreativeIntentKind?
}

enum ScreenplayStudioMomentumPresentation: Equatable {
    case hidden
    case loading
    case failure(message: String)
    case insight(
        nudge: BackendBlockSignalNudgeState,
        history: BackendBlockSignalHistoryTrendState
    )
}

struct ScreenplayStudioSurfaceMixStatPresentation: Identifiable, Equatable {
    var id: String { label }

    let label: String
    let value: String
}

struct ScreenplayStudioSurfaceMixPresentation: Equatable {
    let stats: [ScreenplayStudioSurfaceMixStatPresentation]
    let detail: String
}

struct ScreenplayStudioThemRailPresentation: Equatable {
    let overview: ScreenplayStudioThemRailOverviewPresentation
    let liveIntent: ScreenplayStudioLiveIntentPresentation
    let momentum: ScreenplayStudioMomentumPresentation
    let surfaceMix: ScreenplayStudioSurfaceMixPresentation
}

struct ScreenplayStudioThemRailActions {
    let onRefreshMomentum: () -> Void
    let onUseLiveIntentPrompt: (String, CreativeIntentKind?) -> Void
}

enum ScreenplayStudioThemRailPresentationPlanner {
    static func make(
        signalState: CreativeCompanionSignalState,
        analytics: ScreenplayCompanionAnalyticsSnapshot,
        isBlockSignalLoading: Bool,
        blockSignalErrorText: String,
        blockSignalNudge: BackendBlockSignalNudgeState,
        blockSignalHistory: BackendBlockSignalHistoryTrendState
    ) -> ScreenplayStudioThemRailPresentation {
        ScreenplayStudioThemRailPresentation(
            overview: .standard,
            liveIntent: liveIntent(from: signalState),
            momentum: momentum(
                isLoading: isBlockSignalLoading,
                errorText: blockSignalErrorText,
                nudge: blockSignalNudge,
                history: blockSignalHistory
            ),
            surfaceMix: surfaceMix(from: analytics)
        )
    }

    static func liveIntent(
        from signalState: CreativeCompanionSignalState
    ) -> ScreenplayStudioLiveIntentPresentation {
        ScreenplayStudioLiveIntentPresentation(
            isVisible: signalState.hasContent,
            presenceTitle: signalState.presence.title.isEmpty
                ? "Creative Presence"
                : signalState.presence.title,
            intentLabel: optionalRawText(signalState.intent.label),
            presenceDetail: optionalRawText(signalState.presence.detail),
            proactivePrompt: optionalRawText(signalState.proactiveSuggestion?.prompt ?? ""),
            proactiveIntentKind: signalState.proactiveSuggestion == nil
                ? nil
                : signalState.intent.kind
        )
    }

    static func momentum(
        isLoading: Bool,
        errorText: String,
        nudge: BackendBlockSignalNudgeState,
        history: BackendBlockSignalHistoryTrendState
    ) -> ScreenplayStudioMomentumPresentation {
        if isLoading {
            return .loading
        }

        if !errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .failure(message: errorText)
        }

        if nudge.shouldRender || history.shouldRender {
            return .insight(nudge: nudge, history: history)
        }

        return .hidden
    }

    static func surfaceMix(
        from analytics: ScreenplayCompanionAnalyticsSnapshot
    ) -> ScreenplayStudioSurfaceMixPresentation {
        ScreenplayStudioSurfaceMixPresentation(
            stats: [
                ScreenplayStudioSurfaceMixStatPresentation(label: "Home", value: "\(analytics.homeTurns)"),
                ScreenplayStudioSurfaceMixStatPresentation(label: "Studio", value: "\(analytics.studioTurns)"),
                ScreenplayStudioSurfaceMixStatPresentation(label: "Voice", value: "\(analytics.voiceTurns)"),
                ScreenplayStudioSurfaceMixStatPresentation(label: "Typed", value: "\(analytics.typedTurns)")
            ],
            detail: "Companion turns stay attached to the same creative lane, whether they start on the page, in voice, or in the command bar."
        )
    }

    private static func optionalRawText(_ value: String) -> String? {
        value.isEmpty ? nil : value
    }
}

struct ScreenplayStudioThemRailView<LeadingContent: View, TrailingContent: View>: View {
    let presentation: ScreenplayStudioThemRailPresentation
    let actions: ScreenplayStudioThemRailActions
    private let leadingContent: LeadingContent
    private let trailingContent: TrailingContent

    init(
        presentation: ScreenplayStudioThemRailPresentation,
        actions: ScreenplayStudioThemRailActions,
        @ViewBuilder leadingContent: () -> LeadingContent,
        @ViewBuilder trailingContent: () -> TrailingContent
    ) {
        self.presentation = presentation
        self.actions = actions
        self.leadingContent = leadingContent()
        self.trailingContent = trailingContent()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            ScreenplayStudioThemRailOverviewView(presentation: presentation.overview)
            ScreenplayStudioLiveIntentView(
                presentation: presentation.liveIntent,
                onUsePrompt: actions.onUseLiveIntentPrompt
            )
            leadingContent
            ScreenplayStudioMomentumView(
                presentation: presentation.momentum,
                onRefresh: actions.onRefreshMomentum
            )
            trailingContent
            ScreenplayStudioSurfaceMixView(presentation: presentation.surfaceMix)
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.herShellPanelSoft.opacity(0.96))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.40), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.panel")
    }
}

struct ScreenplayStudioThemRailOverviewView: View {
    let presentation: ScreenplayStudioThemRailOverviewPresentation

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(presentation.title)
                .font(IOThemTypography.UI.editorialTitle)
                .foregroundStyle(Color.herText.opacity(0.92))
            Text(presentation.subtitle)
                .font(IOThemTypography.UI.bodyStrong)
                .foregroundStyle(Color.herText.opacity(0.82))
            Text(presentation.detail)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.60))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("studio.them.intro")
    }
}

struct ScreenplayStudioLiveIntentView: View {
    let presentation: ScreenplayStudioLiveIntentPresentation
    let onUsePrompt: (String, CreativeIntentKind?) -> Void

    var body: some View {
        if presentation.isVisible {
            intelligenceCollectionCard(title: "Live Intent", icon: "dot.radiowaves.left.and.right") {
                VStack(alignment: .leading, spacing: 8) {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 8) {
                            Text(presentation.presenceTitle)
                                .font(IOThemTypography.UI.calloutStrong)
                                .foregroundStyle(Color.herText.opacity(0.88))
                                .fixedSize(horizontal: true, vertical: false)
                            Spacer(minLength: 0)
                            if let intentLabel = presentation.intentLabel {
                                intentText(intentLabel)
                                    .fixedSize(horizontal: true, vertical: false)
                            }
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text(presentation.presenceTitle)
                                .font(IOThemTypography.UI.calloutStrong)
                                .foregroundStyle(Color.herText.opacity(0.88))
                            if let intentLabel = presentation.intentLabel {
                                intentText(intentLabel)
                            }
                        }
                    }

                    if let presenceDetail = presentation.presenceDetail {
                        Text(presenceDetail)
                            .font(IOThemTypography.UI.caption)
                            .foregroundStyle(Color.herText.opacity(0.72))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if let proactivePrompt = presentation.proactivePrompt {
                        Button {
                            onUsePrompt(proactivePrompt, presentation.proactiveIntentKind)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Label("Try this ask", systemImage: "arrow.up.right")
                                    .font(IOThemTypography.UI.microMedium)
                                    .foregroundStyle(Color.herStudioActiveFill.opacity(0.86))
                                Text(proactivePrompt)
                                    .font(IOThemTypography.UI.captionMedium)
                                    .foregroundStyle(Color.herText.opacity(0.84))
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                            .contentShape(Rectangle())
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Color.herStudioActiveFill.opacity(0.08))
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(Color.herStudioActiveFill.opacity(0.20), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("Try this ask. \(proactivePrompt)")
                        .accessibilityHint("Loads this ask into the companion composer without sending it.")
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier("studio.them.live-intent.use-prompt")
                    }
                }
            }
        }
    }

    private func intentText(_ value: String) -> some View {
        Text(value)
            .font(IOThemTypography.UI.label)
            .foregroundStyle(Color.herText.opacity(0.74))
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct ScreenplayStudioMomentumView: View {
    let presentation: ScreenplayStudioMomentumPresentation
    let onRefresh: () -> Void

    @ViewBuilder
    var body: some View {
        switch presentation {
        case .hidden:
            EmptyView()
        case .loading:
            intelligenceCollectionCard(title: "Momentum", icon: "hourglass") {
                HStack(spacing: 10) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Checking writing momentum without interrupting the page.")
                        .font(IOThemTypography.UI.captionMedium)
                        .foregroundStyle(Color.herText.opacity(0.70))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityIdentifier("studio.them.momentum.loading")
        case .failure(let message):
            intelligenceCollectionCard(title: "Momentum", icon: "exclamationmark.triangle") {
                VStack(alignment: .leading, spacing: 8) {
                    Text(message)
                        .font(IOThemTypography.UI.captionMedium)
                        .foregroundStyle(Color.herText.opacity(0.70))
                        .fixedSize(horizontal: false, vertical: true)
                    Button(action: onRefresh) {
                        Label("Retry", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityIdentifier("studio.them.momentum.retry")
                }
            }
            .accessibilityIdentifier("studio.them.momentum.error")
        case .insight(let nudge, let history):
            momentumInsight(nudge: nudge, history: history)
                .accessibilityIdentifier("studio.them.momentum.insight")
        }
    }

    private func momentumInsight(
        nudge: BackendBlockSignalNudgeState,
        history: BackendBlockSignalHistoryTrendState
    ) -> some View {
        let title = nudge.shouldRender ? nudge.title : history.title
        let icon = nudge.shouldRender
            ? (nudge.level == .high ? "sparkles.rectangle.stack" : "sparkle.magnifyingglass")
            : "chart.xyaxis.line"

        return intelligenceCollectionCard(title: title, icon: icon) {
            VStack(alignment: .leading, spacing: 10) {
                if nudge.shouldRender {
                    HStack(spacing: 8) {
                        Text(nudge.scoreLabel)
                            .font(IOThemTypography.UI.editorialMetric)
                            .foregroundStyle(momentumTint(nudge.level))
                        if !nudge.topSignalLabel.isEmpty {
                            Text(nudge.topSignalLabel)
                                .font(IOThemTypography.UI.micro)
                                .foregroundStyle(Color.herText.opacity(0.62))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.white.opacity(0.16))
                                .clipShape(Capsule())
                        }
                        Spacer(minLength: 0)
                        Button(action: onRefresh) {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("Refresh momentum signal")
                        .accessibilityLabel("Refresh momentum")
                        .accessibilityIdentifier("studio.them.momentum.refresh")
                    }

                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.herShellStroke.opacity(0.20))
                            Capsule()
                                .fill(momentumTint(nudge.level).opacity(0.58))
                                .frame(width: max(8, geometry.size.width * nudge.progress))
                        }
                    }
                    .frame(height: 5)

                    Text(nudge.summary)
                        .font(IOThemTypography.UI.captionStrong)
                        .foregroundStyle(Color.herText.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(nudge.detailLabel)
                        .font(IOThemTypography.UI.microMedium)
                        .foregroundStyle(Color.herText.opacity(0.48))
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    HStack(spacing: 8) {
                        Text(history.trendLabel)
                            .font(IOThemTypography.UI.captionStrong)
                            .foregroundStyle(momentumTint(history.latestLevel))
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                        Button(action: onRefresh) {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("Refresh momentum history")
                        .accessibilityLabel("Refresh momentum")
                        .accessibilityIdentifier("studio.them.momentum.refresh")
                    }
                }

                if history.shouldRender {
                    momentumHistorySparkline(history)
                }
            }
        }
    }

    private func momentumHistorySparkline(
        _ history: BackendBlockSignalHistoryTrendState
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(Array(history.sparklineScores.enumerated()), id: \.offset) { _, score in
                    Capsule()
                        .fill(momentumTint(history.latestLevel).opacity(0.30 + (0.42 * score)))
                        .frame(width: 5, height: CGFloat(max(5, 26 * score)))
                }
                Spacer(minLength: 0)
            }
            .frame(height: 28)

            HStack(spacing: 8) {
                Text(history.countLabel)
                Text(history.levelMixLabel)
                Spacer(minLength: 0)
            }
            .font(IOThemTypography.UI.microMedium)
            .foregroundStyle(Color.herText.opacity(0.48))
        }
    }

    private func momentumTint(_ level: BackendBlockSignalLevel) -> Color {
        switch level {
        case .high: return Color.red.opacity(0.74)
        case .medium: return Color.orange.opacity(0.76)
        case .low, .unknown: return Color.green.opacity(0.66)
        }
    }
}

struct ScreenplayStudioSurfaceMixView: View {
    let presentation: ScreenplayStudioSurfaceMixPresentation

    var body: some View {
        intelligenceCollectionCard(title: "Surface mix", icon: "waveform.path.ecg") {
            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 8),
                    GridItem(.flexible(), spacing: 8)
                ],
                spacing: 8
            ) {
                ForEach(presentation.stats) { stat in
                    directionOneMiniStat(stat.label, value: stat.value)
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier(
                            "studio.them.surface-mix.\(stat.label.lowercased())"
                        )
                }
            }

            Text(presentation.detail)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.54))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityIdentifier("studio.them.surface-mix")
    }
}
