import Foundation

struct ScreenplayStudioUserPrompt: Identifiable, Equatable {
    enum Source: String, Codable, Equatable {
        case typed
        case voice
    }

    enum Target: String, Codable, Equatable {
        case page
        case voicePin
    }

    enum MemoryDomain: String, Codable, Equatable {
        case project
        case companion
        case mixed
    }

    let id: UUID
    let text: String
    let requestID: String?
    let source: Source
    let target: Target
    let memoryDomain: MemoryDomain
    let recordedAt: Date
}

struct PreparedTurnPrompt {
    let directorText: String
    let partialHint: String
    let useScreenplayMode: Bool
    let shouldWriteToPage: Bool
    let shouldAutoOpenStudio: Bool
    let memoryDomain: StudioMemoryDomain
    let director: HerDirectorContext
    let companionSignals: CreativeCompanionSignalState
    let baseSystemPrompt: String
}

@MainActor
struct StudioDialogueAnchorMetadata {
    let startLine: Int?
    let endLine: Int?
    let sceneLabel: String
    let draftSceneID: String
    let outlineSceneID: String
    let outlineBeatIDs: [String]
    let scriptNodeID: String
    let documentRevisionID: String
}

#if DEBUG
struct DebugStudioPromptStubReply {
    let target: ScreenplayStudioUserPrompt.Target
    let pack: String
    let phase: String
    let projectID: String
    let versionID: String
    let noteTitle: String
    let noteBody: String
    let insertedText: String
}
#endif
