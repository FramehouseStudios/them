import Foundation

extension BackendTalkResult {
    @MainActor
    static func studioRealtime(
        userMessage: String,
        assistantMessage: String,
        userName: String?,
        voiceEmotionLane: String?,
        uiReflection: BackendTalkUIReflection,
        screenplayTrace: BackendTalkScreenplayTrace
    ) -> BackendTalkResult {
        BackendTalkResult(
            audioURL: URL(fileURLWithPath: "/dev/null"),
            streamedFirstSegment: false,
            streamedRemainderURL: nil,
            audioDurationMs: nil,
            renderContract: .default,
            timingSource: nil,
            transcript: userMessage,
            reply: assistantMessage,
            screenplayOutput: nil,
            screenplayQuality: nil,
            screenplayCues: [],
            dialogueTimeline: nil,
            assistantSelfName: nil,
            userName: userName,
            voiceEmotionLane: voiceEmotionLane,
            ttsVoice: nil,
            uiReflection: uiReflection,
            knowledgeTrace: .empty,
            creativeMemoryTrace: .empty,
            screenplayTrace: screenplayTrace,
            turnStatus: "responded",
            turnContinueReason: nil,
            turnErrorStage: nil,
            turnErrorMessage: nil,
            noteAction: nil,
            taskAction: nil,
            speculativeTrace: .none,
            turnMetaRateLimitNotice: nil,
            commit: nil
        )
    }
}
