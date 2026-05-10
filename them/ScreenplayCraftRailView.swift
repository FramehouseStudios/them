import SwiftUI
import ScreenplayStudio

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
    let isSavingOverride: Bool
    let onRefresh: () -> Void
    let onAnalyze: () -> Void
    let onCreateOverride: (ScreenplayCraftTurnOverrideMutation) -> Void

    @State private var activeOverrideTurn: ScreenplayCraftTurnDrift?
    @State private var overrideReasonText: String = ""
    @State private var overridePageText: String = ""

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
            craftStateCard(
                icon: "rectangle.3.group",
                title: "Frameworks unavailable",
                detail: "Refresh when the craft backend is available."
            ) {
                Button(action: onRefresh) {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isLoading || isAnalyzing)
            }
        } else {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 8) {
                    sectionLabel("Framework")
                    Spacer(minLength: 0)
                    craftChip("Live \(frameworks.count)")
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 7) {
                        ForEach(frameworks) { framework in
                            frameworkButton(framework)
                        }
                    }
                }
                .scrollClipDisabled()
            }
        }
    }

    private func frameworkButton(_ framework: ScreenplayCraftFrameworkReference) -> some View {
        let isSelected = framework.id == selectedFrameworkID
        return Button {
            selectedFrameworkID = framework.id
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 11, weight: .semibold))
                Text(framework.title)
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .lineLimit(1)
                if let version = framework.version, !version.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text("v\(version)")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .opacity(0.62)
                }
            }
            .foregroundStyle(isSelected ? Color.herText.opacity(0.90) : Color.herText.opacity(0.58))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(isSelected ? Color.white.opacity(0.20) : Color.white.opacity(0.08))
            .overlay(
                Capsule()
                    .stroke(isSelected ? Color.herText.opacity(0.20) : Color.herShellStroke.opacity(0.14), lineWidth: 1)
            )
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isLoading || isAnalyzing)
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
                        timelineRow(turn, report: report, pageCount: timelinePageCount(report: report, turns: turns))
                    }
                }
            }
        }
    }

    private func timelineRow(_ turn: ScreenplayCraftTurnDrift, report: ScreenplayCraftReport, pageCount: Int) -> some View {
        let majorTurn = report.majorTurns.first { $0.turnId == turn.turnId }
        let expectedRange = majorTurn?.expectedPageRange
        let actualRange = majorTurn?.actualPageRange
        return VStack(alignment: .leading, spacing: 7) {
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
                    if let expectedRange {
                        timelineBand(
                            range: expectedRange,
                            pageCount: pageCount,
                            width: geometry.size.width,
                            color: Color.herText.opacity(0.18),
                            height: 10
                        )
                    } else if let expectedPage = turn.expectedPage {
                        marker(color: Color.herText.opacity(0.50))
                            .offset(x: timelineOffset(page: expectedPage, pageCount: pageCount, width: geometry.size.width))
                    }
                    if let actualRange {
                        timelineBand(
                            range: actualRange,
                            pageCount: pageCount,
                            width: geometry.size.width,
                            color: statusColor(turn.status).opacity(0.24),
                            height: 6
                        )
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
                Text("E " + pageRangeOrPageText(range: expectedRange, page: turn.expectedPage))
                Text("A " + pageRangeOrPageText(range: actualRange, page: turn.actualPage))
                Text(turn.status.capitalized)
                Spacer(minLength: 0)
                if shouldOfferOverride(for: turn) {
                    Button {
                        beginOverride(for: turn)
                    } label: {
                        Label("Override", systemImage: "checkmark.seal")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                    .disabled(isSavingOverride)
                }
            }
            .font(.system(size: 9, weight: .regular, design: .monospaced))
            .foregroundStyle(Color.herText.opacity(0.48))

            if activeOverrideTurn?.turnId == turn.turnId {
                overrideComposer(for: turn)
            }
        }
        .padding(10)
        .background(Color.black.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func overrideComposer(for turn: ScreenplayCraftTurnDrift) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Mark \(turn.label) as present")
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.78))

            HStack(spacing: 8) {
                TextField("Page", text: $overridePageText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 72)
                TextField("Reason", text: $overrideReasonText, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...3)
            }

            HStack(spacing: 8) {
                Button("Cancel") {
                    clearOverrideComposer()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button {
                    submitOverride(for: turn)
                } label: {
                    Label(isSavingOverride ? "Saving" : "Save Override", systemImage: isSavingOverride ? "hourglass" : "checkmark")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(isSavingOverride)
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.09))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
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

    private func timelineBand(
        range: ScreenplayCraftPageRange,
        pageCount: Int,
        width: CGFloat,
        color: Color,
        height: CGFloat
    ) -> some View {
        Capsule()
            .fill(color)
            .frame(width: timelineBandWidth(range: range, pageCount: pageCount, width: width), height: height)
            .offset(x: timelineOffset(page: range.start, pageCount: pageCount, width: width))
    }

    private func timelineOffset(page: Int, pageCount: Int, width: CGFloat) -> CGFloat {
        guard pageCount > 1 else { return 0 }
        let clampedPage = min(max(page, 1), pageCount)
        let available = max(width - 9, 0)
        return available * CGFloat(clampedPage - 1) / CGFloat(pageCount - 1)
    }

    private func timelineBandWidth(range: ScreenplayCraftPageRange, pageCount: Int, width: CGFloat) -> CGFloat {
        guard pageCount > 1 else { return 12 }
        let start = min(max(range.start, 1), pageCount)
        let end = min(max(range.end, start), pageCount)
        let startOffset = timelineOffset(page: start, pageCount: pageCount, width: width)
        let endOffset = timelineOffset(page: end, pageCount: pageCount, width: width)
        return max(endOffset - startOffset + 9, 12)
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

    private func pageRangeOrPageText(range: ScreenplayCraftPageRange?, page: Int?) -> String {
        if let range {
            return rangeText(range)
        }
        return pageText(page)
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
        case "present", "accepted", "complete", "on_time", "on-time", "on_target", "on-target", "overridden", "manually_present":
            return Color.green.opacity(0.82)
        case "late", "early", "drift", "partial":
            return Color.orange.opacity(0.86)
        case "missing", "absent", "failed":
            return Color.red.opacity(0.78)
        default:
            return Color.herText.opacity(0.58)
        }
    }

    private func shouldOfferOverride(for turn: ScreenplayCraftTurnDrift) -> Bool {
        switch turn.status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "missing", "absent", "failed", "late", "early", "drift", "partial":
            return true
        default:
            return turn.actualPage == nil
        }
    }

    private func beginOverride(for turn: ScreenplayCraftTurnDrift) {
        activeOverrideTurn = turn
        overridePageText = turn.actualPage.map(String.init) ?? ""
        overrideReasonText = ""
    }

    private func clearOverrideComposer() {
        activeOverrideTurn = nil
        overrideReasonText = ""
        overridePageText = ""
    }

    private func submitOverride(for turn: ScreenplayCraftTurnDrift) {
        let trimmedReason = overrideReasonText.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedPage = overridePageText.trimmingCharacters(in: .whitespacesAndNewlines)
        onCreateOverride(ScreenplayCraftTurnOverrideMutation(
            turnId: turn.turnId,
            action: "mark-present",
            reason: trimmedReason.isEmpty ? nil : trimmedReason,
            sceneId: nil,
            page: Int(trimmedPage),
            userId: nil,
            expiresAt: nil
        ))
        clearOverrideComposer()
    }
}


#if DEBUG
private struct ScreenplayCraftRailPreviewHost: View {
    @State private var selectedFrameworkID: String = "save-the-cat"

    var body: some View {
        ScrollView {
            ScreenplayCraftRailView(
                projectTitle: "Vapor Trail",
                versionId: "v2",
                selectedFrameworkID: $selectedFrameworkID,
                frameworks: ScreenplayCraftRailPreviewData.frameworks,
                report: ScreenplayCraftRailPreviewData.report,
                isLoading: false,
                isAnalyzing: false,
                errorText: "",
                infoText: "",
                fallbackPageCount: 102,
                isSavingOverride: false,
                onRefresh: {},
                onAnalyze: {},
                onCreateOverride: { _ in }
            )
            .padding()
        }
        .frame(width: 380)
        .background(Color.herShellPanel)
    }
}

private enum ScreenplayCraftRailPreviewData {
    static let frameworks: [ScreenplayCraftFrameworkReference] = decodeFrameworks()
    static let report: ScreenplayCraftReport = decodeReport()

    private static func decodeFrameworks() -> [ScreenplayCraftFrameworkReference] {
        struct Payload: Decodable {
            let frameworks: [ScreenplayCraftFrameworkReference]
        }
        return decode(Payload.self, from: frameworkJSON).frameworks
    }

    private static func decodeReport() -> ScreenplayCraftReport {
        decode(ScreenplayCraftReport.self, from: reportJSON)
    }

    private static func decode<T: Decodable>(_ type: T.Type, from raw: String) -> T {
        do {
            return try JSONDecoder().decode(type, from: Data(raw.utf8))
        } catch {
            fatalError("Invalid craft preview fixture: \(error)")
        }
    }

    private static let frameworkJSON = #"""
    {
      "frameworks": [
        { "id": "save-the-cat", "title": "Save the Cat!", "version": "1.0" },
        { "id": "three-act", "title": "Three-Act Structure", "version": "1.0" }
      ]
    }
    """#

    private static let reportJSON = #"""
    {
      "id": "report_preview_drift",
      "schemaVersion": 1,
      "projectId": "proj-preview",
      "versionId": "v2",
      "screenplayTitle": "Vapor Trail",
      "framework": { "id": "save-the-cat", "title": "Save the Cat!", "version": "1.0" },
      "pageCount": 102,
      "summary": "One required turn has been marked by the writer; two turns still drift against their expected bands.",
      "coverage": {
        "requiredMajorTurnCount": 4,
        "detectedMajorTurnCount": 3,
        "overriddenMajorTurnCount": 1,
        "missingMajorTurnCount": 0,
        "complete": true,
        "confidence": 0.82
      },
      "beatSheet": {
        "id": "beats_preview",
        "frameworkId": "save-the-cat",
        "title": "Save the Cat! - Vapor Trail",
        "beats": [
          { "id": "b_catalyst", "frameworkBeatId": "catalyst", "label": "Catalyst", "expectedPageRange": { "start": 12, "end": 12 }, "actualPageRange": { "start": 14, "end": 16 }, "sceneTitle": "INT. CAR - DUSK", "status": "present", "evidence": [], "majorTurnId": "catalyst" },
          { "id": "b_midpoint", "frameworkBeatId": "midpoint", "label": "Midpoint", "expectedPageRange": { "start": 55, "end": 55 }, "actualPageRange": { "start": 50, "end": 52 }, "sceneTitle": "EXT. AIRSTRIP - NIGHT", "status": "present", "evidence": [], "majorTurnId": "midpoint" },
          { "id": "b_all_lost", "frameworkBeatId": "all-is-lost", "label": "All Is Lost", "expectedPageRange": { "start": 75, "end": 75 }, "actualPageRange": { "start": 73, "end": 74 }, "sceneTitle": "INT. MOTEL - NIGHT", "status": "manually_present", "evidence": [], "majorTurnId": "all-is-lost" }
        ]
      },
      "majorTurns": [
        { "id": "mt_catalyst", "turnId": "catalyst", "label": "Catalyst", "required": true, "expectedPage": 12, "expectedPageRange": { "start": 12, "end": 12 }, "actualPage": 15, "actualPageRange": { "start": 14, "end": 16 }, "status": "late", "detected": true, "driftPages": 3, "evidence": [] },
        { "id": "mt_midpoint", "turnId": "midpoint", "label": "Midpoint", "required": true, "expectedPage": 55, "expectedPageRange": { "start": 55, "end": 55 }, "actualPage": 51, "actualPageRange": { "start": 50, "end": 52 }, "status": "early", "detected": true, "driftPages": -4, "evidence": [] },
        { "id": "mt_all_lost", "turnId": "all-is-lost", "label": "All Is Lost", "required": true, "expectedPage": 75, "expectedPageRange": { "start": 75, "end": 75 }, "actualPage": 73, "actualPageRange": { "start": 73, "end": 74 }, "status": "manually_present", "detected": false, "driftPages": -2, "evidence": [], "override": { "id": "ov_preview", "turnId": "all-is-lost", "action": "mark-present", "reason": "Writer flagged the motel scene as the lowest moment.", "page": 73 } }
      ],
      "drift": {
        "status": "on-target-with-overrides",
        "summary": "Catalyst is late; midpoint is early; All Is Lost is accepted by writer override.",
        "timeline": [
          { "id": "td_catalyst", "turnId": "catalyst", "label": "Catalyst", "expectedPage": 12, "actualPage": 15, "driftPages": 3, "status": "late" },
          { "id": "td_midpoint", "turnId": "midpoint", "label": "Midpoint", "expectedPage": 55, "actualPage": 51, "driftPages": -4, "status": "early" },
          { "id": "td_all_lost", "turnId": "all-is-lost", "label": "All Is Lost", "expectedPage": 75, "actualPage": 73, "driftPages": -2, "status": "overridden" }
        ]
      },
      "overrides": [
        { "id": "ov_preview", "turnId": "all-is-lost", "action": "mark-present", "reason": "Writer flagged the motel scene as the lowest moment.", "page": 73 }
      ]
    }
    """#
}

#Preview("Craft Drift") {
    ScreenplayCraftRailPreviewHost()
}
#endif
