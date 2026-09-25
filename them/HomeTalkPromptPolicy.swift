import Foundation

/// Decides when the home surface shows its "Talk" prompt.
///
/// The prompt is the only control that starts a conversation on the home
/// surface, so it stays visible whenever Clementine is not already listening,
/// speaking, or working on a turn. It fades while a conversation is running
/// and comes back the moment the conversation ends.
enum HomeTalkPromptPolicy {
    static func shouldShow(
        voiceIsActive: Bool,
        isTurnSubmitting: Bool,
        isThinking: Bool
    ) -> Bool {
        !voiceIsActive && !isTurnSubmitting && !isThinking
    }
}
