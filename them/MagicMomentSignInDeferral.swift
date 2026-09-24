import Foundation

/// The first page a guest asks for on the onboarding card. Seen live on
/// 2026-09-24: "Start Page" opened the account sheet (the workspace needs a
/// signed-in writer) and, in the same breath, submitted the page anyway; the
/// request failed on auth, the error was written into the onboarding overlay
/// that had just closed, and nothing wrote the page after sign-in. The scene
/// is kept here instead and submitted the moment the writer is in.
nonisolated struct MagicMomentSignInDeferral: Equatable {
    let name: String
    let sceneSeed: String

    static let signInMessage = "Sign in to write your first page. Your scene is saved and it will be written as soon as you're in."

    static func shouldDefer(_ decision: ThemWorkspaceAuthenticationPolicy.AccessDecision) -> Bool {
        decision == .requireAccount
    }
}
