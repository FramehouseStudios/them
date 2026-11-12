import SwiftUI
import ScreenplayStudio

struct ScreenplayStudioRightPanelTabs: View {
    @Binding var selection: ScreenplayStudioScreen.DirectionOneRightPanelTab
    @State private var tabFrames: [ScreenplayStudioScreen.DirectionOneRightPanelTab: CGRect] = [:]
    private static let coordinateSpace = "studio.inspector.tabs"
    private static let tabOutlineWidth: CGFloat = 1
    let textColor: Color
    let secondaryTextColor: Color
    let panelColor: Color
    let panelSoftColor: Color
    let selectionStrokeColor: Color
    let strokeColor: Color

    var body: some View {
        let tabs = ScreenplayStudioScreen.DirectionOneRightPanelTab.allCases
        let rowCount = (tabs.count + 2) / 3

        VStack(spacing: 8) {
            ForEach(0..<rowCount, id: \.self) { row in
                rightPanelTabRow(Array(tabs.dropFirst(row * 3).prefix(3)))
            }
        }
        .padding(6)
        .coordinateSpace(name: Self.coordinateSpace)
        .contentShape(Rectangle())
        .highPriorityGesture(
            SpatialTapGesture(coordinateSpace: .named(Self.coordinateSpace)).onEnded { value in
                guard let tab = ScreenplayStudioInspectorTabHitTesting.target(at: value.location, frames: tabFrames) else { return }
                StudioUITestInputDiagnostics.inspectorTab(.routed, requestedTab: tab, selection: selection)
                activate(tab)
            }
        )
        .background(panelSoftColor)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(strokeColor.opacity(0.55), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(alignment: .topTrailing) {
            StudioUITestInputDiagnosticsView(identifier: "studio.debug.inspector.input.trace")
                .frame(width: 12, height: 12)
                .allowsHitTesting(false)
        }
        .onAppear {
            StudioUITestInputDiagnostics.installIfRequested()
            StudioUITestInputDiagnostics.inspectorTab(.appeared, requestedTab: selection, selection: selection)
        }
        .onChange(of: selection) { _, value in
            StudioUITestInputDiagnostics.inspectorTab(.observed, requestedTab: value, selection: selection)
        }
    }

    private func activate(_ tab: ScreenplayStudioScreen.DirectionOneRightPanelTab) {
        withAnimation(.easeInOut(duration: 0.16)) { selection = tab }
        StudioUITestInputDiagnostics.inspectorTab(.applied, requestedTab: tab, selection: selection)
    }

    private func rightPanelTabRow(
        _ tabs: [ScreenplayStudioScreen.DirectionOneRightPanelTab]
    ) -> some View {
        HStack(spacing: 6) {
            ForEach(tabs) { tab in
                let isActive = selection == tab
                Button {
                    StudioUITestInputDiagnostics.inspectorTab(.entered, requestedTab: tab, selection: selection)
                    activate(tab)
                } label: {
                    VStack(spacing: 6) {
                        Image(systemName: tab.iconName)
                            .font(isActive ? IOThemTypography.UI.captionStrong : IOThemTypography.UI.captionMedium)

                        Text(tab.title)
                            .font(isActive ? IOThemTypography.UI.compactLabel : IOThemTypography.UI.compactLabelMedium)
                            .lineLimit(1)
                            .minimumScaleFactor(0.82)
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(isActive ? textColor.opacity(0.96) : secondaryTextColor)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .onGeometryChange(for: CGRect.self) { proxy in
                        proxy.frame(in: .named(Self.coordinateSpace))
                    } action: { frame in
                        let visibleFrame = ScreenplayStudioInspectorTabHitTesting.visibleFrame(
                            for: frame, outlineWidth: Self.tabOutlineWidth
                        )
                        if tabFrames[tab] != visibleFrame { tabFrames[tab] = visibleFrame }
                        StudioUITestInputDiagnostics.inspectorFrame(tab: tab, frame: visibleFrame)
                    }
                    .contentShape(Rectangle())
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(isActive ? Color.white.opacity(0.96) : panelColor)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(
                                isActive ? selectionStrokeColor.opacity(0.72) : strokeColor.opacity(0.36),
                                lineWidth: Self.tabOutlineWidth
                            )
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityHint("Shows the \(tab.title) inspector.")
                .accessibilityValue(isActive ? "Selected" : "Not selected")
                .accessibilityIdentifier("studio.right-panel.\(tab.rawValue)")
                .accessibilityAddTraits(isActive ? .isSelected : [])
            }
        }
    }
}

/// Resolves the visible control under a pointer without choosing a neighbouring finger-area candidate.
enum ScreenplayStudioInspectorTabHitTesting {
    static func visibleFrame(for frame: CGRect, outlineWidth: CGFloat) -> CGRect {
        guard outlineWidth.isFinite, outlineWidth >= 0 else { return .null }
        // SwiftUI's centred outline extends half its width beyond layout bounds.
        return frame.insetBy(dx: -outlineWidth / 2, dy: -outlineWidth / 2)
    }

    static func target(
        at point: CGPoint,
        frames: [ScreenplayStudioScreen.DirectionOneRightPanelTab: CGRect]
    ) -> ScreenplayStudioScreen.DirectionOneRightPanelTab? {
        guard point.x.isFinite, point.y.isFinite else { return nil }
        let matches = frames.filter { _, frame in
            !frame.isEmpty && frame.minX.isFinite && frame.minY.isFinite &&
                frame.maxX.isFinite && frame.maxY.isFinite && frame.contains(point)
        }
        return matches.count == 1 ? matches.first?.key : nil
    }
}

func directionOneMiniStat(_ label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
        Text(value)
            .font(IOThemTypography.UI.compactTitle)
            .foregroundStyle(Color.herText.opacity(0.90))
            .lineLimit(2)
            .minimumScaleFactor(0.74)
            .multilineTextAlignment(.leading)
        Text(label)
            .font(IOThemTypography.UI.micro)
            .foregroundStyle(Color.herText.opacity(0.42))
            .textCase(.uppercase)
    }
    .frame(maxWidth: .infinity)
    .padding(.horizontal, 12)
    .padding(.vertical, 12)
    .background(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(Color.white.opacity(0.46))
    )
    .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.14), lineWidth: 1)
    )
}

func inspectorPanelLead(title: String, detail: String) -> some View {
    VStack(alignment: .leading, spacing: 6) {
        Text(title)
            .font(IOThemTypography.UI.bodyMedium)
            .foregroundStyle(Color.herText.opacity(0.84))
        Text(detail)
            .font(IOThemTypography.UI.caption)
            .foregroundStyle(Color.herText.opacity(0.64))
            .fixedSize(horizontal: false, vertical: true)
    }
}

func inspectorMessageCard(
    icon: String,
    title: String,
    detail: String,
    chromeText: Color = Color.black.opacity(0.74)
) -> some View {
    HStack(alignment: .top, spacing: 12) {
        Image(systemName: icon)
            .font(IOThemTypography.UI.sectionTitle)
            .foregroundStyle(chromeText.opacity(0.86))
            .frame(width: 38, height: 38)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Color.white.opacity(0.82))
            )

        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(IOThemTypography.UI.sectionTitle)
                .foregroundStyle(Color.herText.opacity(0.92))
            Text(detail)
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.herText.opacity(0.68))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
    .padding(16)
    .background(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(Color.white.opacity(0.42))
    )
    .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
    )
}

func intelligenceCollectionCard<Content: View>(
    title: String,
    icon: String,
    @ViewBuilder content: () -> Content
) -> some View {
    VStack(alignment: .leading, spacing: 12) {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.herText.opacity(0.56))
            Text(title)
                .font(IOThemTypography.UI.captionStrong)
                .foregroundStyle(Color.herText.opacity(0.82))
        }

        content()
    }
    .padding(14)
    .background(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .fill(Color.white.opacity(0.36))
    )
    .overlay(
        RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
    )
}

func inspectorSubsectionLabel(_ title: String) -> some View {
    Text(title)
        .font(IOThemTypography.UI.captionStrong)
        .foregroundStyle(Color.herText.opacity(0.74))
        .textCase(.uppercase)
}

func sectionCard<Content: View>(
    title: String,
    @ViewBuilder content: () -> Content
) -> some View {
    VStack(alignment: .leading, spacing: 14) {
        Text(title)
            .font(IOThemTypography.UI.title)
            .foregroundStyle(Color.herText.opacity(0.90))
        content()
    }
    .padding(18)
    .background(
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .fill(Color.herShellPanelSoft)
    )
    .overlay(
        RoundedRectangle(cornerRadius: 22, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.68), lineWidth: 1)
    )
    .shadow(color: Color.herPaperShadow.opacity(0.10), radius: 12, y: 6)
}
