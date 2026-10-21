import SwiftUI
import ScreenplayStudio

/// Read-only stack of printed pages for the current draft: one paper card per
/// 55-line page, numbered the way a printed script is, with the total count
/// and screen-time estimate on top. Tapping a page jumps the editor to it.
struct ScreenplayStudioPagesOverviewView: View {
    let draft: String
    let title: String
    let onJumpToPage: (BackendScreenplayPaginationPage) -> Void

    @Environment(\.dismiss) private var dismiss

    private var pages: [ScreenplayPageLayout.Page] {
        ScreenplayPageLayout.paginate(draft)
    }

    var body: some View {
        let pages = self.pages
        let lineCount = pages.reduce(0) { $0 + $1.lineCount }
        return NavigationStack {
            ScrollView {
                LazyVStack(spacing: IOThemSpacing.Scale.xl) {
                    header(pageCount: pages.count, lineCount: lineCount)
                    if pages.isEmpty {
                        emptyState
                    } else {
                        ForEach(pages) { page in
                            pageCard(page, total: pages.count)
                        }
                    }
                }
                .padding(.horizontal, IOThemSpacing.Scale.lg)
                .padding(.vertical, IOThemSpacing.Scale.xl)
            }
            .background(Color.herShellPanelSoft.ignoresSafeArea())
            .navigationTitle("Pages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("studio.pages.overview.done")
                }
            }
        }
        .accessibilityIdentifier("studio.pages.overview")
    }

    static func summaryLine(pageCount: Int, lineCount: Int) -> String {
        let pages = ScreenplayPageLayout.summaryText(pageCount: pageCount)
        guard pageCount > 0 else { return pages }
        let minutes = ScreenplayPageLayout.estimatedMinutes(lineCount: lineCount)
        let minuteText = minutes < 1 ? "under a minute" : "about \(Int(minutes.rounded())) min"
        return "\(pages) · \(minuteText) on screen · \(ScreenplayPageLayout.defaultLinesPerPage) lines per printed page"
    }

    private func header(pageCount: Int, lineCount: Int) -> some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.xxs) {
            Text(title.isEmpty ? "Untitled draft" : title)
                .font(IOThemTypography.UI.sectionTitle)
                .foregroundStyle(Color.herText.opacity(0.90))
                .lineLimit(1)
            Text(Self.summaryLine(pageCount: pageCount, lineCount: lineCount))
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.62))
                .accessibilityIdentifier("studio.pages.overview.summary")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var emptyState: some View {
        VStack(spacing: IOThemSpacing.Scale.sm) {
            Image(systemName: "doc.text")
                .font(IOThemTypography.UI.title)
                .foregroundStyle(Color.herText.opacity(0.32))
            Text("Nothing on the page yet. Talk a scene onto it and the pages will count up here.")
                .font(IOThemTypography.UI.body)
                .foregroundStyle(Color.herText.opacity(0.62))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, IOThemSpacing.Scale.xxxl)
    }

    private func pageCard(_ page: ScreenplayPageLayout.Page, total: Int) -> some View {
        let kinds = ScreenplayPageLayout.classify(page.lines)
        return Button {
            onJumpToPage(page.backendPage)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer(minLength: 0)
                    Text("\(page.number).")
                        .font(IOThemTypography.Screenplay.referenceText)
                        .foregroundStyle(Color.black.opacity(0.70))
                }
                .padding(.bottom, IOThemSpacing.Scale.md)

                ForEach(Array(page.lines.enumerated()), id: \.offset) { index, line in
                    pageLine(line, kind: kinds[index])
                }

                Spacer(minLength: IOThemSpacing.Scale.lg)

                Text("Page \(page.number) of \(total) · lines \(page.startLine)–\(page.endLine)")
                    .font(IOThemTypography.UI.compactLabelMedium)
                    .foregroundStyle(Color.black.opacity(0.38))
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(.horizontal, IOThemSpacing.Scale.xxl)
            .padding(.vertical, IOThemSpacing.Scale.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous)
                    .fill(Color.herPaper)
                    .shadow(color: Color.black.opacity(0.10), radius: 10, y: 4)
            )
            .overlay(
                RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous)
                    .stroke(Color.herShellStroke.opacity(0.22), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("studio.pages.overview.page.\(page.number)")
        .accessibilityLabel("Page \(page.number) of \(total)")
    }

    private func pageLine(_ line: String, kind: ScreenplayPageLayout.LineKind) -> some View {
        let leading: CGFloat
        let alignment: Alignment
        switch kind {
        case .character:
            leading = IOThemSpacing.ScreenplayIndent.character
            alignment = .leading
        case .dialogue:
            leading = IOThemSpacing.ScreenplayIndent.dialogue
            alignment = .leading
        case .parenthetical:
            leading = IOThemSpacing.ScreenplayIndent.dialogue + IOThemSpacing.Scale.lg
            alignment = .leading
        case .transition:
            leading = 0
            alignment = .trailing
        case .sceneHeading, .action, .blank:
            leading = 0
            alignment = .leading
        }
        return Text(line.isEmpty ? " " : line)
            .font(IOThemTypography.Screenplay.referenceText)
            .fontWeight(kind == .sceneHeading ? .bold : .regular)
            .foregroundStyle(Color.black.opacity(line.isEmpty ? 0.0 : 0.82))
            .frame(maxWidth: .infinity, alignment: alignment)
            .padding(.leading, leading)
            .fixedSize(horizontal: false, vertical: true)
    }
}
