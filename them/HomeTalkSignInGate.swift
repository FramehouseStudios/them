import Foundation

/// Talk on the home screen needs an account, as Studio does: production
/// requires login (D-guest-mode-vs-required-login). Signed out, a tap on Talk
/// asked for the microphone and speech permissions, started listening, and
/// the turn could only end in a 401 the home screen never showed. It now
/// opens the account sheet and says why.
enum HomeTalkSignInGate {
    static let message = "Sign in to talk. What you say and write saves to your account and follows you to your other devices."

    /// A stored refresh token is not a reason to stop: the request path
    /// refreshes it. Only a writer with no session at all is sent to sign in.
    static func requiresSignIn(
        isAuthenticated: Bool,
        accessTokenExpired: Bool,
        refreshTokenPresent: Bool,
        isRunningUITests: Bool
    ) -> Bool {
        ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: isAuthenticated,
            accessTokenExpired: accessTokenExpired,
            refreshTokenPresent: refreshTokenPresent,
            isRunningUITests: isRunningUITests
        ) == .requireAccount
    }
}
