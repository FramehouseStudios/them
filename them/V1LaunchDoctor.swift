import Combine
import SwiftUI
import ScreenplayStudio
#if os(macOS)
import AppKit
#endif
#if canImport(UIKit)
import UIKit
#endif

enum V1LaunchDoctorFlow: String, CaseIterable, Codable, Identifiable {
    case talkPipeline = "talk_pipeline"
    case screenplayStudio = "screenplay_studio"
    case creativeMemory = "creative_memory"
    case realtime = "realtime"
    case releaseReadiness = "release_readiness"

    var id: String { rawValue }

    var definition: V1LaunchDoctorFlowDefinition {
        switch self {
        case .talkPipeline:
            return V1LaunchDoctorFlowDefinition(
                flow: self,
                title: "Talk Pipeline",
                v1Pillar: "talk",
                goal: "Record voice, receive a useful companion reply, hear playback, and keep the turn.",
                checklist: [
                    "Start a fresh session.",
                    "Record a short emotional scene prompt by voice.",
                    "Confirm Clementine transcribes the prompt and replies.",
                    "Confirm audio playback is audible.",
                    "Confirm the turn appears in saved history after relaunch.",
                ],
                passCriteria: "Voice -> reply -> playback -> saved turn works without a restart or manual repair."
            )
        case .screenplayStudio:
            return V1LaunchDoctorFlowDefinition(
                flow: self,
                title: "Screenplay Studio",
                v1Pillar: "screenplay",
                goal: "Create a project, write a properly formatted page, save it, reopen it, and export it.",
                checklist: [
                    "Create or open a Studio project.",
                    "Write one scene with slugline, action, character, and dialogue.",
                    "Save the draft and reopen Studio.",
                    "Confirm the page is still formatted correctly.",
                    "Export at least one supported format.",
                ],
                passCriteria: "A one-page screenplay survives save/reopen and exports through the current Studio controls."
            )
        case .creativeMemory:
            return V1LaunchDoctorFlowDefinition(
                flow: self,
                title: "Creative Memory",
                v1Pillar: "memory",
                goal: "Confirm Clementine remembers safe creative context and exposes enough shape to diagnose memory.",
                checklist: [
                    "Ask Clementine to remember a character name and creative constraint.",
                    "Start a later turn and ask for continuity from that character.",
                    "Open Data Controls and refresh Memory Shape.",
                    "Confirm the answer uses the remembered context without exposing raw private data unexpectedly.",
                    "Record whether export/delete privacy decisions remain parked or approved.",
                ],
                passCriteria: "Memory improves continuity, diagnostics are readable, and privacy-gated export/delete behavior is understood."
            )
        case .realtime:
            return V1LaunchDoctorFlowDefinition(
                flow: self,
                title: "Realtime",
                v1Pillar: "realtime",
                goal: "Mint a realtime session, confirm supplier metadata, and verify degraded-mode behavior.",
                checklist: [
                    "Use the default realtime provider and start a voice session.",
                    "Confirm the app receives a client secret without user-visible breakage.",
                    "Switch provider mode in Data Controls if needed.",
                    "Force or simulate primary supplier failure when available.",
                    "Confirm fallback/degraded state is visible and the app remains usable.",
                ],
                passCriteria: "Realtime starts on the primary path, fallback is visible when triggered, and no dead-end state traps the user."
            )
        case .releaseReadiness:
            return V1LaunchDoctorFlowDefinition(
                flow: self,
                title: "iOS Release Readiness",
                v1Pillar: "ios",
                goal: "Confirm release config, signed preflight, and Launch Doctor proof are ready before TestFlight or external review.",
                checklist: [
                    "Create them/Release.local.env from the example template.",
                    "Fill real DEVELOPMENT_TEAM_ID, hosted BACKEND_URL, and production APP_TOKEN values.",
                    "Run scripts/run_release_preflight.sh and confirm it is green.",
                    "Confirm the app is not using localhost, placeholder tokens, or debug signing for release.",
                    "Export Launch Doctor JSON/Markdown and record human sign-off for the release build.",
                ],
                passCriteria: "Release config is real, preflight is green, Launch Doctor proof is exported, and human sign-off is recorded before TestFlight/external review."
            )
        }
    }
}

struct V1LaunchDoctorFlowDefinition: Equatable, Identifiable {
    let flow: V1LaunchDoctorFlow
    let title: String
    let v1Pillar: String
    let goal: String
    let checklist: [String]
    let passCriteria: String

    var id: String { flow.rawValue }
}

enum V1LaunchDoctorStatus: String, CaseIterable, Codable, Identifiable {
    case notStarted = "not_started"
    case inProgress = "in_progress"
    case passed
    case failed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .notStarted:
            return "Not Started"
        case .inProgress:
            return "In Progress"
        case .passed:
            return "Pass"
        case .failed:
            return "Fail"
        }
    }

    var symbolName: String {
        switch self {
        case .notStarted:
            return "circle"
        case .inProgress:
            return "clock"
        case .passed:
            return "checkmark.circle.fill"
        case .failed:
            return "xmark.circle.fill"
        }
    }

    var isComplete: Bool {
        self == .passed || self == .failed
    }
}

enum V1LaunchDoctorOverallStatus: String, Codable {
    case notStarted = "not_started"
    case inProgress = "in_progress"
    case passed
    case failed
}

struct V1LaunchDoctorFlowResult: Codable, Equatable, Identifiable {
    var flow: V1LaunchDoctorFlow
    var status: V1LaunchDoctorStatus
    var notes: String
    var evidence: String
    var updatedAt: Date

    var id: String { flow.rawValue }

    init(
        flow: V1LaunchDoctorFlow,
        status: V1LaunchDoctorStatus = .notStarted,
        notes: String = "",
        evidence: String = "",
        updatedAt: Date = Date.distantPast
    ) {
        self.flow = flow
        self.status = status
        self.notes = notes
        self.evidence = evidence
        self.updatedAt = updatedAt
    }
}

struct V1LaunchDoctorReportSummary: Codable, Equatable {
    var total: Int
    var passed: Int
    var failed: Int
    var inProgress: Int
    var notStarted: Int
}

struct V1LaunchDoctorReport: Codable, Equatable {
    static let schemaVersion = 1

    var schemaVersion: Int = Self.schemaVersion
    var source: String = "io.them.v1_launch_doctor"
    var generatedAt: Date
    var overallStatus: V1LaunchDoctorOverallStatus
    var summary: V1LaunchDoctorReportSummary
    var results: [V1LaunchDoctorFlowResult]

    var jsonData: Data {
        get throws {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            encoder.dateEncodingStrategy = .iso8601
            return try encoder.encode(self)
        }
    }

    var jsonString: String {
        (try? String(data: jsonData, encoding: .utf8)) ?? "{}"
    }

    var markdown: String {
        var lines: [String] = []
        lines.append("# THEM V1 Launch Doctor")
        lines.append("")
        lines.append("- Generated: \(Self.isoString(from: generatedAt))")
        lines.append("- Overall: \(overallStatus.rawValue)")
        lines.append("- Passed: \(summary.passed)/\(summary.total)")
        lines.append("- Failed: \(summary.failed)")
        lines.append("")
        for result in results {
            let definition = result.flow.definition
            lines.append("## \(definition.title)")
            lines.append("")
            lines.append("- Pillar: \(definition.v1Pillar)")
            lines.append("- Status: \(result.status.rawValue)")
            lines.append("- Goal: \(definition.goal)")
            lines.append("- Pass criteria: \(definition.passCriteria)")
            if !result.evidence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                lines.append("- Evidence: \(result.evidence)")
            }
            if !result.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                lines.append("")
                lines.append(result.notes)
            }
            lines.append("")
        }
        return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines) + "\n"
    }

    private static func isoString(from date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}

enum V1LaunchDoctorReportBuilder {
    static func makeReport(
        results: [V1LaunchDoctorFlowResult],
        generatedAt: Date = Date()
    ) -> V1LaunchDoctorReport {
        let normalized = V1LaunchDoctorFlow.allCases.map { flow in
            results.first(where: { $0.flow == flow }) ?? V1LaunchDoctorFlowResult(flow: flow)
        }
        let summary = V1LaunchDoctorReportSummary(
            total: normalized.count,
            passed: normalized.filter { $0.status == .passed }.count,
            failed: normalized.filter { $0.status == .failed }.count,
            inProgress: normalized.filter { $0.status == .inProgress }.count,
            notStarted: normalized.filter { $0.status == .notStarted }.count
        )
        let overallStatus: V1LaunchDoctorOverallStatus
        if summary.failed > 0 {
            overallStatus = .failed
        } else if summary.passed == summary.total {
            overallStatus = .passed
        } else if summary.inProgress > 0 || summary.passed > 0 {
            overallStatus = .inProgress
        } else {
            overallStatus = .notStarted
        }
        return V1LaunchDoctorReport(
            generatedAt: generatedAt,
            overallStatus: overallStatus,
            summary: summary,
            results: normalized
        )
    }
}

@MainActor
final class V1LaunchDoctorStore: ObservableObject {
    static let jsonFilename = "io_them_v1_launch_doctor.latest.json"
    static let markdownFilename = "io_them_v1_launch_doctor.latest.md"

    @Published private(set) var results: [V1LaunchDoctorFlowResult]

    private let defaults: UserDefaults
    private let storageKey = "io.them.v1LaunchDoctor.results.v1"
    private let now: () -> Date

    init(defaults: UserDefaults = .standard, now: @escaping () -> Date = Date.init) {
        self.defaults = defaults
        self.now = now
        self.results = Self.loadResults(defaults: defaults, key: storageKey)
    }

    func result(for flow: V1LaunchDoctorFlow) -> V1LaunchDoctorFlowResult {
        results.first(where: { $0.flow == flow }) ?? V1LaunchDoctorFlowResult(flow: flow)
    }

    func setStatus(_ status: V1LaunchDoctorStatus, for flow: V1LaunchDoctorFlow) {
        update(flow: flow) { result in
            result.status = status
            result.updatedAt = now()
        }
    }

    func updateNotes(_ notes: String, for flow: V1LaunchDoctorFlow) {
        update(flow: flow) { result in
            result.notes = notes
            result.updatedAt = now()
        }
    }

    func updateEvidence(_ evidence: String, for flow: V1LaunchDoctorFlow) {
        update(flow: flow) { result in
            result.evidence = evidence
            result.updatedAt = now()
        }
    }

    func reset() {
        results = V1LaunchDoctorFlow.allCases.map { V1LaunchDoctorFlowResult(flow: $0) }
        persist()
    }

    func currentReport(generatedAt: Date = Date()) -> V1LaunchDoctorReport {
        V1LaunchDoctorReportBuilder.makeReport(results: results, generatedAt: generatedAt)
    }

    func writeLatestReportFiles() throws -> [URL] {
        let report = currentReport()
        let directory = Self.reportDirectory()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

        let jsonURL = directory.appendingPathComponent(Self.jsonFilename)
        try report.jsonData.write(to: jsonURL, options: .atomic)

        let markdownURL = directory.appendingPathComponent(Self.markdownFilename)
        try report.markdown.data(using: .utf8)?.write(to: markdownURL, options: .atomic)
        return [jsonURL, markdownURL]
    }

    static func reportDirectory() -> URL {
        #if os(macOS)
        FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        #else
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        #endif
    }

    private func update(flow: V1LaunchDoctorFlow, mutate: (inout V1LaunchDoctorFlowResult) -> Void) {
        var next = result(for: flow)
        mutate(&next)
        results.removeAll { $0.flow == flow }
        results.append(next)
        results.sort { lhs, rhs in
            guard
                let left = V1LaunchDoctorFlow.allCases.firstIndex(of: lhs.flow),
                let right = V1LaunchDoctorFlow.allCases.firstIndex(of: rhs.flow)
            else { return lhs.flow.rawValue < rhs.flow.rawValue }
            return left < right
        }
        persist()
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let data = try? encoder.encode(results) {
            defaults.set(data, forKey: storageKey)
        }
    }

    private static func loadResults(defaults: UserDefaults, key: String) -> [V1LaunchDoctorFlowResult] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if
            let data = defaults.data(forKey: key),
            let decoded = try? decoder.decode([V1LaunchDoctorFlowResult].self, from: data)
        {
            return V1LaunchDoctorReportBuilder.makeReport(results: decoded).results
        }
        return V1LaunchDoctorFlow.allCases.map { V1LaunchDoctorFlowResult(flow: $0) }
    }
}

struct V1LaunchDoctorView: View {
    var onDone: () -> Void = {}

    @StateObject private var store = V1LaunchDoctorStore()
    @State private var exportMessage = ""

    private var report: V1LaunchDoctorReport {
        store.currentReport()
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    summary
                    ForEach(V1LaunchDoctorFlow.allCases) { flow in
                        flowPanel(flow)
                    }
                    exportPanel
                }
                .padding(.horizontal, 24)
                .padding(.top, 28)
                .padding(.bottom, 24)
                .frame(maxWidth: 980, alignment: .topLeading)
            }
            .background(
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
            )
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done", action: onDone)
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("V1 Launch Doctor")
                .font(IOThemTypography.UI.largeTitle)
                .foregroundStyle(Color.herText.opacity(0.95))
            Text("Run the release smoke in the app and leave a structured proof trail.")
                .font(IOThemTypography.UI.body)
                .foregroundStyle(Color.herText.opacity(0.72))
        }
    }

    private var summary: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 14)], alignment: .leading, spacing: 14) {
            launchMetric(title: "Overall", value: report.overallStatus.rawValue.replacingOccurrences(of: "_", with: " "))
            launchMetric(title: "Passed", value: "\(report.summary.passed)/\(report.summary.total)")
            launchMetric(title: "Failed", value: "\(report.summary.failed)")
        }
        .padding(16)
        .background(panelBackground)
    }

    private func launchMetric(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased())
                .font(IOThemTypography.UI.label)
                .foregroundStyle(Color.herText.opacity(0.56))
            Text(value)
                .font(IOThemTypography.UI.sectionTitle)
                .foregroundStyle(Color.herText.opacity(0.92))
                .textCase(.none)
        }
        .frame(minWidth: 96, alignment: .leading)
    }

    private func flowPanel(_ flow: V1LaunchDoctorFlow) -> some View {
        let definition = flow.definition
        let result = store.result(for: flow)
        return VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Image(systemName: result.status.symbolName)
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(statusColor(result.status))
                VStack(alignment: .leading, spacing: 4) {
                    Text(definition.title)
                        .font(IOThemTypography.UI.title)
                        .foregroundStyle(Color.herText.opacity(0.94))
                    Text(definition.goal)
                        .font(IOThemTypography.UI.callout)
                        .foregroundStyle(Color.herText.opacity(0.76))
                }
                Spacer(minLength: 0)
                Text(definition.v1Pillar.uppercased())
                    .font(IOThemTypography.UI.label)
                    .foregroundStyle(Color.herText.opacity(0.58))
            }

            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(definition.checklist.enumerated()), id: \.offset) { index, item in
                    Text("\(index + 1). \(item)")
                        .font(IOThemTypography.UI.callout)
                        .foregroundStyle(Color.herText.opacity(0.76))
                }
            }

            Text("Pass: \(definition.passCriteria)")
                .font(IOThemTypography.UI.callout)
                .foregroundStyle(Color.herText.opacity(0.82))

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 126), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(V1LaunchDoctorStatus.allCases) { status in
                    Button {
                        store.setStatus(status, for: flow)
                    } label: {
                        Label(status.title, systemImage: status.symbolName)
                            .font(IOThemTypography.UI.caption)
                    }
                    .buttonStyle(.bordered)
                    .tint(result.status == status ? statusColor(status) : Color.herText.opacity(0.28))
                }
            }

            TextField(
                "Evidence link, build number, route output, or file path",
                text: Binding(
                    get: { store.result(for: flow).evidence },
                    set: { store.updateEvidence($0, for: flow) }
                )
            )
            .textFieldStyle(.roundedBorder)

            TextEditor(
                text: Binding(
                    get: { store.result(for: flow).notes },
                    set: { store.updateNotes($0, for: flow) }
                )
            )
            .font(IOThemTypography.UI.callout)
            .frame(minHeight: 70)
            .scrollContentBackground(.hidden)
            .background(Color.white.opacity(0.16))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(16)
        .background(panelBackground)
    }

    private var exportPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    exportButtons
                }

                VStack(alignment: .leading, spacing: 8) {
                    exportButtons
                }
            }

            if !exportMessage.isEmpty {
                Text(exportMessage)
                    .font(IOThemTypography.UI.callout)
                    .foregroundStyle(Color.herText.opacity(0.82))
            }

            Text(reportLocationHint)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.62))
        }
        .padding(16)
        .background(panelBackground)
    }

    @ViewBuilder
    private var exportButtons: some View {
        Button {
            exportReport()
        } label: {
            Label("Export Latest Report", systemImage: "square.and.arrow.down")
        }
        .buttonStyle(.borderedProminent)

        Button {
            copyMarkdown()
        } label: {
            Label("Copy Markdown", systemImage: "doc.on.doc")
        }
        .buttonStyle(.bordered)

        Button(role: .destructive) {
            store.reset()
            exportMessage = "Launch Doctor reset."
        } label: {
            Label("Reset", systemImage: "arrow.counterclockwise")
        }
        .buttonStyle(.bordered)
    }

    private var reportLocationHint: String {
        #if os(macOS)
        return "The launch room checks docs/v1-launch-doctor.latest.json, then Downloads/\(V1LaunchDoctorStore.jsonFilename)."
        #else
        return "On iOS, the report is saved to this app's Documents folder for TestFlight evidence."
        #endif
    }

    private var panelBackground: some ShapeStyle {
        .white.opacity(0.20)
    }

    private func statusColor(_ status: V1LaunchDoctorStatus) -> Color {
        switch status {
        case .notStarted:
            return Color.herText.opacity(0.46)
        case .inProgress:
            return Color.blue.opacity(0.76)
        case .passed:
            return Color.green.opacity(0.78)
        case .failed:
            return Color.red.opacity(0.78)
        }
    }

    private func exportReport() {
        do {
            let urls = try store.writeLatestReportFiles()
            exportMessage = "Launch Doctor report exported: \(urls.map(\.lastPathComponent).joined(separator: ", "))"
            #if os(macOS)
            NSWorkspace.shared.activateFileViewerSelecting(urls)
            #endif
        } catch {
            exportMessage = "Export failed: \(error.localizedDescription)"
        }
    }

    private func copyMarkdown() {
        let text = report.markdown
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #elseif canImport(UIKit)
        UIPasteboard.general.string = text
        #endif
        exportMessage = "Launch Doctor markdown copied."
    }
}

#Preview {
    V1LaunchDoctorView()
}
