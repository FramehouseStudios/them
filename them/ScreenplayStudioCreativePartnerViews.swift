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
    let emptyContextDetail: String
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
        emptyContextDetail: "Nothing is stored yet. Clear controls appear only when this partner has a thread or memory to remove.",
        clearThreadButtonTitle: "Clear Thread",
        clearMemoryButtonTitle: "Clear Memory",
        reuseButtonTitle: "Reuse Ask",
        toPageButtonTitle: "Prepare for Page"
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
    let canClearThread: Bool
    let canClearMemory: Bool
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
        hasCompanionThread: Bool,
        hasCompanionMemory: Bool,
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
            ),
            canClearThread: hasCompanionThread,
            canClearMemory: hasCompanionMemory
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

    @State private var pendingClearTarget: ClearTarget?

    private enum ClearTarget: Equatable {
        case thread
        case memory
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            creativePartnerHeader
            routeAndActivitySummary
            modeSection

            sectionDivider
            voicePinSection
            sectionDivider
            contextSection
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.creative-partner")
    }

    private var creativePartnerHeader: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(presentation.copy.title)
                .font(IOThemTypography.UI.prominentCallout)
                .foregroundStyle(Color.herText.opacity(0.94))
            Text(presentation.copy.subtitle)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var routeAndActivitySummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: presentation.route.targetSystemImage)
                    .accessibilityHidden(true)
                Text(presentation.route.workflowLabel)
                Text("to")
                    .foregroundStyle(Color.herText.opacity(0.46))
                Text(presentation.route.targetLabel)
            }
            .font(IOThemTypography.UI.captionStrong)
            .foregroundStyle(targetTint.opacity(0.92))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("studio.them.route.summary")

            VStack(alignment: .leading, spacing: 6) {
                metaRow(
                    presentation.copy.modeMetaLabel,
                    value: presentation.selectedModeShortTitle,
                    identifier: "studio.them.meta.mode"
                )
                ForEach(presentation.routePills) { pill in
                    metaRow(
                        pill.label,
                        value: pill.value,
                        identifier: "studio.them.meta.\(pill.label.lowercased())"
                    )
                }
            }

            HStack(alignment: .top, spacing: 12) {
                ForEach(presentation.metrics) { metric in
                    metricSummary(metric)
                }
            }
        }
    }

    private var modeSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(presentation.copy.modeSectionTitle)
                .font(IOThemTypography.UI.label)
                .foregroundStyle(Color.herText.opacity(0.72))

            VStack(spacing: 7) {
                ForEach(presentation.modeOptions) { mode in
                    modeButton(mode)
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(presentation.copy.modePickerLabel)
            .accessibilityIdentifier("studio.them.modePicker")

            Text(presentation.selectedModeSummary)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.72))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("studio.them.mode.summary")
        }
    }

    private var contextSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(presentation.copy.contextTitle)
                .font(IOThemTypography.UI.label)
                .foregroundStyle(Color.herText.opacity(0.72))
            Text(presentation.copy.contextDetail)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.66))
                .fixedSize(horizontal: false, vertical: true)

            if presentation.canClearThread || presentation.canClearMemory {
                if pendingClearTarget != nil {
                    clearConfirmationPanel
                } else {
                    clearActionButtons
                }
            } else {
                Text(presentation.copy.emptyContextDetail)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.58))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("studio.them.creative-partner.context.empty")
            }
        }
    }

    private var clearActionButtons: some View {
        VStack(spacing: 8) {
            if presentation.canClearThread {
                Button(role: .destructive) {
                    pendingClearTarget = .thread
                } label: {
                    Label(presentation.copy.clearThreadButtonTitle, systemImage: "text.bubble")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.bordered)
                .accessibilityHint("Opens a confirmation. Screenplay pages stay intact.")
                .accessibilityIdentifier("studio.them.creative-partner.clear-thread")
            }

            if presentation.canClearMemory {
                Button(role: .destructive) {
                    pendingClearTarget = .memory
                } label: {
                    Label(presentation.copy.clearMemoryButtonTitle, systemImage: "brain.head.profile")
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.bordered)
                .accessibilityHint("Opens a confirmation. Project facts stay intact.")
                .accessibilityIdentifier("studio.them.creative-partner.clear-memory")
            }
        }
        .controlSize(.regular)
    }

    private var clearConfirmationPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(clearConfirmationTitle, systemImage: "exclamationmark.triangle")
                .font(IOThemTypography.UI.calloutStrong)
                .foregroundStyle(Color.herText.opacity(0.90))

            Text(clearConfirmationMessage)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                Button("Cancel") {
                    pendingClearTarget = nil
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity, minHeight: 44)
                .accessibilityIdentifier("studio.them.creative-partner.clear.cancel")

                Button(clearConfirmationButtonTitle, role: .destructive) {
                    confirmPendingClear()
                }
                .buttonStyle(.borderedProminent)
                .frame(maxWidth: .infinity, minHeight: 44)
                .accessibilityIdentifier(clearConfirmationButtonIdentifier)
            }
            .controlSize(.regular)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.herText.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.red.opacity(0.24), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.them.creative-partner.clear.confirmation")
    }

    private var clearConfirmationButtonTitle: String {
        switch pendingClearTarget {
        case .thread:
            return presentation.copy.clearThreadButtonTitle
        case .memory:
            return presentation.copy.clearMemoryButtonTitle
        case nil:
            return "Clear"
        }
    }

    private var clearConfirmationButtonIdentifier: String {
        switch pendingClearTarget {
        case .thread:
            return "studio.them.creative-partner.clear-thread.confirm"
        case .memory:
            return "studio.them.creative-partner.clear-memory.confirm"
        case nil:
            return "studio.them.creative-partner.clear.confirm"
        }
    }

    private func confirmPendingClear() {
        let target = pendingClearTarget
        pendingClearTarget = nil
        switch target {
        case .thread:
            actions.onClearThread()
        case .memory:
            actions.onClearMemory()
        case nil:
            break
        }
    }

    private var clearConfirmationTitle: String {
        switch pendingClearTarget {
        case .thread:
            return "Clear this Voice Pin thread?"
        case .memory:
            return "Clear this companion memory?"
        case nil:
            return "Confirm clear"
        }
    }

    private var clearConfirmationMessage: String {
        switch pendingClearTarget {
        case .thread:
            return "This removes the Voice Pin conversation. Screenplay pages stay intact."
        case .memory:
            return "This removes learned companion context. Screenplay pages and project facts stay intact."
        case nil:
            return "Screenplay pages and project facts stay intact."
        }
    }

    private var sectionDivider: some View {
        Rectangle()
            .fill(Color.herShellStroke.opacity(0.16))
            .frame(height: 1)
    }

    private func metricSummary(
        _ metric: ScreenplayStudioCreativePartnerMetricPresentation
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(metric.value)
                .font(IOThemTypography.UI.compactTitle)
                .foregroundStyle(Color.herText.opacity(0.88))
            Text(metric.label)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.58))
        }
        .frame(maxWidth: .infinity, minHeight: 36, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("studio.them.metric.\(metric.label.lowercased())")
    }

    private func metaRow(
        _ label: String,
        value: String,
        identifier: String
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(label)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.52))
            Spacer(minLength: 8)
            Text(value)
                .font(IOThemTypography.UI.labelMedium)
                .foregroundStyle(Color.herText.opacity(0.76))
                .multilineTextAlignment(.trailing)
        }
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier(identifier)
    }

    private func modeButton(
        _ mode: ScreenplayStudioCreativePartnerModePresentation
    ) -> some View {
        let isSelected = mode.rawValue == presentation.selectedModeRawValue

        return Button {
            actions.onSelectMode(mode.rawValue)
        } label: {
            HStack(spacing: 10) {
                Text(mode.title)
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(isSelected ? 0.94 : 0.78))
                Spacer(minLength: 8)
                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.herStudioActiveFill.opacity(0.92))
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(
                        isSelected
                            ? Color.herStudioActiveFill.opacity(0.14)
                            : Color.white.opacity(0.22)
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(
                        isSelected
                            ? Color.herStudioActiveFill.opacity(0.36)
                            : Color.herShellStroke.opacity(0.18),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .accessibilityLabel("\(mode.title). \(mode.summary)")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
        .accessibilityIdentifier("studio.them.mode.\(mode.rawValue)")
    }

    private var targetTint: Color {
        switch presentation.route {
        case .page: return .green
        case .voicePin: return .blue
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
            Text(latest.userAskLabel)
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.herText.opacity(0.86))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Text(latest.timeAgo)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.52))

            Text(latest.outputExcerpt)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.68))
                .lineLimit(6)
                .accessibilityLabel(latest.accessibilityLabel)
                .accessibilityIdentifier("studio.voice-pin.latest.output")

            VStack(spacing: 8) {
                Button {
                    actions.onReuseVoicePin(latest.exchangeID)
                } label: {
                    Label(presentation.copy.reuseButtonTitle, systemImage: "arrow.uturn.backward")
                        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .font(IOThemTypography.UI.labelMedium)
                .accessibilityHint("Loads this ask back into the composer without sending it.")
                .accessibilityIdentifier("studio.them.voice-pin.latest.reuse")

                Button {
                    actions.onSendVoicePinToPage(latest.exchangeID)
                } label: {
                    Label(presentation.copy.toPageButtonTitle, systemImage: "doc.text")
                        .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
                }
                .buttonStyle(.borderedProminent)
                .font(IOThemTypography.UI.labelMedium)
                .accessibilityHint("Loads this ask into the composer and selects the Page destination.")
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
                    .foregroundStyle(Color.herText.opacity(0.58))
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 2)
        .accessibilityIdentifier("studio.them.voice-pin.empty")
    }
}
