import Foundation

struct ScreenplayInsertionRequest: Identifiable, Equatable {
    enum Mode: String, Equatable {
        case insert
        case streamPreview
        case streamCommit
        case streamCancel
        case streamInsertProgress
        case streamInsertFinalize
        case streamInsertCancel
        case voiceRevealPrepare
        case voiceRevealUpdate
        case voiceRevealFinalize
        case voiceRevealCancel
    }

    let id: UUID
    let text: String
    let mode: Mode
    let replacementTarget: ScreenplayPendingReplacementTarget?
    let voiceRevealState: ScreenplayVoiceRevealPresentationState?
    let livePageContext: ScreenplayLiveTalkPageContext?
    let requiresLivePageContext: Bool

    init(
        id: UUID = UUID(),
        text: String,
        mode: Mode = .insert,
        replacementTarget: ScreenplayPendingReplacementTarget? = nil,
        requiresLivePageContext: Bool = false,
        livePageContext: ScreenplayLiveTalkPageContext? = nil,
        voiceRevealState: ScreenplayVoiceRevealPresentationState? = nil
    ) {
        self.id = id
        self.text = text
        self.mode = mode
        self.replacementTarget = replacementTarget
        self.voiceRevealState = voiceRevealState
        self.livePageContext = livePageContext
        self.requiresLivePageContext = requiresLivePageContext
    }
}

struct ScreenplayTurnPlaybackSession: Equatable {
    let fullText: String
    let timeline: ScreenplayDialogueTimelineRevision
    let audioDurationMs: Int
    let requestID: String
    let timingSource: String
    let replacementTarget: ScreenplayPendingReplacementTarget?

    var livePageContext: ScreenplayLiveTalkPageContext? = nil
    var requiresLivePageContext: Bool = false

    var cues: [ScreenplayVoiceCue] {
        timeline.compatibilityCues
    }

    var cueCount: Int {
        timeline.totalRevealUnitCount
    }
}

typealias ScreenplayVoiceInsertPlan = ScreenplayTurnPlaybackSession


struct ScreenplayLineJumpRequest: Identifiable, Equatable {
    let id: UUID
    let line: Int
}

struct ScreenplayLineHighlightRequest: Identifiable, Equatable {
    let id: UUID
    let startLine: Int
    let endLine: Int
}

struct ScreenplayAnchoredTextRectRequest: Identifiable, Equatable {
    let id: UUID
    let startLine: Int
    let endLine: Int
}

struct ScreenplayAnchoredTextRectSnapshot: Equatable {
    let requestID: UUID
    let startLine: Int
    let endLine: Int
    let rect: CGRect
    let visibleRect: CGRect
}

struct ScreenplayEditorFocusRequest: Identifiable, Equatable {
    let id: UUID
}


struct ScreenplayVoiceRevealPresentationState: Equatable {
    enum Phase: String, Equatable {
        case prepared
        case playing
        case completed
    }

    let sessionID: String
    let timeline: ScreenplayDialogueTimelineRevision
    let visibleUTF16Length: Int
    let activeSegmentID: String?
    let phase: Phase
}


enum ScreenplaySyncedVoiceReplyRole: String, Codable, Equatable {
    case preview
    case final
}

struct ScreenplaySyncedVoiceRenderContract: Equatable {
    let replyRole: ScreenplaySyncedVoiceReplyRole
    let authoritativePageTextAvailable: Bool
    let syncReady: Bool

    nonisolated static let `default` = ScreenplaySyncedVoiceRenderContract(
        replyRole: .final,
        authoritativePageTextAvailable: false,
        syncReady: false
    )

    nonisolated static let pageWritePreview = ScreenplaySyncedVoiceRenderContract(
        replyRole: .preview,
        authoritativePageTextAvailable: false,
        syncReady: false
    )
}

