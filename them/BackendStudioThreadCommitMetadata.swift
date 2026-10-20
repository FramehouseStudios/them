import Foundation

nonisolated struct BackendStudioThreadCommitMetadata: Hashable {
    let screenplayProjectId: String
    let screenplayDocumentRevisionId: String
    let screenplayTarget: String
    let screenplayPromptSource: String
    let screenplayWriteId: String
    let screenplayAnchorLine: Int?
    let screenplayAnchorEndLine: Int?
    let screenplayInsertionMode: String
    let screenplayAnchorSceneLabel: String
    let screenplayAnchorDraftSceneId: String
    let screenplayAnchorOutlineSceneId: String
    let screenplayAnchorOutlineBeatIds: [String]
    let screenplayAnchorScriptNodeId: String
    let screenplayNoteTitle: String
    let screenplayNoteBody: String
    let screenplayInsertedText: String
    let screenplayReplacementApplied: Bool
    let screenplayReplacedWriteId: String
    let screenplayRevisedBlockText: String
    let screenplayResolvedAnchorExcerpt: String
    var screenplayDraftExcerpt: String = ""
    var screenplayAct: String = ""
    var screenplaySceneObjective: String = ""
    var screenplaySceneSummary: String = ""
    var screenplayCurrentBeat: String = ""
    var screenplayLogline: String = ""
    var screenplayThemeArgument: String = ""
    var screenplayCentralQuestion: String = ""
    var screenplayProtagonistWant: String = ""
    var screenplayProtagonistNeed: String = ""
    var screenplayAntagonisticForce: String = ""
    var screenplayEndingImage: String = ""
    var screenplayFeatureSequence: String = ""
    var screenplayFeatureObligation: String = ""
    var screenplayActPressureState: String = ""
    var screenplayCharacterArcState: String = ""
    var screenplayCharacterArcMemory: BackendScreenplayCharacterArcMemory? = nil
    var screenplayCharacterVoiceMemories: [BackendScreenplayCharacterVoiceMemory] = []
    var screenplayLastSceneOutcome: String = ""
    var screenplayNextScenePlan: String = ""
    var screenplayNextSceneMoves: [String] = []
    var screenplayNextThreeTurns: [String] = []
    var screenplayActThreePayoffPath: [String] = []
    var screenplayBeatSequence: [String] = []
    var screenplayCharacterFocus: [String] = []
    var screenplayUnresolvedSetups: [String] = []
    var screenplayUnresolvedStoryThreads: [String] = []
    var screenplayCharacterArcTurns: [String] = []
    var screenplayImageMotifs: [String] = []
    var screenplayContinuityNotes: [String] = []
    var screenplayEmotionalContinuity: String = ""
    var screenplayPageCount: Int? = nil
    var screenplayTargetPages: Int? = nil
    /// What the Studio offers this turn (tabs, sections, colors, scenes), so
    /// Clementine can operate only what exists. See StudioCapabilitiesSnapshot.
    var studioCapabilitiesJSON: String = ""
    /// Local recovery evidence only; never serialized into provider/request payloads.
    var recoveryDraftIdentity: ScreenplayDraftContentIdentity? = nil

    var isMeaningful: Bool {
        !screenplayProjectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayDocumentRevisionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayTarget.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayPromptSource.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayWriteId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        screenplayAnchorLine != nil ||
        screenplayAnchorEndLine != nil ||
        !screenplayInsertionMode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayAnchorSceneLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayAnchorDraftSceneId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayAnchorOutlineSceneId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayAnchorOutlineBeatIds.isEmpty ||
        !screenplayAnchorScriptNodeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayNoteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayInsertedText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        screenplayReplacementApplied ||
        !screenplayReplacedWriteId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayRevisedBlockText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayResolvedAnchorExcerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayDraftExcerpt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayAct.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplaySceneObjective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplaySceneSummary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayCurrentBeat.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayLogline.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayThemeArgument.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayCentralQuestion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayProtagonistWant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayProtagonistNeed.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayAntagonisticForce.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayEndingImage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayFeatureSequence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayFeatureObligation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayActPressureState.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayCharacterArcState.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        screenplayCharacterArcMemory?.isMeaningful == true ||
        screenplayCharacterVoiceMemories.contains(where: \.isMeaningful) ||
        !screenplayLastSceneOutcome.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayNextScenePlan.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !screenplayNextSceneMoves.isEmpty ||
        !screenplayNextThreeTurns.isEmpty ||
        !screenplayActThreePayoffPath.isEmpty ||
        !screenplayBeatSequence.isEmpty ||
        !screenplayCharacterFocus.isEmpty ||
        !screenplayUnresolvedSetups.isEmpty ||
        !screenplayUnresolvedStoryThreads.isEmpty ||
        !screenplayCharacterArcTurns.isEmpty ||
        !screenplayImageMotifs.isEmpty ||
        !screenplayContinuityNotes.isEmpty ||
        !screenplayEmotionalContinuity.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        (screenplayPageCount ?? 0) > 0 ||
        (screenplayTargetPages ?? 0) > 0
    }
}

extension BackendStudioThreadCommitMetadata {
    func retainingRecoveryDraftIdentity(_ draft: String) -> Self? {
        guard isMeaningful else { return nil }
        var captured = self
        captured.recoveryDraftIdentity = screenplayTarget.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "page"
            ? ScreenplayDraftContentIdentity(draft: draft) : nil
        return captured
    }
}
