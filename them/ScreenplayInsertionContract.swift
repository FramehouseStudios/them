import Foundation

// A line range alone is not authority to replace changed writer text.
func screenplayReplacementTargetIsCurrent(_ target: ScreenplayPendingReplacementTarget, in draft: String) -> Bool {
    let wanted = target.currentText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !wanted.isEmpty, target.startLine > 0, target.endLine >= target.startLine else { return false }
    let lines = draft.components(separatedBy: "\n")
    if target.endLine <= lines.count {
        let candidate = lines[(target.startLine - 1)..<target.endLine].joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if candidate.utf8.elementsEqual(wanted.utf8) { return true }
    }
    let text = draft as NSString
    let first = text.range(of: wanted, options: [.literal])
    guard first.location != NSNotFound else { return false }
    let next = first.location + 1
    return next >= text.length || text.range(of: wanted, options: [.literal], range: NSRange(location: next, length: text.length - next)).location == NSNotFound
}

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
