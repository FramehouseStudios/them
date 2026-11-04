import Foundation

/// Binding observation time changes when the project context refreshes. Keep
/// each record's time stable until its actual scene/outline mapping changes.
@MainActor
enum ScreenplayBindingPayload {
    static func make(snapshot: ScreenplayProjectBindingSnapshot,
        previous: [BackendScreenplayBindingRecord]) -> [BackendScreenplayBindingRecord] {
        guard !snapshot.projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        let timestamp = max(snapshot.updatedAt.timeIntervalSince1970 * 1000, 1)
        let priorByScene = Dictionary(previous.map { ($0.draftSceneId, $0) }, uniquingKeysWith: { first, _ in first })
        return snapshot.sceneBindings.map { binding in
            func record(updatedAt: TimeInterval?) -> BackendScreenplayBindingRecord {
                .init(draftSceneId: binding.draftSceneID, draftLine: binding.draftLine,
                    draftEndLine: binding.draftEndLine, draftSlugline: binding.draftSlugline,
                    draftShortLabel: binding.draftShortLabel, outlineSceneId: binding.outlineSceneID ?? "",
                    outlineSceneTitle: binding.outlineSceneTitle ?? "", outlineSceneSlugline: binding.outlineSceneSlugline ?? "",
                    outlineBeatIds: binding.outlineBeatIDs, outlineBeatLabels: binding.outlineBeatLabels,
                    actTitle: binding.actTitle ?? "", matchedBy: binding.matchedBy, updatedAt: updatedAt)
            }
            if let prior = priorByScene[binding.draftSceneID], record(updatedAt: prior.updatedAt) == prior { return prior }
            return record(updatedAt: timestamp)
        }
    }
}
