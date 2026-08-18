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
}
