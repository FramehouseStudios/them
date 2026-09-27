import Foundation

/// Paces the cross-device refresh timers (the Studio's `/screenplay/projects`
/// poll and the Memories sheet's session + memories poll).
///
/// The timer keeps ticking every few seconds so a desktop edit still shows up
/// quickly while something is open and changing. Once nothing has changed for
/// `idleAfterUnchangedPolls` polls, or when there is no active context (no
/// project selected), only every `idleTickStride`th tick makes a request.
/// Seen live 2026-09-27: an open Studio with no project polled the projects
/// list every 3 seconds, and the Memories sheet bootstraps a session every
/// 3 seconds for as long as it is open.
enum CrossDevicePollPolicy {
    static let idleAfterUnchangedPolls = 10
    static let idleTickStride = 5

    static func shouldPoll(tick: Int, hasActiveContext: Bool, unchangedStreak: Int) -> Bool {
        let isIdle = !hasActiveContext || unchangedStreak >= idleAfterUnchangedPolls
        guard isIdle else { return true }
        return tick % idleTickStride == 0
    }
}
