import Foundation

extension FirstPageFreshProject {
    static let openFailure = "Couldn't open a project for this scene. Your scene is saved; try again."

    /// Asks the Studio for the first page's own project and waits until
    /// writes target it; nil when ready, else what went wrong. Moved out of
    /// RootExperienceView.
    ///
    /// UI tests run the Studio on a stub page transport with no server, so
    /// there is no project to open; the page goes to the empty editor as it
    /// did before #794. Without this, every first-run smoke stopped at
    /// "Couldn't open a project for this scene."
    @MainActor
    static func open(
        sceneSeed: String,
        boundProjectID: @escaping @MainActor () -> String,
        draft: @escaping @MainActor () -> String,
        isRunningUITests: Bool = IOThemRuntime.isRunningUITests
    ) async -> String? {
        if isRunningUITests { return nil }
        try? await Task.sleep(for: .milliseconds(600)) // let the Studio mount
        let ready = Task { @MainActor () -> String in
            for await note in NotificationCenter.default.notifications(named: Self.ready) {
                return (note.userInfo?[projectIDKey] as? String) ?? ""
            }
            return ""
        }
        let timeout = Task { try? await Task.sleep(for: .seconds(20)); ready.cancel() }
        await Task.yield()
        NotificationCenter.default.post(name: requested, object: nil, userInfo: [titleKey: title(fromSceneSeed: sceneSeed)])
        let projectID = await ready.value
        timeout.cancel()
        guard !projectID.isEmpty else { return openFailure }
        for _ in 0..<50 {
            if isBound(to: projectID, boundProjectID: boundProjectID(), draft: draft()) { return nil }
            try? await Task.sleep(for: .milliseconds(200))
        }
        return openFailure
    }
}
