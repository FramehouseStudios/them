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
            GeometryReader { geometry in
            let textWidth = geometry.size.width - 2 * IOThemSpacing.Scale.lg - 2 * IOThemSpacing.Scale.xxl
            let metrics = ScreenplayPageThumbnailMetrics(textWidth: textWidth)
            ScrollView {
                LazyVStack(spacing: IOThemSpacing.Scale.xl) {
                    header(pageCount: pages.count, lineCount: lineCount)
                    if pages.isEmpty {
                        emptyState
                    } else {
                        ForEach(pages) { page in
                            pageCard(page, total: pages.count, metrics: metrics)
                        }
                    }
                }
                .padding(.horizontal, IOThemSpacing.Scale.lg)
                .padding(.vertical, IOThemSpacing.Scale.xl)
            }
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

    private func pageCard(_ page: ScreenplayPageLayout.Page, total: Int, metrics: ScreenplayPageThumbnailMetrics) -> some View {
        let kinds = ScreenplayPageLayout.classify(page.lines)
        return Button {
            onJumpToPage(page.backendPage)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Spacer(minLength: 0)
                    // A screenplay's first page is not numbered (as printed).
                    Text(page.number > 1 ? "\(page.number)." : " ")
                        .font(.custom("Courier", size: metrics.fontSize))
                        .foregroundStyle(Color.black.opacity(0.70))
                }
                .padding(.bottom, IOThemSpacing.Scale.md)

                ForEach(Array(page.lines.enumerated()), id: \.offset) { index, line in
                    pageLine(line, kind: kinds[index], metrics: metrics)
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

    private func pageLine(_ line: String, kind: ScreenplayPageLayout.LineKind, metrics: ScreenplayPageThumbnailMetrics) -> some View {
        let placement = metrics.placement(for: kind, line: line)
        return Text(line.isEmpty ? " " : line)
            .font(.custom("Courier", size: metrics.fontSize))
            .fontWeight(kind == .sceneHeading ? .bold : .regular)
            .foregroundStyle(Color.black.opacity(line.isEmpty ? 0.0 : 0.82))
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .frame(maxWidth: .infinity, alignment: placement.trailing ? .trailing : .leading)
            .padding(.leading, placement.leading)
    }
}

/// A page card shows the page as printed: each line the paginator made is one
/// line on the card. At 12 pt the card was narrower than a 62-character action
/// line, so every line wrapped again ("lit. A banner over / the Nora checks…",
/// 2026-09-30). The size fits 62 Courier characters (0.6 em each) and indents
/// are measured in characters, as on paper: dialogue 10, parenthetical 16,
/// character cue 22 from the action margin.
struct ScreenplayPageThumbnailMetrics: Equatable {
    static let actionCharacters: CGFloat = 62
    static let courierAdvance: CGFloat = 0.6
    let fontSize: CGFloat

    init(textWidth: CGFloat) {
        // A few characters of slack: the card's border and rounding take
        // part of the measured width.
        let fitted = max(textWidth, 1) / ((Self.actionCharacters + 4) * Self.courierAdvance)
        fontSize = min(12, (fitted * 10).rounded(.down) / 10)
    }

    var characterWidth: CGFloat { fontSize * Self.courierAdvance }

    func placement(for kind: ScreenplayPageLayout.LineKind, line: String) -> (leading: CGFloat, trailing: Bool) {
        switch kind {
        case .character: return (characterWidth * 22, false)
        case .dialogue: return (characterWidth * 10, false)
        case .parenthetical: return (characterWidth * 16, false)
        // FADE IN: opens at the left margin; closing transitions sit right.
        case .transition: return ScreenplayEditorElement.layoutElement(.transition, line: line) == .action ? (0, false) : (0, true)
        case .sceneHeading, .action, .blank: return (0, false)
        }
    }
}
