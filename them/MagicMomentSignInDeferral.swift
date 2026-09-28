import Foundation

/// The first page a guest asks for on the onboarding card. Seen live on
/// 2026-09-24: "Start Page" opened the account sheet (the workspace needs a
/// signed-in writer) and, in the same breath, submitted the page anyway; the
/// request failed on auth, the error was written into the onboarding overlay
/// that had just closed, and nothing wrote the page after sign-in. The scene
/// is kept here instead and submitted the moment the writer is in.
///
/// It is also stored on the device: creating an account can take the writer
/// out of the app (mail, a password manager), and a relaunch used to drop the
/// scene the sheet had just promised was saved.
nonisolated struct MagicMomentSignInDeferral: Equatable, Codable {
    let name: String
    let sceneSeed: String

    static let storageKey = "magic_moment_pending_first_page"

    static func load(defaults: UserDefaults = .standard) -> MagicMomentSignInDeferral? {
        guard let data = defaults.data(forKey: storageKey),
              let deferral = try? JSONDecoder().decode(MagicMomentSignInDeferral.self, from: data),
              !deferral.sceneSeed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return nil
        }
        return deferral
    }

    /// Stores the pending page, or removes it once it is written or dropped.
    static func persist(_ deferral: MagicMomentSignInDeferral?, defaults: UserDefaults = .standard) {
        guard let deferral, let data = try? JSONEncoder().encode(deferral) else {
            defaults.removeObject(forKey: storageKey)
            return
        }
        defaults.set(data, forKey: storageKey)
    }

    static let signInMessage = "Create an account or sign in to write your first page. Your scene is saved and it will be written as soon as you're in."

    /// The home card while the page waits: signed out it asks for an account,
    /// signed in (e.g. after a relaunch) it only needs a tap.
    static func waitingMessage(isSignedIn: Bool) -> String {
        isSignedIn ? "Your scene is saved. Tap Continue to write your first page." : signInMessage
    }

    /// The home card after a write that failed; the scene is still stored.
    static func failureMessage(_ reason: String) -> String {
        let clean = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let why = clean.isEmpty ? "" : " \(clean.hasSuffix(".") ? clean : clean + ".")"
        // Mapped failure copy often already says the work is safe; say it once.
        let alreadyReassures = ["safe", "saved", "try again"].contains { clean.lowercased().contains($0) }
        return "Your first page wasn't written yet.\(why)" + (alreadyReassures ? "" : " Your scene is still saved; try again when you're ready.")
    }

    static func shouldDefer(_ decision: ThemWorkspaceAuthenticationPolicy.AccessDecision) -> Bool {
        decision == .requireAccount
    }
}
