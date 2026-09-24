import Foundation

/// When the "Where we left off" card may appear on the home surface.
/// Seen live on 2026-09-24: a fresh install whose backend identity already
/// had a conversation showed the card underneath the translucent onboarding
/// overlay, its buttons reachable behind "Start your first page". A writer
/// who has not finished onboarding is not being welcomed back yet.
nonisolated enum HomeSessionContinuityCardPolicy {
    static func shouldShow(
        hasMeaningfulSnapshot: Bool,
        fingerprint: String,
        dismissedFingerprint: String,
        needsOnboardingName: Bool
    ) -> Bool {
        guard hasMeaningfulSnapshot else { return false }
        guard !needsOnboardingName else { return false }
        return fingerprint != dismissedFingerprint
    }
}
