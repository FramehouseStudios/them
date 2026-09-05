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

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isCompactWidth {
                VStack(alignment: .leading, spacing: 10) {
                    recoverySectionTitle
                    refreshButton
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    recoverySectionTitle
                    Spacer()
                    refreshButton
                }
            }

            Text(statusText)
                .font(IOThemTypography.UI.callout)
                .foregroundStyle(Color.herText.opacity(0.78))
                .fixedSize(horizontal: false, vertical: true)
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

    private var isCompactWidth: Bool {
        horizontalSizeClass == .compact
    }

    private var recoverySectionTitle: some View {
        Text("Screenplay Outline Recovery")
            .font(IOThemTypography.UI.sectionTitle)
            .foregroundStyle(Color.herText.opacity(0.92))
            .fixedSize(horizontal: false, vertical: true)
    }

    private var refreshButton: some View {
        Button(action: onRefresh) {
            HStack(spacing: 7) {
                if isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                        .font(IOThemTypography.UI.prominentCallout)
                }
                Text(isRefreshing ? "Refreshing" : "Refresh")
                    .font(IOThemTypography.UI.calloutStrong)
            }
            .frame(minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(isDisabled || isRefreshing || runningChainID != nil)
        .accessibilityLabel("Refresh parked outline changes")
        .accessibilityHint("Checks this device for screenplay outline changes that need attention.")
        .accessibilityIdentifier("data.outline-recovery.refresh")
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
                        .fixedSize(horizontal: false, vertical: true)
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

            if isCompactWidth {
                recoveryActions(for: chain, horizontal: false)
            } else {
                ViewThatFits(in: .horizontal) {
                    recoveryActions(for: chain, horizontal: true)
                    recoveryActions(for: chain, horizontal: false)
                }
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
                recoveryActionButtons(for: chain, fullWidth: false)
            }
            .disabled(isDisabled || runningChainID != nil)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                recoveryActionButtons(for: chain, fullWidth: true)
            }
            .disabled(isDisabled || runningChainID != nil)
        }
    }

    @ViewBuilder
    private func recoveryActionButtons(
        for chain: ScreenplayOutlineMutationRecoveryChain,
        fullWidth: Bool
    ) -> some View {
        Button {
            onInspect(chain)
        } label: {
            Label("Inspect", systemImage: "doc.text.magnifyingglass")
                .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("data.outline-recovery.inspect.\(chain.id)")
        .accessibilityHint("Opens the saved outline snapshots and recovery details.")

        Button {
            onExport(chain)
        } label: {
            Label("Export", systemImage: "square.and.arrow.up")
                .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("data.outline-recovery.export.\(chain.id)")
        .accessibilityHint("Saves this outline recovery chain as JSON.")

        if chain.permitsRetry {
            Button {
                onRetry(chain)
            } label: {
                Label("Retry Safely", systemImage: "arrow.triangle.2.circlepath")
                    .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(.borderedProminent)
            .accessibilityHint("Retries the exact saved request with its original revision check.")
            .accessibilityIdentifier("data.outline-recovery.retry.\(chain.id)")
        }

        Button(role: .destructive) {
            onDiscard(chain)
        } label: {
            Label("Discard", systemImage: "trash")
                .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 44, alignment: .leading)
        }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("data.outline-recovery.discard.\(chain.id)")
        .accessibilityHint("Asks for confirmation before deleting the saved outline snapshots.")
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

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Label("Saved locally and never merged automatically", systemImage: "lock.shield")
                        .font(IOThemTypography.UI.prominentCallout)
                        .foregroundStyle(Color.orange.opacity(0.90))
                        .fixedSize(horizontal: false, vertical: true)

                    metadataCard

                    ForEach(Array(chain.entries.enumerated()), id: \.element.id) { index, entry in
                        snapshotCard(entry, index: index)
                    }
                }
                .padding(isCompactWidth ? 16 : 20)
                .frame(maxWidth: 760, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Parked Outline Change")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .top, spacing: 0) {
                recoveryDetailTopBar
            }
            #else
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Done", action: onDone)
                        .frame(minWidth: 64, minHeight: 44)
                        .accessibilityIdentifier("data.outline-recovery.detail.done")
                }
                ToolbarItem(placement: .primaryAction) {
                    Button(action: onExport) {
                        Label("Export", systemImage: "square.and.arrow.up")
                            .labelStyle(.titleAndIcon)
                    }
                    .frame(minHeight: 44)
                    .disabled(isDisabled)
                    .accessibilityIdentifier("data.outline-recovery.detail.export")
                    .accessibilityHint("Saves the complete recovery chain as JSON.")
                }
            }
            #endif
        }
        .accessibilityIdentifier("data.outline-recovery.detail")
        #if os(macOS)
        .frame(minWidth: 720, minHeight: 620)
        #endif
    }

    private var isCompactWidth: Bool {
        horizontalSizeClass == .compact
    }

    #if os(iOS)
    private var recoveryDetailTopBar: some View {
        HStack(spacing: 10) {
            Button("Done", action: onDone)
                .buttonStyle(.bordered)
                .frame(minWidth: 64, minHeight: 44)
                .contentShape(Rectangle())
                .accessibilityIdentifier("data.outline-recovery.detail.done")
                .accessibilityHint("Closes the recovery detail without changing saved work.")
            Spacer(minLength: 4)
            Text("Outline Recovery")
                .font(IOThemTypography.UI.calloutStrong)
                .foregroundStyle(Color.primary.opacity(0.86))
                .lineLimit(1)
                .minimumScaleFactor(0.82)
            Spacer(minLength: 4)
            Button(action: onExport) {
                Label("Export", systemImage: "square.and.arrow.up")
                    .labelStyle(.titleAndIcon)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .disabled(isDisabled)
            .accessibilityIdentifier("data.outline-recovery.detail.export")
            .accessibilityHint("Saves the complete recovery chain as JSON.")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.24)
        }
    }
    #endif

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
                    .fixedSize(horizontal: false, vertical: true)
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
