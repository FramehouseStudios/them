import SwiftUI
import ScreenplayStudio

struct ScreenplayStudioPageMetadataItem: View {
    let title: String
    let value: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(IOThemTypography.UI.monoBadge)
                .tracking(0.7)
                .foregroundStyle(Color.herText.opacity(0.40))
            Text(value)
                .font(IOThemTypography.UI.monoLabelStrong)
                .foregroundStyle(color)
                .lineLimit(1)
        }
    }
}

struct ScreenplayStudioPageMetadataDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color.herPaperLine.opacity(0.34))
            .frame(width: 1, height: 20)
            .padding(.top, 7)
    }
}

struct ScreenplayStudioPageEmptyPlaceholder: View {
    let hasSelectedProject: Bool

    var body: some View {
        GeometryReader { proxy in
            let editorWidth = max(
                0,
                proxy.size.width - (ScreenplayStackMetrics.pageSurfaceHorizontalPadding * 2)
            )
            let editorTextInset = ScreenplayStackMetrics.editorTextInsetHorizontal(
                forEditorWidth: editorWidth
            )
            let metricsContainerWidth = max(
                120,
                editorWidth - (editorTextInset * 2)
            )
            let metrics = ScreenplayStackMetrics.editor(containerWidth: metricsContainerWidth)
            let editableWidth = max(metricsContainerWidth, 120)
            let dialogueWidth = max(
                editableWidth - metrics.dialogueLeading - metrics.dialogueTrailing,
                48
            )

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Rectangle()
                        .fill(Color.accentColor.opacity(0.44))
                        .frame(width: 2, height: 18)
                    Text(
                        hasSelectedProject
                        ? "Start with a scene heading or the first visual beat."
                        : "Start typing, then anchor the draft once it has a title."
                    )
                    .font(IOThemTypography.Screenplay.referenceText)
                    .foregroundStyle(Color.black.opacity(0.24))
                    .lineLimit(2)
                }
                .padding(.bottom, 22)

                Text("INT. LOCATION - DAY")
                    .font(IOThemTypography.Screenplay.referenceText)
                    .foregroundStyle(Color.black.opacity(0.15))
                    .padding(.bottom, metrics.sceneHeadingSpacingAfter + 8)

                actionLine(width: max(84, editableWidth * 0.72))
                actionLine(width: max(110, editableWidth * 0.90))
                actionLine(width: max(72, editableWidth * 0.58))
                    .padding(.bottom, metrics.actionCueSpacingAfter + 16)

                Text("CHARACTER")
                    .font(IOThemTypography.Screenplay.referenceText)
                    .foregroundStyle(Color.black.opacity(0.12))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, metrics.characterLeading)
                    .padding(.trailing, metrics.characterTrailing)
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 7)

                indentedLine(
                    width: max(92, dialogueWidth * 0.82),
                    leading: metrics.dialogueLeading,
                    trailing: metrics.dialogueTrailing
                )
                .padding(.bottom, 6)

                indentedLine(
                    width: max(78, dialogueWidth * 0.66),
                    leading: metrics.dialogueLeading,
                    trailing: metrics.dialogueTrailing
                )

                Spacer(minLength: 0)
            }
            .padding(
                .top,
                IOThemSpacing.ScreenplayPageChrome.headerHeight
                + IOThemSpacing.ScreenplayPageChrome.contentTopPadding
                + ScreenplayStackMetrics.editorTextInsetVertical
            )
            .padding(
                .leading,
                ScreenplayStackMetrics.pageSurfaceHorizontalPadding + editorTextInset
            )
            .padding(
                .trailing,
                ScreenplayStackMetrics.pageSurfaceHorizontalPadding + editorTextInset
            )
            .padding(.bottom, IOThemSpacing.ScreenplayPageChrome.contentBottomPadding)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .allowsHitTesting(false)
        }
    }

    private func actionLine(width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(Color.black.opacity(0.08))
            .frame(width: width, height: 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 9)
    }

    private func indentedLine(width: CGFloat, leading: CGFloat, trailing: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(Color.black.opacity(0.08))
            .frame(width: width, height: 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, leading)
            .padding(.trailing, trailing)
    }
}

struct ScreenplayStudioElementModeBar: View {
    let activeElement: ScreenplayEditorElement
    let panelColor: Color
    let strokeColor: Color
    let textColor: Color
    let secondaryTextColor: Color
    let onSelect: (ScreenplayEditorElement) -> Void

    @State private var hoveredElement: ScreenplayEditorElement?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 3) {
                ForEach(ScreenplayEditorElement.allCases) { element in
                    elementButton(element)
                }
            }
            .padding(.horizontal, 5)
            .padding(.vertical, 4)
        }
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(panelColor.opacity(0.92))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(strokeColor.opacity(0.20), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.03), radius: 6, y: 2)
    }

    private func elementButton(_ element: ScreenplayEditorElement) -> some View {
        let isActive = activeElement == element
        let isHovered = hoveredElement == element
        let foreground = isActive
            ? textColor.opacity(0.94)
            : secondaryTextColor.opacity(isHovered ? 0.88 : 0.76)
        let fill = isActive
            ? Color.white.opacity(0.84)
            : (isHovered ? Color.black.opacity(0.028) : Color.clear)

        return Button {
            onSelect(element)
        } label: {
            Text(buttonLabel(element))
                .font(isActive ? IOThemTypography.UI.compactLabel : IOThemTypography.UI.compactLabelMedium)
                .foregroundStyle(foreground)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(fill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(isActive ? strokeColor.opacity(0.18) : Color.clear, lineWidth: 1)
                )
                .shadow(
                    color: isActive ? Color.black.opacity(0.03) : Color.clear,
                    radius: 2,
                    y: 1
                )
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredElement = hovering
                ? element
                : (hoveredElement == element ? nil : hoveredElement)
        }
        .help(element.hint)
        .animation(.easeOut(duration: 0.14), value: isActive)
    }

    private func buttonLabel(_ element: ScreenplayEditorElement) -> String {
        switch element {
        case .sceneHeading:
            return "Scene"
        case .action:
            return "Action"
        case .character:
            return "Character"
        case .dialogue:
            return "Dialogue"
        case .parenthetical:
            return "( )"
        case .transition:
            return "→"
        }
    }
}
