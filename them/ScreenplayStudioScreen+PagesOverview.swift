// Studio home: printed-page overview (page cards with numbers) and the jump-to-page plumbing it reuses.
import Foundation
import SwiftUI
import Combine
import ScreenplayStudio

extension ScreenplayStudioScreen {
    func jumpToPaginationPage(_ page: BackendScreenplayPaginationPage) {
        liveDraftBridge.jumpToLine(page.startLine)
        liveDraftBridge.highlightLineRange(startLine: page.startLine, endLine: page.endLine)
    }
}

extension ScreenplayStudioScreen {
    /// Header chip on the Studio home page: live printed-page count for the
    /// draft as typed, opening the numbered page overview.
    var screenplayPagesOverviewChip: some View {
        let pageCount = ScreenplayPageLayout.pageCount(for: vm.fountainDraft)
        return Button {
            vm.isPagesOverviewPresented = true
        } label: {
            HStack(spacing: IOThemSpacing.Scale.xxs) {
                Image(systemName: "doc.on.doc")
                    .font(IOThemTypography.UI.compactLabel)
                Text(ScreenplayPageLayout.summaryText(pageCount: pageCount))
                    .font(IOThemTypography.UI.compactLabel)
                    .lineLimit(1)
            }
            .foregroundStyle(Color.herText.opacity(0.78))
            .padding(.horizontal, IOThemSpacing.Scale.sm + 1)
            .padding(.vertical, IOThemSpacing.Scale.xs - 1)
            .background(Color.herShellPanelSoft.opacity(0.82))
            .overlay(
                Capsule()
                    .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
            )
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("studio.draft.page.pages")
        .accessibilityLabel("\(ScreenplayPageLayout.summaryText(pageCount: pageCount)). Show printed pages.")
        .help("Printed pages at \(ScreenplayPageLayout.defaultLinesPerPage) lines per page. Tap to see every numbered page.")
    }

    var screenplayPagesOverviewSheet: some View {
        ScreenplayStudioPagesOverviewView(
            draft: vm.fountainDraft,
            title: vm.selectedProject?.title ?? "",
            onJumpToPage: { page in
                vm.isPagesOverviewPresented = false
                jumpToPaginationPage(page)
            }
        )
    }
}
