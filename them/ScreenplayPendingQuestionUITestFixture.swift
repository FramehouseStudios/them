#if DEBUG
import Foundation

/// A local presentation fixture, never a substitute for backend question proof.
@MainActor
enum ScreenplayPendingQuestionUITestFixture {
    static func install(on model: ScreenplayStudioViewModel) -> Bool {
        let arguments = ProcessInfo.processInfo.arguments
        guard IOThemRuntime.isRunningUITests,
              arguments.contains("--ui-show-pending-screenplay-question") else { return false }
        let options: [BackendPendingScreenplayOption]? = arguments.contains("--ui-show-provisional-screenplay-options") ? [
            BackendPendingScreenplayOption(id: "option-1", rank: 1,
                value: "Mara gives June the manifest and lets her choose the crossing.", recommended: true),
            BackendPendingScreenplayOption(id: "option-2", rank: 2,
                value: "Mara exposes the ferry board before June can leave.", recommended: false),
            BackendPendingScreenplayOption(id: "option-3", rank: 3,
                value: "Mara destroys the manifest and trusts June without proof.", recommended: false),
        ] : nil
        model.pendingScreenplayQuestion = BackendPendingScreenplayQuestion(
            id: "ui-pending-theme-question",
            projectId: model.selectedProjectID.isEmpty ? "ui-project" : model.selectedProjectID,
            projectTitle: model.selectedProject?.title ?? "The Last Crossing",
            targetField: "project.theme_argument", targetLabel: "Theme argument",
            question: options == nil
                ? "What does Mara learn about love when control can no longer keep June safe?"
                : "Which path should become true: Option 1, 2, or 3?",
            provisionalOptions: options, askedAt: Date().timeIntervalSince1970 * 1_000)
        // Exercise the real startup outbox notification after installing the
        // question. An isolated fixture must survive unrelated queue refreshes.
        Task { @MainActor in
            await Task.yield()
            NotificationCenter.default.post(name: .themOfflineTalkOutboxUpdated, object: nil)
        }
        return true
    }
}
#endif
