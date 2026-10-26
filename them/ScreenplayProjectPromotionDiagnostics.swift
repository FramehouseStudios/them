#if DEBUG
import SwiftUI
import ScreenplayStudio

/// Read-only completion witness for a held real HTTP response, not a test
/// command or alternate promotion path. No writer text or credentials exposed.
struct ScreenplayProjectPromotionDiagnostics: View {
    let isCreating: Bool
    var body: some View {
        if IOThemRuntime.isRunningUITests {
            Text(isCreating ? "creating" : "idle")
                .font(IOThemTypography.UI.nano).frame(width: 1, height: 1).opacity(0.01)
                .accessibilityIdentifier("studio.promotion.phase")
        }
    }
}
#endif
