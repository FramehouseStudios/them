import SwiftUI
import ScreenplayStudio

struct TalkDiagnosticsSheet: View {
    let stats: BackendTalkStatsResponse?
    let errors: BackendTalkErrorsResponse?
    let refreshedAt: Date?
    let lastError: String
    let isRefreshing: Bool
    let onRefresh: () -> Void
    let onDone: () -> Void

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
                    statsSection
                    errorsSection
                }
            }
            footer
        }
        .padding(24)
        .background(Color.herPeachMid)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Talk Diagnostics")
                    .font(IOThemTypography.UI.title)
                    .foregroundStyle(Color.herText.opacity(0.96))
                Text(refreshedLine)
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.62))
            }
            Spacer()
            Button(action: onRefresh) {
                Label(isRefreshing ? "Refreshing" : "Refresh", systemImage: "arrow.clockwise")
            }
            .disabled(isRefreshing)
            Button("Done", action: onDone)
                .keyboardShortcut(.defaultAction)
        }
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
                                    .lineLimit(1)
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
    }

    private var footer: some View {
        Text("Safe-public backend snapshots only: aggregate counts, rates, and error classes. No prompts, transcripts, user IDs, or replies are shown here.")
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
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(metrics, id: \.0) { label, value in
                VStack(alignment: .leading, spacing: 3) {
                    Text(label)
                        .font(IOThemTypography.UI.micro)
                        .foregroundStyle(Color.herText.opacity(0.56))
                    Text(value)
                        .font(IOThemTypography.UI.monoCaption)
                        .foregroundStyle(Color.herText.opacity(0.96))
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white.opacity(0.54), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
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
