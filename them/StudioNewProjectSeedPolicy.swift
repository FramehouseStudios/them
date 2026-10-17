import Foundation

/// Decides which draft, if any, a newly created Studio project starts with.
///
/// A draft typed before any project exists is "live only"; creating a project
/// adopts it as that project's first page. A draft that already belongs to an
/// open project must not be copied into the new one. Seen live 2026-09-27:
/// creating "Harbor Night" while "The Motel Letter" was open saved the Motel
/// Letter's page as Harbor Night's first version.
enum StudioNewProjectSeedPolicy {
    static func seedDraft(currentDraft: String, hasSelectedProject: Bool) -> String {
        guard !hasSelectedProject,
              !currentDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "" }
        // Preserve the writer's exact bytes; trimming is validation, not editing.
        return currentDraft
    }
}
