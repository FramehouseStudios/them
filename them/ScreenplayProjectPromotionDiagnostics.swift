#if DEBUG
import SwiftUI
import ScreenplayStudio

/// Read-only completion witness for a held real HTTP response, not a test
/// command or alternate promotion path. No writer text or credentials exposed.
struct ScreenplayProjectPromotionDiagnostics: View {
    let isCreating: Bool
    @ObservedObject private var bridge = ScreenplayLiveDraftBridge.shared
    var body: some View {
        if IOThemRuntime.isRunningUITests {
            VStack {
                Text(isCreating ? "creating" : "idle")
                    .accessibilityIdentifier("studio.promotion.phase")
                Text(verbatim: "draft=\(bridge.draftText.count); committed=\(bridge.lastCommittedWrite?.committedDraft.count ?? 0); matches=\(bridge.lastCommittedWrite?.committedDraft.utf8.elementsEqual(bridge.draftText.utf8) == true); streaming=\(bridge.streamingProgress); voice=\(bridge.syncedVoiceTurnState.phase.rawValue); pending=\(String(describing: bridge.pendingInsertion?.mode))")
                    .accessibilityIdentifier("studio.promotion.state")
            }
            .font(IOThemTypography.UI.nano).frame(width: 1, height: 1).opacity(0.01)
        }
    }
}
#endif
