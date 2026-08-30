import SwiftUI
import ScreenplayStudio

struct ScreenplayCraftReaderPreviewWarningState: Identifiable, Equatable {
    let id: String
    let code: String
    let severityLabel: String
    let message: String
}

struct ScreenplayCraftReaderPreviewCharacterState: Identifiable, Equatable {
    let id: String
    let name: String
    let shareLabel: String
    let detailLabel: String
}

struct ScreenplayCraftReaderPreviewSceneState: Identifiable, Equatable {
    let id: String
    let signalLabel: String
    let heading: String
    let detailLabel: String
}

struct ScreenplayCraftReaderPreviewState: Equatable {
    let pagesLabel: String
    let scenesLabel: String
    let dialogueLabel: String
    let averageSceneLabel: String
    let paceLabel: String
    let summary: String
    let characters: [ScreenplayCraftReaderPreviewCharacterState]
    let hiddenCharacterCount: Int
    let sceneSignals: [ScreenplayCraftReaderPreviewSceneState]
    let hiddenSceneSignalCount: Int
    let warnings: [ScreenplayCraftReaderPreviewWarningState]
    let hiddenWarningCount: Int

    static func make(report: ScreenplayCraftCoverageSimulationReport) -> ScreenplayCraftReaderPreviewState {
        let warningStates = report.warnings.map { warning in
            let cleanSeverity = warning.severity.trimmingCharacters(in: .whitespacesAndNewlines)
            return ScreenplayCraftReaderPreviewWarningState(
                id: warning.id,
                code: warning.code,
                severityLabel: cleanSeverity.isEmpty ? "SIGNAL" : cleanSeverity.uppercased(),
                message: warning.message.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }
        let visibleWarnings = Array(warningStates.prefix(3))
        let cleanIntensity = report.pacing.intensity.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSummary = report.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        let dialogueRatio = min(max(report.overview.dialogueRatio, 0), 1)
        let averageSceneLines = max(report.overview.avgSceneLengthLines, 0)
        let characterStates = report.characters.compactMap { character -> ScreenplayCraftReaderPreviewCharacterState? in
            let cleanName = character.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanName.isEmpty else { return nil }
            let share = min(max(character.share, 0), 1)
            let sceneCount = max(character.sceneCount, 0)
            let lineCount = max(character.lineCount, 0)
            return ScreenplayCraftReaderPreviewCharacterState(
                id: character.id,
                name: cleanName,
                shareLabel: "\(Int((share * 100).rounded()))%",
                detailLabel: "\(sceneCount) scene\(sceneCount == 1 ? "" : "s") · \(lineCount) line\(lineCount == 1 ? "" : "s")"
            )
        }
        let visibleCharacters = Array(characterStates.prefix(3))

        var sceneOrder: [String] = []
        var sceneStates: [String: ScreenplayCraftReaderPreviewSceneState] = [:]
        func collectSceneSignals(_ signals: [ScreenplayCraftCoverageSceneSignal], label: String) {
            for signal in signals {
                let key = signal.id
                if let existing = sceneStates[key] {
                    let labels = existing.signalLabel.components(separatedBy: " · ")
                    guard !labels.contains(label) else { continue }
                    sceneStates[key] = ScreenplayCraftReaderPreviewSceneState(
                        id: existing.id,
                        signalLabel: (labels + [label]).joined(separator: " · "),
                        heading: existing.heading,
                        detailLabel: existing.detailLabel
                    )
                    continue
                }
                let cleanHeading = signal.heading.trimmingCharacters(in: .whitespacesAndNewlines)
                let sceneNumber = max(signal.idx + 1, 1)
                let lineCount = max(signal.lineCount, 0)
                sceneOrder.append(key)
                sceneStates[key] = ScreenplayCraftReaderPreviewSceneState(
                    id: key,
                    signalLabel: label,
                    heading: cleanHeading.isEmpty ? "Scene \(sceneNumber)" : cleanHeading,
                    detailLabel: "Scene \(sceneNumber) · \(lineCount) line\(lineCount == 1 ? "" : "s")"
                )
            }
        }
        collectSceneSignals(report.pacing.peakScenes, label: "PEAK")
        collectSceneSignals(report.pacing.longScenes, label: "LONG")
        collectSceneSignals(report.pacing.shortScenes, label: "SHORT")
        let allSceneSignals = sceneOrder.compactMap { sceneStates[$0] }
        let visibleSceneSignals = Array(allSceneSignals.prefix(3))

        return ScreenplayCraftReaderPreviewState(
            pagesLabel: String(max(report.overview.pageCount, 0)),
            scenesLabel: String(max(report.overview.sceneCount, 0)),
            dialogueLabel: "\(Int((dialogueRatio * 100).rounded()))%",
            averageSceneLabel: "\(Int(averageSceneLines.rounded())) lines",
            paceLabel: cleanIntensity.isEmpty ? "Unknown" : cleanIntensity.capitalized,
            summary: cleanSummary.isEmpty ? "Reader preview ready." : cleanSummary,
            characters: visibleCharacters,
            hiddenCharacterCount: max(characterStates.count - visibleCharacters.count, 0),
            sceneSignals: visibleSceneSignals,
            hiddenSceneSignalCount: max(allSceneSignals.count - visibleSceneSignals.count, 0),
            warnings: visibleWarnings,
            hiddenWarningCount: max(warningStates.count - visibleWarnings.count, 0)
        )
    }
}

struct ScreenplayCraftReaderPreviewView: View {
    let report: ScreenplayCraftCoverageSimulationReport?
    let isLoading: Bool
    let errorText: String
    let sourceText: String
    let canRun: Bool
    let isCurrent: Bool
    let onRun: () -> Void

    private var cleanErrorText: String {
        errorText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var cleanSourceText: String {
        sourceText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.sm) {
            HStack(alignment: .center, spacing: IOThemSpacing.Scale.sm) {
                VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxs) {
                    Text("Reader preview")
                        .font(IOThemTypography.UI.label)
                        .foregroundStyle(Color.herText.opacity(0.70))
                        .textCase(.uppercase)
                    Text("What a coverage reader sees before submission.")
                        .font(IOThemTypography.UI.microRegular)
                        .foregroundStyle(Color.herText.opacity(0.48))
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: IOThemSpacing.Scale.sm)

                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("Running reader preview")
                }

                Button(action: onRun) {
                    Label(report == nil ? "Preview" : "Refresh", systemImage: "doc.text.magnifyingglass")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!canRun || isLoading)
                .accessibilityIdentifier("studio.craft.reader-preview.run")
                .accessibilityLabel(report == nil ? "Run reader preview" : "Refresh reader preview")
                .accessibilityHint("Analyzes the current draft without changing it.")
            }

            if !cleanErrorText.isEmpty {
                stateCard(
                    icon: "exclamationmark.triangle",
                    title: "Reader preview unavailable",
                    detail: cleanErrorText,
                    color: Color.orange.opacity(0.86)
                )
            } else if let report {
                resultContent(ScreenplayCraftReaderPreviewState.make(report: report))
            } else {
                stateCard(
                    icon: isLoading || canRun ? "doc.text.magnifyingglass" : "doc.text",
                    title: isLoading ? "Reading the draft" : "Preview the reader view",
                    detail: isLoading
                        ? "Measuring pacing, scene shape, and character balance."
                        : canRun
                            ? "Run a private pacing and readability pass before you share the script."
                            : "Write or import a draft to unlock reader preview.",
                    color: Color.herText.opacity(0.58)
                )
            }
        }
        .padding(IOThemSpacing.Scale.md)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.md, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.craft.reader-preview")
    }

    private func resultContent(_ state: ScreenplayCraftReaderPreviewState) -> some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.sm) {
            if !isCurrent {
                Label("Draft or framework changed. Refresh before relying on this preview.", systemImage: "arrow.clockwise.circle")
                    .font(IOThemTypography.UI.microMedium)
                    .foregroundStyle(Color.orange.opacity(0.86))
                    .fixedSize(horizontal: false, vertical: true)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: IOThemSpacing.Scale.sm) {
                metric(label: "Pages", value: state.pagesLabel)
                metric(label: "Scenes", value: state.scenesLabel)
                metric(label: "Dialogue", value: state.dialogueLabel)
                metric(label: "Avg scene", value: state.averageSceneLabel)
            }

            HStack(spacing: IOThemSpacing.Scale.xs) {
                Text("PACE")
                    .font(IOThemTypography.UI.nano)
                    .foregroundStyle(Color.herText.opacity(0.48))
                Text(state.paceLabel)
                    .font(IOThemTypography.UI.micro)
                    .foregroundStyle(paceColor(state.paceLabel))
            }

            Text(state.summary)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("studio.craft.reader-preview.summary")

            if !state.characters.isEmpty {
                VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xs) {
                    sectionHeader("Character balance", hiddenCount: state.hiddenCharacterCount)
                    ForEach(state.characters) { character in
                        characterRow(character)
                    }
                }
            }

            if !state.sceneSignals.isEmpty {
                VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xs) {
                    sectionHeader("Scene watchlist", hiddenCount: state.hiddenSceneSignalCount)
                    ForEach(state.sceneSignals) { signal in
                        sceneSignalRow(signal)
                    }
                }
            }

            if state.warnings.isEmpty {
                Label("No reader warnings", systemImage: "checkmark.seal")
                    .font(IOThemTypography.UI.microMedium)
                    .foregroundStyle(Color.green.opacity(0.82))
            } else {
                VStack(alignment: .leading, spacing: IOThemSpacing.Scale.sm) {
                    sectionHeader("Reader signals", hiddenCount: state.hiddenWarningCount)
                    ForEach(state.warnings) { warning in
                        warningRow(warning)
                    }
                }
            }

            if !cleanSourceText.isEmpty {
                Text("Updated from \(cleanSourceText.lowercased()).")
                    .font(IOThemTypography.UI.nanoRegular)
                    .foregroundStyle(Color.herText.opacity(0.42))
            }
        }
        .opacity(isCurrent ? 1 : 0.74)
    }

    private func metric(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxxs) {
            Text(value)
                .font(IOThemTypography.UI.prominentCallout)
                .foregroundStyle(Color.herText.opacity(0.88))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(label)
                .font(IOThemTypography.UI.nanoMedium)
                .foregroundStyle(Color.herText.opacity(0.46))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(IOThemSpacing.Scale.sm)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)")
    }

    private func sectionHeader(_ title: String, hiddenCount: Int) -> some View {
        HStack(spacing: IOThemSpacing.Scale.xs) {
            Text(title)
                .font(IOThemTypography.UI.nanoMedium)
                .foregroundStyle(Color.herText.opacity(0.48))
                .textCase(.uppercase)
            Spacer(minLength: IOThemSpacing.Scale.xs)
            if hiddenCount > 0 {
                Text("+\(hiddenCount) more")
                    .font(IOThemTypography.UI.nanoRegular)
                    .foregroundStyle(Color.herText.opacity(0.42))
            }
        }
    }

    private func characterRow(_ character: ScreenplayCraftReaderPreviewCharacterState) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: IOThemSpacing.Scale.sm) {
            VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxxs) {
                Text(character.name)
                    .font(IOThemTypography.UI.microMedium)
                    .foregroundStyle(Color.herText.opacity(0.72))
                    .lineLimit(1)
                Text(character.detailLabel)
                    .font(IOThemTypography.UI.nanoRegular)
                    .foregroundStyle(Color.herText.opacity(0.44))
            }
            Spacer(minLength: IOThemSpacing.Scale.xs)
            Text(character.shareLabel)
                .font(IOThemTypography.UI.monoBadge)
                .foregroundStyle(Color.herStudioActiveFill.opacity(0.84))
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("studio.craft.reader-preview.character.\(character.id)")
    }

    private func sceneSignalRow(_ signal: ScreenplayCraftReaderPreviewSceneState) -> some View {
        HStack(alignment: .top, spacing: IOThemSpacing.Scale.sm) {
            VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxxs) {
                Text(signal.heading)
                    .font(IOThemTypography.UI.microMedium)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .lineLimit(2)
                Text(signal.detailLabel)
                    .font(IOThemTypography.UI.nanoRegular)
                    .foregroundStyle(Color.herText.opacity(0.44))
            }
            Spacer(minLength: IOThemSpacing.Scale.xs)
            Text(signal.signalLabel)
                .font(IOThemTypography.UI.monoBadge)
                .foregroundStyle(Color.orange.opacity(0.82))
                .multilineTextAlignment(.trailing)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("studio.craft.reader-preview.scene.\(signal.id)")
    }

    private func warningRow(_ warning: ScreenplayCraftReaderPreviewWarningState) -> some View {
        HStack(alignment: .top, spacing: IOThemSpacing.Scale.sm) {
            Text(warning.severityLabel)
                .font(IOThemTypography.UI.monoBadge)
                .foregroundStyle(severityColor(warning.severityLabel))
                .padding(.horizontal, IOThemSpacing.Scale.xs)
                .padding(.vertical, IOThemSpacing.Scale.xxs)
                .background(severityColor(warning.severityLabel).opacity(0.12))
                .clipShape(Capsule())

            Text(warning.message)
                .font(IOThemTypography.UI.microRegular)
                .foregroundStyle(Color.herText.opacity(0.64))
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("studio.craft.reader-preview.warning.\(warning.code)")
    }

    private func stateCard(icon: String, title: String, detail: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: IOThemSpacing.Scale.sm) {
            Image(systemName: icon)
                .foregroundStyle(color)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxs) {
                Text(title)
                    .font(IOThemTypography.UI.label)
                    .foregroundStyle(Color.herText.opacity(0.78))
                Text(detail)
                    .font(IOThemTypography.UI.microRegular)
                    .foregroundStyle(Color.herText.opacity(0.54))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(IOThemSpacing.Scale.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.black.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous))
    }

    private func severityColor(_ severity: String) -> Color {
        switch severity.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "hard", "high": return Color.red.opacity(0.84)
        case "medium": return Color.orange.opacity(0.84)
        case "soft", "low": return Color.herStudioActiveFill.opacity(0.82)
        default: return Color.herText.opacity(0.62)
        }
    }

    private func paceColor(_ pace: String) -> Color {
        switch pace.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "high": return Color.orange.opacity(0.86)
        case "medium": return Color.blue.opacity(0.78)
        case "low": return Color.green.opacity(0.74)
        default: return Color.herText.opacity(0.62)
        }
    }
}
