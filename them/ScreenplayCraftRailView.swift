import SwiftUI

struct ScreenplayCraftRailView: View {
    let projectTitle: String
    let versionId: String
    @Binding var selectedFrameworkID: String
    let frameworks: [ScreenplayCraftFrameworkReference]
    let report: ScreenplayCraftReport?
    let isLoading: Bool
    let isAnalyzing: Bool
    let errorText: String
    let infoText: String
    let fallbackPageCount: Int
    let onRefresh: () -> Void
    let onAnalyze: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            frameworkPicker

            if isLoading {
                craftStateCard(
                    icon: "arrow.triangle.2.circlepath",
                    title: "Loading craft report",
                    detail: "Checking the active screenplay version."
                ) {
                    ProgressView()
                        .controlSize(.small)
                }
            } else if !errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                craftStateCard(
                    icon: "exclamationmark.triangle",
                    title: "Craft unavailable",
                    detail: errorText
                ) {
                    Button(action: onRefresh) {
                        Label("Retry", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            } else if let report {
                reportContent(report)
            } else {
                craftStateCard(
                    icon: "chart.line.uptrend.xyaxis",
                    title: "No craft report yet",
                    detail: infoText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? "Save or analyze this screenplay version to populate the craft rail."
                        : infoText
                ) {
                    Button(action: onAnalyze) {
                        Label(isAnalyzing ? "Analyzing" : "Analyze", systemImage: isAnalyzing ? "hourglass" : "wand.and.stars")
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(projectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isAnalyzing)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.herShellPanelSoft.opacity(0.96))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.40), lineWidth: 1)
        )
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Craft")
                        .font(.system(size: 24, weight: .semibold, design: .serif))
                        .foregroundStyle(Color.herText.opacity(0.92))
                    Text(projectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "No project selected" : projectTitle)
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.74))
                        .lineLimit(1)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 6) {
                    craftChip(versionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Draft" : "v" + String(versionId.suffix(6)).uppercased())
                    if isAnalyzing {
                        craftChip("Analyzing")
                    }
                }
            }

            HStack(spacing: 8) {
                Button(action: onRefresh) {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isLoading || isAnalyzing)

                Button(action: onAnalyze) {
                    Label(isAnalyzing ? "Analyzing" : "Analyze", systemImage: isAnalyzing ? "hourglass" : "wand.and.stars")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(projectTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isLoading || isAnalyzing)
            }
        }
    }

    @ViewBuilder
    private var frameworkPicker: some View {
        if frameworks.isEmpty {
            Text("Frameworks will appear when the craft backend is available.")
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.54))
                .fixedSize(horizontal: false, vertical: true)
        } else {
            VStack(alignment: .leading, spacing: 7) {
                Text("Framework")
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.46))
                    .textCase(.uppercase)
                Picker("Framework", selection: $selectedFrameworkID) {
                    ForEach(frameworks) { framework in
                        Text(framework.title).tag(framework.id)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
        }
    }

    private func reportContent(_ report: ScreenplayCraftReport) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            coverageStrip(report)
            majorTurnTimeline(report)
            beatSheetTable(report)
            if !report.overrides.isEmpty {
                overridesStrip(report.overrides)
            }
        }
    }

    private func coverageStrip(_ report: ScreenplayCraftReport) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                craftMetric("Turns", value: "\(report.coverage.detectedMajorTurnCount)/\(max(report.coverage.requiredMajorTurnCount, 1))")
                craftMetric("Missing", value: "\(report.coverage.missingMajorTurnCount)")
                craftMetric("Beats", value: "\(report.beatSheet.beats.count)")
            }

            if let summary = report.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(summary)
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func majorTurnTimeline(_ report: ScreenplayCraftReport) -> some View {
        let turns = timelineTurns(for: report)
        return VStack(alignment: .leading, spacing: 10) {
            sectionLabel("Major-turn drift")
            if turns.isEmpty {
                craftStateCard(icon: "flag.slash", title: "No major turns", detail: "This report did not include turn timing yet.")
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(turns) { turn in
                        timelineRow(turn, pageCount: timelinePageCount(report: report, turns: turns))
                    }
                }
            }
        }
    }

    private func timelineRow(_ turn: ScreenplayCraftTurnDrift, pageCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(turn.label)
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.84))
                    .lineLimit(1)
                Spacer(minLength: 8)
                Text(driftText(turn))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundStyle(statusColor(turn.status))
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.herShellStroke.opacity(0.22))
                        .frame(height: 4)
                    if let expectedPage = turn.expectedPage {
                        marker(color: Color.herText.opacity(0.50))
                            .offset(x: timelineOffset(page: expectedPage, pageCount: pageCount, width: geometry.size.width))
                    }
                    if let actualPage = turn.actualPage {
                        marker(color: statusColor(turn.status))
                            .offset(x: timelineOffset(page: actualPage, pageCount: pageCount, width: geometry.size.width))
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .frame(height: 18)

            HStack(spacing: 8) {
                Text("E " + pageText(turn.expectedPage))
                Text("A " + pageText(turn.actualPage))
                Text(turn.status.capitalized)
            }
            .font(.system(size: 9, weight: .regular, design: .monospaced))
            .foregroundStyle(Color.herText.opacity(0.48))
        }
        .padding(10)
        .background(Color.black.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func beatSheetTable(_ report: ScreenplayCraftReport) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                sectionLabel("Beat sheet")
                Spacer(minLength: 0)
                Text(report.framework.title)
                    .font(.system(size: 9, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.48))
                    .lineLimit(1)
            }

            if report.beatSheet.beats.isEmpty {
                craftStateCard(icon: "tablecells", title: "No classified beats", detail: "The selected framework has no beat rows in this report.")
            } else {
                VStack(spacing: 0) {
                    HStack(spacing: 8) {
                        tableHeader("Beat", width: nil)
                        tableHeader("Pages", width: 54)
                        tableHeader("State", width: 58)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Color.white.opacity(0.10))

                    ForEach(report.beatSheet.beats) { beat in
                        beatRow(beat)
                        if beat.id != report.beatSheet.beats.last?.id {
                            Divider().overlay(Color.herShellStroke.opacity(0.14))
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
                )
            }
        }
    }

    private func beatRow(_ beat: ScreenplayCraftBeat) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) {
                Text(beat.label)
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
                if let sceneTitle = beat.sceneTitle, !sceneTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text(sceneTitle)
                        .font(.system(size: 9, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.48))
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Text(pageRangeText(expected: beat.expectedPageRange, actual: beat.actualPageRange))
                .font(.system(size: 9, weight: .medium, design: .monospaced))
                .foregroundStyle(Color.herText.opacity(0.54))
                .frame(width: 54, alignment: .leading)

            Text(beat.status.capitalized)
                .font(.system(size: 9, weight: .semibold, design: .default))
                .foregroundStyle(statusColor(beat.status))
                .frame(width: 58, alignment: .leading)
        }
        .padding(10)
        .background(Color.white.opacity(0.05))
    }

    private func overridesStrip(_ overrides: [ScreenplayCraftTurnOverride]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("Overrides")
            ForEach(overrides.prefix(4)) { item in
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.seal")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.green.opacity(0.78))
                    Text(item.turnId)
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.herText.opacity(0.62))
                    Spacer(minLength: 0)
                    Text(item.action.capitalized)
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.58))
                }
            }
        }
        .padding(10)
        .background(Color.green.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func craftStateCard<Accessory: View>(
        icon: String,
        title: String,
        detail: String,
        @ViewBuilder accessory: () -> Accessory
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.68))
                    .frame(width: 26, height: 26)
                    .background(Color.white.opacity(0.10))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.82))
                    Text(detail)
                        .font(.system(size: 11, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.56))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            accessory()
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func craftStateCard(icon: String, title: String, detail: String) -> some View {
        craftStateCard(icon: icon, title: title, detail: detail) { EmptyView() }
    }

    private func craftMetric(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color.herText.opacity(0.86))
            Text(label)
                .font(.system(size: 9, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.42))
                .textCase(.uppercase)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(Color.black.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func craftChip(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold, design: .default))
            .foregroundStyle(Color.herText.opacity(0.62))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.white.opacity(0.12))
            .clipShape(Capsule())
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .semibold, design: .default))
            .foregroundStyle(Color.herText.opacity(0.48))
            .textCase(.uppercase)
    }

    private func tableHeader(_ text: String, width: CGFloat?) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .semibold, design: .default))
            .foregroundStyle(Color.herText.opacity(0.48))
            .textCase(.uppercase)
            .frame(width: width, alignment: .leading)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
    }

    private func marker(color: Color) -> some View {
        Circle()
            .fill(color)
            .frame(width: 9, height: 9)
            .overlay(Circle().stroke(Color.white.opacity(0.70), lineWidth: 1))
    }

    private func timelineOffset(page: Int, pageCount: Int, width: CGFloat) -> CGFloat {
        guard pageCount > 1 else { return 0 }
        let clampedPage = min(max(page, 1), pageCount)
        let available = max(width - 9, 0)
        return available * CGFloat(clampedPage - 1) / CGFloat(pageCount - 1)
    }

    private func timelineTurns(for report: ScreenplayCraftReport) -> [ScreenplayCraftTurnDrift] {
        if !report.drift.timeline.isEmpty {
            return report.drift.timeline
        }
        return report.majorTurns.map { turn in
            ScreenplayCraftTurnDrift(
                id: turn.id,
                turnId: turn.turnId,
                label: turn.label,
                expectedPage: turn.expectedPage,
                actualPage: turn.actualPage,
                driftPages: turn.driftPages,
                status: turn.status
            )
        }
    }

    private func timelinePageCount(report: ScreenplayCraftReport, turns: [ScreenplayCraftTurnDrift]) -> Int {
        let reportPages = report.pageCount ?? fallbackPageCount
        let turnPages = turns.flatMap { [$0.expectedPage, $0.actualPage] }.compactMap { $0 }.max() ?? 1
        return max(max(reportPages, fallbackPageCount), max(turnPages, 1))
    }

    private func driftText(_ turn: ScreenplayCraftTurnDrift) -> String {
        guard let drift = turn.driftPages else {
            return turn.actualPage == nil ? "Missing" : "On page"
        }
        if drift == 0 { return "On time" }
        return drift > 0 ? "+\(drift) pg" : "\(drift) pg"
    }

    private func pageText(_ page: Int?) -> String {
        guard let page else { return "--" }
        return "p\(page)"
    }

    private func pageRangeText(expected: ScreenplayCraftPageRange?, actual: ScreenplayCraftPageRange?) -> String {
        if let actual {
            return rangeText(actual)
        }
        if let expected {
            return "E " + rangeText(expected)
        }
        return "--"
    }

    private func rangeText(_ range: ScreenplayCraftPageRange) -> String {
        range.start == range.end ? "p\(range.start)" : "p\(range.start)-\(range.end)"
    }

    private func statusColor(_ rawStatus: String) -> Color {
        switch rawStatus.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "present", "accepted", "complete", "on_time", "overridden", "manually_present":
            return Color.green.opacity(0.82)
        case "late", "early", "drift", "partial":
            return Color.orange.opacity(0.86)
        case "missing", "absent", "failed":
            return Color.red.opacity(0.78)
        default:
            return Color.herText.opacity(0.58)
        }
    }
}
