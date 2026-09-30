import SwiftUI
import ScreenplayStudio

/// The length the writer set for a project (Studio Settings → Target length).
/// The act planner assumed 110 pages for every script, so a 75-page draft was
/// still "Act II" at FADE OUT and pages were held to the wrong act (74-page
/// run, 2026-09-30). Unset projects keep the 110-page default. Stored per
/// account and project on this device; the value also reaches memory with each
/// page write (screenplay_target_pages).
nonisolated enum ScreenplayTargetLength {
    static let range = 5...180
    static let step = 5
    private static let baseKey = "screenplay.studio.targetPages.v1"

    static func pages(
        forProject projectID: String,
        ownerUserID: String = BackendAuthClient.currentAuthSessionState().user?.userId ?? "",
        defaults: UserDefaults = .standard
    ) -> Int {
        chosenPages(forProject: projectID, ownerUserID: ownerUserID, defaults: defaults)
            ?? ScreenplayFeatureProgressionGuide.defaultTargetPages
    }

    static func chosenPages(
        forProject projectID: String,
        ownerUserID: String = BackendAuthClient.currentAuthSessionState().user?.userId ?? "",
        defaults: UserDefaults = .standard
    ) -> Int? {
        let project = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty,
              let stored = defaults.dictionary(forKey: key(ownerUserID))?[project] as? Int,
              range.contains(stored) else { return nil }
        return stored
    }

    /// nil clears the choice (back to the default).
    static func set(
        _ pages: Int?,
        forProject projectID: String,
        ownerUserID: String = BackendAuthClient.currentAuthSessionState().user?.userId ?? "",
        defaults: UserDefaults = .standard
    ) {
        let project = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty else { return }
        var all = defaults.dictionary(forKey: key(ownerUserID)) ?? [:]
        if let pages {
            all[project] = min(range.upperBound, max(range.lowerBound, pages))
        } else {
            all.removeValue(forKey: project)
        }
        defaults.set(all, forKey: key(ownerUserID))
    }

    private static func key(_ ownerUserID: String) -> String {
        ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: baseKey, ownerUserID: ownerUserID)
    }
}

/// Studio Settings row: "Target length  90 pages  − +".
struct ScreenplayTargetLengthControl: View {
    let projectID: String
    let onChange: () -> Void
    @State private var pages: Int = ScreenplayFeatureProgressionGuide.defaultTargetPages

    var body: some View {
        Stepper(value: Binding(
            get: { pages },
            set: { next in
                pages = next
                ScreenplayTargetLength.set(next, forProject: projectID)
                onChange()
            }
        ), in: ScreenplayTargetLength.range, step: ScreenplayTargetLength.step) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Target length")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.88))
                Text("\(pages) pages · acts are timed to it")
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.66))
            }
        }
        .disabled(projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        .accessibilityIdentifier("studio.settings.target-length")
        .accessibilityValue("\(pages) pages")
        .onAppear { pages = ScreenplayTargetLength.pages(forProject: projectID) }
        .onChange(of: projectID) { _, next in pages = ScreenplayTargetLength.pages(forProject: next) }
    }
}
