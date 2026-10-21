import SwiftUI
import ScreenplayStudio

/// One responsive navigator over the model's current draft/density snapshot.
/// Selection is preview UI state only; jumping uses the existing source handler.
struct ScreenplayStudioDraftPageTools: View {
    @Binding var linesPerPage: Int
    let presentation: ScreenplayStudioDraftPagesPresentation
    let onRefresh: () -> Void
    let onJumpToPage: (BackendScreenplayPaginationPage) -> Void
    @State private var selectedPageID: Int?

    private var selectedPage: ScreenplayStudioPaginationPagePresentation? { presentation.selectedPage(selectedPageID) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Page Navigator")
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(0.94))
                Text("Browse your screenplay and open its text without changing a word.")
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .fixedSize(horizontal: false, vertical: true)
            }
            summary
            navigation
            densityControls
            if !presentation.errorText.isEmpty {
                Text(presentation.errorText)
                    .font(IOThemTypography.UI.labelMedium)
                    .foregroundStyle(Color.red.opacity(0.82))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("studio.draft.pages.error")
            }
            if presentation.pages.isEmpty {
                Text("Your title page does not count as screenplay page 1. Start a scene to see its pages here.")
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.70))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("studio.draft.pages.empty")
            } else {
                LazyVStack(spacing: 10) {
                    ForEach(presentation.pages) { row in pageCard(row) }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("studio.draft.page-tools")
        .onChange(of: linesPerPage) { _, _ in selectedPageID = nil }
        .onChange(of: presentation.cursorPageID) { _, _ in selectedPageID = nil }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(presentation.summary(selection: selectedPageID))
                .font(IOThemTypography.UI.captionStrong)
                .accessibilityIdentifier("studio.draft.pages.summary")
            Text(presentation.runtimeText)
                .font(IOThemTypography.UI.labelRegular)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("studio.draft.pages.runtime")
            if presentation.activePageCount > 1 {
                Text("Cursor text spans several printed pages. Navigation selects a preview; opening it goes to the original source line.")
                    .font(IOThemTypography.UI.microRegular)
                    .fixedSize(horizontal: false, vertical: true)
            } else if let cursorPage = presentation.cursorPageID {
                Text("Cursor on page \(cursorPage)")
                    .font(IOThemTypography.UI.microRegular)
                    .accessibilityIdentifier("studio.draft.pages.cursor")
            }
        }
        .foregroundStyle(Color.herText.opacity(0.84))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.herShellStroke.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }

    private var navigation: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { navigationButtons }
            VStack(spacing: 8) { navigationButtons }
        }
    }

    @ViewBuilder private var navigationButtons: some View {
        navigationButton("Previous", symbol: "chevron.left", id: "previous", target: presentation.adjacentPage(to: selectedPageID, offset: -1))
        navigationButton("Next", symbol: "chevron.right", id: "next", target: presentation.adjacentPage(to: selectedPageID, offset: 1))
    }

    private func navigationButton(_ title: String, symbol: String, id: String, target: ScreenplayStudioPaginationPagePresentation?) -> some View {
        Button { if let target { jump(to: target) } } label: {
            Label(title, systemImage: symbol).fixedSize(horizontal: true, vertical: false)
                .frame(maxWidth: .infinity, minHeight: 32)
        }
        .font(IOThemTypography.UI.labelMedium)
        .buttonStyle(.bordered)
        .disabled(target == nil)
        .accessibilityIdentifier("studio.draft.pages.\(id)")
        .accessibilityLabel("\(title) page")
        .accessibilityHint("Moves the editor cursor to that page's original source text")
    }

    private var densityControls: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Preview density").font(IOThemTypography.UI.captionStrong)
            Text("\(linesPerPage) lines per page")
                .font(IOThemTypography.UI.labelMedium).monospacedDigit()
                .accessibilityIdentifier("studio.draft.pages.density.value")
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { densityButtons }
                VStack(spacing: 8) { densityButtons }
            }
            Button("Use standard \(ScreenplayPageLayout.defaultLinesPerPage)") { linesPerPage = ScreenplayPageLayout.defaultLinesPerPage }
                .buttonStyle(.bordered)
                .disabled(linesPerPage == ScreenplayPageLayout.defaultLinesPerPage)
                .accessibilityIdentifier("studio.draft.pages.density.standard")
                .accessibilityHint("Resets the preview to the standard Letter-page line density")
            Text("Preview only. Does not change your screenplay text or PDF layout. Time is an estimate at standard density.")
                .font(IOThemTypography.UI.microRegular)
                .foregroundStyle(Color.herText.opacity(0.70))
                .fixedSize(horizontal: false, vertical: true)
            Button(action: onRefresh) {
                Label(presentation.isRefreshing ? "Recalculating…" : "Recalculate Pages", systemImage: "arrow.clockwise")
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .disabled(presentation.refreshDisabled)
            .accessibilityIdentifier("studio.draft.pages.recalculate")
            .accessibilityHint("Rechecks the current draft; it never edits or saves your words")
        }
        .font(IOThemTypography.UI.labelMedium)
        .foregroundStyle(Color.herText.opacity(0.86))
    }

    @ViewBuilder private var densityButtons: some View {
        densityButton("Fewer lines", symbol: "minus", id: "decrease", delta: -1, disabled: linesPerPage <= ScreenplayPageLayout.minimumLinesPerPage)
        densityButton("More lines", symbol: "plus", id: "increase", delta: 1, disabled: linesPerPage >= ScreenplayPageLayout.maximumLinesPerPage)
    }

    private func densityButton(_ title: String, symbol: String, id: String, delta: Int, disabled: Bool) -> some View {
        Button { linesPerPage = min(ScreenplayPageLayout.maximumLinesPerPage, max(ScreenplayPageLayout.minimumLinesPerPage, linesPerPage + delta)) } label: {
            Label(title, systemImage: symbol).fixedSize(horizontal: true, vertical: false)
                .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.bordered)
        .disabled(disabled)
        .accessibilityIdentifier("studio.draft.pages.density.\(id)")
        .accessibilityLabel(delta < 0 ? "Decrease preview lines per page" : "Increase preview lines per page")
        .accessibilityValue("\(linesPerPage)")
    }

    private func pageCard(_ row: ScreenplayStudioPaginationPagePresentation) -> some View {
        let isSelected = selectedPage?.id == row.id
        return Button { jump(to: row) } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Page \(row.id)").font(IOThemTypography.UI.captionStrong)
                    Spacer(minLength: 4)
                    if isSelected { Text("Selected").font(IOThemTypography.UI.microMedium).fixedSize() }
                }
                Text("Lines \(row.page.startLine)–\(row.page.endLine) · \(row.durationText)")
                    .font(IOThemTypography.UI.microRegular)
                    .fixedSize(horizontal: false, vertical: true)
                if !row.visiblePreviewLines.isEmpty {
                    Text(row.visiblePreviewLines.joined(separator: "\n"))
                        .font(IOThemTypography.UI.monoPrompt)
                        .foregroundStyle(Color.black.opacity(0.82))
                        .lineSpacing(3).lineLimit(5)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.white.opacity(0.94), in: RoundedRectangle(cornerRadius: 8))
                }
                Label("Open page text", systemImage: "arrow.turn.down.right")
                    .font(IOThemTypography.UI.labelMedium)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundStyle(Color.herText.opacity(0.88))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(isSelected ? Color.herStudioActiveFill.opacity(0.14) : Color.herShellStroke.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(isSelected ? Color.herStudioActiveStroke.opacity(0.7) : Color.herShellStroke.opacity(0.2), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("studio.draft.page.\(row.id)")
        .accessibilityLabel("Page \(row.id), lines \(row.page.startLine) through \(row.page.endLine), \(row.durationText)\(isSelected ? ", selected preview" : "")")
        .accessibilityValue(row.visiblePreviewLines.joined(separator: "\n"))
        .accessibilityHint("Opens original source line \(row.page.startLine) in the editor; it does not replace text")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func jump(to row: ScreenplayStudioPaginationPagePresentation) {
        selectedPageID = row.id
        onJumpToPage(row.page)
    }
}
