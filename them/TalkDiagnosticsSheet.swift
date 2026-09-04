import SwiftUI
import ScreenplayStudio

struct TalkDiagnosticsSheet: View {
    let stats: BackendTalkStatsResponse?
    let errors: BackendTalkErrorsResponse?
    let latency: ClementineLatencySummary
    let latencyHealth: ClementineLatencyHealth
    let refreshedAt: Date?
    let lastError: String
    let isRefreshing: Bool
    let onRefresh: () -> Void
    let onDone: () -> Void

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            header
            if !lastError.isEmpty {
                Text(lastError)
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(.red.opacity(0.82))
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    latencySection
                    statsSection
                    errorsSection
                    footer
                }
            }
        }
        .padding(contentPadding)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.herPeachMid)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("talk-diagnostics.screen")
    }

    private var isCompact: Bool {
        horizontalSizeClass == .compact
    }

    private var contentPadding: CGFloat {
        isCompact ? 16 : 24
    }

    private var latencySection: some View {
        diagnosticsCard(title: "Client Latency", summary: latencyHealth.diagnosticsSummary) {
            metricGrid([
                ("SLO", latencyHealth.level.displayName),
                ("Checks", "\(latencyHealth.evaluatedMetricCount)/\(latencyHealth.evaluatedMetricCount + latencyHealth.pendingMetricCount)"),
                ("Latest text", ClementineLatencySummary.millisecondsText(latency.latestFirstTextMs)),
                ("Latest audio", ClementineLatencySummary.millisecondsText(latency.latestFirstAudioMs)),
                ("P95 text", ClementineLatencySummary.millisecondsText(latency.p95FirstTextMs)),
                ("P95 audio", ClementineLatencySummary.millisecondsText(latency.p95FirstAudioMs)),
                ("Barge-in ack", ClementineLatencySummary.millisecondsText(latency.latestBargeInAckMs)),
                ("Network", latency.latestNetworkClass?.rawValue.capitalized ?? "n/a"),
                ("Speech chunk", latency.latestSpeechTargetCharacters.map { "\($0) chars" } ?? "n/a")
            ])
            if !latencyHealth.breaches.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(latencyHealth.breaches) { breach in
                        Text(breach.diagnosticsLine)
                            .font(IOThemTypography.UI.monoCaption)
                            .foregroundStyle(breach.isCritical ? Color.red.opacity(0.82) : Color.herText.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 2)
            }
        }
        .accessibilityIdentifier("talk-diagnostics.latency")
    }

    @ViewBuilder
    private var header: some View {
        if isCompact {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .center, spacing: 12) {
                    titleAndRefreshTime
                    Spacer(minLength: 8)
                    doneButton
                }
                refreshButton
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("talk-diagnostics.header")
        } else {
            HStack(alignment: .center, spacing: 12) {
                titleAndRefreshTime
                Spacer(minLength: 8)
                refreshButton
                doneButton
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("talk-diagnostics.header")
        }
    }

    private var titleAndRefreshTime: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Talk Diagnostics")
                .font(IOThemTypography.UI.title)
                .foregroundStyle(Color.herText.opacity(0.96))
                .fixedSize(horizontal: false, vertical: true)
            Text("Clementine talk health • \(refreshedLine)")
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.62))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var refreshButton: some View {
        Button(action: onRefresh) {
            Label(isRefreshing ? "Refreshing…" : "Refresh Diagnostics", systemImage: "arrow.clockwise")
                .frame(maxWidth: isCompact ? .infinity : nil, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(isRefreshing)
        .accessibilityIdentifier("talk-diagnostics.refresh")
        .accessibilityHint("Reloads safe aggregate talk health and local latency measurements.")
    }

    private var doneButton: some View {
        Button(action: onDone) {
            Text("Done")
                .frame(minWidth: 48, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.herText.opacity(0.14))
        .foregroundStyle(Color.herText.opacity(0.94))
        .keyboardShortcut(.defaultAction)
        .accessibilityIdentifier("talk-diagnostics.done")
        .accessibilityHint("Returns to Clementine without starting a conversation.")
    }

    private var statsSection: some View {
        diagnosticsCard(title: "Conversation Health", summary: stats?.diagnosticsSummary ?? "No talk stats yet") {
            if let stats {
                metricGrid([
                    ("Turns", "\(stats.total)"),
                    ("Users", "\(stats.uniqueUserCount)"),
                    ("Sessions", "\(stats.uniqueSessionCount)"),
                    ("Final replies", "\(stats.replyRoleCounts.final)"),
                    ("Preview replies", "\(stats.replyRoleCounts.preview)"),
                    ("P90 audio", "\(Int(stats.audioDurationMs.p90)) ms"),
                    ("Page text", percentText(stats.authoritativePageTextRate)),
                    ("Sync ready", percentText(stats.syncReadyRate))
                ])
            } else {
                emptyLine("Refresh to load aggregate /talk stats.")
            }
        }
        .accessibilityIdentifier("talk-diagnostics.conversation-health")
    }

    private var errorsSection: some View {
        diagnosticsCard(title: "Error Rate", summary: errors?.diagnosticsSummary ?? "No talk error snapshot yet") {
            if let errors {
                metricGrid([
                    ("Total", "\(errors.total)"),
                    ("Rate", String(format: "%.1f/hr", errors.errorRatePerHour)),
                    ("Classes", "\(errors.counts.count)")
                ])
                if !errors.counts.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(errors.counts.sorted(by: errorSort), id: \.key) { key, count in
                            HStack {
                                Text(key)
                                    .font(IOThemTypography.UI.monoCaption)
                                    .foregroundStyle(Color.herText.opacity(0.96))
                                    .fixedSize(horizontal: false, vertical: true)
                                Spacer()
                                Text("\(count)")
                                    .font(IOThemTypography.UI.monoCaption)
                                    .foregroundStyle(Color.herText.opacity(0.74))
                            }
                        }
                    }
                    .padding(.top, 4)
                }
            } else {
                emptyLine("Refresh to load /talk/errors.")
            }
        }
        .accessibilityIdentifier("talk-diagnostics.errors")
    }

    private var footer: some View {
        Text("Safe-public backend aggregates and local timing measurements only. No prompts, transcripts, user IDs, or replies are shown here.")
            .font(IOThemTypography.UI.label)
            .foregroundStyle(Color.herText.opacity(0.56))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var refreshedLine: String {
        guard let refreshedAt else { return "Not refreshed yet" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return "Updated \(formatter.localizedString(for: refreshedAt, relativeTo: Date()))"
    }

    private func diagnosticsCard<Content: View>(
        title: String,
        summary: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.herText.opacity(0.96))
                Text(summary)
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.66))
                    .fixedSize(horizontal: false, vertical: true)
            }
            content()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.58), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.68), lineWidth: 1)
        )
    }

    private func metricGrid(_ metrics: [(String, String)]) -> some View {
        LazyVGrid(columns: metricColumns, alignment: .leading, spacing: 8) {
            ForEach(metrics, id: \.0) { label, value in
                VStack(alignment: .leading, spacing: 3) {
                    Text(label)
                        .font(IOThemTypography.UI.micro)
                        .foregroundStyle(Color.herText.opacity(0.56))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(value)
                        .font(IOThemTypography.UI.monoCaption)
                        .foregroundStyle(Color.herText.opacity(0.96))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                }
                .padding(10)
                .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                .background(Color.white.opacity(0.54), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
    }

    private var metricColumns: [GridItem] {
        if isCompact {
            return Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: 2)
        }
        return [GridItem(.adaptive(minimum: 104), spacing: 8, alignment: .top)]
    }

    private func emptyLine(_ text: String) -> some View {
        Text(text)
            .font(IOThemTypography.UI.caption)
            .foregroundStyle(Color.herText.opacity(0.58))
    }

    private func percentText(_ value: Double) -> String {
        "\(Int((max(0, min(1, value)) * 100).rounded()))%"
    }

    private func errorSort(_ lhs: (key: String, value: Int), _ rhs: (key: String, value: Int)) -> Bool {
        if lhs.value == rhs.value { return lhs.key < rhs.key }
        return lhs.value > rhs.value
    }
}
