import Foundation

/// Eligibility for the existing restored/committed-page promotion capability.
/// Auth and exact-document identity stay owned by StudioActionDocumentContext.
struct ScreenplayRestoredLiveDraftProjectPromotionPolicy {
    static func shouldCreateProject(
        isStudioSurfaceActive: Bool,
        draft: String,
        existingProjectID: String,
        isAutoCreatingProject: Bool,
        createKey: String,
        lastCreateKey: String
    ) -> Bool {
        guard isStudioSurfaceActive else { return false }
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard existingProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard !isAutoCreatingProject else { return false }
        guard !createKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return createKey != lastCreateKey
    }

    static func canContinue(
        initiating: StudioActionDocumentContext, current: StudioActionDocumentContext,
        isStudioActive: Bool, isCancelled: Bool
    ) -> Bool {
        !isCancelled && isStudioActive && initiating.projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && initiating.matches(current)
    }
}
