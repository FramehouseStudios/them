import Foundation
import StoreKit

/// Release-QA tooling (the V1 Launch Doctor and the voice transport and
/// realtime provider pickers) is shown only when the AppTransaction
/// environment proves a non-production build: `.xcode` (Debug) or
/// `.sandbox` (TestFlight). App Store builds report `.production` and stay
/// hidden; any lookup failure also hides it.
enum ReleaseQAToolingGate {
    /// Debug builds short-circuit to visible without touching StoreKit: with
    /// no App Store receipt, `AppTransaction.shared` raises a system "Sign in
    /// to Apple Account" prompt every time (seen on the simulator).
    /// `AppTransaction.shared` is a `VerificationResult`; an unverified
    /// result stays hidden.
    static func isVisible() async -> Bool {
        #if DEBUG
        return true
        #else
        do {
            let transaction = try await AppTransaction.shared.payloadValue
            return transaction.environment == .sandbox || transaction.environment == .xcode
        } catch {
            return false
        }
        #endif
    }

    /// Choices made while the pickers were visible (TestFlight) must not
    /// strand a build where they are hidden: no stub provider, which
    /// production refuses, and no preview transport the writer cannot turn
    /// off.
    static func resetHiddenChoices(defaults: UserDefaults = .standard) {
        let supplierKey = ClementineRealtimeSupplierMode.storageKey
        if let raw = defaults.string(forKey: supplierKey) {
            defaults.set(ClementineRealtimeSupplierMode.releaseSafe(rawValue: raw).rawValue, forKey: supplierKey)
        }
        if defaults.string(forKey: ClementineVoiceTransportMode.storageKey) != nil {
            defaults.set(ClementineVoiceTransportMode.turnBased.rawValue, forKey: ClementineVoiceTransportMode.storageKey)
        }
    }

    /// Runs once at launch so the reset does not wait for Data Controls.
    static func resetHiddenChoicesAtLaunchIfNeeded() {
        Task {
            if !(await isVisible()) {
                resetHiddenChoices()
            }
        }
    }
}
