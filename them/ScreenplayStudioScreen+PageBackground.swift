// D009 I4: moved verbatim out of ScreenplayStudioScreen.swift (no behaviour change).
import SwiftUI
import ScreenplayStudio

extension ScreenplayStudioScreen {
    func screenplayPageBackground(
        isDropTargeted: Bool,
        isDraftingPreviewActive: Bool,
        isCommitNoticeVisible: Bool
    ) -> some View {
        GeometryReader { proxy in
            let guidePositions = ScreenplayStackMetrics.paperGuidePositions(in: proxy.size.width)
            let headerBottom = IOThemSpacing.ScreenplayPageChrome.headerHeight
            let guideTop = headerBottom + 18
            let leftMarkerInset = max(guidePositions.left - 20, 12)
            let markerColor = isDraftingPreviewActive
                ? Color.green.opacity(0.66)
                : Color.accentColor.opacity(0.54)

            ZStack {
                RoundedRectangle(cornerRadius: IOThemSpacing.ScreenplayPageChrome.cornerRadius, style: .continuous)
                    .fill(Color.herPaper)

                LinearGradient(
                    colors: [
                        Color.white.opacity(0.36),
                        Color.herPaper.opacity(0.92),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: headerBottom + 24)
                .frame(maxHeight: .infinity, alignment: .top)
                .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.ScreenplayPageChrome.cornerRadius, style: .continuous))

                RoundedRectangle(cornerRadius: IOThemSpacing.ScreenplayPageChrome.cornerRadius, style: .continuous)
                    .stroke(
                        isDropTargeted ? Color.herStudioActiveStroke : Color.black.opacity(0.08),
                        lineWidth: isDropTargeted ? 1.5 : 0.8
                    )

                Path { path in
                    path.move(to: CGPoint(x: 18, y: headerBottom))
                    path.addLine(to: CGPoint(x: proxy.size.width - 18, y: headerBottom))
                }
                .stroke(Color.herPaperLine.opacity(0.34), lineWidth: 0.8)

                Path { path in
                    path.move(to: CGPoint(x: guidePositions.left, y: guideTop))
                    path.addLine(to: CGPoint(x: guidePositions.left, y: proxy.size.height - 18))
                    path.move(to: CGPoint(x: guidePositions.right, y: guideTop))
                    path.addLine(to: CGPoint(x: guidePositions.right, y: proxy.size.height - 18))
                }
                .stroke(Color.herPaperLine.opacity(0.22), lineWidth: 0.75)

                if isDraftingPreviewActive || isCommitNoticeVisible {
                    VStack {
                        Capsule()
                            .fill(markerColor)
                            .frame(width: 3, height: isDraftingPreviewActive ? 84 : 52)
                            .shadow(color: markerColor.opacity(0.10), radius: 3, y: 0)
                            .padding(.top, guideTop + 16)
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    .padding(.leading, leftMarkerInset)
                    .animation(.easeInOut(duration: 0.18), value: isDraftingPreviewActive)
                    .animation(.easeInOut(duration: 0.18), value: isCommitNoticeVisible)
                }
            }
        }
    }
}
