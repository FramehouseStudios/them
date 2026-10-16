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

/// The empty page's hint names the gesture the writer actually has.
enum ScreenplayPagePlacementHint {
    static var text: String {
        #if os(macOS)
        "Start with a scene heading, or click to place the first line."
        #else
        "Start with a scene heading, or tap to place the first line."
        #endif
    }

    /// On a phone the header row scrolls sideways, so the hint showed as a
    /// clipped fourth stat ("Start with a sc"), and the empty page already
    /// says the same thing inside the paper.
    static func showsInHeader(pageIsEmpty: Bool, isCompact: Bool) -> Bool {
        pageIsEmpty && !isCompact
    }
}

/// A project with nothing written and no saved version showed an orange
/// "Not saved" twice (top bar and header), which reads as a warning when
/// there is nothing to lose. The drawer already calls it a blank page.
enum StudioBlankPageStatus {
    static let label = "Blank page"

    static func applies(pageIsEmpty: Bool, hasSavedVersion: Bool, hasUnsavedChanges: Bool, isSaving: Bool) -> Bool {
        pageIsEmpty && !hasSavedVersion && !hasUnsavedChanges && !isSaving
    }
}

struct ScreenplayStudioPageEmptyPlaceholder: View {
    let hasSelectedProject: Bool

    var body: some View {
        GeometryReader { proxy in
            // Laid over the page content (inside the surface's horizontal
            // padding), so the proxy width is already the editor width.
            let editorWidth = max(0, proxy.size.width)
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
            .padding(.top, ScreenplayStackMetrics.editorTextInsetVertical)
            .padding(.leading, editorTextInset)
            .padding(.trailing, editorTextInset)
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
    let onSelect: (ScreenplayEditorElement) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hoveredElement: ScreenplayEditorElement?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            HStack(spacing: 4) {
                ForEach(ScreenplayEditorElement.allCases) { element in
                    elementButton(element)
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 4)
        }
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(panelColor)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(strokeColor, lineWidth: 1)
        )
        .accessibilityIdentifier("studio.element-mode-bar")
    }

    private func elementButton(_ element: ScreenplayEditorElement) -> some View {
        let isActive = activeElement == element
        let isHovered = hoveredElement == element
        let foreground = isActive
            ? IOThemColors.StudioChrome.selectedElementInk
            : textColor
        let fill = isActive
            ? IOThemColors.StudioChrome.selectedElement
            : (isHovered ? textColor.opacity(0.06) : Color.clear)

        return Button {
            onSelect(element)
        } label: {
            Text(buttonLabel(element))
                .font(IOThemTypography.UI.editorElementLabel)
                .foregroundStyle(foreground)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(minWidth: 44, minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(fill)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("studio.element-mode.\(element.rawValue)")
        .accessibilityLabel(element.title)
        .accessibilityHint(element.hint)
        .accessibilityValue(isActive ? "Selected" : "Not selected")
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .onHover { hovering in
            hoveredElement = hovering
                ? element
                : (hoveredElement == element ? nil : hoveredElement)
        }
        .help(element.hint)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: isActive)
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
            return "Parenthetical"
        case .transition:
            return "Transition"
        }
    }
}
