import SwiftUI
import ScreenplayStudio

enum ScreenplayStudioSavedVersionsState: Equatable {
    case needsProject
    case empty
    case populated
}

struct ScreenplayStudioSavedVersionPresentation: Identifiable {
    var id: String { snapshot.id }

    let snapshot: ScreenplayStudioSnapshotPresentation
    let isLatest: Bool
}

struct ScreenplayStudioSavedPanelPresentation {
    let isSaving: Bool
    let hasDraft: Bool
    let autosaveStatusText: String
    let backgroundSyncNoticeText: String
    let hasSelectedProject: Bool
    let snapshotVersions: [ScreenplayStudioSnapshotPresentation]

    var saveTitle: String {
        isSaving ? "Saving…" : "Save Script"
    }

    var saveSystemImage: String {
        isSaving ? "arrow.clockwise" : "square.and.arrow.down"
    }

    var saveDisabled: Bool {
        isSaving || !hasDraft || !hasSelectedProject
    }

    var showsBackgroundSyncNotice: Bool {
        !backgroundSyncNoticeText.isEmpty
    }


    var versionsState: ScreenplayStudioSavedVersionsState {
        ScreenplayStudioSavedPanelPresentationPlanner.versionsState(
            hasSelectedProject: hasSelectedProject,
            versionCount: snapshotVersions.count
        )
    }

    var versions: [ScreenplayStudioSavedVersionPresentation] {
        ScreenplayStudioSavedPanelPresentationPlanner.versions(from: snapshotVersions)
    }
}

struct ScreenplayStudioSavedPanelActions {
    let onSave: () -> Void
    let onRetryBackgroundSync: () -> Void
    let onRestore: (BackendScreenplayVersion) -> Void
}

enum ScreenplayStudioSavedPanelPresentationPlanner {
    static func versionsState(
        hasSelectedProject: Bool,
        versionCount: Int
    ) -> ScreenplayStudioSavedVersionsState {
        guard hasSelectedProject else { return .needsProject }
        return versionCount > 0 ? .populated : .empty
    }

    static func versions(
        from snapshots: [ScreenplayStudioSnapshotPresentation]
    ) -> [ScreenplayStudioSavedVersionPresentation] {
        snapshots.enumerated().map { index, snapshot in
            ScreenplayStudioSavedVersionPresentation(
                snapshot: snapshot,
                isLatest: index == snapshots.startIndex
            )
        }
    }
}

struct ScreenplayStudioSavedPanel: View {
    let presentation: ScreenplayStudioSavedPanelPresentation
    let actions: ScreenplayStudioSavedPanelActions

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Button(action: actions.onSave) {
                    HStack(spacing: 6) {
                        Image(systemName: presentation.saveSystemImage)
                            .font(IOThemTypography.UI.label)
                        Text(presentation.saveTitle)
                            .font(IOThemTypography.UI.captionStrong)
                    }
                    .foregroundStyle(Color.herText.opacity(0.88))
                    .lineLimit(1)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(Color.herStudioActiveFill.opacity(0.18))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .fixedSize() // wrapped to "Save / Script" beside a long status chip
                .disabled(presentation.saveDisabled)
                .accessibilityHint(
                    presentation.hasSelectedProject
                        ? "Creates a saved screenplay version."
                        : "Select or create a project before saving."
                )
                .accessibilityIdentifier("studio.saved.save")

                savedStatusChip(presentation.autosaveStatusText, prominence: .muted)
            }

            Text(StudioSavedPanelCopy.intro)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.66))
                .accessibilityIdentifier("studio.saved.panel")

            if presentation.showsBackgroundSyncNotice {
                HStack(spacing: 8) {
                    Label(presentation.backgroundSyncNoticeText, systemImage: "icloud.slash")
                        .font(IOThemTypography.UI.labelMedium)
                        .foregroundStyle(Color.orange.opacity(0.82))
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    Button(action: actions.onRetryBackgroundSync) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Retry Studio sync")
                    .accessibilityIdentifier("studio.background-sync.retry")
                    .help("Retry Studio sync")
                }
                .accessibilityIdentifier("studio.background-sync.notice")
            }

            Divider()
                .overlay(Color.herShellStroke.opacity(0.18))

            savedVersionsContent
        }
    }

    @ViewBuilder
    private var savedVersionsContent: some View {
        switch presentation.versionsState {
        case .needsProject:
            Text("Select or create a project to keep saved screenplay versions here.")
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.48))
                .accessibilityIdentifier("studio.saved.empty.no-project")
        case .empty:
            Text(StudioSavedPanelCopy.empty)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.48))
                .accessibilityIdentifier("studio.saved.empty.no-versions")
        case .populated:
            VStack(alignment: .leading, spacing: 8) {
                Text("Recent saves")
                    .font(IOThemTypography.UI.micro)
                    .foregroundStyle(Color.herText.opacity(0.40))
                    .textCase(.uppercase)

                ForEach(presentation.versions) { version in
                    savedVersionRow(version)
                }
            }
        }
    }

    private func savedVersionRow(
        _ presentation: ScreenplayStudioSavedVersionPresentation
    ) -> some View {
        let snapshot = presentation.snapshot
        return HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(snapshot.phaseTitle)
                        .font(IOThemTypography.UI.captionStrong)
                        .foregroundStyle(Color.herText.opacity(0.88))
                        .accessibilityIdentifier("studio.saved.version.\(snapshot.id)")
                    if presentation.isLatest {
                        savedStatusChip("Latest", prominence: .success)
                    }
                }

                if let timestamp = snapshot.relativeTimestampText {
                    Text(timestamp)
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.62))
                }
                // Own line: beside the time it was cut to "Restored from Today…".
                if let notes = snapshot.notes {
                    Text(notes)
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.62))
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 0)

            Button(snapshot.restoreTitle) {
                actions.onRestore(snapshot.version)
            }
            .buttonStyle(.bordered)
            .disabled(!snapshot.restoreEnabled)
            .accessibilityIdentifier("studio.saved.restore.\(snapshot.id)")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.10))
        )
    }

    private func savedStatusChip(
        _ title: String,
        prominence: ScreenplayStudioSavedStatusChipProminence
    ) -> some View {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let fill: Color
        let stroke: Color
        let text: Color

        switch prominence {
        case .success:
            fill = Color.green.opacity(0.14)
            stroke = Color.green.opacity(0.34)
            text = Color.green.opacity(0.86)
        case .muted:
            fill = Color.herShellPanelSoft.opacity(0.94)
            stroke = Color.herShellStroke.opacity(0.22)
            text = Color.herText.opacity(0.74)
        }

        return Text(clean)
            .font(IOThemTypography.UI.captionStrong)
            .foregroundStyle(text)
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(
                Capsule()
                    .fill(fill)
            )
            .overlay(
                Capsule()
                    .stroke(stroke, lineWidth: 1)
            )
    }
}

private enum ScreenplayStudioSavedStatusChipProminence {
    case success
    case muted
}

/// The Saved panel named Command+S on an iPhone (seen live); the shortcut is
/// only mentioned where a keyboard is the norm.
enum StudioSavedPanelCopy {
    static var intro: String {
        #if os(macOS)
        return "Command+S saves the current script here and keeps recent versions inside Studio."
        #else
        return "Save Script keeps this version here, with your recent versions inside Studio."
        #endif
    }

    static var empty: String {
        #if os(macOS)
        return "No saved versions yet. Press Command+S or use Save Script to create the first one."
        #else
        return "No saved versions yet. Use Save Script to create the first one."
        #endif
    }
}
