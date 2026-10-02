import SwiftUI
import ScreenplayStudio

/// Rebuilds the app when the writer switches between the original peach and
/// dark (Profile > Appearance). Color tokens read the stored appearance while a
/// view's body runs, so a new identity makes every screen pick up the change.
/// Peach keeps today's behavior exactly (no forced color scheme).
struct IOThemAppearanceRoot<Content: View>: View {
    @AppStorage(IOThemAppearance.storageKey) private var appearanceRaw = IOThemAppearance.peach.rawValue
    @ViewBuilder let content: () -> Content

    var body: some View {
        let appearance = IOThemAppearance(rawValue: appearanceRaw) ?? .peach
        let _ = IOThemAppearance.apply(appearance)
        content()
            .id(appearance)
            .preferredColorScheme(appearance == .dark ? .dark : nil)
    }
}
