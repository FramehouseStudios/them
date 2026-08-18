import SwiftUI
import UniformTypeIdentifiers

extension ScreenplayStudioScreen {
    enum PromptRoutingMode: String, CaseIterable, Identifiable {
        case automatic
        case page
        case voicePin

        var id: String { rawValue }

        var title: String {
            switch self {
            case .automatic: return "Auto"
            case .page: return "Write to Page"
            case .voicePin: return "Keep in Voice Pin"
            }
        }
    }

    enum StudioPromptIntent: String, CaseIterable, Identifiable {
        case advice
        case rewrite
        case voicePin

        var id: String { rawValue }

        var title: String {
            switch self {
            case .advice: return "Advice"
            case .rewrite: return "Rewrite"
            case .voicePin: return "Voice Pin"
            }
        }
    }

    enum DraftImportMode: String {
        case replace
        case append
    }

    static let draftImportTextExtensions: Set<String> = [
        "fountain",
        "txt",
        "md",
        "text",
        "screenplay",
    ]

    static var draftImportContentTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .text]
        for ext in draftImportTextExtensions.sorted() {
            if let type = UTType(filenameExtension: ext), !types.contains(type) {
                types.append(type)
            }
        }
        return types
    }

    enum StudioTarget: String, Codable, Equatable {
        case page
        case voicePin

        var label: String {
            switch self {
            case .page: return "Page"
            case .voicePin: return "Voice Pin"
            }
        }

        var systemImage: String {
            switch self {
            case .page: return "doc.text"
            case .voicePin: return "text.bubble"
            }
        }

        var tint: Color {
            switch self {
            case .page: return Color.green
            case .voicePin: return Color.blue
            }
        }

        var fill: Color {
            switch self {
            case .page: return Color.green.opacity(0.12)
            case .voicePin: return Color.blue.opacity(0.12)
            }
        }
    }

    enum StudioPromptSource: String, Codable, Equatable {
        case typed
        case voice

        var label: String {
            switch self {
            case .typed: return "Typed"
            case .voice: return "Voice"
            }
        }
    }

    enum DraftToolsSection: String, CaseIterable, Identifiable {
        case pages
        case revisions
        case snapshots

        var id: String { rawValue }

        var title: String {
            switch self {
            case .pages: return "Pages"
            case .revisions: return "Revisions"
            case .snapshots: return "Snapshots"
            }
        }

        var iconName: String {
            switch self {
            case .pages: return "doc.plaintext"
            case .revisions: return "highlighter"
            case .snapshots: return "clock.arrow.circlepath"
            }
        }
    }

    enum DirectionOneDraftShortcut: String, CaseIterable, Identifiable {
        case pages
        case revisions
        case snapshots
        case saved

        var id: String { rawValue }

        var color: Color {
            switch self {
            case .pages: return .blue
            case .revisions: return .pink
            case .snapshots: return .yellow
            case .saved: return .green
            }
        }

        var label: String {
            switch self {
            case .pages: return "Draft Pages"
            case .revisions: return "Draft Revisions"
            case .snapshots: return "Draft Snapshots"
            case .saved: return "Saved Drafts"
            }
        }

        var hoverLabel: String {
            switch self {
            case .pages: return "Pages"
            case .revisions: return "Revisions"
            case .snapshots: return "Snapshots"
            case .saved: return "Saved"
            }
        }
    }

    enum IntelligenceFixQueueKind: String, Equatable {
        case bindScene
        case attachCharacter
        case mergeDuplicateBeats
        case reanchorScene
        case rewriteBrief

        var isSafe: Bool {
            switch self {
            case .bindScene, .attachCharacter, .mergeDuplicateBeats:
                return true
            case .reanchorScene, .rewriteBrief:
                return false
            }
        }
    }

    struct IntelligenceFixQueueItem: Identifiable, Equatable {
        let id: String
        let title: String
        let detail: String
        let actionTitle: String
        let kind: IntelligenceFixQueueKind
        let issue: ScreenplayIntelligenceIssue?
        let drift: ScreenplaySceneDriftSummary?

        var isSafe: Bool { kind.isSafe }
    }

    struct IntelligenceFixBatchSnapshot: Equatable {
        let id: String
        let createdAt: Date
        let project: BackendScreenplayProjectSummary
        let outline: BackendScreenplayOutline
        let queuedFixesBefore: [IntelligenceFixQueueItem]
        let appliedFixIDs: [String]
        let studioPromptSeed: String
        let studioPromptRoutingModeRaw: String
        let selectedInspectorSectionRaw: String
        let highlightedSceneInspectorKey: String

        var shortID: String {
            String(id.prefix(8)).uppercased()
        }
    }

    enum StudioDebugIntelligenceQueueAction: String {
        case previewAll = "preview_all"
        case applyOne = "apply_one"
        case applyAllSafe = "apply_all_safe"
        case rollbackLastBatch = "rollback_last_batch"
    }

    enum SidebarSection: String, CaseIterable, Identifiable {
        case projects
        case files

        var id: String { rawValue }

        var title: String {
            switch self {
            case .projects: return "Projects"
            case .files: return "Files"
            }
        }

        var iconName: String {
            switch self {
            case .projects: return "film.stack"
            case .files: return "folder"
            }
        }
    }

    enum InspectorSection: String, CaseIterable, Identifiable {
        case comments
        case collaborators
        case scenes
        case beats

        var id: String { rawValue }

        var title: String {
            switch self {
            case .comments: return "Comments"
            case .collaborators: return "Collaborators"
            case .scenes: return "Scenes"
            case .beats: return "Beats"
            }
        }

        var iconName: String {
            switch self {
            case .comments: return "text.bubble"
            case .collaborators: return "person.2"
            case .scenes: return "film.stack"
            case .beats: return "waveform.path.ecg"
            }
        }
    }

    enum FullThreadFilter: String, CaseIterable, Identifiable {
        case all
        case pageWrites
        case voicePin
        case companion
        case currentScene

        var id: String { rawValue }

        var title: String {
            switch self {
            case .all: return "All"
            case .pageWrites: return "Page Writes"
            case .voicePin: return "Voice Pin"
            case .companion: return "Companion"
            case .currentScene: return "Current Scene"
            }
        }
    }

    enum DirectionOneLeftRailTab: String, CaseIterable, Identifiable {
        case scenes
        case projects

        var id: String { rawValue }

        var title: String {
            switch self {
            case .scenes: return "Scenes"
            case .projects: return "Projects"
            }
        }

        var systemImage: String {
            switch self {
            case .scenes: return "list.bullet.rectangle"
            case .projects: return "folder"
            }
        }
    }

    enum DirectionOneRightPanelTab: String, CaseIterable, Identifiable {
        case draft
        case beats
        case craft
        case outline
        case them
        case saved

        var id: String { rawValue }

        static func resolved(from raw: String) -> Self? {
            switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "intelligence", "companion", "them":
                return .them
            default:
                return Self(rawValue: raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
            }
        }

        var title: String {
            switch self {
            case .draft: return "Draft"
            case .beats: return "Beats"
            case .craft: return "Craft"
            case .outline: return "Outline"
            case .them: return "io.them"
            case .saved: return "Saved"
            }
        }

        var iconName: String {
            switch self {
            case .draft: return "doc.text"
            case .beats: return "flag"
            case .craft: return "chart.line.uptrend.xyaxis"
            case .outline: return "list.bullet.rectangle.portrait"
            case .them: return "sparkles"
            case .saved: return "checkmark.circle"
            }
        }
    }


    enum DirectionOneWorkspaceMode: String, CaseIterable, Identifiable {
        case draft
        case beats
        case outline

        var id: String { rawValue }

        init?(tab: DirectionOneRightPanelTab) {
            switch tab {
            case .draft:
                self = .draft
            case .beats:
                self = .beats
            case .outline:
                self = .outline
            case .craft, .them, .saved:
                return nil
            }
        }

        var title: String {
            switch self {
            case .draft:
                return "Draft"
            case .beats:
                return "Beats"
            case .outline:
                return "Outline"
            }
        }

        var subtitle: String {
            switch self {
            case .draft:
                return "Page"
            case .beats:
                return "Story beats"
            case .outline:
                return "Structure"
            }
        }

        var tab: DirectionOneRightPanelTab {
            switch self {
            case .draft:
                return .draft
            case .beats:
                return .beats
            case .outline:
                return .outline
            }
        }
    }

    enum DirectionOneAssistantGuidanceKind {
        case anchorProject
        case reviewPendingAction
        case reviewSignals
        case reopenThread
        case advanceDraft
    }

    struct StudioFileEntry: Identifiable, Hashable {
        let url: URL
        let isDirectory: Bool
        let modifiedAt: Date?
        var id: String { url.path }
        var name: String { url.lastPathComponent }
    }

    enum DraftStatusChipProminence {
        case accent
        case success
        case warning
        case danger
        case muted
    }

    struct VoicePinHistoryGroup: Identifiable {
        let category: String
        let items: [ScreenplayAssistantPinState]

        var id: String { category }
    }

    struct VoicePinSuggestion: Identifiable {
        let category: String
        let text: String

        var id: String { "\(category)|\(text)" }
    }

    struct VoicePinTurn: Identifiable, Equatable {
        enum Source {
            case voice
            case typed
        }

        let id: UUID
        let exchangeID: UUID
        let userAskLabel: String
        let fountainOutput: String
        let source: Source
        let packLabel: String
        let phase: String
        let timestamp: Date
        let lineRef: Int?

        var outputExcerpt: String {
            fountainOutput
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .prefix(2)
                .joined(separator: " · ")
        }

        var timeAgo: String {
            let elapsed = max(0, Int(Date().timeIntervalSince(timestamp)))
            if elapsed < 60 {
                return "\(elapsed)s ago"
            }
            if elapsed < 3600 {
                return "\(elapsed / 60)m ago"
            }
            return "\(elapsed / 3600)h ago"
        }
    }

    struct StudioAskNoteExchange: Identifiable, Codable, Equatable {
        let id: UUID
        let backendThreadID: String?
        let backendTurn: Int?
        let requestID: String?
        let prompt: String
        let target: StudioTarget
        let source: StudioPromptSource
        let noteTitle: String
        let noteBody: String
        let developmentText: String?
        let writeID: String?
        let replacedWriteID: String?
        let anchorLine: Int?
        let anchorEndLine: Int?
        let anchorSceneLabel: String?
        let anchorExcerpt: String?
        let insertedText: String?
        let replacementApplied: Bool?
        let revisedBlockText: String?
        let resolvedAnchorExcerpt: String?
        let packLabel: String?
        let phase: String?
        let sluglineAnchorLine: Int?
        let memoryDomainRaw: String?
        let companionModeRaw: String?
        let timestamp: Date

        init(
            id: UUID,
            backendThreadID: String?,
            backendTurn: Int?,
            requestID: String?,
            prompt: String,
            target: StudioTarget,
            source: StudioPromptSource,
            noteTitle: String,
            noteBody: String,
            developmentText: String? = nil,
            writeID: String?,
            replacedWriteID: String?,
            anchorLine: Int?,
            anchorEndLine: Int?,
            anchorSceneLabel: String?,
            anchorExcerpt: String?,
            insertedText: String?,
            replacementApplied: Bool? = nil,
            revisedBlockText: String? = nil,
            resolvedAnchorExcerpt: String? = nil,
            packLabel: String? = nil,
            phase: String? = nil,
            sluglineAnchorLine: Int? = nil,
            memoryDomainRaw: String? = nil,
            companionModeRaw: String? = nil,
            timestamp: Date
        ) {
            self.id = id
            self.backendThreadID = backendThreadID
            self.backendTurn = backendTurn
            self.requestID = requestID
            self.prompt = prompt
            self.target = target
            self.source = source
            self.noteTitle = noteTitle
            self.noteBody = noteBody
            let cleanDevelopmentText = developmentText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            self.developmentText = cleanDevelopmentText.isEmpty ? nil : cleanDevelopmentText
            self.writeID = writeID
            self.replacedWriteID = replacedWriteID
            self.anchorLine = anchorLine
            self.anchorEndLine = anchorEndLine
            self.anchorSceneLabel = anchorSceneLabel
            self.anchorExcerpt = anchorExcerpt
            self.insertedText = insertedText
            self.replacementApplied = replacementApplied
            self.revisedBlockText = revisedBlockText
            self.resolvedAnchorExcerpt = resolvedAnchorExcerpt
            self.packLabel = packLabel
            self.phase = phase
            self.sluglineAnchorLine = sluglineAnchorLine
            self.memoryDomainRaw = memoryDomainRaw
            self.companionModeRaw = companionModeRaw
            self.timestamp = timestamp
        }
    }

    struct StudioWriteAnchorRecord: Codable, Equatable {
        let writeID: String
        let anchorLine: Int
        let anchorEndLine: Int
        let anchorSceneLabel: String?
        let anchorExcerpt: String?
        let insertedText: String?
        let versionID: String?
        let updatedAt: Date
    }

    enum StudioActionPreviewDiffKind {
        case unchanged
        case added
        case removed
        case changed
    }

    struct StudioActionPreviewDiffSummary {
        let unchangedCount: Int
        let addedCount: Int
        let removedCount: Int
        let changedCount: Int
        let isDestructive: Bool

        var impactedCount: Int {
            addedCount + removedCount + changedCount
        }
    }

    struct StudioActionPreviewDiffRow: Identifiable {
        let id = UUID()
        let kind: StudioActionPreviewDiffKind
        let beforeLineNumber: Int?
        let afterLineNumber: Int?
        let beforeText: String
        let afterText: String
    }

    struct DraftSceneNavigatorItem: Identifiable, Equatable {
        let id: String
        let line: Int
        let label: String
        let shortLabel: String
    }

    struct FullThreadSceneOption: Identifiable, Hashable {
        let key: String
        let label: String
        let count: Int
        let isCurrent: Bool

        var id: String { key }
    }

    struct FullThreadSection: Identifiable {
        let key: String
        let title: String
        let entries: [StudioAskNoteExchange]

        var id: String { key }
    }

    enum FullThreadDraftComparisonState {
        case matchesCurrentDraft
        case revisedInDraft
        case removedFromDraft
    }

    struct FullThreadDraftComparison {
        let state: FullThreadDraftComparisonState
        let currentText: String
        let sceneLabel: String?
    }

    struct FullThreadRevisionTimelineItem: Identifiable {
        let id: String
        let exchange: StudioAskNoteExchange
        let title: String
        let subtitle: String
        let tint: Color
        let canOpenDiff: Bool
    }

    enum ScreenplayPageMetaTone {
        case muted
        case accent
        case warning
        case success

        var color: Color {
            switch self {
            case .muted:
                return Color.herText.opacity(0.68)
            case .accent:
                return Color.accentColor.opacity(0.82)
            case .warning:
                return Color.orange.opacity(0.86)
            case .success:
                return Color.green.opacity(0.78)
            }
        }
    }

    enum InlineWriteRevisionPreset {
        case sharper
        case moreVisual
        case shorter

        var title: String {
            switch self {
            case .sharper: return "sharper"
            case .moreVisual: return "more visual"
            case .shorter: return "shorter"
            }
        }

        var displayPrompt: String {
            switch self {
            case .sharper: return "Make the last write sharper."
            case .moreVisual: return "Make the last write more visual."
            case .shorter: return "Make the last write shorter."
            }
        }

        var instruction: String {
            switch self {
            case .sharper:
                return "Make it sharper. Tighten the beats, conflict, and line choices without changing the story intent."
            case .moreVisual:
                return "Make it more visual. Favor playable action, physical behavior, and screenable images over explanation."
            case .shorter:
                return "Make it shorter. Keep the same story intent, but compress the writing and remove anything expendable."
            }
        }
    }

    struct ResolvedStudioExchangeAnchor {
        let startLine: Int
        let endLine: Int
        let sceneLabel: String?
    }
}
