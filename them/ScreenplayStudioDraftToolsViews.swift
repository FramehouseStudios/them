import SwiftUI
import ScreenplayStudio

enum ScreenplayStudioDraftDocumentNotice: Equatable {
    case warning(String)
    case information(String)
}

struct ScreenplayStudioDraftDocumentPresentation {
    static let fallbackStatusText = "Save status will appear here after your first edit."

    let isSaving: Bool
    let exportItems: [ScreenplayExportMenuItem]
    let autosaveStatusText: String
    let exportFormatsErrorText: String
    let pdfUnavailableText: String

    var statusText: String {
        autosaveStatusText.isEmpty ? Self.fallbackStatusText : autosaveStatusText
    }

    var statusSystemImage: String {
        if isSaving {
            return "arrow.triangle.2.circlepath"
        }

        let normalizedStatus = statusText.lowercased()
        if normalizedStatus.contains("saved") || normalizedStatus.contains("synced") {
            return "checkmark.circle.fill"
        }
        if normalizedStatus.contains("pending") || normalizedStatus.contains("offline") {
            return "clock.badge.exclamationmark"
        }
        return "icloud"
    }

    var statusIsConfirmed: Bool {
        let normalizedStatus = statusText.lowercased()
        return !isSaving && (normalizedStatus.contains("saved") || normalizedStatus.contains("synced"))
    }

    var notice: ScreenplayStudioDraftDocumentNotice? {
        if !exportFormatsErrorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .warning(exportFormatsErrorText)
        }
        if !pdfUnavailableText.isEmpty {
            return .information(pdfUnavailableText)
        }
        return nil
    }
}

struct ScreenplayStudioDraftFormatPresentation {
    let cards: [ScreenplayFormatLintCard]
    let isLoading: Bool
    let errorText: String
    let sourceText: String

    var shouldShow: Bool {
        isLoading || !cards.isEmpty || !errorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct ScreenplayStudioPaginationPagePresentation: Identifiable {
    var id: Int { page.page }

    let page: BackendScreenplayPaginationPage
    let previewLines: [String]
    let isActive: Bool

    var visiblePreviewLines: [String] {
        previewLines
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

struct ScreenplayStudioDraftPagesPresentation {
    let isRefreshing: Bool
    let isDraftEmpty: Bool
    let errorText: String
    let pages: [ScreenplayStudioPaginationPagePresentation]

    var refreshDisabled: Bool {
        isRefreshing || isDraftEmpty
    }

    var activePageIndex: Int? {
        pages.firstIndex(where: \.isActive)
    }

    var activePage: ScreenplayStudioPaginationPagePresentation? {
        guard let activePageIndex else { return nil }
        return pages[activePageIndex]
    }

    var previousPage: BackendScreenplayPaginationPage? {
        guard let activePageIndex, activePageIndex > pages.startIndex else { return nil }
        return pages[pages.index(before: activePageIndex)].page
    }

    var nextPage: BackendScreenplayPaginationPage? {
        guard let activePageIndex else { return nil }
        let nextIndex = pages.index(after: activePageIndex)
        guard pages.indices.contains(nextIndex) else { return nil }
        return pages[nextIndex].page
    }

    var estimatedMinutes: Double? {
        guard !pages.isEmpty else { return nil }
        let total = pages.reduce(0.0) { partialResult, row in
            if let estimate = row.page.estMinutes, estimate > 0 {
                return partialResult + estimate
            }
            return partialResult + (Double(max(0, row.page.lineCount)) / 55.0)
        }
        return total > 0 ? total : nil
    }
}

struct ScreenplayStudioDraftRevisionPresentation {
    let isRefreshing: Bool
    let isDraftEmpty: Bool
    let errorText: String
    let summary: BackendScreenplayRevisionSummary?
    let ranges: [BackendScreenplayRevisionRange]

    var refreshDisabled: Bool {
        isRefreshing || isDraftEmpty
    }
}

struct ScreenplayStudioSnapshotPresentation: Identifiable {
    var id: String { version.id }

    let version: BackendScreenplayVersion
    let phaseTitle: String
    let relativeTimestampText: String?
    let notes: String?
    let canRestore: Bool
}

struct ScreenplayStudioDraftSnapshotsPresentation {
    let versions: [ScreenplayStudioSnapshotPresentation]
}

struct ScreenplayStudioDraftToolsPresentation {
    let document: ScreenplayStudioDraftDocumentPresentation
    let integrityIssues: [ScreenplayPageIntegrityIssue]
    let formatLint: ScreenplayStudioDraftFormatPresentation
    let pages: ScreenplayStudioDraftPagesPresentation
    let revisions: ScreenplayStudioDraftRevisionPresentation
    let snapshots: ScreenplayStudioDraftSnapshotsPresentation
}

struct ScreenplayStudioDraftIntegrityActions {
    let onOpenInspector: () -> Void
    let onReview: (ScreenplayPageIntegrityIssue) -> Void
    let onMoveToPin: (ScreenplayPageIntegrityIssue) -> Void
    let onRemove: (ScreenplayPageIntegrityIssue) -> Void
    let onMoveAllToPin: () -> Void
}

struct ScreenplayStudioDraftToolsActions {
    let onSaveNow: () -> Void
    let onImport: () -> Void
    let onExport: (String) -> Void
    let onRefreshExportFormats: () -> Void
    let onOpenGoogleDocs: () -> Void
    let onRefreshFormatLint: () -> Void
    let integrity: ScreenplayStudioDraftIntegrityActions
    let onRefreshPagination: () -> Void
    let onJumpToPage: (BackendScreenplayPaginationPage) -> Void
    let onRefreshRevision: () -> Void
    let onCreateSnapshot: () -> Void
    let onRestoreSnapshot: (BackendScreenplayVersion) -> Void
}

enum ScreenplayStudioDraftRevisionTint: Equatable {
    case blue
    case pink
    case yellow
    case green
    case orange
    case red
    case brown
    case neutral
}

enum ScreenplayStudioDraftToolsPresentationPlanner {
    static func visibleIntegrityIssues(
        _ issues: [ScreenplayPageIntegrityIssue],
        limit: Int = 4
    ) -> [ScreenplayPageIntegrityIssue] {
        Array(issues.prefix(max(0, limit)))
    }

    static func integrityTitle(issueCount: Int) -> String {
        issueCount == 1
            ? "1 non-screenplay block detected"
            : "\(issueCount) non-screenplay blocks detected"
    }

    static func paginationPreviewLines(
        for page: BackendScreenplayPaginationPage,
        draft: String,
        maxLines: Int = 4
    ) -> [String] {
        guard maxLines > 0 else { return [] }
        func normalizedLines(_ text: String) -> [String] {
            text.replacingOccurrences(of: "\r\n", with: "\n")
                .replacingOccurrences(of: "\r", with: "\n")
                .components(separatedBy: "\n")
        }
        func visibleLines(_ lines: [String]) -> [String] {
            Array(lines.lazy
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .prefix(maxLines))
        }
        // The backend excerpt can be flattened or shortened. The current draft
        // keeps screenplay line structure and lets the view truncate visibly.
        let allLines = normalizedLines(draft)
        let startIndex = min(max(page.startLine, 1) - 1, allLines.count)
        let endIndex = max(startIndex, min(page.endLine, allLines.count))
        let pageLines = visibleLines(Array(allLines[startIndex..<endIndex]))
        return pageLines.isEmpty ? visibleLines(normalizedLines(page.preview ?? "")) : pageLines
    }

    static func isPaginationPageActive(
        _ page: BackendScreenplayPaginationPage,
        cursorLine: Int
    ) -> Bool {
        guard page.startLine <= page.endLine else { return false }
        return (page.startLine...page.endLine).contains(cursorLine)
    }

    static func orderedSnapshotVersions(
        _ versions: [BackendScreenplayVersion],
        limit: Int = 10
    ) -> [BackendScreenplayVersion] {
        versions
            .sorted { lhs, rhs in
                (lhs.updatedAt ?? lhs.createdAt ?? 0) > (rhs.updatedAt ?? rhs.createdAt ?? 0)
            }
            .prefix(max(0, limit))
            .map { $0 }
    }

    static func snapshotPhaseTitle(_ version: BackendScreenplayVersion) -> String {
        version.phase?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Draft"
    }

    static func snapshotNotes(_ version: BackendScreenplayVersion) -> String? {
        guard let notes = version.notes,
              !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return notes
    }

    static func snapshotCanRestore(_ version: BackendScreenplayVersion) -> Bool {
        !(version.draft ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func visibleRevisionRanges(
        _ ranges: [BackendScreenplayRevisionRange],
        limit: Int = 6
    ) -> [BackendScreenplayRevisionRange] {
        Array(ranges.prefix(max(0, limit)))
    }

    static func revisionTint(for key: String) -> ScreenplayStudioDraftRevisionTint {
        switch key.lowercased() {
        case "blue": return .blue
        case "pink": return .pink
        case "yellow": return .yellow
        case "green": return .green
        case "goldenrod": return .orange
        case "salmon", "cherry": return .red
        case "buff", "tan": return .brown
        default: return .neutral
        }
    }
}

struct ScreenplayStudioDraftToolsCard: View {
    @Binding var selectedSection: ScreenplayStudioScreen.DraftToolsSection
    @Binding var autosaveEnabled: Bool
    @Binding var linesPerPage: Int
    @Binding var revisionColor: String
    @Binding var snapshotLabel: String

    let presentation: ScreenplayStudioDraftToolsPresentation
    let actions: ScreenplayStudioDraftToolsActions

    var body: some View {
        sectionCard(title: "Document") {
            VStack(alignment: .leading, spacing: 16) {
                ScreenplayStudioDraftDocumentControls(
                    autosaveEnabled: $autosaveEnabled,
                    presentation: presentation.document,
                    actions: actions
                )

                if !presentation.integrityIssues.isEmpty {
                    ScreenplayStudioDraftIntegrityWarningSection(
                        issues: presentation.integrityIssues,
                        actions: actions.integrity
                    )
                }

                if presentation.formatLint.shouldShow {
                    ScreenplayFormatLintCardListView(
                        title: "Format warnings",
                        cards: presentation.formatLint.cards,
                        isLoading: presentation.formatLint.isLoading,
                        errorText: presentation.formatLint.errorText,
                        sourceText: presentation.formatLint.sourceText,
                        maxVisible: 3,
                        onRefresh: actions.onRefreshFormatLint
                    )
                }

                ScreenplayStudioDraftToolsTabs(selection: $selectedSection)

                selectedTools
                    .padding(16)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(Color.white.opacity(0.54))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.herShellStroke.opacity(0.22), lineWidth: 1)
                    )
            }
        }
    }

    @ViewBuilder
    private var selectedTools: some View {
        switch selectedSection {
        case .pages:
            ScreenplayStudioDraftPageTools(
                linesPerPage: $linesPerPage,
                presentation: presentation.pages,
                onRefresh: actions.onRefreshPagination,
                onJumpToPage: actions.onJumpToPage
            )
        case .revisions:
            ScreenplayStudioDraftRevisionTools(
                revisionColor: $revisionColor,
                presentation: presentation.revisions,
                onRefresh: actions.onRefreshRevision
            )
        case .snapshots:
            ScreenplayStudioDraftSnapshotTools(
                snapshotLabel: $snapshotLabel,
                presentation: presentation.snapshots,
                onCreateSnapshot: actions.onCreateSnapshot,
                onRestoreSnapshot: actions.onRestoreSnapshot
            )
        }
    }
}

private struct ScreenplayStudioDraftDocumentControls: View {
    @Binding var autosaveEnabled: Bool
    let presentation: ScreenplayStudioDraftDocumentPresentation
    let actions: ScreenplayStudioDraftToolsActions

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Save & Share")
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.herText.opacity(0.92))
                Text("Protect your latest changes, bring in another draft, or export a copy to share.")
                    .font(IOThemTypography.UI.callout)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .fixedSize(horizontal: false, vertical: true)
            }

            documentActions

            Divider()
                .overlay(Color.herShellStroke.opacity(0.24))

            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Autosave", systemImage: "arrow.triangle.2.circlepath")
                        .font(IOThemTypography.UI.calloutStrong)
                        .foregroundStyle(Color.herText.opacity(0.88))
                    Text("Keep each change protected while you write.")
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.66))
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                Toggle("Autosave", isOn: $autosaveEnabled)
                    .labelsHidden()
                    .toggleStyle(.switch)
                    .controlSize(.small)
                    .accessibilityIdentifier("studio.draft.document.autosave")
                    .accessibilityHint("Automatically saves screenplay changes while you write")
            }

            HStack(alignment: .top, spacing: 9) {
                Image(systemName: presentation.statusSystemImage)
                    .font(IOThemTypography.UI.calloutStrong)
                    .foregroundStyle(
                        presentation.statusIsConfirmed
                            ? Color.green.opacity(0.78)
                            : Color.herText.opacity(0.66)
                    )
                    .padding(.top, 1)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Draft status")
                        .font(IOThemTypography.UI.captionStrong)
                        .foregroundStyle(Color.herText.opacity(0.82))
                    Text(presentation.statusText)
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.herShellPanelSoft.opacity(0.78))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
            )

            if let notice = presentation.notice {
                switch notice {
                case .warning(let text):
                    Text(text)
                        .font(IOThemTypography.UI.labelMedium)
                        .foregroundStyle(Color.orange.opacity(0.78))
                        .fixedSize(horizontal: false, vertical: true)
                case .information(let text):
                    Text(text)
                        .font(IOThemTypography.UI.labelMedium)
                        .foregroundStyle(Color.herText.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.60))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.24), lineWidth: 1)
        )
    }

    private var documentActions: some View {
        VStack(spacing: 8) {
            saveButton
            importButton
            exportMenu
        }
    }

    private var saveButton: some View {
        Button(action: actions.onSaveNow) {
            Label(
                presentation.isSaving ? "Saving…" : "Save Now",
                systemImage: presentation.isSaving ? "arrow.clockwise" : "icloud.and.arrow.up"
            )
            .font(IOThemTypography.UI.calloutStrong)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.regular)
        .disabled(presentation.isSaving)
        .accessibilityIdentifier("studio.draft.document.save")
        .accessibilityHint("Saves the current screenplay draft now")
    }

    private var importButton: some View {
        Button(action: actions.onImport) {
            Label("Import", systemImage: "square.and.arrow.down")
                .font(IOThemTypography.UI.calloutStrong)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.regular)
        .accessibilityIdentifier("studio.draft.document.import")
        .accessibilityHint("Imports a screenplay file into this draft")
    }

    private var exportMenu: some View {
        Menu {
            ForEach(presentation.exportItems) { item in
                Button(item.title) {
                    actions.onExport(item.format)
                }
                .accessibilityIdentifier("studio.export.\(item.format.lowercased())")
                .disabled(!item.isEnabled)
            }
            Divider()
            Button("Refresh Export Formats", action: actions.onRefreshExportFormats)
            Button("Open in Google Docs", action: actions.onOpenGoogleDocs)
        } label: {
            Label("Export Copy", systemImage: "square.and.arrow.up")
                .font(IOThemTypography.UI.calloutStrong)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.regular)
        .accessibilityIdentifier("studio.export.menu")
        .accessibilityHint("Shows the available screenplay export formats")
    }
}

struct ScreenplayStudioDraftIntegrityWarningSection: View {
    let issues: [ScreenplayPageIntegrityIssue]
    let actions: ScreenplayStudioDraftIntegrityActions

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            Text("Companion-style or conversational prose is sitting on the screenplay page. Review or remove it before it gets baked into the script.")
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.68))

            VStack(alignment: .leading, spacing: 8) {
                ForEach(ScreenplayStudioDraftToolsPresentationPlanner.visibleIntegrityIssues(issues)) { issue in
                    issueRow(issue)
                }
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.orange.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.orange.opacity(0.16), lineWidth: 1)
        )
        .accessibilityIdentifier("studio.draft.integrity.list")
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(IOThemTypography.UI.label)
                .foregroundStyle(Color.orange.opacity(0.92))
            Text(ScreenplayStudioDraftToolsPresentationPlanner.integrityTitle(issueCount: issues.count))
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.herText.opacity(0.88))
            Spacer(minLength: 0)
            if issues.count > 1 {
                Button("Move all to Pin", action: actions.onMoveAllToPin)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityIdentifier("studio.draft.integrity.move-all")
            }
            Text("Review")
                .font(IOThemTypography.UI.micro)
                .foregroundStyle(Color.orange.opacity(0.92))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.12))
                .clipShape(Capsule())
        }
    }

    private func issueRow(_ issue: ScreenplayPageIntegrityIssue) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(issue.preview)
                .font(IOThemTypography.UI.monoLabel)
                .foregroundStyle(Color.herText.opacity(0.80))
                .lineLimit(3)

            Text("Lines \(issue.startLine)-\(issue.endLine) · \(issue.reason)")
                .font(IOThemTypography.UI.microRegular)
                .foregroundStyle(Color.herText.opacity(0.58))

            HStack(spacing: 8) {
                Button("Jump") {
                    actions.onReview(issue)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("studio.draft.integrity.jump.\(issue.startLine)-\(issue.endLine)")

                Button("Move to Pin") {
                    actions.onMoveToPin(issue)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("studio.draft.integrity.move.\(issue.startLine)-\(issue.endLine)")

                Button("Remove") {
                    actions.onRemove(issue)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange.opacity(0.28))
                .accessibilityIdentifier("studio.draft.integrity.remove.\(issue.startLine)-\(issue.endLine)")
            }
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.orange.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.orange.opacity(0.16), lineWidth: 1)
        )
    }
}

struct ScreenplayStudioPageIntegrityBanner: View {
    let issues: [ScreenplayPageIntegrityIssue]
    let actions: ScreenplayStudioDraftIntegrityActions

    var body: some View {
        let primaryIssue = issues.first

        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.orange.opacity(0.92))
                .padding(.top, 1)

            VStack(alignment: .leading, spacing: 5) {
                Text(ScreenplayStudioDraftToolsPresentationPlanner.integrityTitle(issueCount: issues.count))
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(0.88))

                if let primaryIssue {
                    Text("Lines \(primaryIssue.startLine)-\(primaryIssue.endLine) read like companion prose, not screenplay: \"\(primaryIssue.preview)\"")
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.72))
                        .lineLimit(2)
                } else {
                    Text("Non-screenplay text is sitting on the page and should be reviewed before it stays in the draft.")
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.72))
                }
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                Button("Review") {
                    if let primaryIssue {
                        actions.onReview(primaryIssue)
                    } else {
                        actions.onOpenInspector()
                    }
                }
                .buttonStyle(.bordered)

                if issues.count > 1 {
                    Button("Move all to Pin", action: actions.onMoveAllToPin)
                        .buttonStyle(.bordered)
                }

                if let primaryIssue {
                    Button("Move to Pin") {
                        actions.onMoveToPin(primaryIssue)
                    }
                    .buttonStyle(.bordered)

                    Button("Remove") {
                        actions.onRemove(primaryIssue)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.orange.opacity(0.28))
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.orange.opacity(0.12))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.orange.opacity(0.16), lineWidth: 1)
        )
        .accessibilityIdentifier("studio.page.integrity.banner")
    }
}

private struct ScreenplayStudioDraftToolsTabs: View {
    @Binding var selection: ScreenplayStudioScreen.DraftToolsSection

    var body: some View {
        HStack(spacing: 8) {
            ForEach(ScreenplayStudioScreen.DraftToolsSection.allCases) { section in
                sectionButton(section)
            }
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.white.opacity(0.54))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.22), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }

    private func sectionButton(_ section: ScreenplayStudioScreen.DraftToolsSection) -> some View {
        let isActive = selection == section
        return Button {
            selection = section
        } label: {
            VStack(spacing: 5) {
                Image(systemName: section.iconName)
                    .font(IOThemTypography.UI.calloutStrong)
                Text(section.title)
                    .font(IOThemTypography.UI.captionStrong)
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
            }
            .foregroundStyle(Color.herText.opacity(isActive ? 0.92 : 0.70))
            .frame(maxWidth: .infinity, alignment: .center)
            .frame(minHeight: 46)
            .padding(.horizontal, 4)
            .padding(.vertical, 6)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(isActive ? Color.herStudioActiveFill.opacity(0.76) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(
                        isActive ? Color.herStudioActiveStroke.opacity(0.90) : Color.clear,
                        lineWidth: isActive ? 1.3 : 1
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(section.title)
        .accessibilityHint("Shows \(section.title.lowercased()) tools")
        .accessibilityIdentifier("studio.draft.tools.\(section.rawValue)")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}

private struct ScreenplayStudioDraftPageTools: View {
    private static let standardLinesPerPage = 55
    private static let linesPerPageRange = 24...90

    @Binding var linesPerPage: Int
    let presentation: ScreenplayStudioDraftPagesPresentation
    let onRefresh: () -> Void
    let onJumpToPage: (BackendScreenplayPaginationPage) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Page Navigator")
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.herText.opacity(0.92))
                    .accessibilityIdentifier("studio.draft.pages.title")
                Text("See where you are, move between pages, and adjust how the draft is divided without changing its words.")
                    .font(IOThemTypography.UI.callout)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .fixedSize(horizontal: false, vertical: true)
            }

            pageOverview
            pageDivisionControls

            paginationStrip
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.draft.page-tools")
    }

    private var pageOverview: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 8) {
                pageMetric(
                    title: "Current page",
                    value: presentation.activePage.map { "\($0.page.page)" } ?? "—",
                    systemImage: "location.fill",
                    identifier: "studio.draft.pages.summary.current"
                )
                pageMetric(
                    title: "Draft pages",
                    value: "\(presentation.pages.count)",
                    systemImage: "doc.on.doc",
                    identifier: "studio.draft.pages.summary.total"
                )
            }

            if let estimatedMinutes = presentation.estimatedMinutes {
                Label(
                    String(format: "About %.1f minutes of screen time", estimatedMinutes),
                    systemImage: "clock"
                )
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.68))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("studio.draft.pages.summary.runtime")
            } else if presentation.pages.isEmpty {
                Label("Add draft text to calculate pages", systemImage: "text.badge.plus")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.66))
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(Color.herShellPanelSoft.opacity(0.76))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.draft.pages.summary")
    }

    private func pageMetric(
        title: String,
        value: String,
        systemImage: String,
        identifier: String
    ) -> some View {
        HStack(alignment: .center, spacing: 9) {
            Image(systemName: systemImage)
                .font(IOThemTypography.UI.calloutStrong)
                .foregroundStyle(Color.herStudioActiveStroke.opacity(0.84))
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.62))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                Text(value)
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.herText.opacity(0.92))
            }
            Spacer(minLength: 0)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color.white.opacity(0.62))
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title), \(value)")
        .accessibilityIdentifier(identifier)
    }

    private var pageDivisionControls: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Page density")
                    .font(IOThemTypography.UI.calloutStrong)
                    .foregroundStyle(Color.herText.opacity(0.88))
                Text("Lines per page changes page breaks and navigation only. It never rewrites the screenplay.")
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.66))
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                linesPerPageButton(
                    title: "Decrease",
                    systemImage: "minus",
                    identifier: "studio.draft.pages.lines.decrease",
                    disabled: linesPerPage <= Self.linesPerPageRange.lowerBound
                ) {
                    linesPerPage = max(Self.linesPerPageRange.lowerBound, linesPerPage - 1)
                }

                VStack(spacing: 1) {
                    Text("\(linesPerPage)")
                        .font(IOThemTypography.UI.sectionTitle)
                        .foregroundStyle(Color.herText.opacity(0.94))
                    Text("lines / page")
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.60))
                        .lineLimit(1)
                        .minimumScaleFactor(0.82)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Lines per page")
                .accessibilityValue("\(linesPerPage)")
                .accessibilityIdentifier("studio.draft.pages.lines.value")

                linesPerPageButton(
                    title: "Increase",
                    systemImage: "plus",
                    identifier: "studio.draft.pages.lines.increase",
                    disabled: linesPerPage >= Self.linesPerPageRange.upperBound
                ) {
                    linesPerPage = min(Self.linesPerPageRange.upperBound, linesPerPage + 1)
                }
            }

            VStack(spacing: 8) {
                Button {
                    linesPerPage = Self.standardLinesPerPage
                } label: {
                    Label("Use standard 55", systemImage: "gauge.with.dots.needle.67percent")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(linesPerPage == Self.standardLinesPerPage)
                .accessibilityIdentifier("studio.draft.pages.lines.standard")
                .accessibilityHint("Sets page navigation to 55 lines per page")

                Button(action: onRefresh) {
                    Label(
                        presentation.isRefreshing ? "Recalculating…" : "Recalculate Pages",
                        systemImage: presentation.isRefreshing ? "arrow.triangle.2.circlepath" : "arrow.clockwise"
                    )
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(presentation.refreshDisabled)
                .accessibilityIdentifier("studio.draft.pages.refresh")
                .accessibilityHint("Rebuilds the page map using the current draft and page density")
                .help("Recalculate pages")
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .fill(Color.white.opacity(0.58))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.draft.pages.density")
    }

    private func linesPerPageButton(
        title: String,
        systemImage: String,
        identifier: String,
        disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: systemImage)
                    .font(IOThemTypography.UI.calloutStrong)
                Text(title)
                    .font(IOThemTypography.UI.microMedium)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.bordered)
        .disabled(disabled)
        .accessibilityLabel("\(title) lines per page")
        .accessibilityIdentifier(identifier)
    }

    private var paginationStrip: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !presentation.errorText.isEmpty {
                Label(presentation.errorText, systemImage: "exclamationmark.triangle.fill")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.red.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 11, style: .continuous)
                            .fill(Color.red.opacity(0.08))
                    )
            }
            if presentation.pages.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("No pages calculated yet", systemImage: "doc.text.magnifyingglass")
                        .font(IOThemTypography.UI.calloutStrong)
                        .foregroundStyle(Color.herText.opacity(0.82))
                    Text("Start writing, then choose Recalculate Pages to build a navigable page map.")
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.66))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 13, style: .continuous)
                        .fill(Color.herShellPanelSoft.opacity(0.70))
                )
                .accessibilityIdentifier("studio.draft.pages.empty")
            } else {
                quickPageNavigation

                Text("All Pages")
                    .font(IOThemTypography.UI.calloutStrong)
                    .foregroundStyle(Color.herText.opacity(0.86))

                LazyVStack(spacing: 12) {
                    ForEach(presentation.pages) { row in
                        pageRow(row)
                    }
                }
                .accessibilityIdentifier("studio.draft.pages.list")
            }
        }
    }

    private var quickPageNavigation: some View {
        HStack(spacing: 8) {
            Button {
                guard let page = presentation.previousPage else { return }
                onJumpToPage(page)
            } label: {
                Label("Previous", systemImage: "chevron.left")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(presentation.previousPage == nil)
            .accessibilityIdentifier("studio.draft.pages.previous")
            .accessibilityHint("Moves the cursor to the previous screenplay page")

            Button {
                guard let page = presentation.nextPage else { return }
                onJumpToPage(page)
            } label: {
                Label("Next", systemImage: "chevron.right")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(presentation.nextPage == nil)
            .accessibilityIdentifier("studio.draft.pages.next")
            .accessibilityHint("Moves the cursor to the next screenplay page")
        }
    }

    private func pageRow(_ row: ScreenplayStudioPaginationPagePresentation) -> some View {
        let page = row.page
        let rowButton = Button {
            onJumpToPage(page)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text("Page \(page.page)")
                        .font(IOThemTypography.UI.sectionTitle)
                        .foregroundStyle(Color.herText.opacity(0.92))

                    if row.isActive {
                        Text("CURRENT")
                            .font(IOThemTypography.UI.microMedium)
                            .foregroundStyle(Color.herStudioActiveStroke.opacity(0.92))
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(
                                Capsule()
                                    .fill(Color.herStudioActiveFill.opacity(0.70))
                            )
                    }

                    Spacer(minLength: 0)

                    if let estMinutes = page.estMinutes, estMinutes > 0 {
                        Label(String(format: "%.1f min", estMinutes), systemImage: "clock")
                            .font(IOThemTypography.UI.labelRegular)
                            .foregroundStyle(Color.herText.opacity(0.62))
                    }
                }

                HStack(spacing: 10) {
                    Label("Lines \(page.startLine)–\(page.endLine)", systemImage: "text.alignleft")
                    Text("\(page.lineCount) lines")
                }
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.64))

                pagePreview(row)

                HStack(spacing: 6) {
                    Image(systemName: row.isActive ? "location.fill" : "arrow.right.circle")
                    Text(row.isActive ? "Highlight current page" : "Jump to this page")
                    Spacer(minLength: 0)
                }
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(
                    row.isActive
                        ? Color.herStudioActiveStroke.opacity(0.92)
                        : Color.herText.opacity(0.68)
                )
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(row.isActive ? Color.herStudioActiveFill.opacity(0.36) : Color.white.opacity(0.54))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(
                        row.isActive
                            ? Color.herStudioActiveStroke.opacity(0.62)
                            : Color.herShellStroke.opacity(0.20),
                        lineWidth: row.isActive ? 1.3 : 1
                )
            )
        }
        return rowButton
            .buttonStyle(.plain)
            .accessibilityLabel(pageAccessibilityLabel(row))
            .accessibilityHint(row.isActive ? "Highlights this page in the screenplay editor" : "Moves the cursor to this page")
            .accessibilityIdentifier("studio.draft.page.\(page.page)")
            .accessibilityAddTraits(row.isActive ? .isSelected : [])
    }

    private func pagePreview(_ row: ScreenplayStudioPaginationPagePresentation) -> some View {
        let lines = Array(row.visiblePreviewLines.prefix(4))
        return VStack(alignment: .leading, spacing: 4) {
            if lines.isEmpty {
                Text("No preview text is available for this page yet.")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.52))
                    .italic()
            } else {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(IOThemTypography.UI.monoCaption)
                        .foregroundStyle(Color.black.opacity(0.74))
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.96))
                .shadow(color: Color.black.opacity(0.05), radius: 6, y: 2)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
        )
    }

    private func pageAccessibilityLabel(_ row: ScreenplayStudioPaginationPagePresentation) -> String {
        let page = row.page
        var components = [
            "Page \(page.page)",
            "lines \(page.startLine) through \(page.endLine)",
            "\(page.lineCount) lines",
        ]
        if row.isActive {
            components.append("current page")
        }
        if let estMinutes = page.estMinutes, estMinutes > 0 {
            components.append(String(format: "approximately %.1f minutes", estMinutes))
        }
        let excerpt = row.visiblePreviewLines.prefix(2).joined(separator: ". ")
        if !excerpt.isEmpty {
            components.append("Preview: \(excerpt.prefix(160))")
        }
        return components.joined(separator: ", ")
    }
}

private struct ScreenplayStudioDraftRevisionTools: View {
    @Binding var revisionColor: String
    let presentation: ScreenplayStudioDraftRevisionPresentation
    let onRefresh: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            inspectorSubsectionLabel("Revision Color")

            HStack(spacing: 8) {
                Picker("Revision", selection: $revisionColor) {
                    Text("Blue").tag("blue")
                    Text("Pink").tag("pink")
                    Text("Yellow").tag("yellow")
                    Text("Green").tag("green")
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 320)
                Spacer()
                if presentation.isRefreshing {
                    ProgressView()
                        .controlSize(.small)
                }
                Button(action: onRefresh) {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .disabled(presentation.refreshDisabled)
                .accessibilityLabel("Refresh revision colors")
                .help("Refresh revision colors")
            }

            if !presentation.errorText.isEmpty {
                Text(presentation.errorText)
                    .font(IOThemTypography.UI.labelMedium)
                    .foregroundStyle(Color.red.opacity(0.82))
            }

            revisionSummary
        }
        .accessibilityIdentifier("studio.draft.revision-tools")
    }

    private var revisionSummary: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let summary = presentation.summary {
                HStack(spacing: 8) {
                    metricChip("Revised", value: "\(summary.revised)")
                    metricChip("Added", value: "\(summary.added)")
                    metricChip("Moved", value: "\(summary.moved)")
                    metricChip("Removed", value: "\(summary.removed)")
                }
            }
            if presentation.ranges.isEmpty {
                Text("Revision ranges appear after a saved baseline exists.")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.62))
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(
                        Array(
                            ScreenplayStudioDraftToolsPresentationPlanner
                                .visibleRevisionRanges(presentation.ranges)
                                .enumerated()
                        ),
                        id: \.offset
                    ) { _, range in
                        HStack(spacing: 8) {
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(revisionFillColor(range.color))
                                .frame(width: 14, height: 8)
                            Text("\(range.status.capitalized) lines \(range.startLine)-\(range.endLine)")
                                .font(IOThemTypography.UI.caption)
                                .foregroundStyle(Color.herText.opacity(0.72))
                        }
                    }
                }
            }
        }
    }

    private func metricChip(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.70))
            Text(value)
                .font(IOThemTypography.UI.prominentCallout)
                .foregroundStyle(Color.herText.opacity(0.95))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.16))
        )
    }

    private func revisionFillColor(_ key: String) -> Color {
        switch ScreenplayStudioDraftToolsPresentationPlanner.revisionTint(for: key) {
        case .blue: return Color.blue.opacity(0.75)
        case .pink: return Color.pink.opacity(0.82)
        case .yellow: return Color.yellow.opacity(0.86)
        case .green: return Color.green.opacity(0.82)
        case .orange: return Color.orange.opacity(0.84)
        case .red:
            return key.lowercased() == "cherry" ? Color.red.opacity(0.90) : Color.red.opacity(0.75)
        case .brown: return Color.brown.opacity(0.72)
        case .neutral: return Color.white.opacity(0.40)
        }
    }
}

private struct ScreenplayStudioDraftSnapshotTools: View {
    @Binding var snapshotLabel: String
    let presentation: ScreenplayStudioDraftSnapshotsPresentation
    let onCreateSnapshot: () -> Void
    let onRestoreSnapshot: (BackendScreenplayVersion) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Revision Snapshots")
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.herText.opacity(0.90))
                Text("Create a restore point before a major rewrite or structural change.")
                    .font(IOThemTypography.UI.callout)
                    .foregroundStyle(Color.herText.opacity(0.68))
                    .fixedSize(horizontal: false, vertical: true)
            }

            snapshotCreationControls

            if presentation.versions.isEmpty {
                HStack(alignment: .top, spacing: 9) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(IOThemTypography.UI.calloutStrong)
                        .foregroundStyle(Color.herText.opacity(0.58))
                        .padding(.top, 1)
                    Text("No restore points yet. Add an optional note above, then create your first snapshot.")
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.herShellPanelSoft.opacity(0.72))
                )
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(presentation.versions) { snapshot in
                        snapshotRow(snapshot)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.draft.snapshot-tools")
    }

    private var snapshotCreationControls: some View {
        VStack(spacing: 8) {
            snapshotNoteField
            createSnapshotButton
        }
    }

    private var snapshotNoteField: some View {
        TextField("Snapshot note (optional)", text: $snapshotLabel)
            .textFieldStyle(.roundedBorder)
            .accessibilityIdentifier("studio.draft.snapshot.note")
            .accessibilityHint("Describes what this restore point protects")
    }

    private var createSnapshotButton: some View {
        Button(action: onCreateSnapshot) {
            Label("Create Snapshot", systemImage: "plus")
                .font(IOThemTypography.UI.calloutStrong)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.regular)
        .accessibilityIdentifier("studio.draft.snapshot.create")
        .accessibilityHint("Creates a restorable copy of the current draft")
    }

    private func snapshotRow(_ snapshot: ScreenplayStudioSnapshotPresentation) -> some View {
        HStack(spacing: 8) {
            Text(snapshot.phaseTitle)
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.herText.opacity(0.88))
            if let timestamp = snapshot.relativeTimestampText {
                Text(timestamp)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.66))
            }
            if let notes = snapshot.notes {
                Text(notes)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.66))
                    .lineLimit(1)
            }
            Spacer()
            Button("Restore") {
                onRestoreSnapshot(snapshot.version)
            }
            .buttonStyle(.bordered)
            .disabled(!snapshot.canRestore)
            .accessibilityIdentifier("studio.draft.snapshot.restore.\(snapshot.id)")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.12))
        )
    }
}
