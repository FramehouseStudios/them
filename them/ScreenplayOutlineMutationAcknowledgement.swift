import Foundation

nonisolated enum ScreenplayOutlineMutationAcknowledgement {
    static func committedRevision(
        response: BackendScreenplayOutlineMutationResponse,
        entry: ScreenplayOutlineMutationOutboxEntry
    ) -> Int? {
        let stage = (response.stage ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let status = (response.status ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let responseError = (response.error ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let isExactReplayState = (status == "saved" && response.replayed == false) ||
            (status == "replayed" && response.replayed == true)

        guard stage == "screenplay_outline",
              responseError.isEmpty,
              isExactReplayState,
              response.conflict == false,
              response.projectId == entry.projectId,
              response.project?.id == nil || response.project?.id == entry.projectId,
              response.clientRequestId == entry.id,
              response.expectedOutlineRevision == entry.expectedOutlineRevision,
              let currentRevision = response.outlineRevision,
              let committedRevision = response.committedRevision,
              let responseOutline = response.outline,
              currentRevision >= 0,
              entry.expectedOutlineRevision < Int.max,
              currentRevision == entry.expectedOutlineRevision + 1,
              committedRevision == currentRevision,
              responseOutline.revision == currentRevision,
              response.project?.outlineRevision == nil ||
                response.project?.outlineRevision == currentRevision else {
            return nil
        }
        return committedRevision
    }
}
