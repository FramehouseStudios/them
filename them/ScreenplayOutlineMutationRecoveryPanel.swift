import SwiftUI
import ScreenplayStudio
import UniformTypeIdentifiers

struct ScreenplayOutlineMutationRecoveryDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

struct ScreenplayOutlineMutationRecoveryPanel: View {
    let chains: [ScreenplayOutlineMutationRecoveryChain]
    let statusText: String
    let isRefreshing: Bool
    let isDisabled: Bool
    let runningChainID: String?
    let onRefresh: () -> Void
    let onInspect: (ScreenplayOutlineMutationRecoveryChain) -> Void
    let onExport: (ScreenplayOutlineMutationRecoveryChain) -> Void
    let onRetry: (ScreenplayOutlineMutationRecoveryChain) -> Void
    let onDiscard: (ScreenplayOutlineMutationRecoveryChain) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Screenplay Outline Recovery")
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.herText.opacity(0.92))
                Spacer()
                Button(action: onRefresh) {
                    if isRefreshing {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(IOThemTypography.UI.prominentCallout)
                    }
                }
                .buttonStyle(.plain)
                .disabled(isDisabled || isRefreshing || runningChainID != nil)
                .accessibilityLabel("Refresh parked outline changes")
                .accessibilityIdentifier("data.outline-recovery.refresh")
            }

            Text(statusText)
                .font(IOThemTypography.UI.callout)
                .foregroundStyle(Color.herText.opacity(0.78))
                .accessibilityIdentifier("data.outline-recovery.summary")

            ForEach(chains) { chain in
                recoveryChainCard(chain)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white.opacity(0.20))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("data.outline-recovery.section")
    }

    private func recoveryChainCard(
        _ chain: ScreenplayOutlineMutationRecoveryChain
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                    .font(IOThemTypography.UI.bodyStrong)
                    .foregroundStyle(Color.orange.opacity(0.88))
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(recoveryTitle(for: chain))
                        .font(IOThemTypography.UI.prominentCallout)
                        .foregroundStyle(Color.herText.opacity(0.90))
                    Text(recoveryMetadata(for: chain))
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                if runningChainID == chain.id {
                    ProgressView()
                        .controlSize(.small)
                }
            }

            if !chain.parkedHead.lastError.isEmpty {
                Text(chain.parkedHead.lastError)
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.72))
                    .lineLimit(3)
            }

            if !chain.permitsRetry {
                Label(chain.retryUnavailableReason, systemImage: "lock.shield")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.orange.opacity(0.90))
                    .fixedSize(horizontal: false, vertical: true)
            }

            ViewThatFits(in: .horizontal) {
                recoveryActions(for: chain, horizontal: true)
                recoveryActions(for: chain, horizontal: false)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.18))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.20), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("data.outline-recovery.entry.\(chain.id)")
    }

    @ViewBuilder
    private func recoveryActions(
        for chain: ScreenplayOutlineMutationRecoveryChain,
        horizontal: Bool
    ) -> some View {
        if horizontal {
            HStack(spacing: 8) {
                recoveryActionButtons(for: chain)
            }
            .disabled(isDisabled || runningChainID != nil)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                recoveryActionButtons(for: chain)
            }
            .disabled(isDisabled || runningChainID != nil)
        }
    }

    @ViewBuilder
    private func recoveryActionButtons(
        for chain: ScreenplayOutlineMutationRecoveryChain
    ) -> some View {
        Button {
            onInspect(chain)
        } label: {
            Label("Inspect", systemImage: "doc.text.magnifyingglass")
        }
        .accessibilityIdentifier("data.outline-recovery.inspect.\(chain.id)")

        Button {
            onExport(chain)
        } label: {
            Label("Export", systemImage: "square.and.arrow.up")
        }
        .accessibilityIdentifier("data.outline-recovery.export.\(chain.id)")

        if chain.permitsRetry {
            Button {
                onRetry(chain)
            } label: {
                Label("Retry Safely", systemImage: "arrow.triangle.2.circlepath")
            }
            .accessibilityHint("Retries the exact saved request with its original revision check.")
            .accessibilityIdentifier("data.outline-recovery.retry.\(chain.id)")
        }

        Button(role: .destructive) {
            onDiscard(chain)
        } label: {
            Label("Discard", systemImage: "trash")
        }
        .accessibilityIdentifier("data.outline-recovery.discard.\(chain.id)")
    }

    private func recoveryTitle(for chain: ScreenplayOutlineMutationRecoveryChain) -> String {
        let cleanSource = chain.parkedHead.source
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return cleanSource.isEmpty ? "Parked outline change" : cleanSource
    }

    private func recoveryMetadata(for chain: ScreenplayOutlineMutationRecoveryChain) -> String {
        let snapshotCount = chain.entries.count
        let snapshotLabel = snapshotCount == 1 ? "snapshot" : "linked snapshots"
        return "Project \(chain.projectId) • revision \(chain.parkedHead.expectedOutlineRevision) • \(snapshotCount) \(snapshotLabel)"
    }
}

struct ScreenplayOutlineMutationRecoveryDetailView: View {
    let chain: ScreenplayOutlineMutationRecoveryChain
    let isDisabled: Bool
    let onExport: () -> Void
    let onDone: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Label("Saved locally and never merged automatically", systemImage: "lock.shield")
                        .font(IOThemTypography.UI.prominentCallout)
                        .foregroundStyle(Color.orange.opacity(0.90))

                    metadataCard

                    ForEach(Array(chain.entries.enumerated()), id: \.element.id) { index, entry in
                        snapshotCard(entry, index: index)
                    }
                }
                .padding(20)
                .frame(maxWidth: 760, alignment: .leading)
            }
            .navigationTitle("Parked Outline Change")
            .toolbar {
                #if os(macOS)
                ToolbarItem(placement: .automatic) {
                    Button("Done", action: onDone)
                }
                #else
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", action: onDone)
                }
                #endif
                ToolbarItem(placement: .primaryAction) {
                    Button(action: onExport) {
                        Label("Export", systemImage: "square.and.arrow.up")
                    }
                    .disabled(isDisabled)
                }
            }
        }
        .accessibilityIdentifier("data.outline-recovery.detail")
        #if os(macOS)
        .frame(minWidth: 720, minHeight: 620)
        #endif
    }

    private var metadataCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            detailRow("Project", chain.projectId)
            detailRow("Request", chain.parkedHead.id)
            detailRow("Source", chain.parkedHead.source)
            detailRow("Expected revision", String(chain.parkedHead.expectedOutlineRevision))
            detailRow("Retry attempts", String(chain.parkedHead.retries))
            detailRow(
                "Created",
                Date(timeIntervalSince1970: chain.parkedHead.createdAt)
                    .formatted(date: .abbreviated, time: .standard)
            )
            if let parkedReason = chain.parkedHead.parkedReason {
                detailRow("Reason", parkedReason.rawValue.replacingOccurrences(of: "_", with: " "))
            }
            if !chain.parkedHead.lastError.isEmpty {
                detailRow("Last error", chain.parkedHead.lastError)
            }
            detailRow("Recovery snapshots", String(chain.entries.count))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.32))
        )
        .textSelection(.enabled)
    }

    private func snapshotCard(
        _ entry: ScreenplayOutlineMutationOutboxEntry,
        index: Int
    ) -> some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 12) {
                outlineEntityPreview(
                    title: "Acts",
                    values: entry.acts.map { $0.title }
                )
                outlineEntityPreview(
                    title: "Scenes",
                    values: entry.scenes.map { scene in
                        let slugline = (scene.slugline ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                        return slugline.isEmpty ? scene.title : slugline
                    }
                )
                outlineEntityPreview(
                    title: "Beats",
                    values: entry.beats.map { $0.label }
                )
            }
            .padding(.top, 10)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(index == 0 ? "Parked snapshot" : "Dependent snapshot \(index + 1)")
                    .font(IOThemTypography.UI.prominentCallout)
                Text("Revision \(entry.expectedOutlineRevision) • \(entry.acts.count) acts • \(entry.scenes.count) scenes • \(entry.beats.count) beats")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.secondary)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.24))
        )
    }

    @ViewBuilder
    private func outlineEntityPreview(title: String, values: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(title) (\(values.count))")
                .font(IOThemTypography.UI.calloutStrong)
            if values.isEmpty {
                Text("None")
                    .foregroundStyle(Color.secondary)
            } else {
                ForEach(Array(values.prefix(12).enumerated()), id: \.offset) { _, value in
                    Text("• \(value)")
                        .fixedSize(horizontal: false, vertical: true)
                }
                if values.count > 12 {
                    Text("+ \(values.count - 12) more in the exported recovery file")
                        .foregroundStyle(Color.secondary)
                }
            }
        }
        .font(IOThemTypography.UI.caption)
        .textSelection(.enabled)
    }

    private func detailRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.secondary)
            Text(value)
                .font(IOThemTypography.UI.monoCaption)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
