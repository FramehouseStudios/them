import Foundation

/// Paces the Studio's cross-device refresh (the `/screenplay/projects` poll).
///
/// The timer keeps ticking every few seconds so a desktop edit still shows up
/// quickly while a project is open and changing. Once nothing has changed for
/// `idleAfterUnchangedPolls` polls, or when no project is selected at all,
/// only every `idleTickStride`th tick makes a request. Seen live 2026-09-27:
/// an open Studio with no project polled the projects list every 3 seconds.
enum StudioCrossDevicePollPolicy {
    static let idleAfterUnchangedPolls = 10
    static let idleTickStride = 5

    static func shouldPoll(tick: Int, hasSelectedProject: Bool, unchangedStreak: Int) -> Bool {
        let isIdle = !hasSelectedProject || unchangedStreak >= idleAfterUnchangedPolls
        guard isIdle else { return true }
        return tick % idleTickStride == 0
    }
}
