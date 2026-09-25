import Foundation

/// Decides whether closing a sheet (Memories, Notes, Companion, …) should put
/// the microphone back on.
///
/// Opening a sheet tears the voice pipeline down. When the writer was in the
/// middle of a conversation, Return picks it back up. When the home was quiet,
/// Return leaves it quiet: the Talk prompt is the only thing that starts a
/// conversation, so a permission alert or a live mic never appears just
/// because a sheet closed.
enum SheetReturnTalkPolicy {
    static func shouldResume(
        conversationLoopEnabled: Bool,
        needsOnboardingName: Bool
    ) -> Bool {
        conversationLoopEnabled && !needsOnboardingName
    }
}
