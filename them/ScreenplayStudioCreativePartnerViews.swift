import Foundation
import SwiftUI
import ScreenplayStudio

struct ScreenplayStudioCreativePartnerModeInput: Equatable {
    let rawValue: String
    let title: String
    let shortTitle: String
    let summary: String
}

struct ScreenplayStudioCreativePartnerVoicePinTurnInput: Equatable {
    let id: UUID
    let exchangeID: UUID
    let userAskLabel: String
    let fountainOutput: String
    let timestamp: Date
}

struct ScreenplayStudioCreativePartnerVoicePinExchangeInput: Equatable {
    enum Source: Equatable {
        case voice
        case typed
    }

    let id: UUID
    let prompt: String
    let source: Source
    let developmentText: String?
}

struct ScreenplayStudioCreativePartnerModePresentation: Identifiable, Equatable {
    var id: String { rawValue }

    let rawValue: String
    let title: String
    let shortTitle: String
    let summary: String
}

struct ScreenplayStudioCreativePartnerMetricPresentation: Identifiable, Equatable {
    var id: String { label }

    let label: String
    let value: String
}

struct ScreenplayStudioCreativePartnerMetaPillPresentation: Identifiable, Equatable {
    var id: String { label }

    let label: String
    let value: String
}

struct ScreenplayStudioCreativePartnerCopy: Equatable {
    let title: String
    let subtitle: String
    let modeMetaLabel: String
    let modeSectionTitle: String
    let modePickerLabel: String
    let memoryMetaLabel: String
    let outputMetaLabel: String
    let voicePinTitle: String
    let emptyVoicePinTitle: String
    let emptyVoicePinDetail: String
    let contextTitle: String
    let contextDetail: String
    let clearThreadButtonTitle: String
    let clearMemoryButtonTitle: String
    let reuseButtonTitle: String
    let toPageButtonTitle: String

    static let standard = ScreenplayStudioCreativePartnerCopy(
        title: "Creative partner",
        subtitle: "Mode, Voice Pin, and page requests move through one calmer lane.",
        modeMetaLabel: "Mode",
        modeSectionTitle: "Companion mode",
        modePickerLabel: "Companion Mode",
        memoryMetaLabel: "Memory",
        outputMetaLabel: "Output",
        voicePinTitle: "Voice Pin",
        emptyVoicePinTitle: "No active Voice Pin",
        emptyVoicePinDetail: "Dictate or send a note to keep it off the page.",
        contextTitle: "Context",
        contextDetail: "Thread memory, routing, and screenplay fixes stay attached to this same partner surface.",
        clearThreadButtonTitle: "Clear Thread",
        clearMemoryButtonTitle: "Clear Memory",
        reuseButtonTitle: "Reuse",
        toPageButtonTitle: "To Page"
    )
}

enum ScreenplayStudioCreativePartnerRoutePresentation: Equatable {
    case page
    case voicePin

    var targetLabel: String {
        switch self {
        case .page: return "Page"
        case .voicePin: return "Voice Pin"
        }
    }

    var targetSystemImage: String {
        switch self {
        case .page: return "doc.text"
        case .voicePin: return "text.bubble"
        }
    }

    var memoryValue: String {
        switch self {
        case .page: return "Project"
        case .voicePin: return "Companion"
        }
    }

    var outputValue: String {
        switch self {
        case .page: return "Page"
        case .voicePin: return "Pin"
        }
    }

    var workflowLabel: String {
        switch self {
        case .page: return "Page Write"
        case .voicePin: return "Advice"
        }
    }
}

struct ScreenplayStudioCreativePartnerLatestVoicePinPresentation: Equatable {
    let turnID: UUID
    let exchangeID: UUID
    let userAskLabel: String
    let outputExcerpt: String
    let timeAgo: String
    let accessibilityLabel: String
}

enum ScreenplayStudioCreativePartnerVoicePinContent: Equatable {
    case empty
    case latest(ScreenplayStudioCreativePartnerLatestVoicePinPresentation)
}

struct ScreenplayStudioCreativePartnerVoicePinPresentation: Equatable {
    let count: Int
    let content: ScreenplayStudioCreativePartnerVoicePinContent
}

struct ScreenplayStudioCreativePartnerPresentation: Equatable {
    let copy: ScreenplayStudioCreativePartnerCopy
    let modeOptions: [ScreenplayStudioCreativePartnerModePresentation]
    let selectedModeRawValue: String
    let selectedModeShortTitle: String
    let selectedModeSummary: String
    let route: ScreenplayStudioCreativePartnerRoutePresentation
    let routePills: [ScreenplayStudioCreativePartnerMetaPillPresentation]
    let metrics: [ScreenplayStudioCreativePartnerMetricPresentation]
    let voicePin: ScreenplayStudioCreativePartnerVoicePinPresentation
}

struct ScreenplayStudioCreativePartnerActions {
    let onSelectMode: (String) -> Void
    let onReuseVoicePin: (UUID) -> Void
    let onSendVoicePinToPage: (UUID) -> Void
    let onClearThread: () -> Void
    let onClearMemory: () -> Void
}

enum ScreenplayStudioCreativePartnerPresentationPlanner {
    static func make(
        modes: [ScreenplayStudioCreativePartnerModeInput],
        selectedModeRawValue: String,
        routesToPage: Bool,
        recentTurnCount: Int,
        queuedFixCount: Int,
        voicePinTurns: [ScreenplayStudioCreativePartnerVoicePinTurnInput],
        exchanges: [ScreenplayStudioCreativePartnerVoicePinExchangeInput],
        now: Date = Date()
    ) -> ScreenplayStudioCreativePartnerPresentation {
        let modeOptions = modes.map { mode in
            ScreenplayStudioCreativePartnerModePresentation(
                rawValue: mode.rawValue,
                title: mode.title,
                shortTitle: mode.shortTitle,
                summary: mode.summary
            )
        }
        let selectedMode = modeOptions.first { $0.rawValue == selectedModeRawValue }
            ?? modeOptions.first
        let copy = ScreenplayStudioCreativePartnerCopy.standard
        let route: ScreenplayStudioCreativePartnerRoutePresentation = routesToPage
            ? .page
            : .voicePin

        return ScreenplayStudioCreativePartnerPresentation(
            copy: copy,
            modeOptions: modeOptions,
            selectedModeRawValue: selectedMode?.rawValue ?? selectedModeRawValue,
            selectedModeShortTitle: selectedMode?.shortTitle ?? "",
            selectedModeSummary: selectedMode?.summary ?? "",
            route: route,
            routePills: [
                ScreenplayStudioCreativePartnerMetaPillPresentation(
                    label: copy.memoryMetaLabel,
                    value: route.memoryValue
                ),
                ScreenplayStudioCreativePartnerMetaPillPresentation(
                    label: copy.outputMetaLabel,
                    value: route.outputValue
                )
            ],
            metrics: [
                ScreenplayStudioCreativePartnerMetricPresentation(
                    label: "Turns",
                    value: "\(recentTurnCount)"
                ),
                ScreenplayStudioCreativePartnerMetricPresentation(
                    label: "Pins",
                    value: "\(voicePinTurns.count)"
                ),
                ScreenplayStudioCreativePartnerMetricPresentation(
                    label: "Fixes",
                    value: "\(queuedFixCount)"
                )
            ],
            voicePin: ScreenplayStudioCreativePartnerVoicePinPresentation(
                count: voicePinTurns.count,
                content: voicePinContent(
                    turns: voicePinTurns,
                    exchanges: exchanges,
                    now: now
                )
            )
        )
    }

    static func relativeTimestamp(from timestamp: Date, now: Date) -> String {
        let elapsed = max(0, Int(now.timeIntervalSince(timestamp)))
        if elapsed < 60 {
            return "\(elapsed)s ago"
        }
        if elapsed < 3_600 {
            return "\(elapsed / 60)m ago"
        }
        return "\(elapsed / 3_600)h ago"
    }

    static func resolvedVoicePinOutput(
        insertedText: String?,
        revisedBlockText: String?,
        resolvedAnchorExcerpt: String?,
        developmentText: String?,
        noteBody: String
    ) -> String {
        let candidates = [
            insertedText,
            revisedBlockText,
            resolvedAnchorExcerpt,
            developmentText,
            noteBody
        ]
        for candidate in candidates {
            let normalized = candidate?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !normalized.isEmpty {
                return normalized
            }
        }
        return ""
    }

    private static func voicePinContent(
        turns: [ScreenplayStudioCreativePartnerVoicePinTurnInput],
        exchanges: [ScreenplayStudioCreativePartnerVoicePinExchangeInput],
        now: Date
    ) -> ScreenplayStudioCreativePartnerVoicePinContent {
        guard let latestTurn = latestTurn(in: turns),
              let latestExchange = exchanges.first(where: { $0.id == latestTurn.exchangeID }) else {
            return .empty
        }

        let outputExcerpt = excerpt(from: latestTurn.fountainOutput)
        let fullOutput = latestExchange.developmentText?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let sourceLabel = latestExchange.source == .voice ? "Voice" : "Typed"

        return .latest(
            ScreenplayStudioCreativePartnerLatestVoicePinPresentation(
                turnID: latestTurn.id,
                exchangeID: latestTurn.exchangeID,
                userAskLabel: latestTurn.userAskLabel,
                outputExcerpt: outputExcerpt,
                timeAgo: relativeTimestamp(from: latestTurn.timestamp, now: now),
                accessibilityLabel: "\(sourceLabel). \(fullOutput.isEmpty ? outputExcerpt : fullOutput)"
            )
        )
    }

    private static func latestTurn(
        in turns: [ScreenplayStudioCreativePartnerVoicePinTurnInput]
    ) -> ScreenplayStudioCreativePartnerVoicePinTurnInput? {
        turns.enumerated().max { lhs, rhs in
            if lhs.element.timestamp == rhs.element.timestamp {
                return lhs.offset < rhs.offset
            }
            return lhs.element.timestamp < rhs.element.timestamp
        }?.element
    }

    private static func excerpt(from output: String) -> String {
        output
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(2)
            .joined(separator: " · ")
    }
}

struct ScreenplayStudioCreativePartnerView: View {
    let presentation: ScreenplayStudioCreativePartnerPresentation
    let actions: ScreenplayStudioCreativePartnerActions

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(presentation.copy.title)
                            .font(IOThemTypography.UI.prominentCallout)
                            .foregroundStyle(Color.herText.opacity(0.90))
                        Text(presentation.copy.subtitle)
                            .font(IOThemTypography.UI.labelRegular)
                            .foregroundStyle(Color.herText.opacity(0.50))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    VStack(alignment: .trailing, spacing: 6) {
                        HStack(spacing: 8) {
                            metaPill(
                                presentation.copy.modeMetaLabel,
                                value: presentation.selectedModeShortTitle
                            )
                            targetBadge
                            workflowBadge
                        }

                        HStack(spacing: 6) {
                            ForEach(presentation.metrics) { metric in
                                metricPill(metric)
                            }
                        }
                    }
                }

                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(presentation.copy.modeSectionTitle)
                        .font(IOThemTypography.UI.label)
                        .foregroundStyle(Color.herText.opacity(0.62))
                    Spacer(minLength: 0)
                    HStack(spacing: 8) {
                        ForEach(presentation.routePills) { pill in
                            metaPill(pill.label, value: pill.value)
                        }
                    }
                }
            }

            modePicker

            Text(presentation.selectedModeSummary)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.62))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("studio.them.mode.summary")

            sectionDivider
            voicePinSection
            sectionDivider

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(presentation.copy.contextTitle)
                        .font(IOThemTypography.UI.label)
                        .foregroundStyle(Color.herText.opacity(0.62))
                    Text(presentation.copy.contextDetail)
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.50))
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 12)

                HStack(spacing: 8) {
                    Button(presentation.copy.clearThreadButtonTitle, action: actions.onClearThread)
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("studio.them.creative-partner.clear-thread")

                    Button(presentation.copy.clearMemoryButtonTitle, action: actions.onClearMemory)
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("studio.them.creative-partner.clear-memory")
                }
                .controlSize(.small)
                .foregroundStyle(Color.herText.opacity(0.82))
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.creative-partner")
    }

    private var modePicker: some View {
        Picker(
            presentation.copy.modePickerLabel,
            selection: Binding(
                get: { presentation.selectedModeRawValue },
                set: actions.onSelectMode
            )
        ) {
            ForEach(presentation.modeOptions) { mode in
                Text(mode.title)
                    .tag(mode.rawValue)
                    .accessibilityIdentifier("studio.them.mode.\(mode.rawValue)")
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .accessibilityIdentifier("studio.them.modePicker")
    }

    private var sectionDivider: some View {
        Rectangle()
            .fill(Color.herShellStroke.opacity(0.16))
            .frame(height: 1)
    }

    private func metricPill(
        _ metric: ScreenplayStudioCreativePartnerMetricPresentation
    ) -> some View {
        HStack(spacing: 6) {
            Text(metric.value)
                .font(IOThemTypography.UI.monoMicro)
                .foregroundStyle(Color.herText.opacity(0.76))
            Text(metric.label)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.48))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(Color.white.opacity(0.30))
        .overlay(
            Capsule()
                .stroke(Color.herShellStroke.opacity(0.14), lineWidth: 1)
        )
        .clipShape(Capsule())
    }

    private func metaPill(_ label: String, value: String) -> some View {
        HStack(spacing: 4) {
            Text(label)
                .font(IOThemTypography.UI.nanoMedium)
                .foregroundStyle(Color.herText.opacity(0.40))
            Text(value)
                .font(IOThemTypography.UI.monoNanoRegular)
                .foregroundStyle(Color.herText.opacity(0.54))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(Color.white.opacity(0.06))
        .clipShape(Capsule())
    }

    private var targetBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: presentation.route.targetSystemImage)
                .font(IOThemTypography.UI.nano)
            Text(presentation.route.targetLabel)
                .font(IOThemTypography.UI.micro)
        }
        .foregroundStyle(targetTint.opacity(0.92))
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(targetTint.opacity(0.12))
        .overlay(
            Capsule()
                .stroke(targetTint.opacity(0.24), lineWidth: 1)
        )
        .clipShape(Capsule())
    }

    private var targetTint: Color {
        switch presentation.route {
        case .page: return .green
        case .voicePin: return .blue
        }
    }

    private var workflowBadge: some View {
        Text(presentation.route.workflowLabel)
            .font(IOThemTypography.UI.micro)
            .foregroundStyle(workflowTint)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(workflowTint.opacity(0.10))
            .overlay(
                Capsule()
                    .stroke(workflowTint.opacity(0.18), lineWidth: 1)
            )
            .clipShape(Capsule())
    }

    private var workflowTint: Color {
        switch presentation.route {
        case .page: return Color.herStudioActiveFill.opacity(0.92)
        case .voicePin: return Color.blue.opacity(0.88)
        }
    }

    private var voicePinSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(presentation.copy.voicePinTitle)
                    .font(IOThemTypography.UI.label)
                    .foregroundStyle(Color.herText.opacity(0.74))
                Spacer(minLength: 0)
                if presentation.voicePin.count > 0 {
                    Text("\(presentation.voicePin.count)")
                        .font(IOThemTypography.UI.monoMicro)
                        .foregroundStyle(Color.herStudioActiveFill.opacity(0.82))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.herStudioActiveFill.opacity(0.10))
                        .clipShape(Capsule())
                }
            }

            switch presentation.voicePin.content {
            case .empty:
                emptyVoicePin
            case let .latest(latest):
                latestVoicePin(latest)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.voice-pin")
    }

    private func latestVoicePin(
        _ latest: ScreenplayStudioCreativePartnerLatestVoicePinPresentation
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(latest.userAskLabel)
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(0.84))
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(latest.timeAgo)
                    .font(IOThemTypography.UI.microMedium)
                    .foregroundStyle(Color.herText.opacity(0.40))
            }

            Text(latest.outputExcerpt)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.58))
                .lineLimit(4)
                .accessibilityLabel(latest.accessibilityLabel)
                .accessibilityIdentifier("studio.voice-pin.latest.output")

            HStack(spacing: 8) {
                Button(presentation.copy.reuseButtonTitle) {
                    actions.onReuseVoicePin(latest.exchangeID)
                }
                .buttonStyle(.borderless)
                .font(IOThemTypography.UI.labelMedium)
                .accessibilityIdentifier("studio.them.voice-pin.latest.reuse")

                Button(presentation.copy.toPageButtonTitle) {
                    actions.onSendVoicePinToPage(latest.exchangeID)
                }
                .buttonStyle(.borderless)
                .font(IOThemTypography.UI.labelMedium)
                .foregroundStyle(Color.accentColor.opacity(0.84))
                .accessibilityIdentifier("studio.them.voice-pin.latest.to-page")
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.black.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.16), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.voice-pin.latest")
    }

    private var emptyVoicePin: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.herStudioActiveFill.opacity(0.08))
                    .frame(width: 30, height: 30)
                Image(systemName: "waveform")
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(Color.herStudioActiveFill.opacity(0.54))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(presentation.copy.emptyVoicePinTitle)
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(0.66))
                Text(presentation.copy.emptyVoicePinDetail)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.42))
                    .lineLimit(1)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 2)
        .accessibilityIdentifier("studio.them.voice-pin.empty")
    }
}
