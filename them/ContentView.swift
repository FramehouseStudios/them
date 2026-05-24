import SwiftUI
import ScreenplayStudio

struct ContentView: View {
    var body: some View {
        #if os(macOS) && !THEM_MAC_SHELL
        V1MacShellUnavailableView()
        #else
        RootExperienceView()
        #endif
    }
}

#if os(macOS) && !THEM_MAC_SHELL
private struct V1MacShellUnavailableView: View {
    var body: some View {
        VStack(spacing: 14) {
            Text("io.them")
                .font(IOThemTypography.UI.title)
                .foregroundStyle(IOThemColors.Text.primary)
            Text("V1 is iPhone only.")
                .font(IOThemTypography.UI.sectionTitle)
                .foregroundStyle(IOThemColors.Text.primary)
            Text("The Mac shell is dormant scaffolding until a dedicated desktop release ships.")
                .font(IOThemTypography.UI.body)
                .foregroundStyle(IOThemColors.Text.primary.opacity(0.72))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .padding(32)
        .frame(minWidth: 520, minHeight: 360)
        .background(IOThemColors.Background.peachMid)
    }
}
#endif
