import SwiftUI
import Combine
#if os(macOS)
import AppKit
#endif
#if os(iOS)
import UIKit
#endif

struct ScreenplayInsertionRequest: Identifiable, Equatable {
    enum Mode: String, Equatable {
        case insert
        case streamPreview
        case streamCommit
        case streamCancel
        case streamInsertProgress
        case streamInsertFinalize
        case streamInsertCancel
    }

    let id: UUID
    let text: String
    let mode: Mode

    init(id: UUID = UUID(), text: String, mode: Mode = .insert) {
        self.id = id
        self.text = text
        self.mode = mode
    }
}

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

struct ScreenplayVoiceCue: Codable, Equatable {
    let index: Int
    let text: String
    let elementRaw: String
    let startMs: Int
    let endMs: Int
}

struct ScreenplayVoiceInsertPlan: Equatable {
    let fullText: String
    let cues: [ScreenplayVoiceCue]
    let audioDurationMs: Int
    let requestID: String
    let timingSource: String
}

struct ScreenplayEditorSelectionSnapshot: Equatable {
    let location: Int
    let length: Int
    let startLine: Int
    let endLine: Int
    let text: String
    let sceneLabel: String?

    var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var hasSelection: Bool {
        length > 0 && !trimmedText.isEmpty
    }

    var isMultiLine: Bool {
        endLine > startLine
    }
}

struct ScreenplayEditorActionRequest: Identifiable, Equatable {
    enum Action: String, Codable, Equatable {
        case undo
        case redo
    }

    let id: UUID
    let action: Action
}

enum ScreenplayAuditionVoiceStyle: String, Codable, Equatable {
    case natural
    case faster
    case colder
    case vulnerable
}

struct ScreenplayStudioActionRequest: Identifiable, Equatable {
    enum Action: String, Codable, Equatable {
        case saveDraft
        case saveRevisionSnapshot
        case undoLastPageWrite
        case moveCurrentSceneAfterScene
        case moveSelectionAfterScene
        case splitSelectionIntoNewScene
        case promoteSelectionToBeat
        case makeBeatFromSelection
        case updateSelectedBeatFromSelection
        case deleteCurrentBeat
        case duplicateCurrentScene
        case promoteParagraphToDialogue
        case demoteCurrentBeat
        case acceptFocusedRewrite
        case mergeCurrentSceneForward
    }

    let id: UUID
    let action: Action
    let intValue: Int?
    let secondaryIntValue: Int?
    let stringValue: String?
    let secondaryStringValue: String?

    init(
        id: UUID = UUID(),
        action: Action,
        intValue: Int? = nil,
        secondaryIntValue: Int? = nil,
        stringValue: String? = nil,
        secondaryStringValue: String? = nil
    ) {
        self.id = id
        self.action = action
        self.intValue = intValue
        self.secondaryIntValue = secondaryIntValue
        self.stringValue = stringValue
        self.secondaryStringValue = secondaryStringValue
    }
}

struct ScreenplayStudioActionPreview: Identifiable, Equatable {
    let id: UUID
    let actionRequest: ScreenplayStudioActionRequest
    let title: String
    let beforeLines: [String]
    let afterLines: [String]
    let warning: String?

    init(
        id: UUID = UUID(),
        actionRequest: ScreenplayStudioActionRequest,
        title: String,
        beforeLines: [String],
        afterLines: [String],
        warning: String? = nil
    ) {
        self.id = id
        self.actionRequest = actionRequest
        self.title = title
        self.beforeLines = beforeLines
        self.afterLines = afterLines
        self.warning = warning?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

struct ScreenplayCommittedWrite: Identifiable, Equatable {
    let id: UUID
    let writeID: String
    let previousDraft: String
    let committedDraft: String
    let insertedText: String
    let replacementApplied: Bool
    let replacedWriteID: String?
    let startLine: Int
    let endLine: Int
    let committedAt: Date
}

struct ScreenplayPendingReplacementTarget: Identifiable, Equatable {
    let id: UUID
    let sourceWriteID: String
    let startLine: Int
    let endLine: Int
    let currentText: String
}

struct ScreenplayReplacementTraceEvent: Codable, Equatable {
    let kind: String
    let requestID: String
    let sourceWriteID: String
    let startLine: Int?
    let endLine: Int?
    let preview: String
    let detail: String
    let timestamp: Date
}

struct ScreenplayAssistantPinState: Equatable {
    let id: UUID
    let mode: String
    let category: String
    let title: String
    let body: String
    let fullBody: String
    let badge: String
    let actionSummary: String
    let updatedAt: Date

    var dedupeKey: String {
        [mode, category, title, fullBody.isEmpty ? body : fullBody, badge, actionSummary].joined(separator: "|")
    }

    var hasContent: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !actionSummary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static let empty = ScreenplayAssistantPinState(
        id: UUID(),
        mode: "idle",
        category: "",
        title: "",
        body: "",
        fullBody: "",
        badge: "",
        actionSummary: "",
        updatedAt: .distantPast
    )
}

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

enum StudioMemoryDomain: String, CaseIterable, Identifiable, Codable {
    case project
    case companion
    case mixed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .project:
            return "Project"
        case .companion:
            return "Companion"
        case .mixed:
            return "Mixed"
        }
    }

    var promptMemoryDomain: ScreenplayStudioUserPrompt.MemoryDomain {
        ScreenplayStudioUserPrompt.MemoryDomain(rawValue: rawValue) ?? .project
    }
}

enum StudioCompanionMode: String, CaseIterable, Identifiable, Codable {
    case coach
    case coWriter = "co_writer"
    case comfort

    var id: String { rawValue }

    var title: String {
        switch self {
        case .coach:
            return "Coach"
        case .coWriter:
            return "Co-writer"
        case .comfort:
            return "Comfort"
        }
    }

    var shortTitle: String {
        switch self {
        case .coach:
            return "Coach"
        case .coWriter:
            return "Co-write"
        case .comfort:
            return "Comfort"
        }
    }

    var promptInstruction: String {
        switch self {
        case .coach:
            return "COMPANION MODE: Coach. Be calm, practical, and grounded. Name the user's state briefly, then offer one concrete next step. Avoid page-mode language unless they explicitly ask for screenplay work."
        case .coWriter:
            return "COMPANION MODE: Co-writer. Stay warm and relational, but keep bringing the conversation back to story craft, scene choices, and actionable screenplay help. Treat drafted lines as optional collaboration, not commands."
        case .comfort:
            return "COMPANION MODE: Comfort. Be stabilizing, gentle, and reassuring. Do not pressure the user toward productivity. Do not speak in tool-state language or write to the screenplay page unless they explicitly ask."
        }
    }

    var summary: String {
        switch self {
        case .coach:
            return "Practical support with one clear next step."
        case .coWriter:
            return "Warm creative partnership that still stays craft-aware."
        case .comfort:
            return "Soothing, grounding, and non-pressuring presence."
        }
    }
}

nonisolated struct ScreenplayConversationTurn: Identifiable, Codable, Equatable, Hashable {
    let id: UUID
    let user: String
    let assistant: String
    let memoryDomain: StudioMemoryDomain
    let recordedAt: Date
}

enum ScreenplayCompanionSurface: String, Codable, CaseIterable, Identifiable {
    case home
    case studio

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home:
            return "Home"
        case .studio:
            return "Studio"
        }
    }
}

enum ScreenplayCompanionTurnSource: String, Codable, CaseIterable, Identifiable {
    case voice
    case typed

    var id: String { rawValue }
}

nonisolated struct ScreenplayCompanionAnalyticsSnapshot: Codable, Equatable, Hashable {
    let updatedAt: Date
    let totalTurns: Int
    let homeTurns: Int
    let studioTurns: Int
    let voiceTurns: Int
    let typedTurns: Int
    let modeSwitches: Int
    let memoryClears: Int
    let threadClears: Int
    let lastSurfaceRaw: String
    let lastSourceRaw: String

    static let empty = ScreenplayCompanionAnalyticsSnapshot(
        updatedAt: .distantPast,
        totalTurns: 0,
        homeTurns: 0,
        studioTurns: 0,
        voiceTurns: 0,
        typedTurns: 0,
        modeSwitches: 0,
        memoryClears: 0,
        threadClears: 0,
        lastSurfaceRaw: "",
        lastSourceRaw: ""
    )

    var lastSurface: ScreenplayCompanionSurface? {
        ScreenplayCompanionSurface(rawValue: lastSurfaceRaw)
    }

    var lastSource: ScreenplayCompanionTurnSource? {
        ScreenplayCompanionTurnSource(rawValue: lastSourceRaw)
    }
}

struct ScreenplayDraftParagraphSnapshot: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let line: Int
    let element: ScreenplayEditorElement?
    let text: String
}

struct ScreenplayDraftSceneSnapshot: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let line: Int
    let endLine: Int
    let slugline: String
    let shortLabel: String
    let characterCues: [String]
    let dialogueLineCount: Int
}

struct ScreenplayProjectSceneBindingSnapshot: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let draftSceneID: String
    let draftLine: Int
    let draftEndLine: Int
    let draftSlugline: String
    let draftShortLabel: String
    let outlineSceneID: String?
    let outlineSceneTitle: String?
    let outlineSceneSlugline: String?
    let outlineSceneObjective: String?
    let outlineSceneSummary: String?
    let outlineBeatIDs: [String]
    let outlineBeatLabels: [String]
    let actTitle: String?
    let matchedBy: String

    var isBound: Bool {
        !(outlineSceneID ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct ScreenplayStructuredDraft: Codable, Equatable, Hashable {
    let updatedAt: Date
    let lineCount: Int
    let sceneCount: Int
    let paragraphs: [ScreenplayDraftParagraphSnapshot]
    let scenes: [ScreenplayDraftSceneSnapshot]
    let characters: [String]

    static let empty = ScreenplayStructuredDraft(
        updatedAt: .distantPast,
        lineCount: 0,
        sceneCount: 0,
        paragraphs: [],
        scenes: [],
        characters: []
    )
}

struct ScreenplayProjectBindingSnapshot: Codable, Equatable, Hashable {
    let updatedAt: Date
    let projectID: String
    let projectTitle: String
    let versionID: String
    let phase: String
    let draftSceneCount: Int
    let outlineSceneCount: Int
    let boundSceneCount: Int
    let draftCharacterCount: Int
    let projectCharacterCount: Int
    let boundCharacterCount: Int
    let sceneBindings: [ScreenplayProjectSceneBindingSnapshot]

    static let empty = ScreenplayProjectBindingSnapshot(
        updatedAt: .distantPast,
        projectID: "",
        projectTitle: "",
        versionID: "",
        phase: "",
        draftSceneCount: 0,
        outlineSceneCount: 0,
        boundSceneCount: 0,
        draftCharacterCount: 0,
        projectCharacterCount: 0,
        boundCharacterCount: 0,
        sceneBindings: []
    )
}

enum ScreenplayIntelligenceSeverity: String, Codable, Equatable, Hashable {
    case info
    case warning
    case critical
}

struct ScreenplayIntelligenceIssue: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let title: String
    let detail: String
    let severity: ScreenplayIntelligenceSeverity
}

struct ScreenplayCharacterLineSummary: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let character: String
    let sceneCount: Int
    let dialogueLineCount: Int
}

struct ScreenplayActBalanceSummary: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let actTitle: String
    let sceneCount: Int
    let beatCount: Int
    let dialogueLineCount: Int
}

struct ScreenplaySceneDriftSummary: Identifiable, Codable, Equatable, Hashable {
    let id: String
    let sceneLabel: String
    let objective: String
    let draftSignal: String
    let overlapScore: Double
}

struct ScreenplayIntelligenceReport: Codable, Equatable, Hashable {
    let updatedAt: Date
    let continuityIssues: [ScreenplayIntelligenceIssue]
    let characterSummaries: [ScreenplayCharacterLineSummary]
    let sceneGoalDrift: [ScreenplaySceneDriftSummary]
    let actBalance: [ScreenplayActBalanceSummary]
    let duplicateBeatIssues: [ScreenplayIntelligenceIssue]
    let changeSummary: [String]

    static let empty = ScreenplayIntelligenceReport(
        updatedAt: .distantPast,
        continuityIssues: [],
        characterSummaries: [],
        sceneGoalDrift: [],
        actBalance: [],
        duplicateBeatIssues: [],
        changeSummary: []
    )
}

struct ScreenplayLocalStudioCommandFeedback {
    let confirmation: String
    let shouldSpeakConfirmation: Bool
    let isError: Bool
    let spokenText: String?
    let spokenStyle: ScreenplayAuditionVoiceStyle

    init(
        confirmation: String,
        shouldSpeakConfirmation: Bool,
        isError: Bool,
        spokenText: String? = nil,
        spokenStyle: ScreenplayAuditionVoiceStyle = .natural
    ) {
        self.confirmation = confirmation
        self.shouldSpeakConfirmation = shouldSpeakConfirmation
        self.isError = isError
        self.spokenText = spokenText
        self.spokenStyle = spokenStyle
    }
}

private enum ScreenplayLocalStudioCommand: Equatable {
    case confirmPendingAction
    case cancelPendingAction
    case jumpToLine(Int)
    case jumpToSceneOrdinal(Int)
    case jumpToSceneLabel(String)
    case insertSceneHeading(String)
    case insertCharacterCue(String)
    case setElement(ScreenplayEditorElement)
    case cycleElement(backward: Bool)
    case undo
    case redo
    case saveDraft
    case saveRevisionSnapshot
    case undoLastPageWrite
    case moveCurrentSceneAfterSceneOrdinal(Int)
    case moveCurrentSceneAfterSceneLabel(String)
    case moveSelectionAfterSceneOrdinal(Int)
    case moveSelectionAfterSceneLabel(String)
    case splitSelectionIntoNewScene
    case promoteSelectionToBeat
    case makeBeatFromSelection
    case updateSelectedBeatFromSelection
    case deleteCurrentBeat
    case duplicateCurrentScene
    case promoteParagraphToDialogue
    case demoteCurrentBeat
    case acceptFocusedRewrite
    case mergeCurrentSceneForward
    case readBackSelection
    case readBackCurrentPage
    case readBackCurrentScene
    case readBackSceneOrdinal(Int)
    case readBackSceneLabel(String)
    case readBackCharacterLines(String)
    case auditionSelection(ScreenplayAuditionVoiceStyle)
    case auditionCurrentScene(ScreenplayAuditionVoiceStyle)
    case replaceSelection
    case replaceCurrentScene
    case focusPage
}

enum ScreenplayEditorElement: String, CaseIterable, Identifiable, Codable {
    case sceneHeading
    case action
    case character
    case dialogue
    case parenthetical
    case transition

    var id: String { rawValue }

    var title: String {
        switch self {
        case .sceneHeading: return "Scene Heading"
        case .action: return "Action"
        case .character: return "Character"
        case .dialogue: return "Dialogue"
        case .parenthetical: return "Parenthetical"
        case .transition: return "Transition"
        }
    }

    var shortTitle: String {
        switch self {
        case .sceneHeading: return "Scene"
        case .action: return "Action"
        case .character: return "Character"
        case .dialogue: return "Dialogue"
        case .parenthetical: return "Paren"
        case .transition: return "Transition"
        }
    }

    var systemImage: String {
        switch self {
        case .sceneHeading: return "mappin.and.ellipse"
        case .action: return "text.alignleft"
        case .character: return "person.text.rectangle"
        case .dialogue: return "text.quote"
        case .parenthetical: return "parentheses"
        case .transition: return "arrow.turn.down.right"
        }
    }

    var shortcutKey: String {
        switch self {
        case .sceneHeading: return "1"
        case .action: return "2"
        case .character: return "3"
        case .dialogue: return "4"
        case .parenthetical: return "5"
        case .transition: return "6"
        }
    }

    var hint: String {
        switch self {
        case .sceneHeading: return "INT. HOUSE - NIGHT"
        case .action: return "Left-aligned action in present tense"
        case .character: return "Centered uppercase character cue"
        case .dialogue: return "Dialogue under the character cue"
        case .parenthetical: return "Small performance note in parentheses"
        case .transition: return "Right-aligned CUT TO: / FADE OUT:"
        }
    }

    var expectsUppercase: Bool {
        switch self {
        case .sceneHeading, .character, .transition:
            return true
        case .action, .dialogue, .parenthetical:
            return false
        }
    }

    var next: ScreenplayEditorElement {
        let all = Self.allCases
        guard let index = all.firstIndex(of: self) else { return .action }
        return all[(index + 1) % all.count]
    }

    var previous: ScreenplayEditorElement {
        let all = Self.allCases
        guard let index = all.firstIndex(of: self) else { return .action }
        return all[(index - 1 + all.count) % all.count]
    }

    var screenplayTabForward: ScreenplayEditorElement {
        switch self {
        case .sceneHeading:
            return .action
        case .action:
            return .character
        case .character:
            return .dialogue
        case .dialogue:
            return .parenthetical
        case .parenthetical:
            return .transition
        case .transition:
            return .sceneHeading
        }
    }

    var screenplayTabBackward: ScreenplayEditorElement {
        switch self {
        case .sceneHeading:
            return .sceneHeading
        case .action:
            return .sceneHeading
        case .character:
            return .action
        case .dialogue:
            return .character
        case .parenthetical:
            return .dialogue
        case .transition:
            return .action
        }
    }

    static func inferredElement(
        for line: String,
        previousElement: ScreenplayEditorElement?
    ) -> ScreenplayEditorElement {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .action }

        if looksLikeSceneHeadingStart(trimmed) {
            return .sceneHeading
        }
        if looksLikeTransition(trimmed) {
            return .transition
        }
        if trimmed.hasPrefix("(") && trimmed.hasSuffix(")") {
            return .parenthetical
        }
        if looksLikeCharacterCue(trimmed) {
            return .character
        }
        if previousElement == .character || previousElement == .parenthetical || previousElement == .dialogue {
            return .dialogue
        }
        return .action
    }

    static func inferredSequence(for draft: String) -> [ScreenplayEditorElement?] {
        let lines = draft.components(separatedBy: .newlines)
        var result: [ScreenplayEditorElement?] = []
        var previousElement: ScreenplayEditorElement? = nil

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                result.append(nil)
                continue
            }
            let element = inferredElement(for: trimmed, previousElement: previousElement)
            result.append(element)
            previousElement = element
        }

        return result
    }

    static func nextElementAfterReturn(
        currentLine: String,
        currentElement: ScreenplayEditorElement,
        previousElementBeforeCurrentLine: ScreenplayEditorElement?
    ) -> ScreenplayEditorElement {
        let trimmed = currentLine.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmed.isEmpty {
            switch previousElementBeforeCurrentLine {
            case .character:
                return .dialogue
            case .dialogue, .parenthetical:
                return .action
            case .transition:
                return .sceneHeading
            default:
                return .action
            }
        }

        let inferredCurrent = inferredElement(for: trimmed, previousElement: previousElementBeforeCurrentLine)
        switch inferredCurrent {
        case .sceneHeading:
            return .action
        case .character, .parenthetical:
            return .dialogue
        case .dialogue:
            return .dialogue
        case .transition:
            return .sceneHeading
        case .action:
            return .action
        }
    }

    static func looksLikeSceneHeadingStart(_ line: String) -> Bool {
        let upper = line.uppercased()
        return upper.hasPrefix("INT.")
            || upper.hasPrefix("EXT.")
            || upper.hasPrefix("INT/EXT.")
            || upper.hasPrefix("EXT/INT.")
            || upper.hasPrefix("I/E.")
    }

    static func looksLikeTransition(_ line: String) -> Bool {
        let upper = line.uppercased()
        return upper.hasSuffix("TO:")
            || upper == "FADE IN:"
            || upper == "FADE IN ON:"
            || upper == "FADE OUT:"
            || upper == "FADE OUT."
            || upper == "FADE TO BLACK:"
            || upper == "FADE TO BLACK."
            || upper == "SMASH TO BLACK:"
            || upper == "THE END"
    }

    static func looksLikeCharacterCue(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let upper = trimmed.uppercased()
        guard trimmed == upper else { return false }
        guard !looksLikeSceneHeadingStart(trimmed), !looksLikeTransition(trimmed) else { return false }
        guard !trimmed.contains(".") && !trimmed.contains(":") else { return false }
        guard trimmed.count <= 32 else { return false }
        return trimmed.range(of: #"^[A-Z0-9 '\-()]+$"#, options: .regularExpression) != nil
    }
}

struct ScreenplayStackMetrics {
    let printableWidth: CGFloat
    let dialogueLeading: CGFloat
    let dialogueTrailing: CGFloat
    let characterLeading: CGFloat
    let characterTrailing: CGFloat
    let parentheticalLeading: CGFloat
    let parentheticalTrailing: CGFloat
    let transitionTrailing: CGFloat
    let sceneHeadingSpacingAfter: CGFloat
    let actionCueSpacingAfter: CGFloat
    let transitionSpacingBefore: CGFloat
    static let editorTextInsetHorizontal: CGFloat = 56
    static let editorTextInsetVertical: CGFloat = 30
    static let pageSurfaceHorizontalPadding: CGFloat = 30

    static func paperGuidePositions(in pageWidth: CGFloat) -> (left: CGFloat, right: CGFloat) {
        let inset = pageSurfaceHorizontalPadding + editorTextInsetHorizontal
        return (left: inset, right: max(inset, pageWidth - inset))
    }

    static func editor(containerWidth: CGFloat) -> ScreenplayStackMetrics {
        calibrated(forPrintableWidth: min(max(containerWidth, 420), 520))
    }

    static let guideSample = calibrated(forPrintableWidth: 520)

    static func calibrated(forPrintableWidth printableWidth: CGFloat) -> ScreenplayStackMetrics {
        let dialogueLeading = min(max(printableWidth * 0.245, 110), 132)
        let dialogueTrailing = min(max(printableWidth * 0.225, 98), 120)
        let characterLeading = min(max(dialogueLeading + 56, printableWidth * 0.34), 184)
        let characterTrailing = min(max(dialogueTrailing + 18, printableWidth * 0.23), 132)
        let parentheticalLeading = min(max(characterLeading - 12, dialogueLeading + 34), 172)
        let parentheticalTrailing = min(max(characterTrailing + 14, dialogueTrailing + 22), 148)
        let transitionTrailing = min(max(printableWidth * 0.035, 10), 18)
        let sceneHeadingSpacingAfter = min(max(printableWidth * 0.010, 4), 6)
        let actionCueSpacingAfter = min(max(printableWidth * 0.014, 5), 8)
        let transitionSpacingBefore = min(max(printableWidth * 0.012, 5), 8)

        return ScreenplayStackMetrics(
            printableWidth: printableWidth,
            dialogueLeading: dialogueLeading,
            dialogueTrailing: dialogueTrailing,
            characterLeading: characterLeading,
            characterTrailing: characterTrailing,
            parentheticalLeading: parentheticalLeading,
            parentheticalTrailing: parentheticalTrailing,
            transitionTrailing: transitionTrailing,
            sceneHeadingSpacingAfter: sceneHeadingSpacingAfter,
            actionCueSpacingAfter: actionCueSpacingAfter,
            transitionSpacingBefore: transitionSpacingBefore
        )
    }
}

private extension NSAttributedString.Key {
    static let screenplayElementRaw = NSAttributedString.Key("io.them.them.screenplayElementRaw")
}

private func screenplayParagraphStyle(
    for element: ScreenplayEditorElement,
    previousElement: ScreenplayEditorElement?,
    nextElement: ScreenplayEditorElement?,
    containerWidth: CGFloat
) -> NSParagraphStyle {
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byWordWrapping
    style.paragraphSpacing = 0
    style.paragraphSpacingBefore = 0
    style.lineHeightMultiple = 1.0
    style.tabStops = []

    let metrics = ScreenplayStackMetrics.editor(containerWidth: max(containerWidth, 420))

    switch element {
    case .sceneHeading:
        style.alignment = .left
        style.firstLineHeadIndent = 0
        style.headIndent = 0
        style.tailIndent = 0
        if nextElement == .action || nextElement == .character {
            style.paragraphSpacing = metrics.sceneHeadingSpacingAfter
        }
    case .action:
        style.alignment = .left
        style.firstLineHeadIndent = 0
        style.headIndent = 0
        style.tailIndent = 0
        if nextElement == .character || nextElement == .transition {
            style.paragraphSpacing = metrics.actionCueSpacingAfter
        }
    case .character:
        style.alignment = .center
        style.firstLineHeadIndent = metrics.characterLeading
        style.headIndent = metrics.characterLeading
        style.tailIndent = -metrics.characterTrailing
    case .dialogue:
        style.alignment = .left
        style.firstLineHeadIndent = metrics.dialogueLeading
        style.headIndent = metrics.dialogueLeading
        style.tailIndent = -metrics.dialogueTrailing
    case .parenthetical:
        style.alignment = .left
        style.firstLineHeadIndent = metrics.parentheticalLeading
        style.headIndent = metrics.parentheticalLeading
        style.tailIndent = -metrics.parentheticalTrailing
    case .transition:
        style.alignment = .right
        style.firstLineHeadIndent = 0
        style.headIndent = 0
        style.tailIndent = -metrics.transitionTrailing
        if previousElement == .dialogue || previousElement == .parenthetical {
            style.paragraphSpacingBefore = metrics.transitionSpacingBefore
        }
    }

    return style
}

private func applyScreenplayParagraphAttributes(
    to textStorage: NSTextStorage,
    fullText: String,
    elements: [ScreenplayEditorElement?],
    containerWidth: CGFloat,
    font: Any,
    foregroundColor: Any
) {
    let nsText = fullText as NSString
    let fullRange = NSRange(location: 0, length: nsText.length)

    textStorage.beginEditing()
    textStorage.removeAttribute(.paragraphStyle, range: fullRange)
    textStorage.removeAttribute(.font, range: fullRange)
    textStorage.removeAttribute(.foregroundColor, range: fullRange)
    textStorage.removeAttribute(.screenplayElementRaw, range: fullRange)

    var lineStart = 0
    let lines = screenplayLineTexts(fullText)
    for (index, line) in lines.enumerated() {
        let lineLength = (line as NSString).length
        let hasTrailingNewline = index < lines.count - 1
        let rangeLength = lineLength + (hasTrailingNewline ? 1 : 0)
        let range = NSRange(location: lineStart, length: rangeLength)
        let resolvedElement = (index < elements.count ? elements[index] : nil) ?? .action
        let previousElement: ScreenplayEditorElement? = {
            guard index > 0 else { return nil }
            return index - 1 < elements.count ? elements[index - 1] : nil
        }()
        let nextElement: ScreenplayEditorElement? = {
            guard index + 1 < lines.count else { return nil }
            return index + 1 < elements.count ? elements[index + 1] : nil
        }()
        let paragraphStyle = screenplayParagraphStyle(
            for: resolvedElement,
            previousElement: previousElement,
            nextElement: nextElement,
            containerWidth: containerWidth
        )
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: foregroundColor,
            .paragraphStyle: paragraphStyle,
        ]
        if index < elements.count, let element = elements[index] {
            attributes[.screenplayElementRaw] = element.rawValue
        }
        textStorage.addAttributes(attributes, range: range)
        lineStart += rangeLength
    }
    textStorage.endEditing()
}

private func screenplayLineTexts(_ text: String) -> [String] {
    text.components(separatedBy: .newlines)
}

private func screenplayLineIndex(for location: Int, in text: String) -> Int {
    let safeText = text as NSString
    let maxLength = safeText.length
    let safeLocation = max(0, min(location, maxLength))
    let prefix = safeText.substring(to: safeLocation)
    let breaks = prefix.reduce(into: 0) { count, character in
        if character == "\n" { count += 1 }
    }
    return max(0, breaks)
}

private func screenplayCurrentLineDetails(
    for location: Int,
    in content: String
) -> (lineRange: NSRange, lineText: String, lineIndex: Int) {
    let ns = content as NSString
    let safeLocation = max(0, min(location, ns.length))
    let fullLineRange = ns.lineRange(for: NSRange(location: safeLocation, length: 0))
    let fullLineText = ns.substring(with: fullLineRange)
    let trimmedLineText = fullLineText.trimmingCharacters(in: CharacterSet(charactersIn: "\n"))
    let lineRange = NSRange(
        location: fullLineRange.location,
        length: (trimmedLineText as NSString).length
    )
    return (lineRange, trimmedLineText, screenplayLineIndex(for: lineRange.location, in: content))
}

private func shouldNormalizeScreenplayLineDuringTyping(
    _ lineText: String,
    as element: ScreenplayEditorElement
) -> Bool {
    let trimmed = lineText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }

    switch element {
    case .sceneHeading, .character, .transition:
        return true
    case .action, .dialogue, .parenthetical:
        return false
    }
}

private func screenplayPreviousFlowElement(before lineIndex: Int, in elements: [ScreenplayEditorElement?]) -> ScreenplayEditorElement? {
    guard lineIndex > 0 else { return nil }
    for index in stride(from: lineIndex - 1, through: 0, by: -1) {
        guard index < elements.count else { continue }
        if let element = elements[index] {
            return element
        }
    }
    return nil
}

private func bootstrapScreenplayParagraphElements(
    for text: String,
    attributedText: NSAttributedString? = nil
) -> [ScreenplayEditorElement?] {
    let lines = screenplayLineTexts(text)
    let nsText = text as NSString
    var result: [ScreenplayEditorElement?] = []
    var previousElement: ScreenplayEditorElement? = nil
    var lineStart = 0

    for (index, line) in lines.enumerated() {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        let lineLength = (line as NSString).length
        let hasTrailingNewline = index < lines.count - 1
        let rangeLength = lineLength + (hasTrailingNewline ? 1 : 0)

        guard !trimmed.isEmpty else {
            result.append(nil)
            lineStart += rangeLength
            continue
        }

        var attributedElement: ScreenplayEditorElement?
        if let attributedText, attributedText.length > 0 {
            let lookupLocation = min(lineStart, max(0, nsText.length - 1))
            if lookupLocation >= 0, lookupLocation < attributedText.length,
               let raw = attributedText.attribute(.screenplayElementRaw, at: lookupLocation, effectiveRange: nil) as? String {
                attributedElement = ScreenplayEditorElement(rawValue: raw)
            }
        }

        let element = attributedElement ?? ScreenplayEditorElement.inferredElement(
            for: trimmed,
            previousElement: previousElement
        )
        result.append(element)
        previousElement = element
        lineStart += rangeLength
    }

    return result
}

private func reconcileScreenplayParagraphElements(
    previousText: String,
    nextText: String,
    previousElements: [ScreenplayEditorElement?],
    activeLineIndex: Int?,
    explicitCurrentLineElement: ScreenplayEditorElement?
) -> [ScreenplayEditorElement?] {
    let previousLines = screenplayLineTexts(previousText)
    let nextLines = screenplayLineTexts(nextText)

    guard !previousLines.isEmpty else {
        var bootstrapped = bootstrapScreenplayParagraphElements(for: nextText)
        if let activeLineIndex,
           activeLineIndex < nextLines.count,
           let explicitCurrentLineElement,
           !nextLines[activeLineIndex].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            bootstrapped[activeLineIndex] = explicitCurrentLineElement
        }
        return bootstrapped
    }

    var prefixCount = 0
    while prefixCount < previousLines.count,
          prefixCount < nextLines.count,
          previousLines[prefixCount] == nextLines[prefixCount] {
        prefixCount += 1
    }

    var suffixCount = 0
    while suffixCount < (previousLines.count - prefixCount),
          suffixCount < (nextLines.count - prefixCount),
          previousLines[previousLines.count - 1 - suffixCount] == nextLines[nextLines.count - 1 - suffixCount] {
        suffixCount += 1
    }

    var result = Array<ScreenplayEditorElement?>(repeating: nil, count: nextLines.count)

    for index in 0..<min(prefixCount, nextLines.count) {
        result[index] = index < previousElements.count ? previousElements[index] : nil
    }

    if suffixCount > 0 {
        for offset in 0..<suffixCount {
            let nextIndex = nextLines.count - suffixCount + offset
            let previousIndex = previousLines.count - suffixCount + offset
            result[nextIndex] = previousIndex < previousElements.count ? previousElements[previousIndex] : nil
        }
    }

    let previousChangedStart = prefixCount
    let previousChangedEnd = max(previousChangedStart, previousLines.count - suffixCount)
    let nextChangedStart = prefixCount
    let nextChangedEnd = max(nextChangedStart, nextLines.count - suffixCount)
    let previousChangedCount = max(0, previousChangedEnd - previousChangedStart)

    var previousFlow = screenplayPreviousFlowElement(before: nextChangedStart, in: result)

    for nextIndex in nextChangedStart..<nextChangedEnd {
        let line = nextLines[nextIndex]
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            result[nextIndex] = nil
            continue
        }

        let relativeIndex = nextIndex - nextChangedStart
        let preserved: ScreenplayEditorElement? = {
            guard relativeIndex < previousChangedCount else { return nil }
            let previousIndex = previousChangedStart + relativeIndex
            guard previousIndex < previousElements.count else { return nil }
            return previousElements[previousIndex]
        }()

        let resolved: ScreenplayEditorElement
        if activeLineIndex == nextIndex, let explicitCurrentLineElement {
            resolved = explicitCurrentLineElement
        } else if let preserved {
            resolved = preserved
        } else {
            resolved = ScreenplayEditorElement.inferredElement(for: trimmed, previousElement: previousFlow)
        }

        result[nextIndex] = resolved
        previousFlow = resolved
    }

    if result.count != nextLines.count {
        return bootstrapScreenplayParagraphElements(for: nextText)
    }

    return result
}

@MainActor
final class ScreenplayLiveDraftBridge: ObservableObject {
    static let shared = ScreenplayLiveDraftBridge()

    private struct ProjectBindingContext {
        let projectID: String
        let projectTitle: String
        let versionID: String
        let phase: String
        let outline: BackendScreenplayOutline
        let projectCharacters: [String]
    }

    private static let autoInsertStorageKey = "studio_auto_insert"
    private static let activeElementStorageKey = "studio_active_screenplay_element_v1"
    private static let structuredDraftStorageKey = "studio_structured_draft_v1"
    private static let projectRecentTurnsStorageKey = "studio_project_recent_turns_v1"
    private static let companionRecentTurnsStorageKey = "studio_companion_recent_turns_v1"
    private static let companionModeStorageKey = "studio_companion_mode_v1"
    private static let debugActiveElementRawStorageKey = "studio_debug_active_screenplay_element_raw"
    private static let debugActiveElementLabelStorageKey = "studio_debug_active_screenplay_element_label"
    private static let debugLastMemoryDomainStorageKey = "studio_debug_last_memory_domain"
    private static let debugLastPromptTargetStorageKey = "studio_debug_last_prompt_target"
    private static let debugLastPromptSourceStorageKey = "studio_debug_last_prompt_source"
    private static let debugProjectBindingStorageKey = "studio_debug_project_binding_json"

    @Published var draftText: String = "" {
        didSet {
            guard draftText != oldValue else { return }
            syncStructuredDraftSnapshot(text: draftText)
        }
    }
    @Published var latestVoiceTurn: String = ""
    @Published var latestPack: String = ""
    @Published var latestPhase: String = ""
    @Published var latestUserTranscript: String = ""
    @Published var preferredProjectID: String = ""
    @Published var preferredVersionID: String = ""
    @Published var structuredDraft: ScreenplayStructuredDraft = .empty {
        didSet {
            persistStructuredDraft()
            refreshIntelligenceReport()
        }
    }
    @Published var projectBinding: ScreenplayProjectBindingSnapshot = .empty {
        didSet {
            persistProjectBindingDebugMirror()
            refreshIntelligenceReport()
        }
    }
    @Published var latestStudioRouteTarget: ScreenplayStudioUserPrompt.Target = .voicePin {
        didSet {
            persistStudioRoutingDebugMirror()
        }
    }
    @Published var latestMemoryDomain: StudioMemoryDomain = .project {
        didSet {
            persistStudioRoutingDebugMirror()
        }
    }
    @Published var projectRecentTurns: [ScreenplayConversationTurn] = [] {
        didSet {
            persistConversationTurns(projectRecentTurns, key: Self.projectRecentTurnsStorageKey)
        }
    }
    @Published var companionRecentTurns: [ScreenplayConversationTurn] = [] {
        didSet {
            persistConversationTurns(companionRecentTurns, key: Self.companionRecentTurnsStorageKey)
        }
    }
    @Published var companionMode: StudioCompanionMode = .coach {
        didSet {
            UserDefaults.standard.set(companionMode.rawValue, forKey: Self.companionModeStorageKey)
        }
    }
    @Published var autoInsertEnabled: Bool = true {
        didSet {
            UserDefaults.standard.set(autoInsertEnabled, forKey: Self.autoInsertStorageKey)
        }
    }
    @Published var activeScreenplayElement: ScreenplayEditorElement = .action {
        didSet {
            UserDefaults.standard.set(activeScreenplayElement.rawValue, forKey: Self.activeElementStorageKey)
            persistActiveElementDebugMirror()
        }
    }
    @Published var autoInsertStatusText: String = ""
    @Published var assistantPin: ScreenplayAssistantPinState = .empty
    @Published var assistantPinHistory: [ScreenplayAssistantPinState] = []
    @Published var pendingInsertion: ScreenplayInsertionRequest?
    @Published var pendingLineJump: ScreenplayLineJumpRequest?
    @Published var pendingLineHighlight: ScreenplayLineHighlightRequest?
    @Published var pendingAnchoredTextRectRequest: ScreenplayAnchoredTextRectRequest?
    @Published var anchoredTextRectSnapshot: ScreenplayAnchoredTextRectSnapshot?
    @Published var pendingEditorFocus: ScreenplayEditorFocusRequest?
    @Published var pendingEditorAction: ScreenplayEditorActionRequest?
    @Published var pendingStudioAction: ScreenplayStudioActionRequest?
    @Published var pendingStudioActionPreview: ScreenplayStudioActionPreview?
    @Published var editorSelection: ScreenplayEditorSelectionSnapshot?
    @Published var lastCommittedWrite: ScreenplayCommittedWrite? {
        didSet {
            refreshIntelligenceReport()
        }
    }
    @Published var pendingReplacementTarget: ScreenplayPendingReplacementTarget?
    @Published var submittedReplacementTarget: ScreenplayPendingReplacementTarget?
    @Published var lastUpdatedAt: Date = .distantPast
    @Published var isStreamingDraftPreviewActive: Bool = false
    @Published var streamingProgress: Double = 0
    @Published var currentCursorLine: Int = 1
    @Published var intelligenceReport: ScreenplayIntelligenceReport = .empty
    @Published var companionAnalytics: ScreenplayCompanionAnalyticsSnapshot = .empty
    @Published var latestStudioUserPrompt: ScreenplayStudioUserPrompt? {
        didSet {
            persistStudioRoutingDebugMirror()
        }
    }

    private var lastIngestKey: String = ""
    private var streamingPreviewText: String = ""
    private var streamingPreviewBaseDraft: String = ""
    private var streamTask: Task<Void, Never>?
    private var syncedVoiceInsertTask: Task<Void, Never>?
    private let streamCharDelay: TimeInterval = 0.022
    private(set) var activeSyncedVoiceInsertPlan: ScreenplayVoiceInsertPlan?
    private var activeSyncedVoiceAppliedCueCount: Int = 0
    private var projectBindingContext: ProjectBindingContext?
    private var isHydratingBackendCompanionState = false
    private var companionBackendSyncTask: Task<Void, Never>?
    var onSyncedInsertLifecycleEvent: ((String, ScreenplayVoiceInsertPlan, Int) -> Void)?

#if DEBUG
    private let debugReplacementTraceStorageKey = "studio_debug_replacement_trace_json"
    private var debugActiveReplacementRequestID: String = ""
#endif

    private init() {
        self.autoInsertEnabled = UserDefaults.standard.object(forKey: Self.autoInsertStorageKey) as? Bool ?? true
        if let saved = UserDefaults.standard.string(forKey: Self.activeElementStorageKey),
           let element = ScreenplayEditorElement(rawValue: saved) {
            self.activeScreenplayElement = element
        }
        if let savedMode = UserDefaults.standard.string(forKey: Self.companionModeStorageKey),
           let mode = StudioCompanionMode(rawValue: savedMode) {
            self.companionMode = mode
        }
        self.structuredDraft = Self.restoreStructuredDraft()
        self.projectRecentTurns = Self.restoreConversationTurns(forKey: Self.projectRecentTurnsStorageKey)
        self.companionRecentTurns = Self.restoreConversationTurns(forKey: Self.companionRecentTurnsStorageKey)
        persistActiveElementDebugMirror()
        persistStudioRoutingDebugMirror()
        persistProjectBindingDebugMirror()
        refreshIntelligenceReport()
    }

    private func persistActiveElementDebugMirror() {
        UserDefaults.standard.set(activeScreenplayElement.rawValue, forKey: Self.debugActiveElementRawStorageKey)
        UserDefaults.standard.set(activeScreenplayElement.title, forKey: Self.debugActiveElementLabelStorageKey)
    }

    private static func restoreStructuredDraft() -> ScreenplayStructuredDraft {
        guard let stored = UserDefaults.standard.string(forKey: structuredDraftStorageKey),
              let data = stored.data(using: .utf8) else {
            return .empty
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(ScreenplayStructuredDraft.self, from: data)) ?? .empty
    }

    private static func restoreConversationTurns(forKey key: String) -> [ScreenplayConversationTurn] {
        guard let stored = UserDefaults.standard.string(forKey: key),
              let data = stored.data(using: .utf8) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode([ScreenplayConversationTurn].self, from: data)) ?? []
    }

    private func persistStructuredDraft() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(structuredDraft),
              let encoded = String(data: data, encoding: .utf8) else { return }
        UserDefaults.standard.set(encoded, forKey: Self.structuredDraftStorageKey)
    }

    private func persistConversationTurns(_ turns: [ScreenplayConversationTurn], key: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(turns),
              let encoded = String(data: data, encoding: .utf8) else { return }
        UserDefaults.standard.set(encoded, forKey: key)
    }

    private func persistStudioRoutingDebugMirror() {
        UserDefaults.standard.set(latestMemoryDomain.rawValue, forKey: Self.debugLastMemoryDomainStorageKey)
        UserDefaults.standard.set(latestStudioRouteTarget.rawValue, forKey: Self.debugLastPromptTargetStorageKey)
        UserDefaults.standard.set(latestStudioUserPrompt?.source.rawValue ?? "", forKey: Self.debugLastPromptSourceStorageKey)
    }

    private func persistProjectBindingDebugMirror() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(projectBinding),
              let encoded = String(data: data, encoding: .utf8) else {
            UserDefaults.standard.removeObject(forKey: Self.debugProjectBindingStorageKey)
            return
        }
        UserDefaults.standard.set(encoded, forKey: Self.debugProjectBindingStorageKey)
    }

    private func compactSceneLabel(_ label: String) -> String {
        let upper = label
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        guard !upper.isEmpty else { return "" }

        let prefixes = ["INT./EXT.", "EXT./INT.", "INT/EXT.", "EXT/INT.", "INT.", "EXT.", "I/E."]
        var core = upper
        if let prefix = prefixes.first(where: { upper.hasPrefix($0) }) {
            core = String(upper.dropFirst(prefix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let dashRange = core.range(of: " - ", options: .backwards) {
            core = String(core[..<dashRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return core.isEmpty ? upper : core
    }

    private func normalizedSceneHeading(_ raw: String) -> String {
        var heading = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s*-\s*"#, with: " - ", options: .regularExpression)
            .replacingOccurrences(of: #"^INT\s+"#, with: "INT. ", options: .regularExpression)
            .replacingOccurrences(of: #"^EXT\s+"#, with: "EXT. ", options: .regularExpression)
            .replacingOccurrences(of: #"^INT/EXT\s+"#, with: "INT./EXT. ", options: .regularExpression)
            .replacingOccurrences(of: #"^EXT/INT\s+"#, with: "EXT./INT. ", options: .regularExpression)

        guard !heading.isEmpty else { return "INT. NEW LOCATION - DAY" }
        if !ScreenplayEditorElement.looksLikeSceneHeadingStart(heading) {
            heading = "INT. " + heading
        }
        if !heading.contains(" - ") {
            heading += " - DAY"
        }
        return heading
    }

    private func normalizedCharacterCue(_ raw: String) -> String {
        raw
            .uppercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N} '\-]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func normalizedBindingToken(_ raw: String) -> String {
        raw
            .uppercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N}]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func compactBindingLabel(_ raw: String) -> String {
        normalizedBindingToken(compactSceneLabel(raw))
    }

    private func refreshProjectBindingSnapshot() {
        guard let context = projectBindingContext else {
            projectBinding = .empty
            return
        }

        let actTitlesByID = Dictionary(
            uniqueKeysWithValues: context.outline.acts.map { ($0.id, $0.title.trimmingCharacters(in: .whitespacesAndNewlines)) }
        )
        let beatLabelsByID = Dictionary(
            uniqueKeysWithValues: context.outline.beats.map { ($0.id, $0.label.trimmingCharacters(in: .whitespacesAndNewlines)) }
        )
        let outlineScenes = context.outline.scenes
        var usedOutlineSceneIDs = Set<String>()

        func matchScene(for draftScene: ScreenplayDraftSceneSnapshot) -> (scene: BackendScreenplayScene?, matchedBy: String) {
            let draftSlug = normalizedBindingToken(draftScene.slugline)
            let draftShort = normalizedBindingToken(draftScene.shortLabel)

            func exactSlug(_ outlineScene: BackendScreenplayScene) -> Bool {
                normalizedBindingToken(outlineScene.slugline ?? "") == draftSlug && !draftSlug.isEmpty
            }

            if let scene = outlineScenes.first(where: { !usedOutlineSceneIDs.contains($0.id) && exactSlug($0) }) {
                return (scene, "slugline")
            }
            if let scene = outlineScenes.first(where: { exactSlug($0) }) {
                return (scene, "slugline")
            }

            func exactShort(_ outlineScene: BackendScreenplayScene) -> Bool {
                let outlineSlug = compactBindingLabel(outlineScene.slugline ?? "")
                let outlineTitle = normalizedBindingToken(outlineScene.title)
                return (!draftShort.isEmpty && (outlineSlug == draftShort || outlineTitle == draftShort))
            }

            if let scene = outlineScenes.first(where: { !usedOutlineSceneIDs.contains($0.id) && exactShort($0) }) {
                return (scene, "short_label")
            }
            if let scene = outlineScenes.first(where: { exactShort($0) }) {
                return (scene, "short_label")
            }

            func looseMatch(_ outlineScene: BackendScreenplayScene) -> Bool {
                let outlineSlug = normalizedBindingToken(outlineScene.slugline ?? "")
                let outlineTitle = normalizedBindingToken(outlineScene.title)
                let candidates = [outlineSlug, outlineTitle].filter { !$0.isEmpty }
                guard !candidates.isEmpty else { return false }
                if !draftSlug.isEmpty, candidates.contains(where: { $0.contains(draftSlug) || draftSlug.contains($0) }) {
                    return true
                }
                if !draftShort.isEmpty, candidates.contains(where: { $0.contains(draftShort) || draftShort.contains($0) }) {
                    return true
                }
                return false
            }

            if let scene = outlineScenes.first(where: { !usedOutlineSceneIDs.contains($0.id) && looseMatch($0) }) {
                return (scene, "contains")
            }
            if let scene = outlineScenes.first(where: { looseMatch($0) }) {
                return (scene, "contains")
            }
            return (nil, "unbound")
        }

        let bindings = structuredDraft.scenes.map { draftScene -> ScreenplayProjectSceneBindingSnapshot in
            let matched = matchScene(for: draftScene)
            if let matchedScene = matched.scene {
                usedOutlineSceneIDs.insert(matchedScene.id)
                return ScreenplayProjectSceneBindingSnapshot(
                    id: "\(draftScene.id)|\(matchedScene.id)",
                    draftSceneID: draftScene.id,
                    draftLine: draftScene.line,
                    draftEndLine: draftScene.endLine,
                    draftSlugline: draftScene.slugline,
                    draftShortLabel: draftScene.shortLabel,
                    outlineSceneID: matchedScene.id,
                    outlineSceneTitle: matchedScene.title,
                    outlineSceneSlugline: matchedScene.slugline,
                    outlineSceneObjective: matchedScene.objective,
                    outlineSceneSummary: matchedScene.summary,
                    outlineBeatIDs: matchedScene.beatIds ?? [],
                    outlineBeatLabels: (matchedScene.beatIds ?? []).compactMap { beatID in
                        let label = beatLabelsByID[beatID]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                        return label.isEmpty ? nil : label
                    },
                    actTitle: actTitlesByID[matchedScene.actId ?? ""],
                    matchedBy: matched.matchedBy
                )
            }
            return ScreenplayProjectSceneBindingSnapshot(
                id: "\(draftScene.id)|unbound",
                draftSceneID: draftScene.id,
                draftLine: draftScene.line,
                draftEndLine: draftScene.endLine,
                draftSlugline: draftScene.slugline,
                draftShortLabel: draftScene.shortLabel,
                outlineSceneID: nil,
                outlineSceneTitle: nil,
                outlineSceneSlugline: nil,
                outlineSceneObjective: nil,
                outlineSceneSummary: nil,
                outlineBeatIDs: [],
                outlineBeatLabels: [],
                actTitle: nil,
                matchedBy: matched.matchedBy
            )
        }

        let projectCharacterSet = Set(context.projectCharacters.map(normalizedCharacterCue))
        let draftCharacterSet = Set(structuredDraft.characters.map(normalizedCharacterCue))
        let boundCharacterCount = draftCharacterSet.intersection(projectCharacterSet).count

        projectBinding = ScreenplayProjectBindingSnapshot(
            updatedAt: Date(),
            projectID: context.projectID,
            projectTitle: context.projectTitle,
            versionID: context.versionID,
            phase: context.phase,
            draftSceneCount: structuredDraft.scenes.count,
            outlineSceneCount: context.outline.scenes.count,
            boundSceneCount: bindings.filter(\.isBound).count,
            draftCharacterCount: structuredDraft.characters.count,
            projectCharacterCount: context.projectCharacters.count,
            boundCharacterCount: boundCharacterCount,
            sceneBindings: bindings
        )
    }

    func syncStructuredDraftSnapshot(
        text: String,
        elements explicitElements: [ScreenplayEditorElement?]? = nil
    ) {
        let resolvedElements = explicitElements ?? bootstrapScreenplayParagraphElements(for: text)
        let lines = screenplayLineTexts(text)
        let lineCount = lines.count
        var paragraphs: [ScreenplayDraftParagraphSnapshot] = []
        paragraphs.reserveCapacity(lineCount)

        struct MutableScene {
            var line: Int
            var slugline: String
            var characterCues: Set<String> = []
            var dialogueLineCount: Int = 0
        }

        var scenes: [MutableScene] = []
        var discoveredCharacters: Set<String> = []

        for (index, line) in lines.enumerated() {
            let element = index < resolvedElements.count ? resolvedElements[index] : nil
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            let lineNumber = index + 1
            paragraphs.append(
                ScreenplayDraftParagraphSnapshot(
                    id: "line-\(lineNumber)",
                    line: lineNumber,
                    element: element,
                    text: trimmed
                )
            )

            guard !trimmed.isEmpty, let element else { continue }
            switch element {
            case .sceneHeading:
                scenes.append(MutableScene(line: lineNumber, slugline: trimmed.uppercased()))
            case .character:
                let cue = trimmed.uppercased()
                discoveredCharacters.insert(cue)
                guard !scenes.isEmpty else { continue }
                scenes[scenes.count - 1].characterCues.insert(cue)
            case .dialogue:
                guard !scenes.isEmpty else { continue }
                scenes[scenes.count - 1].dialogueLineCount += 1
            case .action, .parenthetical, .transition:
                break
            }
        }

        let sceneSnapshots = scenes.enumerated().map { index, scene in
            let endLine = index + 1 < scenes.count ? max(scene.line, scenes[index + 1].line - 1) : max(scene.line, lineCount)
            return ScreenplayDraftSceneSnapshot(
                id: "scene-\(scene.line)-\(scene.slugline)",
                line: scene.line,
                endLine: endLine,
                slugline: scene.slugline,
                shortLabel: compactSceneLabel(scene.slugline),
                characterCues: scene.characterCues.sorted(),
                dialogueLineCount: scene.dialogueLineCount
            )
        }

        structuredDraft = ScreenplayStructuredDraft(
            updatedAt: Date(),
            lineCount: lineCount,
            sceneCount: sceneSnapshots.count,
            paragraphs: paragraphs,
            scenes: sceneSnapshots,
            characters: discoveredCharacters.sorted()
        )
        refreshProjectBindingSnapshot()
    }

    func recordStudioConversationTurn(
        user: String,
        assistant: String,
        memoryDomain: StudioMemoryDomain,
        source: ScreenplayCompanionTurnSource = .voice
    ) {
        let cleanUser = user.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAssistant = assistant.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUser.isEmpty, !cleanAssistant.isEmpty else { return }

        let turn = ScreenplayConversationTurn(
            id: UUID(),
            user: String(cleanUser.prefix(320)),
            assistant: String(cleanAssistant.prefix(320)),
            memoryDomain: memoryDomain,
            recordedAt: Date()
        )

        latestMemoryDomain = memoryDomain

        switch memoryDomain {
        case .project:
            projectRecentTurns.append(turn)
            if projectRecentTurns.count > 6 {
                projectRecentTurns.removeFirst(projectRecentTurns.count - 6)
            }
        case .companion:
            companionRecentTurns.append(turn)
            if companionRecentTurns.count > 6 {
                companionRecentTurns.removeFirst(companionRecentTurns.count - 6)
            }
            recordCompanionInteraction(surface: .studio, source: source)
        case .mixed:
            projectRecentTurns.append(turn)
            companionRecentTurns.append(turn)
            if projectRecentTurns.count > 6 {
                projectRecentTurns.removeFirst(projectRecentTurns.count - 6)
            }
            if companionRecentTurns.count > 6 {
                companionRecentTurns.removeFirst(companionRecentTurns.count - 6)
            }
            recordCompanionInteraction(surface: .studio, source: source)
        }
    }

    func recordCompanionHomeTurn(user: String, assistant: String) {
        let cleanUser = user.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanAssistant = assistant.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanUser.isEmpty, !cleanAssistant.isEmpty else { return }
        let turn = ScreenplayConversationTurn(
            id: UUID(),
            user: String(cleanUser.prefix(320)),
            assistant: String(cleanAssistant.prefix(320)),
            memoryDomain: .companion,
            recordedAt: Date()
        )
        companionRecentTurns.append(turn)
        if companionRecentTurns.count > 6 {
            companionRecentTurns.removeFirst(companionRecentTurns.count - 6)
        }
        latestMemoryDomain = .companion
        recordCompanionInteraction(surface: .home, source: .voice)
    }

    func recentTurnPairs(for memoryDomain: StudioMemoryDomain) -> [(user: String, assistant: String)] {
        let source: [ScreenplayConversationTurn]
        switch memoryDomain {
        case .project:
            source = projectRecentTurns
        case .companion:
            source = companionRecentTurns
        case .mixed:
            source = !projectRecentTurns.isEmpty ? projectRecentTurns : companionRecentTurns
        }
        return source.suffix(3).map { ($0.user, $0.assistant) }
    }

    func hydrateBackendCompanionState(force: Bool = false) async {
        if isHydratingBackendCompanionState && !force { return }
        isHydratingBackendCompanionState = true
        defer { isHydratingBackendCompanionState = false }
        do {
            let result = try await BackendMemoryAPI.shared.fetchScreenplayCompanionState()
            if let mode = StudioCompanionMode(rawValue: result.payload.modeRaw.trimmingCharacters(in: .whitespacesAndNewlines)) {
                companionMode = mode
            }
            companionRecentTurns = Array(result.payload.recentTurns.suffix(6))
            companionAnalytics = result.payload.analytics
        } catch {
            // Keep local state as fallback when the backend companion lane is unavailable.
        }
    }

    private func recordCompanionInteraction(
        surface: ScreenplayCompanionSurface,
        source: ScreenplayCompanionTurnSource
    ) {
        companionAnalytics = ScreenplayCompanionAnalyticsSnapshot(
            updatedAt: Date(),
            totalTurns: companionAnalytics.totalTurns + 1,
            homeTurns: companionAnalytics.homeTurns + (surface == .home ? 1 : 0),
            studioTurns: companionAnalytics.studioTurns + (surface == .studio ? 1 : 0),
            voiceTurns: companionAnalytics.voiceTurns + (source == .voice ? 1 : 0),
            typedTurns: companionAnalytics.typedTurns + (source == .typed ? 1 : 0),
            modeSwitches: companionAnalytics.modeSwitches,
            memoryClears: companionAnalytics.memoryClears,
            threadClears: companionAnalytics.threadClears,
            lastSurfaceRaw: surface.rawValue,
            lastSourceRaw: source.rawValue
        )
        schedulePersistBackendCompanionState()
    }

    private func schedulePersistBackendCompanionState() {
        guard !isHydratingBackendCompanionState else { return }
        companionBackendSyncTask?.cancel()
        let mode = companionMode
        let recentTurns = Array(companionRecentTurns.suffix(6))
        let analytics = companionAnalytics
        companionBackendSyncTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            _ = try? await BackendMemoryAPI.shared.updateScreenplayCompanionState(
                mode: mode,
                recentTurns: recentTurns,
                analytics: analytics
            )
        }
    }

    func ingestVoiceTurn(
        _ rawText: String,
        pack: String,
        phase: String,
        projectId: String,
        versionId: String,
        userTranscript: String = "",
        forceInsert: Bool = false
    ) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let normalizedPack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedProject = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVersion = versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = [text, normalizedPack, normalizedPhase, normalizedProject, normalizedVersion].joined(separator: "|")

        if key == lastIngestKey {
            return
        }

        cancelStream()
        lastIngestKey = key
        latestVoiceTurn = text
        latestPack = normalizedPack
        latestPhase = normalizedPhase
        latestUserTranscript = userTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        preferredProjectID = normalizedProject
        preferredVersionID = normalizedVersion
        lastUpdatedAt = Date()

        if autoInsertEnabled || forceInsert {
            // Typed Studio page writes should always land on the draft even when
            // the voice-only auto-insert preference is disabled.
            // Always insert at cursor — regardless of whether the draft is empty.
            // Previously this bailed under certain conditions, causing voice
            // turns after the first one to be dropped.
            streamInsert(text)
        } else {
            autoInsertStatusText = ""
        }
    }

    func insertLatestAtCursor() {
        let text = latestVoiceTurn.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        cancelStream()
        pendingInsertion = ScreenplayInsertionRequest(text: text, mode: .insert)
        autoInsertStatusText = ""
    }

    var previewFormattingBaseDraft: String {
        isStreamingDraftPreviewActive ? streamingPreviewBaseDraft : draftText
    }

    func previewVoiceTurn(
        _ rawText: String,
        pack: String,
        phase: String,
        projectId: String,
        versionId: String
    ) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        cancelStream()

        if !isStreamingDraftPreviewActive {
            streamingPreviewBaseDraft = draftText
        }

        let normalizedPack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedProject = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVersion = versionId.trimmingCharacters(in: .whitespacesAndNewlines)

        latestVoiceTurn = text
        latestPack = normalizedPack
        latestPhase = normalizedPhase
        preferredProjectID = normalizedProject
        preferredVersionID = normalizedVersion
        lastUpdatedAt = Date()
        isStreamingDraftPreviewActive = true

        guard streamingPreviewText != text else { return }
        streamingPreviewText = text
        pendingInsertion = ScreenplayInsertionRequest(text: text, mode: .streamPreview)
        autoInsertStatusText = "Clementine is writing..."
    }

    func commitStreamingVoiceTurn(
        _ rawText: String,
        pack: String,
        phase: String,
        projectId: String,
        versionId: String,
        userTranscript: String = "",
        forceInsert: Bool = false
    ) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            cancelStreamingVoiceTurnPreview()
            return
        }

        let normalizedPack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedProject = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVersion = versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = [text, normalizedPack, normalizedPhase, normalizedProject, normalizedVersion].joined(separator: "|")

        if key != lastIngestKey {
            lastIngestKey = key
        }
        cancelStream()
        latestVoiceTurn = text
        latestPack = normalizedPack
        latestPhase = normalizedPhase
        latestUserTranscript = userTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        preferredProjectID = normalizedProject
        preferredVersionID = normalizedVersion
        lastUpdatedAt = Date()
        streamingPreviewText = text

        if autoInsertEnabled || forceInsert {
            pendingInsertion = ScreenplayInsertionRequest(text: text, mode: .streamCommit)
            autoInsertStatusText = ""
        } else {
            autoInsertStatusText = ""
        }

        isStreamingDraftPreviewActive = false
        streamingPreviewBaseDraft = ""
    }

    func cancelStreamingVoiceTurnPreview() {
        cancelStream()
        guard isStreamingDraftPreviewActive else { return }
        isStreamingDraftPreviewActive = false
        streamingPreviewText = ""
        streamingPreviewBaseDraft = ""
        pendingInsertion = ScreenplayInsertionRequest(text: "", mode: .streamCancel)
        autoInsertStatusText = ""
    }

    func streamInsert(_ text: String) {
        _ = cancelActiveSyncedVoiceInsert(notifyCancellation: false)
        streamTask?.cancel()
        streamTask = nil
        streamingProgress = 0

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            autoInsertStatusText = ""
            return
        }

        if trimmed.count < 40 {
            pendingInsertion = ScreenplayInsertionRequest(text: trimmed, mode: .insert)
            autoInsertStatusText = ""
            return
        }

        let lines = trimmed.components(separatedBy: "\n")
        let totalChars = max(1, trimmed.count)
        autoInsertStatusText = "Clementine is writing..."

        streamTask = Task { @MainActor in
            var streamedText = ""

            for (lineIndex, line) in lines.enumerated() {
                guard !Task.isCancelled else { return }

                if streamedText.isEmpty {
                    streamedText = line
                } else {
                    streamedText += "\n" + line
                }

                let isLast = lineIndex == lines.count - 1
                let mode: ScreenplayInsertionRequest.Mode = isLast ? .streamInsertFinalize : .streamInsertProgress
                pendingInsertion = ScreenplayInsertionRequest(text: streamedText, mode: mode)
                streamingProgress = min(Double(streamedText.count) / Double(totalChars), 1.0)

                guard !isLast else {
                    await Task.yield()
                    streamTask = nil
                    streamingProgress = 0
                    autoInsertStatusText = ""
                    return
                }

                let delay = min(max(TimeInterval(line.count) * streamCharDelay, 0.06), 0.35)
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }

            streamTask = nil
            streamingProgress = 0
            autoInsertStatusText = ""
        }
    }

    @discardableResult
    func streamInsertSynced(
        _ text: String,
        audioDuration: TimeInterval,
        cues: [ScreenplayVoiceCue],
        requestID: String,
        timingSource: String,
        playbackTimeProvider: @escaping @MainActor @Sendable () -> TimeInterval?
    ) -> ScreenplayVoiceInsertPlan? {
        cancelStream()

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            autoInsertStatusText = ""
            return nil
        }

        let durationMs = max(Int((audioDuration * 1_000.0).rounded()), 1)
        let normalizedCues = normalizedVoiceCues(
            cues,
            for: trimmed,
            audioDurationMs: durationMs
        )
        guard !normalizedCues.isEmpty else {
            pendingInsertion = ScreenplayInsertionRequest(text: trimmed, mode: .insert)
            autoInsertStatusText = ""
            return nil
        }

        let resolvedRequestID = requestID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? UUID().uuidString
            : requestID.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedTimingSource = timingSource.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? (cues.isEmpty ? "estimated" : "backend_cues")
            : timingSource.trimmingCharacters(in: .whitespacesAndNewlines)

        let plan = ScreenplayVoiceInsertPlan(
            fullText: trimmed,
            cues: normalizedCues,
            audioDurationMs: durationMs,
            requestID: resolvedRequestID,
            timingSource: resolvedTimingSource
        )
        activeSyncedVoiceInsertPlan = plan
        activeSyncedVoiceAppliedCueCount = 0
        autoInsertStatusText = "Clementine is writing..."
        streamingProgress = 0
        onSyncedInsertLifecycleEvent?("started", plan, 0)

        syncedVoiceInsertTask = Task { @MainActor in
            while !Task.isCancelled {
                let playbackTimeMs = max(Int(((playbackTimeProvider() ?? 0) * 1_000.0).rounded()), 0)
                advanceSyncedVoiceInsert(playbackTimeMs: playbackTimeMs)

                if activeSyncedVoiceInsertPlan == nil {
                    return
                }
                if activeSyncedVoiceAppliedCueCount >= plan.cues.count {
                    completeActiveSyncedVoiceInsertIfNeeded()
                    return
                }

                try? await Task.sleep(nanoseconds: 16_000_000)
            }
        }

        return plan
    }

    func completeActiveSyncedVoiceInsertIfNeeded() {
        guard let plan = activeSyncedVoiceInsertPlan else { return }
        syncedVoiceInsertTask?.cancel()
        syncedVoiceInsertTask = nil
        activeSyncedVoiceAppliedCueCount = plan.cues.count
        pendingInsertion = ScreenplayInsertionRequest(text: plan.fullText, mode: .streamInsertFinalize)
        streamingProgress = 1.0
        autoInsertStatusText = ""
        onSyncedInsertLifecycleEvent?("finished", plan, plan.cues.count)
        activeSyncedVoiceInsertPlan = nil
    }

    func cancelStream() {
        let wasStreaming = streamTask != nil || streamingProgress > 0
        streamTask?.cancel()
        streamTask = nil
        let cancelledSynced = cancelActiveSyncedVoiceInsert(notifyCancellation: true)
        streamingProgress = 0
        if wasStreaming || cancelledSynced {
            pendingInsertion = ScreenplayInsertionRequest(text: "", mode: .streamInsertCancel)
        }
        if autoInsertStatusText == "Clementine is writing..." {
            autoInsertStatusText = ""
        }
    }

    func jumpToLine(_ line: Int) {
        let safeLine = max(1, line)
        currentCursorLine = safeLine
        pendingLineJump = ScreenplayLineJumpRequest(id: UUID(), line: safeLine)
    }

    func highlightLineRange(startLine: Int, endLine: Int? = nil) {
        let safeStart = max(1, startLine)
        let safeEnd = max(safeStart, endLine ?? safeStart)
        pendingLineHighlight = ScreenplayLineHighlightRequest(
            id: UUID(),
            startLine: safeStart,
            endLine: safeEnd
        )
    }

    func anchorTextRect(startLine: Int, endLine: Int? = nil) {
        let safeStart = max(1, startLine)
        let safeEnd = max(safeStart, endLine ?? safeStart)
        pendingAnchoredTextRectRequest = ScreenplayAnchoredTextRectRequest(
            id: UUID(),
            startLine: safeStart,
            endLine: safeEnd
        )
    }

    func clearAnchoredTextRect() {
        pendingAnchoredTextRectRequest = nil
        anchoredTextRectSnapshot = nil
    }

    func requestEditorFocus() {
        pendingEditorFocus = ScreenplayEditorFocusRequest(id: UUID())
    }

    private func advanceSyncedVoiceInsert(playbackTimeMs: Int) {
        guard let plan = activeSyncedVoiceInsertPlan else { return }

        let cuesToApply = plan.cues.prefix { cue in
            playbackTimeMs >= max(cue.startMs, 0)
        }.count

        guard cuesToApply > activeSyncedVoiceAppliedCueCount else {
            return
        }

        activeSyncedVoiceAppliedCueCount = min(cuesToApply, plan.cues.count)
        let visibleText = visibleVoiceInsertText(for: plan, appliedCueCount: activeSyncedVoiceAppliedCueCount)
        let isFinal = activeSyncedVoiceAppliedCueCount >= plan.cues.count
        pendingInsertion = ScreenplayInsertionRequest(
            text: visibleText,
            mode: isFinal ? .streamInsertFinalize : .streamInsertProgress
        )
        streamingProgress = min(
            max(Double(activeSyncedVoiceAppliedCueCount) / Double(max(plan.cues.count, 1)), 0),
            1
        )
        onSyncedInsertLifecycleEvent?("cue_applied", plan, activeSyncedVoiceAppliedCueCount)

        if isFinal {
            completeActiveSyncedVoiceInsertIfNeeded()
        }
    }

    private func cancelActiveSyncedVoiceInsert(notifyCancellation: Bool) -> Bool {
        guard let plan = activeSyncedVoiceInsertPlan else { return false }
        syncedVoiceInsertTask?.cancel()
        syncedVoiceInsertTask = nil
        if notifyCancellation {
            onSyncedInsertLifecycleEvent?("cancelled", plan, activeSyncedVoiceAppliedCueCount)
        }
        activeSyncedVoiceInsertPlan = nil
        activeSyncedVoiceAppliedCueCount = 0
        return true
    }

    private func normalizedVoiceCues(
        _ cues: [ScreenplayVoiceCue],
        for text: String,
        audioDurationMs: Int
    ) -> [ScreenplayVoiceCue] {
        let trimmedProvided = cues.map { cue in
            ScreenplayVoiceCue(
                index: cue.index,
                text: cue.text.trimmingCharacters(in: .whitespacesAndNewlines),
                elementRaw: cue.elementRaw.trimmingCharacters(in: .whitespacesAndNewlines),
                startMs: cue.startMs,
                endMs: cue.endMs
            )
        }.filter { !$0.text.isEmpty }

        if !trimmedProvided.isEmpty {
            return trimmedProvided.enumerated().map { offset, cue in
                ScreenplayVoiceCue(
                    index: offset,
                    text: cue.text,
                    elementRaw: cue.elementRaw,
                    startMs: max(cue.startMs, 0),
                    endMs: max(cue.endMs, cue.startMs)
                )
            }
        }

        let lines = text
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !lines.isEmpty else { return [] }

        let inferredElements = ScreenplayEditorElement.inferredSequence(for: text)
        let nonEmptyElements = inferredElements.compactMap { $0 }
        let segmentDuration = max(audioDurationMs / max(lines.count, 1), 1)

        return lines.enumerated().map { offset, line in
            let startMs = offset * segmentDuration
            let endMs = offset == lines.count - 1
                ? audioDurationMs
                : min(audioDurationMs, startMs + segmentDuration)
            let elementRaw = (offset < nonEmptyElements.count ? nonEmptyElements[offset].rawValue : ScreenplayEditorElement.action.rawValue)
            return ScreenplayVoiceCue(
                index: offset,
                text: line,
                elementRaw: elementRaw,
                startMs: startMs,
                endMs: max(endMs, startMs + 1)
            )
        }
    }

    private func visibleVoiceInsertText(
        for plan: ScreenplayVoiceInsertPlan,
        appliedCueCount: Int
    ) -> String {
        guard appliedCueCount > 0 else { return "" }
        guard appliedCueCount < plan.cues.count else { return plan.fullText }

        var searchStart = plan.fullText.startIndex
        var endIndex = plan.fullText.startIndex

        for cue in plan.cues.prefix(appliedCueCount) {
            guard let range = plan.fullText.range(of: cue.text, range: searchStart..<plan.fullText.endIndex) else {
                return plan.cues
                    .prefix(appliedCueCount)
                    .map(\.text)
                    .joined(separator: "\n")
            }
            endIndex = range.upperBound
            searchStart = range.upperBound
        }

        return String(plan.fullText[..<endIndex]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func requestEditorAction(_ action: ScreenplayEditorActionRequest.Action) {
        pendingEditorAction = ScreenplayEditorActionRequest(id: UUID(), action: action)
    }

    func requestStudioAction(
        _ action: ScreenplayStudioActionRequest.Action,
        intValue: Int? = nil,
        secondaryIntValue: Int? = nil,
        stringValue: String? = nil,
        secondaryStringValue: String? = nil
    ) {
        pendingStudioAction = ScreenplayStudioActionRequest(
            action: action,
            intValue: intValue,
            secondaryIntValue: secondaryIntValue,
            stringValue: stringValue,
            secondaryStringValue: secondaryStringValue
        )
    }

    func previewStudioAction(
        _ action: ScreenplayStudioActionRequest.Action,
        title: String,
        beforeLines: [String],
        afterLines: [String],
        warning: String? = nil,
        intValue: Int? = nil,
        secondaryIntValue: Int? = nil,
        stringValue: String? = nil,
        secondaryStringValue: String? = nil
    ) {
        pendingStudioActionPreview = ScreenplayStudioActionPreview(
            actionRequest: ScreenplayStudioActionRequest(
                action: action,
                intValue: intValue,
                secondaryIntValue: secondaryIntValue,
                stringValue: stringValue,
                secondaryStringValue: secondaryStringValue
            ),
            title: title,
            beforeLines: beforeLines,
            afterLines: afterLines,
            warning: warning
        )
    }

    @discardableResult
    func confirmPendingStudioActionPreview() -> ScreenplayStudioActionPreview? {
        guard let preview = pendingStudioActionPreview else { return nil }
        pendingStudioAction = preview.actionRequest
        pendingStudioActionPreview = nil
        return preview
    }

    @discardableResult
    func cancelPendingStudioActionPreview() -> ScreenplayStudioActionPreview? {
        let preview = pendingStudioActionPreview
        pendingStudioActionPreview = nil
        return preview
    }

    func updateEditorSelectionSnapshot(_ snapshot: ScreenplayEditorSelectionSnapshot?) {
        let normalizedSnapshot: ScreenplayEditorSelectionSnapshot?
        if let snapshot, snapshot.hasSelection {
            normalizedSnapshot = snapshot
        } else {
            normalizedSnapshot = nil
        }
        if editorSelection != normalizedSnapshot {
            editorSelection = normalizedSnapshot
        }
    }

    func setActiveScreenplayElement(_ element: ScreenplayEditorElement) {
        activeScreenplayElement = element
    }

    func setCompanionMode(_ mode: StudioCompanionMode) {
        if companionMode != mode {
            companionAnalytics = ScreenplayCompanionAnalyticsSnapshot(
                updatedAt: Date(),
                totalTurns: companionAnalytics.totalTurns,
                homeTurns: companionAnalytics.homeTurns,
                studioTurns: companionAnalytics.studioTurns,
                voiceTurns: companionAnalytics.voiceTurns,
                typedTurns: companionAnalytics.typedTurns,
                modeSwitches: companionAnalytics.modeSwitches + 1,
                memoryClears: companionAnalytics.memoryClears,
                threadClears: companionAnalytics.threadClears,
                lastSurfaceRaw: companionAnalytics.lastSurfaceRaw,
                lastSourceRaw: companionAnalytics.lastSourceRaw
            )
        }
        companionMode = mode
        schedulePersistBackendCompanionState()
    }

    func clearCompanionMemory() {
        companionRecentTurns = []
        companionAnalytics = ScreenplayCompanionAnalyticsSnapshot(
            updatedAt: Date(),
            totalTurns: companionAnalytics.totalTurns,
            homeTurns: companionAnalytics.homeTurns,
            studioTurns: companionAnalytics.studioTurns,
            voiceTurns: companionAnalytics.voiceTurns,
            typedTurns: companionAnalytics.typedTurns,
            modeSwitches: companionAnalytics.modeSwitches,
            memoryClears: companionAnalytics.memoryClears + 1,
            threadClears: companionAnalytics.threadClears,
            lastSurfaceRaw: companionAnalytics.lastSurfaceRaw,
            lastSourceRaw: companionAnalytics.lastSourceRaw
        )
        schedulePersistBackendCompanionState()
    }

    func clearCompanionPinHistory() {
        assistantPinHistory = []
        if latestMemoryDomain != .project {
            assistantPin = .empty
        }
        companionAnalytics = ScreenplayCompanionAnalyticsSnapshot(
            updatedAt: Date(),
            totalTurns: companionAnalytics.totalTurns,
            homeTurns: companionAnalytics.homeTurns,
            studioTurns: companionAnalytics.studioTurns,
            voiceTurns: companionAnalytics.voiceTurns,
            typedTurns: companionAnalytics.typedTurns,
            modeSwitches: companionAnalytics.modeSwitches,
            memoryClears: companionAnalytics.memoryClears,
            threadClears: companionAnalytics.threadClears + 1,
            lastSurfaceRaw: companionAnalytics.lastSurfaceRaw,
            lastSourceRaw: companionAnalytics.lastSourceRaw
        )
        schedulePersistBackendCompanionState()
    }

    func cycleActiveScreenplayElement(backward: Bool = false) {
        activeScreenplayElement = backward
            ? activeScreenplayElement.screenplayTabBackward
            : activeScreenplayElement.screenplayTabForward
    }

    func currentSceneLabel(atOrBeforeLine line: Int) -> String? {
        sceneSnapshot(atOrBeforeLine: line)?.shortLabel
    }

    func currentSceneSnapshot() -> ScreenplayDraftSceneSnapshot? {
        sceneSnapshot(atOrBeforeLine: currentCursorLine)
    }

    func sceneSnapshotForOrdinal(_ ordinal: Int) -> ScreenplayDraftSceneSnapshot? {
        sceneSnapshot(forOrdinal: ordinal)
    }

    func sceneSnapshotMatching(_ query: String) -> ScreenplayDraftSceneSnapshot? {
        sceneSnapshot(matching: query)
    }

    func sceneSnapshotMatches(_ query: String) -> [ScreenplayDraftSceneSnapshot] {
        sceneSnapshots(matching: query)
    }

    func nextSceneSnapshot(after scene: ScreenplayDraftSceneSnapshot) -> ScreenplayDraftSceneSnapshot? {
        guard let index = structuredDraft.scenes.firstIndex(where: { $0.id == scene.id }) else { return nil }
        let nextIndex = structuredDraft.scenes.index(after: index)
        guard nextIndex < structuredDraft.scenes.endIndex else { return nil }
        return structuredDraft.scenes[nextIndex]
    }

    func selectedEditorSnapshot() -> ScreenplayEditorSelectionSnapshot? {
        selectedBlockSnapshot()
    }

    func currentParagraphSnapshot() -> ScreenplayDraftParagraphSnapshot? {
        structuredDraft.paragraphs.first(where: { $0.line == currentCursorLine })
    }

    func projectBindingSnapshot(forDraftSceneID draftSceneID: String) -> ScreenplayProjectSceneBindingSnapshot? {
        projectBinding.sceneBindings.first(where: { $0.draftSceneID == draftSceneID })
    }

    func prepareNextPageWriteReplacement(
        sourceWriteID: String = "",
        startLine: Int,
        endLine: Int? = nil,
        currentText: String
    ) {
        let cleanText = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty else {
#if DEBUG
            debugActiveReplacementRequestID = ""
#endif
            pendingReplacementTarget = nil
            debugTraceReplacementTarget(
                kind: "prepare-empty-clear",
                target: nil,
                detail: "Ignored empty replacement target."
            )
            return
        }
        let safeStart = max(1, startLine)
        let safeEnd = max(safeStart, endLine ?? safeStart)
#if DEBUG
        debugActiveReplacementRequestID = ""
#endif
        pendingReplacementTarget = ScreenplayPendingReplacementTarget(
            id: UUID(),
            sourceWriteID: sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            startLine: safeStart,
            endLine: safeEnd,
            currentText: cleanText
        )
        debugTraceReplacementTarget(
            kind: "prepare",
            target: pendingReplacementTarget,
            detail: "Prepared next page write replacement."
        )
    }

    func clearPendingPageWriteReplacement() {
        debugTraceReplacementTarget(
            kind: "clear",
            target: pendingReplacementTarget ?? submittedReplacementTarget,
            detail: "Cleared replacement target."
        )
        pendingReplacementTarget = nil
        submittedReplacementTarget = nil
#if DEBUG
        debugActiveReplacementRequestID = ""
#endif
    }

    func capturePendingPageWriteReplacementForSubmission(requestID: String? = nil) {
#if DEBUG
        debugActiveReplacementRequestID = requestID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
#endif
        submittedReplacementTarget = pendingReplacementTarget
        debugTraceReplacementTarget(
            kind: "capture-submit",
            target: submittedReplacementTarget,
            detail: submittedReplacementTarget == nil
                ? "No replacement target was available at submit."
                : "Captured replacement target for submit."
        )
    }

    func clearDraft() {
        cancelStream()
        draftText = ""
        isStreamingDraftPreviewActive = false
        streamingPreviewText = ""
        streamingPreviewBaseDraft = ""
        latestUserTranscript = ""
        lastCommittedWrite = nil
        debugTraceReplacementTarget(
            kind: "clear-draft",
            target: pendingReplacementTarget ?? submittedReplacementTarget,
            detail: "Cleared draft and replacement targets."
        )
        pendingReplacementTarget = nil
        submittedReplacementTarget = nil
#if DEBUG
        debugActiveReplacementRequestID = ""
#endif
        refreshProjectBindingSnapshot()
    }

    func debugReplacementTraceEvents() -> [ScreenplayReplacementTraceEvent] {
#if DEBUG
        let raw = UserDefaults.standard.string(forKey: debugReplacementTraceStorageKey) ?? ""
        guard !raw.isEmpty,
              let data = raw.data(using: .utf8) else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let events = try? decoder.decode([ScreenplayReplacementTraceEvent].self, from: data) else {
            return []
        }
        return events
#else
        return []
#endif
    }

    func debugTraceReplacementTarget(
        kind: String,
        target: ScreenplayPendingReplacementTarget?,
        detail: String,
        requestID: String? = nil
    ) {
#if DEBUG
        let resolvedRequestID = (requestID ?? debugActiveReplacementRequestID)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let event = ScreenplayReplacementTraceEvent(
            kind: kind,
            requestID: resolvedRequestID,
            sourceWriteID: target?.sourceWriteID ?? "",
            startLine: target?.startLine,
            endLine: target?.endLine,
            preview: Self.debugReplacementPreview(target?.currentText ?? ""),
            detail: detail,
            timestamp: Date()
        )
        var events = debugReplacementTraceEvents()
        events.insert(event, at: 0)
        if events.count > 24 {
            events = Array(events.prefix(24))
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(events),
              let encoded = String(data: data, encoding: .utf8) else { return }
        UserDefaults.standard.set(encoded, forKey: debugReplacementTraceStorageKey)
#endif
    }

    private static func debugReplacementPreview(_ text: String) -> String {
        String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(220))
    }

    func clearLastCommittedWrite() {
        lastCommittedWrite = nil
    }

    func bindStructuredDraftToProject(
        projectID: String,
        projectTitle: String,
        versionID: String,
        phase: String,
        outline: BackendScreenplayOutline,
        projectCharacters: [String]
    ) {
        let normalizedProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVersionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedTitle = projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedPhase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedCharacters = projectCharacters
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        if normalizedProjectID.isEmpty,
           normalizedVersionID.isEmpty,
           normalizedTitle.isEmpty,
           outline.scenes.isEmpty,
           normalizedCharacters.isEmpty {
            projectBindingContext = nil
            projectBinding = .empty
            return
        }

        projectBindingContext = ProjectBindingContext(
            projectID: normalizedProjectID,
            projectTitle: normalizedTitle,
            versionID: normalizedVersionID,
            phase: normalizedPhase,
            outline: outline,
            projectCharacters: normalizedCharacters
        )
        refreshProjectBindingSnapshot()
    }

    func recordStudioUserPrompt(
        _ rawText: String,
        requestID: String? = nil,
        source: ScreenplayStudioUserPrompt.Source = .voice,
        target: ScreenplayStudioUserPrompt.Target,
        memoryDomain: StudioMemoryDomain = .project
    ) {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        latestMemoryDomain = memoryDomain
        latestStudioUserPrompt = ScreenplayStudioUserPrompt(
            id: UUID(),
            text: text,
            requestID: requestID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? requestID?.trimmingCharacters(in: .whitespacesAndNewlines)
                : nil,
            source: source,
            target: target,
            memoryDomain: memoryDomain.promptMemoryDomain,
            recordedAt: Date()
        )
    }

    private func sceneSnapshot(atOrBeforeLine line: Int) -> ScreenplayDraftSceneSnapshot? {
        let target = max(1, line)
        return structuredDraft.scenes.last(where: { $0.line <= target })
    }

    private func sceneSnapshot(forOrdinal ordinal: Int) -> ScreenplayDraftSceneSnapshot? {
        guard ordinal > 0, ordinal <= structuredDraft.scenes.count else { return nil }
        return structuredDraft.scenes[ordinal - 1]
    }

    private func sceneSnapshot(matching query: String) -> ScreenplayDraftSceneSnapshot? {
        sceneSnapshots(matching: query).first
    }

    private func sceneSnapshots(matching query: String) -> [ScreenplayDraftSceneSnapshot] {
        let normalizedQuery = query
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N}]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedQuery.isEmpty else { return [] }

        let exactMatches = structuredDraft.scenes.filter {
            $0.slugline
                .replacingOccurrences(of: #"[^\p{L}\p{N}]+"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased() == normalizedQuery
        }
        if !exactMatches.isEmpty {
            return exactMatches
        }

        return structuredDraft.scenes.filter {
            let candidate = $0.slugline
                .replacingOccurrences(of: #"[^\p{L}\p{N}]+"#, with: " ", options: .regularExpression)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .uppercased()
            return candidate.contains(normalizedQuery)
        }
    }

    private func currentBeatCandidates() -> [(beat: BackendScreenplayBeat, sceneID: String, score: Int)] {
        guard let context = projectBindingContext,
              let currentScene = currentSceneSnapshot(),
              let binding = projectBindingSnapshot(forDraftSceneID: currentScene.id) else {
            return []
        }
        let candidateIDs = Set(binding.outlineBeatIDs)
        let candidateBeats = context.outline.beats.filter { candidateIDs.contains($0.id) }
        guard !candidateBeats.isEmpty else { return [] }

        let contextText = [
            selectedEditorSnapshot()?.trimmedText ?? "",
            currentScene.shortLabel,
            currentScene.slugline
        ]
        .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        .joined(separator: " ")
        let contextTokens = normalizedBeatMatchTokens(contextText)

        return candidateBeats.map { beat in
            let beatTokens = normalizedBeatMatchTokens([beat.label, beat.summary ?? ""].joined(separator: " "))
            return (beat, binding.outlineSceneID ?? "", beatTokens.intersection(contextTokens).count)
        }
        .sorted { lhs, rhs in
            if lhs.score == rhs.score {
                return lhs.beat.label < rhs.beat.label
            }
            return lhs.score > rhs.score
        }
    }

    private func sceneReadbackText(for scene: ScreenplayDraftSceneSnapshot, maxCharacters: Int = 420) -> String {
        let lines = screenplayLineTexts(draftText)
        guard !lines.isEmpty else { return "" }
        let startIndex = max(0, scene.line - 1)
        let endIndex = min(lines.count, scene.endLine)
        guard startIndex < endIndex else { return "" }

        let excerpt = lines[startIndex..<endIndex]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !excerpt.isEmpty else { return "" }
        return String(excerpt.prefix(maxCharacters))
    }

    private func selectedBlockSnapshot() -> ScreenplayEditorSelectionSnapshot? {
        guard let editorSelection, editorSelection.hasSelection else { return nil }
        return editorSelection
    }

    private func refreshIntelligenceReport() {
        guard let context = projectBindingContext else {
            intelligenceReport = .empty
            return
        }

        let draftScenesByID = Dictionary(uniqueKeysWithValues: structuredDraft.scenes.map { ($0.id, $0) })
        let normalizedProjectCharacters = Set(context.projectCharacters.map(normalizedCharacterCue).filter { !$0.isEmpty })

        var continuityIssues: [ScreenplayIntelligenceIssue] = []
        let unboundScenes = projectBinding.sceneBindings.filter { !$0.isBound }
        continuityIssues.append(contentsOf: unboundScenes.map { binding in
            ScreenplayIntelligenceIssue(
                id: "unbound-\(binding.draftSceneID)",
                title: "Unbound scene",
                detail: "\(binding.draftShortLabel) is on the page but not bound to an outline scene yet.",
                severity: .warning
            )
        })

        let beatlessBoundScenes = projectBinding.sceneBindings.filter { $0.isBound && $0.outlineBeatIDs.isEmpty }
        continuityIssues.append(contentsOf: beatlessBoundScenes.map { binding in
            ScreenplayIntelligenceIssue(
                id: "beatless-\(binding.draftSceneID)",
                title: "Scene has no beats",
                detail: "\(binding.draftShortLabel) is bound to the outline but does not carry any beat anchors yet.",
                severity: .info
            )
        })

        let unknownCharacters = structuredDraft.characters
            .map(normalizedCharacterCue)
            .filter { !$0.isEmpty && !normalizedProjectCharacters.contains($0) }
        let uniqueUnknownCharacters = Array(Set(unknownCharacters)).sorted()
        continuityIssues.append(contentsOf: uniqueUnknownCharacters.map { character in
            ScreenplayIntelligenceIssue(
                id: "character-\(character)",
                title: "Untracked character",
                detail: "\(character) appears on the page but is not in the project character set yet.",
                severity: .warning
            )
        })

        let characterSummaries = makeCharacterLineSummaries()

        let sceneGoalDrift = projectBinding.sceneBindings.compactMap { binding -> ScreenplaySceneDriftSummary? in
            guard binding.isBound,
                  let scene = draftScenesByID[binding.draftSceneID] else {
                return nil
            }
            let objective = [binding.outlineSceneObjective, binding.outlineSceneSummary]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            guard !objective.isEmpty else { return nil }

            let objectiveTokens = normalizedIntelligenceTokens(objective)
            let draftTokens = normalizedIntelligenceTokens(sceneExcerptText(for: scene))
            guard objectiveTokens.count >= 3, draftTokens.count >= 3 else { return nil }
            let overlap = objectiveTokens.intersection(draftTokens)
            let overlapScore = Double(overlap.count) / Double(max(objectiveTokens.count, 1))
            guard overlapScore < 0.18 else { return nil }
            return ScreenplaySceneDriftSummary(
                id: "drift-\(binding.draftSceneID)",
                sceneLabel: binding.draftShortLabel,
                objective: String(objective.prefix(120)),
                draftSignal: String(sceneExcerptText(for: scene, maxCharacters: 140).prefix(140)),
                overlapScore: overlapScore
            )
        }

        let scenesByAct = Dictionary(grouping: projectBinding.sceneBindings.filter(\.isBound)) { binding in
            binding.actTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? binding.actTitle!.trimmingCharacters(in: .whitespacesAndNewlines)
                : "Unassigned Act"
        }
        let actBalance = scenesByAct.keys.sorted().map { actTitle in
            let bindings = scenesByAct[actTitle] ?? []
            let sceneCount = bindings.count
            let beatCount = bindings.reduce(0) { partial, binding in
                partial + binding.outlineBeatIDs.count
            }
            let dialogueLineCount = bindings.reduce(0) { partial, binding in
                partial + (draftScenesByID[binding.draftSceneID]?.dialogueLineCount ?? 0)
            }
            return ScreenplayActBalanceSummary(
                id: normalizedBindingToken(actTitle),
                actTitle: actTitle,
                sceneCount: sceneCount,
                beatCount: beatCount,
                dialogueLineCount: dialogueLineCount
            )
        }

        let duplicateBeatIssues = Dictionary(
            grouping: context.outline.beats,
            by: { normalizedBindingToken($0.label) }
        )
        .compactMap { normalizedLabel, beats -> ScreenplayIntelligenceIssue? in
            guard !normalizedLabel.isEmpty, beats.count > 1 else { return nil }
            let titles = beats.map(\.label).sorted().joined(separator: ", ")
            return ScreenplayIntelligenceIssue(
                id: "duplicate-beat-\(normalizedLabel)",
                title: "Duplicate beat label",
                detail: "These beats appear to overlap semantically: \(titles).",
                severity: .warning
            )
        }
        .sorted { $0.title < $1.title }

        var changeSummary: [String] = []
        changeSummary.append("Draft scenes: \(structuredDraft.sceneCount). Bound to outline: \(projectBinding.boundSceneCount)/\(projectBinding.outlineSceneCount).")
        changeSummary.append("Draft characters tracked: \(projectBinding.boundCharacterCount)/\(projectBinding.draftCharacterCount) matched to the project roster.")
        if let lastCommittedWrite {
            changeSummary.append(
                "Last page write touched lines \(lastCommittedWrite.startLine)-\(lastCommittedWrite.endLine) and inserted \(screenplayLineTexts(lastCommittedWrite.insertedText).count) lines."
            )
        }
        if let heaviestAct = actBalance.max(by: { $0.sceneCount < $1.sceneCount }) {
            changeSummary.append("Heaviest act right now: \(heaviestAct.actTitle) with \(heaviestAct.sceneCount) scenes and \(heaviestAct.beatCount) beats.")
        }
        if !sceneGoalDrift.isEmpty {
            changeSummary.append("\(sceneGoalDrift.count) scene objectives look out of sync with the current page draft.")
        }

        intelligenceReport = ScreenplayIntelligenceReport(
            updatedAt: Date(),
            continuityIssues: continuityIssues.sorted { $0.title < $1.title },
            characterSummaries: characterSummaries,
            sceneGoalDrift: sceneGoalDrift.sorted { $0.sceneLabel < $1.sceneLabel },
            actBalance: actBalance,
            duplicateBeatIssues: duplicateBeatIssues,
            changeSummary: changeSummary
        )
    }

    private func makeCharacterLineSummaries() -> [ScreenplayCharacterLineSummary] {
        let paragraphs = structuredDraft.paragraphs.sorted { lhs, rhs in
            if lhs.line == rhs.line {
                return lhs.id < rhs.id
            }
            return lhs.line < rhs.line
        }
        var dialogueLinesByCue: [String: Int] = [:]
        var scenesByCue: [String: Set<String>] = [:]
        var activeCue = ""
        var activeSceneID = ""

        for paragraph in paragraphs {
            if let scene = structuredDraft.scenes.first(where: { paragraph.line >= $0.line && paragraph.line <= $0.endLine }) {
                activeSceneID = scene.id
            }
            switch paragraph.element {
            case .character:
                activeCue = normalizedCharacterCue(paragraph.text)
                if !activeCue.isEmpty, !activeSceneID.isEmpty {
                    scenesByCue[activeCue, default: []].insert(activeSceneID)
                }
            case .dialogue:
                guard !activeCue.isEmpty else { continue }
                dialogueLinesByCue[activeCue, default: 0] += 1
                if !activeSceneID.isEmpty {
                    scenesByCue[activeCue, default: []].insert(activeSceneID)
                }
            default:
                if paragraph.element == .sceneHeading || paragraph.element == .action || paragraph.element == .transition {
                    activeCue = ""
                }
                break
            }
        }

        return dialogueLinesByCue.keys.sorted().map { cue in
            ScreenplayCharacterLineSummary(
                id: cue,
                character: cue,
                sceneCount: scenesByCue[cue]?.count ?? 0,
                dialogueLineCount: dialogueLinesByCue[cue, default: 0]
            )
        }
    }

    private func sceneExcerptText(for scene: ScreenplayDraftSceneSnapshot, maxCharacters: Int = 220) -> String {
        let lines = screenplayLineTexts(draftText)
        guard !lines.isEmpty else { return "" }
        let startIndex = max(0, scene.line - 1)
        let endIndex = min(lines.count, scene.endLine)
        guard startIndex < endIndex else { return "" }
        let excerpt = lines[startIndex..<endIndex]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !excerpt.isEmpty else { return "" }
        return String(excerpt.prefix(maxCharacters))
    }

    private func normalizedIntelligenceTokens(_ raw: String) -> Set<String> {
        let normalized = raw
            .lowercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N}\s]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return [] }
        let stopwords: Set<String> = [
            "the", "a", "an", "and", "or", "but", "to", "of", "in", "on", "at",
            "for", "with", "into", "from", "day", "night", "int", "ext", "scene"
        ]
        return Set(
            normalized
                .split(separator: " ")
                .map(String.init)
                .filter { $0.count > 2 && !stopwords.contains($0) }
        )
    }

    private func normalizedBeatMatchTokens(_ raw: String) -> Set<String> {
        let normalized = raw
            .lowercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N}\s]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return [] }
        return Set(normalized.split(separator: " ").map(String.init).filter { $0.count > 2 })
    }

    private func selectedBlockReadbackText(
        for selection: ScreenplayEditorSelectionSnapshot,
        maxCharacters: Int = 420
    ) -> String {
        let excerpt = selection.trimmedText
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !excerpt.isEmpty else { return "" }
        return String(excerpt.prefix(maxCharacters))
    }

    private func currentPageReadbackText(maxCharacters: Int = 520) -> String {
        let excerpt = screenplayLineTexts(draftText)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !excerpt.isEmpty else { return "" }
        return String(excerpt.prefix(maxCharacters))
    }

    private func characterDialogueReadbackText(
        for rawCharacter: String,
        maxCharacters: Int = 520
    ) -> String {
        let cue = normalizedCharacterCue(rawCharacter)
        guard !cue.isEmpty else { return "" }
        let lines = screenplayLineTexts(draftText)
        guard !lines.isEmpty else { return "" }

        let paragraphs = structuredDraft.paragraphs.sorted { lhs, rhs in
            if lhs.line == rhs.line {
                return lhs.id < rhs.id
            }
            return lhs.line < rhs.line
        }

        var collected: [String] = []
        var index = 0
        while index < paragraphs.count {
            let paragraph = paragraphs[index]
            let paragraphCue = normalizedCharacterCue(paragraph.text)
            guard paragraph.element == .character, paragraphCue == cue else {
                index += 1
                continue
            }

            var lookahead = index + 1
            while lookahead < paragraphs.count {
                let next = paragraphs[lookahead]
                guard next.line > paragraph.line else {
                    lookahead += 1
                    continue
                }
                switch next.element {
                case .dialogue, .parenthetical:
                    let lineIndex = max(0, next.line - 1)
                    if lineIndex < lines.count {
                        let trimmed = lines[lineIndex].trimmingCharacters(in: .whitespacesAndNewlines)
                        if !trimmed.isEmpty {
                            collected.append(trimmed)
                        }
                    }
                    lookahead += 1
                default:
                    lookahead += 1
                    break
                }
                if next.element != .dialogue && next.element != .parenthetical {
                    break
                }
            }
            index = max(index + 1, lookahead)
        }

        let excerpt = collected
            .joined(separator: " ")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !excerpt.isEmpty else { return "" }
        return String(excerpt.prefix(maxCharacters))
    }

    private func auditionExcerptText(
        for command: ScreenplayLocalStudioCommand
    ) -> (spokenText: String, style: ScreenplayAuditionVoiceStyle, confirmation: String)? {
        switch command {
        case let .auditionSelection(style):
            guard let selection = selectedBlockSnapshot() else { return nil }
            let excerpt = selectedBlockReadbackText(for: selection)
            guard !excerpt.isEmpty else { return nil }
            return (
                spokenText: excerpt,
                style: style,
                confirmation: "Auditioning the selected exchange \(style.rawValue)."
            )
        case let .auditionCurrentScene(style):
            guard let scene = sceneSnapshot(atOrBeforeLine: currentCursorLine) else { return nil }
            let excerpt = sceneReadbackText(for: scene)
            guard !excerpt.isEmpty else { return nil }
            return (
                spokenText: excerpt,
                style: style,
                confirmation: "Auditioning \(scene.shortLabel) \(style.rawValue)."
            )
        default:
            return nil
        }
    }

    private func prepareReplacementForScene(_ scene: ScreenplayDraftSceneSnapshot) -> Bool {
        let lines = screenplayLineTexts(draftText)
        guard !lines.isEmpty else { return false }
        let startIndex = max(0, scene.line - 1)
        let endIndex = min(lines.count, scene.endLine)
        guard startIndex < endIndex else { return false }
        let currentText = lines[startIndex..<endIndex].joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !currentText.isEmpty else { return false }
        prepareNextPageWriteReplacement(
            sourceWriteID: "",
            startLine: scene.line,
            endLine: scene.endLine,
            currentText: currentText
        )
        jumpToLine(scene.line)
        highlightLineRange(startLine: scene.line, endLine: scene.endLine)
        requestEditorFocus()
        return true
    }

    private func prepareReplacementForSelection(_ selection: ScreenplayEditorSelectionSnapshot) -> Bool {
        let currentText = selection.trimmedText
        guard !currentText.isEmpty else { return false }
        prepareNextPageWriteReplacement(
            sourceWriteID: "selection:\(selection.startLine)-\(selection.endLine)",
            startLine: selection.startLine,
            endLine: selection.endLine,
            currentText: currentText
        )
        highlightLineRange(startLine: selection.startLine, endLine: selection.endLine)
        requestEditorFocus()
        return true
    }

    private func spokenInteger(from raw: String) -> Int? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return nil }
        if let direct = Int(trimmed) {
            return direct
        }

        let lookup: [String: Int] = [
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
            "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20
        ]
        return lookup[trimmed]
    }

    private func auditionVoiceStyle(in raw: String) -> ScreenplayAuditionVoiceStyle? {
        let normalized = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized.contains("faster") || normalized.contains("brisker") {
            return .faster
        }
        if normalized.contains("colder") || normalized.contains("cooler") {
            return .colder
        }
        if normalized.contains("more vulnerable") || normalized.contains("vulnerable") || normalized.contains("softer") {
            return .vulnerable
        }
        return nil
    }

    private func localStudioCommand(in rawText: String) -> ScreenplayLocalStudioCommand? {
        let trimmed = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let normalized = trimmed
            .lowercased()
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: #"[^\p{L}\p{N}'/.-]+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return nil }

        if normalized == "next element" || normalized == "next mode" {
            return .cycleElement(backward: false)
        }
        if normalized == "previous element" || normalized == "previous mode" || normalized == "back one element" {
            return .cycleElement(backward: true)
        }
        if [
            "confirm",
            "confirm that",
            "yes do it",
            "yes go ahead",
            "go ahead",
        ].contains(normalized) {
            return .confirmPendingAction
        }
        if [
            "cancel that",
            "cancel command",
            "cancel action",
            "never mind",
            "nevermind",
            "stop that",
        ].contains(normalized) {
            return .cancelPendingAction
        }
        if [
            "undo",
            "undo that",
            "undo last change",
            "undo last edit",
            "undo that change",
        ].contains(normalized) {
            return .undo
        }
        if [
            "redo",
            "redo that",
            "redo last change",
            "redo last edit",
        ].contains(normalized) {
            return .redo
        }
        if [
            "save",
            "save draft",
            "save script",
            "save screenplay",
        ].contains(normalized) {
            return .saveDraft
        }
        if [
            "save version",
            "save snapshot",
            "create snapshot",
            "create version",
        ].contains(normalized) {
            return .saveRevisionSnapshot
        }
        if [
            "undo last page write",
            "undo page write",
            "remove last page write",
            "revert last page write",
        ].contains(normalized) {
            return .undoLastPageWrite
        }
        if [
            "read selection",
            "read this selection",
            "read selected block",
            "read selected lines",
            "read this block",
        ].contains(normalized) {
            return .readBackSelection
        }
        if [
            "read this page",
            "read current page",
            "read page",
            "read back this page",
        ].contains(normalized) {
            return .readBackCurrentPage
        }
        if [
            "read this scene",
            "read back this scene",
            "read current scene",
            "read back current scene",
        ].contains(normalized) {
            return .readBackCurrentScene
        }
        if [
            "replace selection",
            "replace this selection",
            "replace selected block",
            "rewrite selection",
            "rewrite selected block",
        ].contains(normalized) {
            return .replaceSelection
        }
        if [
            "replace this scene",
            "replace current scene",
            "replace this block",
            "replace current block",
        ].contains(normalized) {
            return .replaceCurrentScene
        }
        if [
            "split this block into a new scene",
            "split this selection into a new scene",
            "split selection into a new scene",
            "split this into a new scene",
        ].contains(normalized) {
            return .splitSelectionIntoNewScene
        }
        if [
            "promote this selection to a beat",
            "promote selection to a beat",
            "make this selection a beat",
            "turn this selection into a beat",
            "promote this block to a beat",
        ].contains(normalized) {
            return .promoteSelectionToBeat
        }
        if [
            "make a beat from selection",
            "make beat from selection",
            "make a beat from this selection",
            "capture a beat from selection",
            "capture beat from selection",
        ].contains(normalized) {
            return .makeBeatFromSelection
        }
        if [
            "update selected beat from selection",
            "refresh selected beat from selection",
            "update this beat from selection",
            "refresh this beat from selection",
            "use this selection for the selected beat",
        ].contains(normalized) {
            return .updateSelectedBeatFromSelection
        }
        if [
            "delete this beat",
            "remove this beat",
            "cut this beat",
        ].contains(normalized) {
            return .deleteCurrentBeat
        }
        if [
            "duplicate this scene",
            "duplicate current scene",
            "copy this scene",
        ].contains(normalized) {
            return .duplicateCurrentScene
        }
        if [
            "promote this paragraph to dialogue",
            "turn this paragraph into dialogue",
            "make this paragraph dialogue",
            "promote paragraph to dialogue",
        ].contains(normalized) {
            return .promoteParagraphToDialogue
        }
        if [
            "demote this beat",
            "pull this beat out of the scene",
            "detach this beat",
        ].contains(normalized) {
            return .demoteCurrentBeat
        }
        if [
            "accept only that rewrite",
            "accept that rewrite",
            "keep only that rewrite",
            "keep that rewrite",
        ].contains(normalized) {
            return .acceptFocusedRewrite
        }
        if [
            "merge this scene with the next one",
            "merge this scene with next scene",
            "merge current scene with next scene",
            "merge this scene forward",
        ].contains(normalized) {
            return .mergeCurrentSceneForward
        }
        if normalized == "focus page" || normalized == "focus screenplay" || normalized == "focus draft" {
            return .focusPage
        }

        if let style = auditionVoiceStyle(in: normalized) {
            if normalized.contains("audition this selection")
                || normalized.contains("audition selection")
                || normalized.contains("audition this exchange")
                || normalized.contains("audition this block") {
                return .auditionSelection(style)
            }
            if normalized.contains("audition this scene")
                || normalized.contains("audition current scene") {
                return .auditionCurrentScene(style)
            }
        }

        if let match = normalized.range(of: #"^(?:go to|jump to|move to)? ?line ([a-z0-9]+)$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:go to|jump to|move to)? ?line "#,
                with: "",
                options: .regularExpression
            )
            if let line = spokenInteger(from: captured) {
                return .jumpToLine(line)
            }
        }

        if let match = normalized.range(of: #"^(?:go to|jump to|move to) scene (.+)$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:go to|jump to|move to) scene "#,
                with: "",
                options: .regularExpression
            )
            if let ordinal = spokenInteger(from: captured) {
                return .jumpToSceneOrdinal(ordinal)
            }
            return .jumpToSceneLabel(captured)
        }

        if let match = normalized.range(of: #"^(?:read|read back) scene (.+)$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:read|read back) scene "#,
                with: "",
                options: .regularExpression
            )
            if let ordinal = spokenInteger(from: captured) {
                return .readBackSceneOrdinal(ordinal)
            }
            return .readBackSceneLabel(captured)
        }

        if let match = normalized.range(of: #"^(?:move|put) (?:this|current) scene after scene (.+)$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:move|put) (?:this|current) scene after scene "#,
                with: "",
                options: .regularExpression
            )
            if let ordinal = spokenInteger(from: captured) {
                return .moveCurrentSceneAfterSceneOrdinal(ordinal)
            }
            return .moveCurrentSceneAfterSceneLabel(captured)
        }

        if let match = normalized.range(of: #"^(?:move|put) (?:this selection|selection|this block|selected block) after scene (.+)$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:move|put) (?:this selection|selection|this block|selected block) after scene "#,
                with: "",
                options: .regularExpression
            )
            if let ordinal = spokenInteger(from: captured) {
                return .moveSelectionAfterSceneOrdinal(ordinal)
            }
            return .moveSelectionAfterSceneLabel(captured)
        }

        if normalized == "new scene" || normalized == "insert scene" || normalized == "insert scene heading" {
            return .insertSceneHeading("")
        }
        if let match = normalized.range(of: #"^(?:new scene|insert scene heading|insert slugline) (.+)$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:new scene|insert scene heading|insert slugline) "#,
                with: "",
                options: .regularExpression
            )
            return .insertSceneHeading(captured)
        }

        if let match = normalized.range(of: #"^(?:character|insert character|character cue) (.+)$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:character|insert character|character cue) "#,
                with: "",
                options: .regularExpression
            )
            return .insertCharacterCue(captured)
        }

        if let match = normalized.range(of: #"^(?:read|read back) just (.+?)(?:'s|s)? lines$"#, options: .regularExpression) {
            let captured = String(normalized[match]).replacingOccurrences(
                of: #"^(?:read|read back) just "#,
                with: "",
                options: .regularExpression
            ).replacingOccurrences(
                of: #"(?:'s|s)? lines$"#,
                with: "",
                options: .regularExpression
            )
            return .readBackCharacterLines(captured)
        }

        let elementPhrases: [(ScreenplayEditorElement, [String])] = [
            (.sceneHeading, ["scene mode", "scene heading mode", "switch to scene", "switch to scene heading"]),
            (.action, ["action mode", "switch to action"]),
            (.character, ["character mode", "switch to character"]),
            (.dialogue, ["dialogue mode", "switch to dialogue"]),
            (.parenthetical, ["parenthetical mode", "switch to parenthetical", "paren mode"]),
            (.transition, ["transition mode", "switch to transition"])
        ]
        for (element, phrases) in elementPhrases {
            if phrases.contains(where: { normalized == $0 }) {
                return .setElement(element)
            }
        }

        return nil
    }

    private func ambiguousSceneFeedback(_ query: String, candidates: [ScreenplayDraftSceneSnapshot]) -> ScreenplayLocalStudioCommandFeedback {
        let labels = candidates.prefix(3).enumerated().map { index, scene in
            "scene \(index + 1): \(scene.shortLabel)"
        }.joined(separator: ", ")
        return ScreenplayLocalStudioCommandFeedback(
            confirmation: "I found multiple scenes matching \(query). Narrow it to a numbered scene first: \(labels).",
            shouldSpeakConfirmation: true,
            isError: true
        )
    }

    private func destructivePreviewFeedback(
        title: String,
        beforeLines: [String],
        afterLines: [String],
        warning: String? = nil,
        action: ScreenplayStudioActionRequest.Action,
        intValue: Int? = nil,
        secondaryIntValue: Int? = nil,
        stringValue: String? = nil,
        secondaryStringValue: String? = nil
    ) -> ScreenplayLocalStudioCommandFeedback {
        previewStudioAction(
            action,
            title: title,
            beforeLines: beforeLines,
            afterLines: afterLines,
            warning: warning,
            intValue: intValue,
            secondaryIntValue: secondaryIntValue,
            stringValue: stringValue,
            secondaryStringValue: secondaryStringValue
        )
        return ScreenplayLocalStudioCommandFeedback(
            confirmation: "\(title). Say confirm to continue or cancel to keep the draft as-is.",
            shouldSpeakConfirmation: true,
            isError: false
        )
    }

    private func beatCandidateSelection() -> (beat: BackendScreenplayBeat, sceneID: String)? {
        let candidates = currentBeatCandidates()
        guard let first = candidates.first else { return nil }
        if candidates.count > 1, candidates[0].score == candidates[1].score {
            return nil
        }
        return (first.beat, first.sceneID)
    }

    func executeLocalStudioCommand(
        _ rawText: String,
        source: ScreenplayStudioUserPrompt.Source = .voice
    ) -> ScreenplayLocalStudioCommandFeedback? {
        guard let command = localStudioCommand(in: rawText) else { return nil }

        if command != .confirmPendingAction && command != .cancelPendingAction,
           pendingStudioActionPreview != nil {
            pendingStudioActionPreview = nil
        }

        let feedback: ScreenplayLocalStudioCommandFeedback
        let target: ScreenplayStudioUserPrompt.Target

        switch command {
        case .confirmPendingAction:
            guard let preview = confirmPendingStudioActionPreview() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "There isn't a pending structural change to confirm right now.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Confirmed \(preview.title.lowercased()). Applying it now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .cancelPendingAction:
            guard let preview = cancelPendingStudioActionPreview() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "There isn't a pending structural change to cancel.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Canceled \(preview.title.lowercased()).",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .jumpToLine(line):
            jumpToLine(line)
            highlightLineRange(startLine: line)
            requestEditorFocus()
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Jumped to line \(max(1, line)).",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .jumpToSceneOrdinal(ordinal):
            guard let scene = sceneSnapshot(forOrdinal: ordinal) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find scene \(ordinal) yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            jumpToLine(scene.line)
            highlightLineRange(startLine: scene.line)
            requestEditorFocus()
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Jumped to scene \(ordinal), \(scene.shortLabel).",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .jumpToSceneLabel(label):
            let matches = sceneSnapshotMatches(label)
            if matches.count > 1 {
                return ambiguousSceneFeedback(label, candidates: matches)
            }
            guard let scene = matches.first else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find that scene in the draft yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            jumpToLine(scene.line)
            highlightLineRange(startLine: scene.line)
            requestEditorFocus()
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Jumped to \(scene.shortLabel).",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .insertSceneHeading(rawHeading):
            let headingSeed = rawHeading.trimmingCharacters(in: .whitespacesAndNewlines)
            let heading = normalizedSceneHeading(
                headingSeed.isEmpty ? "INT. NEW LOCATION - DAY" : headingSeed
            )
            requestEditorFocus()
            setActiveScreenplayElement(.sceneHeading)
            pendingInsertion = ScreenplayInsertionRequest(text: heading, mode: .insert)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) {
                self.setActiveScreenplayElement(.action)
            }
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Inserted scene heading \(compactSceneLabel(heading)).",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .insertCharacterCue(rawCue):
            let cue = normalizedCharacterCue(rawCue)
            guard !cue.isEmpty else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I need a character name for that command.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestEditorFocus()
            setActiveScreenplayElement(.character)
            pendingInsertion = ScreenplayInsertionRequest(text: cue, mode: .insert)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06) {
                self.setActiveScreenplayElement(.dialogue)
            }
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Inserted character cue \(cue).",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .setElement(element):
            requestEditorFocus()
            setActiveScreenplayElement(element)
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Switched to \(element.title.lowercased()) mode.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .cycleElement(backward):
            requestEditorFocus()
            cycleActiveScreenplayElement(backward: backward)
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: backward
                    ? "Moved to the previous screenplay element."
                    : "Moved to the next screenplay element.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .undo:
            requestEditorFocus()
            requestEditorAction(.undo)
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Undid the last screenplay edit.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .redo:
            requestEditorFocus()
            requestEditorAction(.redo)
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Redid the last screenplay edit.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .saveDraft:
            guard !(projectBinding.projectID.isEmpty && preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a Studio project before saving a draft version.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(.saveDraft)
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Saving the current draft now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .saveRevisionSnapshot:
            guard !(projectBinding.projectID.isEmpty && preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a Studio project before saving a snapshot version.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(.saveRevisionSnapshot)
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Saving a new snapshot version now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .undoLastPageWrite:
            guard lastCommittedWrite != nil else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "There isn't a recent page write to undo yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(.undoLastPageWrite)
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Undoing the most recent page write now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case let .moveCurrentSceneAfterSceneOrdinal(ordinal):
            guard let currentScene = sceneSnapshot(atOrBeforeLine: currentCursorLine) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find the current scene to move yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard let targetScene = sceneSnapshot(forOrdinal: ordinal) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find scene \(ordinal) yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard targetScene.id != currentScene.id else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "You're already in that scene.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = destructivePreviewFeedback(
                title: "Confirm move scene",
                beforeLines: [
                    "Current scene: \(currentScene.shortLabel)",
                    "Destination: after scene \(ordinal)"
                ],
                afterLines: [
                    "\(currentScene.shortLabel) will move after \(targetScene.shortLabel).",
                    "The page text will be reordered without rewriting lines."
                ],
                action: .moveCurrentSceneAfterScene,
                intValue: ordinal
            )
        case let .moveCurrentSceneAfterSceneLabel(label):
            guard let currentScene = sceneSnapshot(atOrBeforeLine: currentCursorLine) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find the current scene to move yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            let matches = sceneSnapshotMatches(label)
            if matches.count > 1 {
                return ambiguousSceneFeedback(label, candidates: matches)
            }
            guard let targetScene = matches.first else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find that target scene yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard targetScene.id != currentScene.id else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "You're already in that scene.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = destructivePreviewFeedback(
                title: "Confirm move scene",
                beforeLines: [
                    "Current scene: \(currentScene.shortLabel)",
                    "Destination: after \(targetScene.shortLabel)"
                ],
                afterLines: [
                    "\(currentScene.shortLabel) will move after \(targetScene.shortLabel).",
                    "The page text will be reordered without rewriting lines."
                ],
                action: .moveCurrentSceneAfterScene,
                stringValue: label
            )
        case let .moveSelectionAfterSceneOrdinal(ordinal):
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select the block you want to move first.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard let targetScene = sceneSnapshot(forOrdinal: ordinal) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find scene \(ordinal) yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = destructivePreviewFeedback(
                title: "Confirm move selection",
                beforeLines: [
                    "Selected lines: \(selection.startLine)-\(selection.endLine)",
                    String(selection.trimmedText.prefix(96))
                ],
                afterLines: [
                    "The selected block will move after \(targetScene.shortLabel).",
                    "Its text will stay intact; only the order changes."
                ],
                action: .moveSelectionAfterScene,
                intValue: ordinal,
                secondaryIntValue: selection.startLine,
                stringValue: selection.trimmedText
            )
        case let .moveSelectionAfterSceneLabel(label):
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select the block you want to move first.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            let matches = sceneSnapshotMatches(label)
            if matches.count > 1 {
                return ambiguousSceneFeedback(label, candidates: matches)
            }
            guard let targetScene = matches.first else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find that target scene yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = destructivePreviewFeedback(
                title: "Confirm move selection",
                beforeLines: [
                    "Selected lines: \(selection.startLine)-\(selection.endLine)",
                    String(selection.trimmedText.prefix(96))
                ],
                afterLines: [
                    "The selected block will move after \(targetScene.shortLabel).",
                    "Its text will stay intact; only the order changes."
                ],
                action: .moveSelectionAfterScene,
                secondaryIntValue: selection.startLine,
                stringValue: label,
                secondaryStringValue: selection.trimmedText
            )
        case .splitSelectionIntoNewScene:
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select the block you want to split into a new scene first.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(
                .splitSelectionIntoNewScene,
                intValue: selection.startLine,
                secondaryIntValue: selection.endLine,
                stringValue: selection.sceneLabel
            )
            target = .page
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Splitting the selected block into a new scene now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .promoteSelectionToBeat:
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select the block you want to promote into a beat first.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard !(projectBinding.projectID.isEmpty && preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a Studio project before promoting a beat.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(
                .promoteSelectionToBeat,
                intValue: selection.startLine,
                secondaryIntValue: selection.endLine,
                stringValue: selection.trimmedText,
                secondaryStringValue: selection.sceneLabel
            )
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Promoting the selected block into a beat now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .makeBeatFromSelection:
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select the block you want to turn into a beat first.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard !(projectBinding.projectID.isEmpty && preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a Studio project before creating a beat.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(
                .makeBeatFromSelection,
                intValue: selection.startLine,
                secondaryIntValue: selection.endLine,
                stringValue: selection.trimmedText,
                secondaryStringValue: selection.sceneLabel
            )
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Making a beat from the selected block now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .updateSelectedBeatFromSelection:
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select the block you want to use first.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard !(projectBinding.projectID.isEmpty && preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a Studio project before updating a beat.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(
                .updateSelectedBeatFromSelection,
                intValue: selection.startLine,
                secondaryIntValue: selection.endLine,
                stringValue: selection.trimmedText,
                secondaryStringValue: selection.sceneLabel
            )
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Updating the selected beat from the selected block now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .deleteCurrentBeat:
            guard !(projectBinding.projectID.isEmpty && preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a Studio project before deleting a beat.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            guard let selectedBeat = beatCandidateSelection() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I found more than one beat near the cursor. Jump into the exact scene or highlight the beat text before deleting it.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            feedback = destructivePreviewFeedback(
                title: "Confirm delete beat",
                beforeLines: [
                    "Beat: \(selectedBeat.beat.label)",
                    String((selectedBeat.beat.summary ?? "").prefix(120))
                ],
                afterLines: [
                    "This beat will be removed from the outline and detached from the current scene."
                ],
                action: .deleteCurrentBeat,
                intValue: currentCursorLine
            )
        case .duplicateCurrentScene:
            guard let currentScene = sceneSnapshot(atOrBeforeLine: currentCursorLine) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find the current scene to duplicate yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(.duplicateCurrentScene, intValue: currentScene.line, stringValue: currentScene.id)
            target = .page
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Duplicating \(currentScene.shortLabel) now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .promoteParagraphToDialogue:
            let paragraphLine = selectedBlockSnapshot()?.startLine ?? currentCursorLine
            guard structuredDraft.paragraphs.contains(where: { $0.line == paragraphLine }) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find a paragraph to promote at the cursor yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            requestStudioAction(
                .promoteParagraphToDialogue,
                intValue: paragraphLine,
                secondaryIntValue: selectedBlockSnapshot()?.endLine
            )
            target = .page
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Promoting that paragraph into dialogue now.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .demoteCurrentBeat:
            guard !(projectBinding.projectID.isEmpty && preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a Studio project before demoting a beat.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            guard let selectedBeat = beatCandidateSelection() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I found more than one beat near the cursor. Jump into the exact scene or highlight the beat text before demoting it.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            feedback = destructivePreviewFeedback(
                title: "Confirm demote beat",
                beforeLines: [
                    "Beat: \(selectedBeat.beat.label)",
                    "Current scene anchor: active"
                ],
                afterLines: [
                    "The beat will stay in the outline but come off the current scene."
                ],
                action: .demoteCurrentBeat,
                intValue: currentCursorLine
            )
        case .acceptFocusedRewrite:
            target = .voicePin
            feedback = destructivePreviewFeedback(
                title: "Confirm accept rewrite",
                beforeLines: [
                    "Current revised diff focus will stay mutable."
                ],
                afterLines: [
                    "Only the focused rewrite will remain accepted in the draft."
                ],
                action: .acceptFocusedRewrite
            )
        case .mergeCurrentSceneForward:
            guard let currentScene = sceneSnapshot(atOrBeforeLine: currentCursorLine) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find the current scene to merge yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard nextSceneSnapshot(after: currentScene) != nil else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "There isn't a following scene to merge into this one yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = destructivePreviewFeedback(
                title: "Confirm merge scenes",
                beforeLines: [
                    "Current scene: \(currentScene.shortLabel)",
                    "Next scene: \(nextSceneSnapshot(after: currentScene)?.shortLabel ?? "Unknown")"
                ],
                afterLines: [
                    "The following scene will fold into \(currentScene.shortLabel).",
                    "Outline beat anchors from both scenes will merge."
                ],
                action: .mergeCurrentSceneForward,
                intValue: currentScene.line
            )
        case .readBackSelection:
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select a block on the page first so I know what to read back.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            let excerpt = selectedBlockReadbackText(for: selection)
            if excerpt.isEmpty {
                feedback = ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I found the selected block, but there isn't enough text there to read back yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
                break
            }
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: {
                    if let sceneLabel = selection.sceneLabel, !sceneLabel.isEmpty {
                        return "Reading back the selected block from \(sceneLabel)."
                    }
                    return "Reading back the selected block."
                }(),
                shouldSpeakConfirmation: true,
                isError: false,
                spokenText: excerpt
            )
        case .readBackCurrentPage:
            target = .voicePin
            let excerpt = currentPageReadbackText()
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: excerpt.isEmpty
                    ? "The current page is still empty."
                    : "Reading back the current page.",
                shouldSpeakConfirmation: true,
                isError: excerpt.isEmpty,
                spokenText: excerpt.isEmpty ? nil : excerpt
            )
        case .readBackCurrentScene:
            guard let scene = sceneSnapshot(atOrBeforeLine: currentCursorLine) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find a scene at the current cursor yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            let excerpt = sceneReadbackText(for: scene)
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: excerpt.isEmpty
                    ? "I found \(scene.shortLabel), but there isn't enough scene text there to read back yet."
                    : "Reading back \(scene.shortLabel).",
                shouldSpeakConfirmation: true,
                isError: excerpt.isEmpty,
                spokenText: excerpt.isEmpty ? nil : excerpt
            )
        case let .readBackSceneOrdinal(ordinal):
            guard let scene = sceneSnapshot(forOrdinal: ordinal) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find scene \(ordinal) yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            let excerpt = sceneReadbackText(for: scene)
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: excerpt.isEmpty
                    ? "I found scene \(ordinal), but there isn't enough scene text there to read back yet."
                    : "Reading back scene \(ordinal), \(scene.shortLabel).",
                shouldSpeakConfirmation: true,
                isError: excerpt.isEmpty,
                spokenText: excerpt.isEmpty ? nil : excerpt
            )
        case let .readBackSceneLabel(label):
            guard let scene = sceneSnapshot(matching: label) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find that scene in the draft yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            let excerpt = sceneReadbackText(for: scene)
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: excerpt.isEmpty
                    ? "I found \(scene.shortLabel), but there isn't enough scene text there to read back yet."
                    : "Reading back \(scene.shortLabel).",
                shouldSpeakConfirmation: true,
                isError: excerpt.isEmpty,
                spokenText: excerpt.isEmpty ? nil : excerpt
            )
        case let .readBackCharacterLines(character):
            target = .voicePin
            let excerpt = characterDialogueReadbackText(for: character)
            let normalizedCue = normalizedCharacterCue(character)
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: excerpt.isEmpty
                    ? "I couldn't find spoken lines for \(normalizedCue.isEmpty ? "that character" : normalizedCue) yet."
                    : "Reading just \(normalizedCue)'s lines.",
                shouldSpeakConfirmation: true,
                isError: excerpt.isEmpty,
                spokenText: excerpt.isEmpty ? nil : excerpt
            )
        case .auditionSelection, .auditionCurrentScene:
            guard let audition = auditionExcerptText(for: command) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find enough screenplay text to audition yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: audition.confirmation,
                shouldSpeakConfirmation: true,
                isError: false,
                spokenText: audition.spokenText,
                spokenStyle: audition.style
            )
        case .replaceSelection:
            guard let selection = selectedBlockSnapshot() else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Select the block you want me to replace first.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard prepareReplacementForSelection(selection) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I found the selection, but I couldn't arm it for replacement yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Armed the selected block for replacement. The next page write will replace that selection.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .replaceCurrentScene:
            if let selection = selectedBlockSnapshot(),
               prepareReplacementForSelection(selection) {
                target = .voicePin
                feedback = ScreenplayLocalStudioCommandFeedback(
                    confirmation: "Armed the selected block for replacement. The next page write will replace that selection.",
                    shouldSpeakConfirmation: true,
                    isError: false
                )
                break
            }
            guard let scene = sceneSnapshot(atOrBeforeLine: currentCursorLine) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I couldn't find a current scene to replace yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            guard prepareReplacementForScene(scene) else {
                return ScreenplayLocalStudioCommandFeedback(
                    confirmation: "I found the scene, but I couldn't arm it for replacement yet.",
                    shouldSpeakConfirmation: true,
                    isError: true
                )
            }
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Armed \(scene.shortLabel) for replacement. The next page write will replace this scene.",
                shouldSpeakConfirmation: true,
                isError: false
            )
        case .focusPage:
            requestEditorFocus()
            target = .voicePin
            feedback = ScreenplayLocalStudioCommandFeedback(
                confirmation: "Focused the screenplay page.",
                shouldSpeakConfirmation: false,
                isError: false
            )
        }

        latestMemoryDomain = .project
        recordStudioUserPrompt(
            rawText,
            source: source,
            target: target,
            memoryDomain: .project
        )
        recordStudioConversationTurn(
            user: rawText,
            assistant: feedback.confirmation,
            memoryDomain: .project
        )
        updateAssistantPin(
            mode: target == .page ? "page" : "copilot",
            category: target == .page ? "Scene" : "Task",
            title: "Studio command",
            body: feedback.confirmation,
            badge: "Command",
            actionSummary: feedback.confirmation
        )
        return feedback
    }

    func updateAssistantPin(
        mode: String,
        category: String,
        title: String,
        body: String,
        fullBody: String? = nil,
        badge: String = "",
        actionSummary: String = ""
    ) {
        let cleanMode = mode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "idle"
            : mode.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanCategory = category.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanFullBody = (fullBody ?? body).trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanBadge = badge.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanActionSummary = actionSummary.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanTitle.isEmpty || !cleanBody.isEmpty || !cleanActionSummary.isEmpty else { return }

        let nextPin = ScreenplayAssistantPinState(
            id: UUID(),
            mode: cleanMode,
            category: cleanCategory,
            title: cleanTitle,
            body: cleanBody,
            fullBody: cleanFullBody,
            badge: cleanBadge,
            actionSummary: cleanActionSummary,
            updatedAt: Date()
        )
        assistantPin = nextPin
        latestStudioRouteTarget = cleanMode.lowercased() == "page" ? .page : .voicePin

        if cleanMode.lowercased() == "copilot",
           !cleanBody.isEmpty {
            if assistantPinHistory.first?.dedupeKey != nextPin.dedupeKey {
                assistantPinHistory.insert(nextPin, at: 0)
                if assistantPinHistory.count > 3 {
                    assistantPinHistory = Array(assistantPinHistory.prefix(3))
                }
            }
        }
    }

    func restoreAssistantPin(_ pin: ScreenplayAssistantPinState) {
        assistantPin = pin
    }
}

struct CursorInsertTextEditor: View {
    @Binding var text: String
    @Binding var activeScreenplayElement: ScreenplayEditorElement
    @Binding var insertionRequest: ScreenplayInsertionRequest?
    @Binding var lineJumpRequest: ScreenplayLineJumpRequest?
    @Binding var lineHighlightRequest: ScreenplayLineHighlightRequest?
    @Binding var anchoredTextRectRequest: ScreenplayAnchoredTextRectRequest?
    @Binding var anchoredTextRectSnapshot: ScreenplayAnchoredTextRectSnapshot?
    @Binding var editorFocusRequest: ScreenplayEditorFocusRequest?
    @Binding var editorActionRequest: ScreenplayEditorActionRequest?
    @Binding var editorSelection: ScreenplayEditorSelectionSnapshot?
    @Binding var currentCursorLine: Int
    @Binding var lastCommittedWrite: ScreenplayCommittedWrite?
    @Binding var pendingReplacementTarget: ScreenplayPendingReplacementTarget?
    @Binding var submittedReplacementTarget: ScreenplayPendingReplacementTarget?
    var onUserEdit: (() -> Void)? = nil

    private var screenplayFont: Font {
        .custom("Courier", size: 12)
    }

    var body: some View {
        #if os(macOS)
        MacCursorInsertTextEditor(
            text: $text,
            activeScreenplayElement: $activeScreenplayElement,
            insertionRequest: $insertionRequest,
            lineJumpRequest: $lineJumpRequest,
            lineHighlightRequest: $lineHighlightRequest,
            anchoredTextRectRequest: $anchoredTextRectRequest,
            anchoredTextRectSnapshot: $anchoredTextRectSnapshot,
            editorFocusRequest: $editorFocusRequest,
            editorActionRequest: $editorActionRequest,
            editorSelection: $editorSelection,
            currentCursorLine: $currentCursorLine,
            lastCommittedWrite: $lastCommittedWrite,
            pendingReplacementTarget: $pendingReplacementTarget,
            submittedReplacementTarget: $submittedReplacementTarget,
            onUserEdit: onUserEdit
        )
        #elseif os(iOS)
        IOSCursorInsertTextEditor(
            text: $text,
            activeScreenplayElement: $activeScreenplayElement,
            insertionRequest: $insertionRequest,
            lineJumpRequest: $lineJumpRequest,
            lineHighlightRequest: $lineHighlightRequest,
            anchoredTextRectRequest: $anchoredTextRectRequest,
            anchoredTextRectSnapshot: $anchoredTextRectSnapshot,
            editorFocusRequest: $editorFocusRequest,
            editorActionRequest: $editorActionRequest,
            editorSelection: $editorSelection,
            currentCursorLine: $currentCursorLine,
            lastCommittedWrite: $lastCommittedWrite,
            pendingReplacementTarget: $pendingReplacementTarget,
            submittedReplacementTarget: $submittedReplacementTarget,
            onUserEdit: onUserEdit
        )
        #else
        EmptyView()
        #endif
    }
}

#if os(macOS)
private final class HollywoodScreenplayTextView: NSTextView {
    var draftProvider: () -> String = { "" }
    var onElementShortcut: ((ScreenplayEditorElement) -> Void)?

    override func paste(_ sender: Any?) {
        guard let pasted = NSPasteboard.general.string(forType: .string) else {
            super.paste(sender)
            return
        }

        let normalized = FountainFormatter.normalizePastedScreenplayBlock(
            pasted,
            existingDraft: draftProvider()
        )
        guard !normalized.isEmpty, normalized != pasted else {
            super.paste(sender)
            return
        }

        let selection = selectedRange()
        guard shouldChangeText(in: selection, replacementString: normalized) else { return }
        textStorage?.replaceCharacters(in: selection, with: normalized)
        let caretLocation = min(selection.location + (normalized as NSString).length, (string as NSString).length)
        setSelectedRange(NSRange(location: caretLocation, length: 0))
        didChangeText()
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        let acceptsShortcutModifier = modifiers == [.command] || modifiers == [.control]
        if acceptsShortcutModifier,
           let key = event.charactersIgnoringModifiers?.lowercased(),
           let element = Self.screenplayElementShortcut(for: key) {
            onElementShortcut?(element)
            return true
        }

        return super.performKeyEquivalent(with: event)
    }

    private static func screenplayElementShortcut(for key: String) -> ScreenplayEditorElement? {
        switch key {
        case "1": return .sceneHeading
        case "2": return .action
        case "3": return .character
        case "4": return .dialogue
        case "5": return .parenthetical
        case "6": return .transition
        default: return nil
        }
    }
}

private func hollywoodScreenplayEditorFont() -> NSFont {
    NSFont(name: "Courier", size: 12) ?? NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
}

private struct MacCursorInsertTextEditor: NSViewRepresentable {
    @Binding var text: String
    @Binding var activeScreenplayElement: ScreenplayEditorElement
    @Binding var insertionRequest: ScreenplayInsertionRequest?
    @Binding var lineJumpRequest: ScreenplayLineJumpRequest?
    @Binding var lineHighlightRequest: ScreenplayLineHighlightRequest?
    @Binding var anchoredTextRectRequest: ScreenplayAnchoredTextRectRequest?
    @Binding var anchoredTextRectSnapshot: ScreenplayAnchoredTextRectSnapshot?
    @Binding var editorFocusRequest: ScreenplayEditorFocusRequest?
    @Binding var editorActionRequest: ScreenplayEditorActionRequest?
    @Binding var editorSelection: ScreenplayEditorSelectionSnapshot?
    @Binding var currentCursorLine: Int
    @Binding var lastCommittedWrite: ScreenplayCommittedWrite?
    @Binding var pendingReplacementTarget: ScreenplayPendingReplacementTarget?
    @Binding var submittedReplacementTarget: ScreenplayPendingReplacementTarget?
    var onUserEdit: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = true
        scrollView.backgroundColor = .white
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.borderType = .noBorder
        scrollView.contentView.postsBoundsChangedNotifications = true

        let textView = HollywoodScreenplayTextView()
        textView.isRichText = false
        textView.isEditable = true
        textView.isSelectable = true
        textView.allowsUndo = true
        textView.usesAdaptiveColorMappingForDarkAppearance = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDataDetectionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isHorizontallyResizable = false
        textView.isVerticallyResizable = true
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.font = hollywoodScreenplayEditorFont()
        textView.textColor = .black
        textView.insertionPointColor = .black
        textView.backgroundColor = .white
        textView.drawsBackground = true
        textView.textContainerInset = NSSize(
            width: ScreenplayStackMetrics.editorTextInsetHorizontal,
            height: ScreenplayStackMetrics.editorTextInsetVertical
        )
        textView.selectedTextAttributes = [
            .backgroundColor: NSColor.systemBlue.withAlphaComponent(0.18),
            .foregroundColor: NSColor.black,
        ]
        textView.typingAttributes = [
            .font: hollywoodScreenplayEditorFont(),
            .foregroundColor: NSColor.black,
        ]
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.containerSize = NSSize(
            width: scrollView.contentSize.width,
            height: CGFloat.greatestFiniteMagnitude
        )
        textView.textContainer?.lineFragmentPadding = 0
        textView.string = text
        textView.draftProvider = { textView.string }
        textView.onElementShortcut = { element in
            context.coordinator.applyShortcutElement(element)
        }
        textView.delegate = context.coordinator
        context.coordinator.primeParagraphElements(
            for: textView.string,
            attributedText: textView.attributedString()
        )

        scrollView.documentView = textView
        context.coordinator.bindScrollView(scrollView)
        context.coordinator.textView = textView
        context.coordinator.refreshScreenplayPresentationAndTyping()
        return scrollView
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let textView = nsView.documentView as? NSTextView else { return }
        let previousPendingID = context.coordinator.parent.pendingReplacementTarget?.id
        let previousSubmittedID = context.coordinator.parent.submittedReplacementTarget?.id
        let previousInsertionID = context.coordinator.parent.insertionRequest?.id
        context.coordinator.parent = self
        let currentPendingID = pendingReplacementTarget?.id
        let currentSubmittedID = submittedReplacementTarget?.id
        let currentInsertionID = insertionRequest?.id
        if previousPendingID != currentPendingID ||
            previousSubmittedID != currentSubmittedID ||
            previousInsertionID != currentInsertionID {
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: "update-parent-sync",
                target: submittedReplacementTarget ?? pendingReplacementTarget,
                detail: "Synced representable parent. pending=\(previousPendingID?.uuidString.lowercased() ?? "nil")->\(currentPendingID?.uuidString.lowercased() ?? "nil") submitted=\(previousSubmittedID?.uuidString.lowercased() ?? "nil")->\(currentSubmittedID?.uuidString.lowercased() ?? "nil") insertion=\(previousInsertionID?.uuidString.lowercased() ?? "nil")->\(currentInsertionID?.uuidString.lowercased() ?? "nil")"
            )
        }
        context.coordinator.textView = textView
        context.coordinator.bindScrollView(nsView)
        if let hollywoodTextView = textView as? HollywoodScreenplayTextView {
            hollywoodTextView.draftProvider = { hollywoodTextView.string }
            hollywoodTextView.onElementShortcut = { element in
                context.coordinator.applyShortcutElement(element)
            }
        }

        if context.coordinator.lastKnownActiveElement != activeScreenplayElement {
            context.coordinator.applyActiveElementFromBinding(activeScreenplayElement)
        }

        if !context.coordinator.isApplyingProgrammaticChange, textView.string != text {
            let previousSelection = textView.selectedRange()
            context.coordinator.isApplyingProgrammaticChange = true
            textView.string = text
            let cappedLocation = min(previousSelection.location, (text as NSString).length)
            textView.setSelectedRange(NSRange(location: cappedLocation, length: 0))
            context.coordinator.isApplyingProgrammaticChange = false
            context.coordinator.refreshScreenplayPresentationAndTyping()
            context.coordinator.updateCurrentCursorLine()
            context.coordinator.refreshAnchoredTextRectSnapshot()
        }

        if let request = insertionRequest,
           request.id != context.coordinator.lastAppliedInsertionID {
            context.coordinator.applyInsertion(request)
        }

        if let jump = lineJumpRequest,
           jump.id != context.coordinator.lastAppliedLineJumpID {
            context.coordinator.applyLineJump(jump)
        }

        if let highlight = lineHighlightRequest,
           highlight.id != context.coordinator.lastAppliedLineHighlightID {
            context.coordinator.applyLineHighlight(highlight)
        }

        if let anchored = anchoredTextRectRequest,
           anchored.id != context.coordinator.lastAppliedAnchoredTextRectRequestID {
            context.coordinator.applyAnchoredTextRectRequest(anchored)
        } else if anchoredTextRectRequest == nil,
                  context.coordinator.activeAnchoredTextRectRequest != nil {
            context.coordinator.clearAnchoredTextRectRequest()
        }

        if let focus = editorFocusRequest,
           focus.id != context.coordinator.lastAppliedEditorFocusID {
            context.coordinator.applyEditorFocus(focus)
        }

        if let action = editorActionRequest,
           action.id != context.coordinator.lastAppliedEditorActionID {
            context.coordinator.applyEditorAction(action)
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: MacCursorInsertTextEditor
        weak var textView: NSTextView?
        var lastKnownActiveElement: ScreenplayEditorElement
        var isApplyingProgrammaticChange = false
        var lastAppliedInsertionID: UUID?
        var lastAppliedLineJumpID: UUID?
        var lastAppliedLineHighlightID: UUID?
        var lastAppliedEditorFocusID: UUID?
        var lastAppliedEditorActionID: UUID?
        var streamingPreviewRange: NSRange?
        var streamingPreviewOriginalSelection: NSRange = NSRange(location: 0, length: 0)
        var streamingPreviewOriginalText: String = ""
        var streamingPreviewPrefix: String = ""
        var streamingPreviewSuffix: String = ""
        var streamingPreviewBaseText: String = ""
        var streamingInsertRange: NSRange?
        var streamingInsertPrefix: String = ""
        var streamingInsertSuffix: String = ""
        var streamingInsertBaseText: String = ""
        var commitHighlightRange: NSRange?
        var commitHighlightWorkItem: DispatchWorkItem?
        weak var scrollView: NSScrollView?
        var boundsObserver: NSObjectProtocol?
        var lastAppliedAnchoredTextRectRequestID: UUID?
        var activeAnchoredTextRectRequest: ScreenplayAnchoredTextRectRequest?
        var explicitCurrentLineElement: ScreenplayEditorElement?
        var explicitCurrentLineLocation: Int?
        var paragraphElements: [ScreenplayEditorElement?] = []
        var lastKnownTextSnapshot: String

        init(_ parent: MacCursorInsertTextEditor) {
            self.parent = parent
            self.lastKnownActiveElement = parent.activeScreenplayElement
            self.lastKnownTextSnapshot = parent.text
        }

        deinit {
            if let boundsObserver {
                NotificationCenter.default.removeObserver(boundsObserver)
            }
        }

        func bindScrollView(_ scrollView: NSScrollView) {
            guard self.scrollView !== scrollView else { return }
            if let boundsObserver {
                NotificationCenter.default.removeObserver(boundsObserver)
                self.boundsObserver = nil
            }
            self.scrollView = scrollView
            boundsObserver = NotificationCenter.default.addObserver(
                forName: NSView.boundsDidChangeNotification,
                object: scrollView.contentView,
                queue: .main
            ) { [weak self] _ in
                self?.refreshAnchoredTextRectSnapshot()
            }
        }

        func primeParagraphElements(for text: String, attributedText: NSAttributedString? = nil) {
            paragraphElements = bootstrapScreenplayParagraphElements(for: text, attributedText: attributedText)
            lastKnownTextSnapshot = text
            ScreenplayLiveDraftBridge.shared.syncStructuredDraftSnapshot(text: text, elements: paragraphElements)
        }

        private func synchronizeParagraphElementsWithCurrentText(in textView: NSTextView) {
            let nextText = textView.string
            let activeLineIndex = screenplayLineIndex(for: currentLineLocation(in: textView), in: nextText)
            paragraphElements = reconcileScreenplayParagraphElements(
                previousText: lastKnownTextSnapshot,
                nextText: nextText,
                previousElements: paragraphElements,
                activeLineIndex: activeLineIndex,
                explicitCurrentLineElement: explicitCurrentLineElement
            )
            lastKnownTextSnapshot = nextText
            ScreenplayLiveDraftBridge.shared.syncStructuredDraftSnapshot(text: nextText, elements: paragraphElements)
        }

        private func updateParagraphElementMetadata(
            _ element: ScreenplayEditorElement?,
            lineIndex: Int,
            in text: String
        ) {
            let lineCount = screenplayLineTexts(text).count
            if paragraphElements.count != lineCount {
                paragraphElements = reconcileScreenplayParagraphElements(
                    previousText: lastKnownTextSnapshot,
                    nextText: text,
                    previousElements: paragraphElements,
                    activeLineIndex: nil,
                    explicitCurrentLineElement: nil
                )
            }
            guard lineIndex >= 0, lineIndex < paragraphElements.count else {
                lastKnownTextSnapshot = text
                return
            }
            let trimmed = screenplayLineTexts(text)[lineIndex].trimmingCharacters(in: .whitespacesAndNewlines)
            paragraphElements[lineIndex] = trimmed.isEmpty ? nil : element
            lastKnownTextSnapshot = text
            ScreenplayLiveDraftBridge.shared.syncStructuredDraftSnapshot(text: text, elements: paragraphElements)
        }

        func textDidChange(_ notification: Notification) {
            guard !isApplyingProgrammaticChange else { return }
            guard let textView else { return }
            synchronizeParagraphElementsWithCurrentText(in: textView)
            normalizeCurrentLineIfNeeded(in: textView)
            syncActiveElementFromSelection()
            refreshScreenplayPresentationAndTyping()
            let next = textView.string
            if parent.text != next {
                parent.text = next
            }
            parent.onUserEdit?()
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard !isApplyingProgrammaticChange else { return }
            if let textView {
                clearExplicitCurrentLineOverrideIfNeeded(in: textView)
            }
            syncActiveElementFromSelection()
            refreshTypingAttributesOnly()
            updateCurrentCursorLine()
        }

        func textView(_ textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
            if commandSelector == #selector(NSResponder.insertTab(_:)) {
                cycleActiveElement(backward: false)
                return true
            }
            if commandSelector == #selector(NSResponder.insertBacktab(_:)) {
                cycleActiveElement(backward: true)
                return true
            }
            if commandSelector == #selector(NSResponder.insertNewline(_:)) {
                handleInsertNewline(in: textView)
                return true
            }
            return false
        }

        func applyInsertion(_ request: ScreenplayInsertionRequest) {
            switch request.mode {
            case .insert:
                applyStandardInsertion(request)
            case .streamPreview:
                applyStreamingPreview(request)
            case .streamCommit:
                applyStreamingCommit(request)
            case .streamCancel:
                cancelStreamingPreview()
                lastAppliedInsertionID = request.id
                DispatchQueue.main.async {
                    if self.parent.insertionRequest?.id == request.id {
                        self.parent.insertionRequest = nil
                    }
                }
            case .streamInsertProgress:
                applyStreamingInsertProgress(request)
            case .streamInsertFinalize:
                finalizeStreamingInsert(request)
            case .streamInsertCancel:
                cancelStreamingInsert()
                lastAppliedInsertionID = request.id
                DispatchQueue.main.async {
                    if self.parent.insertionRequest?.id == request.id {
                        self.parent.insertionRequest = nil
                    }
                }
            }
        }

        func applyLineJump(_ request: ScreenplayLineJumpRequest) {
            guard let textView else { return }
            let targetLine = max(1, request.line)
            let content = textView.string
            let targetRange = rangeForLine(targetLine, in: content)
            let location = targetRange.location
            textView.setSelectedRange(NSRange(location: location, length: 0))
            textView.scrollRangeToVisible(targetRange)
            parent.currentCursorLine = targetLine
            refreshAnchoredTextRectSnapshot()
            lastAppliedLineJumpID = request.id
            DispatchQueue.main.async {
                if self.parent.lineJumpRequest?.id == request.id {
                    self.parent.lineJumpRequest = nil
                }
            }
        }

        func applyLineHighlight(_ request: ScreenplayLineHighlightRequest) {
            guard let textView else { return }
            let content = textView.string
            let highlightRange = rangeForLines(
                startLine: request.startLine,
                endLine: request.endLine,
                in: content
            )
            applyCommitHighlight(highlightRange, in: textView, contentLength: (content as NSString).length)
            lastAppliedLineHighlightID = request.id
            DispatchQueue.main.async {
                if self.parent.lineHighlightRequest?.id == request.id {
                    self.parent.lineHighlightRequest = nil
                }
            }
        }

        func applyAnchoredTextRectRequest(_ request: ScreenplayAnchoredTextRectRequest) {
            activeAnchoredTextRectRequest = request
            lastAppliedAnchoredTextRectRequestID = request.id
            refreshAnchoredTextRectSnapshot()
        }

        func clearAnchoredTextRectRequest() {
            activeAnchoredTextRectRequest = nil
            lastAppliedAnchoredTextRectRequestID = nil
            DispatchQueue.main.async {
                self.parent.anchoredTextRectSnapshot = nil
            }
        }

        func applyEditorFocus(_ request: ScreenplayEditorFocusRequest) {
            guard let textView else { return }
            textView.window?.makeFirstResponder(textView)
            textView.scrollRangeToVisible(textView.selectedRange())
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
            lastAppliedEditorFocusID = request.id
            DispatchQueue.main.async {
                if self.parent.editorFocusRequest?.id == request.id {
                    self.parent.editorFocusRequest = nil
                }
            }
        }

        func applyEditorAction(_ request: ScreenplayEditorActionRequest) {
            guard let textView else { return }
            textView.window?.makeFirstResponder(textView)
            switch request.action {
            case .undo:
                textView.undoManager?.undo()
            case .redo:
                textView.undoManager?.redo()
            }
            synchronizeParagraphElementsWithCurrentText(in: textView)
            syncActiveElementFromSelection()
            refreshScreenplayPresentationAndTyping()
            let next = textView.string
            if parent.text != next {
                parent.text = next
            }
            parent.onUserEdit?()
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
            lastAppliedEditorActionID = request.id
            DispatchQueue.main.async {
                if self.parent.editorActionRequest?.id == request.id {
                    self.parent.editorActionRequest = nil
                }
            }
        }

        func updateCurrentCursorLine() {
            guard let textView else { return }
            let line = lineNumber(for: textView.selectedRange().location, in: textView.string)
            if parent.currentCursorLine != line {
                parent.currentCursorLine = line
            }
            refreshEditorSelectionSnapshot()
        }

        private func refreshEditorSelectionSnapshot() {
            guard let textView else { return }
            let snapshot = selectionSnapshot(in: textView)
            if parent.editorSelection != snapshot {
                parent.editorSelection = snapshot
            }
        }

        func applyShortcutElement(_ element: ScreenplayEditorElement) {
            guard let textView else { return }
            applyActiveElement(element)
            setExplicitCurrentLineOverride(element, in: textView)
            applyParagraphNormalizationIfNeeded(for: element, in: textView)
            refreshScreenplayPresentationAndTyping()
        }

        func applyActiveElementFromBinding(_ element: ScreenplayEditorElement) {
            guard textView != nil else {
                lastKnownActiveElement = element
                return
            }
            applyActiveElement(element)
            if let textView {
                setExplicitCurrentLineOverride(element, in: textView)
                applyParagraphNormalizationIfNeeded(for: element, in: textView)
            }
            refreshScreenplayPresentationAndTyping()
        }

        private func applyActiveElement(_ element: ScreenplayEditorElement) {
            lastKnownActiveElement = element
            if parent.activeScreenplayElement != element {
                parent.activeScreenplayElement = element
            }
        }

        private func cycleActiveElement(backward: Bool) {
            let next = backward
                ? parent.activeScreenplayElement.screenplayTabBackward
                : parent.activeScreenplayElement.screenplayTabForward
            applyShortcutElement(next)
        }

        private func handleInsertNewline(in textView: NSTextView) {
            let initialContext = currentLineContext(in: textView)
            applyParagraphNormalizationIfNeeded(for: initialContext.currentElement, in: textView)
            let context = currentLineContext(in: textView)
            isApplyingProgrammaticChange = true
            textView.insertNewline(nil)
            isApplyingProgrammaticChange = false
            let nextElement = ScreenplayEditorElement.nextElementAfterReturn(
                currentLine: context.lineText,
                currentElement: context.currentElement,
                previousElementBeforeCurrentLine: context.previousElement
            )
            applyActiveElement(nextElement)
            setExplicitCurrentLineOverride(nextElement, in: textView)
            refreshScreenplayPresentationAndTyping()

            let next = textView.string
            if parent.text != next {
                parent.text = next
            }
            parent.onUserEdit?()
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
        }

        private func syncActiveElementFromSelection() {
            guard let textView else { return }
            let context = currentLineContext(in: textView)
            let nextElement: ScreenplayEditorElement
            if context.lineText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                nextElement = ScreenplayEditorElement.nextElementAfterReturn(
                    currentLine: context.lineText,
                    currentElement: parent.activeScreenplayElement,
                    previousElementBeforeCurrentLine: context.previousElement
                )
            } else {
                nextElement = context.currentElement
            }
            applyActiveElement(nextElement)
        }

        func refreshScreenplayPresentationAndTyping() {
            applyScreenplayParagraphStyles()
            refreshTypingAttributesOnly()
        }

        private func refreshTypingAttributesOnly() {
            guard let textView else { return }
            let containerWidth = max(textView.textContainer?.size.width ?? 560, 420)
            let context = currentLineContext(in: textView)
            let paragraphStyle = screenplayParagraphStyle(
                for: parent.activeScreenplayElement,
                previousElement: context.previousElement,
                nextElement: nil,
                containerWidth: containerWidth
            )
            textView.typingAttributes = [
                .font: hollywoodScreenplayEditorFont(),
                .foregroundColor: NSColor.black,
                .paragraphStyle: paragraphStyle,
            ]
        }

        private func applyScreenplayParagraphStyles() {
            guard let textView, let textStorage = textView.textStorage else { return }
            let fullText = textView.string
            synchronizeParagraphElementsWithCurrentText(in: textView)
            let containerWidth = max(textView.textContainer?.size.width ?? 560, 420)
            applyScreenplayParagraphAttributes(
                to: textStorage,
                fullText: fullText,
                elements: paragraphElements,
                containerWidth: containerWidth,
                font: hollywoodScreenplayEditorFont(),
                foregroundColor: NSColor.black
            )
        }

        private func normalizeCurrentLineIfNeeded(in textView: NSTextView) {
            let context = currentLineContext(in: textView)
            guard shouldNormalizeScreenplayLineDuringTyping(context.lineText, as: context.currentElement) else {
                return
            }
            let normalized = normalizedLineText(
                for: context.lineText,
                currentElement: context.currentElement
            )
            guard normalized != context.lineText else { return }

            let selection = textView.selectedRange()
            let offsetIntoLine = max(0, selection.location - context.lineRange.location)
            let originalLength = (context.lineText as NSString).length
            let nextLength = (normalized as NSString).length
            let adjustedLocation = min(context.lineRange.location + min(offsetIntoLine, nextLength), (textView.string as NSString).length - originalLength + nextLength)

            isApplyingProgrammaticChange = true
            textView.textStorage?.replaceCharacters(in: context.lineRange, with: normalized)
            textView.setSelectedRange(NSRange(location: adjustedLocation, length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = textView.string
        }

        private func applyParagraphNormalizationIfNeeded(for element: ScreenplayEditorElement, in textView: NSTextView) {
            let context = currentLineContext(in: textView)
            guard !context.lineText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            let normalized = normalizedLineText(for: context.lineText, currentElement: element, forceParentheticalWrapping: true)
            guard normalized != context.lineText else { return }

            let selection = textView.selectedRange()
            let offsetIntoLine = max(0, selection.location - context.lineRange.location)
            let nextLength = (normalized as NSString).length

            isApplyingProgrammaticChange = true
            textView.textStorage?.replaceCharacters(in: context.lineRange, with: normalized)
            textView.setSelectedRange(NSRange(location: context.lineRange.location + min(offsetIntoLine, nextLength), length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = textView.string
            parent.onUserEdit?()
        }

        private func normalizedLineText(
            for lineText: String,
            currentElement: ScreenplayEditorElement,
            forceParentheticalWrapping: Bool = false
        ) -> String {
            let trimmed = lineText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return lineText }

            let effectiveElement: ScreenplayEditorElement =
                forceParentheticalWrapping && currentElement == .parenthetical
                ? .parenthetical
                : currentElement

            return FountainFormatter.normalizeEditorLine(
                trimmed,
                as: effectiveElement,
                existingDraft: parent.text
            )
        }

        private func currentLineContext(in textView: NSTextView) -> (lineRange: NSRange, lineText: String, currentElement: ScreenplayEditorElement, previousElement: ScreenplayEditorElement?) {
            let content = textView.string
            let ns = content as NSString
            let selection = clampedSelection(from: textView.selectedRange(), maxLength: ns.length)
            let details = screenplayCurrentLineDetails(for: selection.location, in: content)
            let previousElement = screenplayPreviousFlowElement(before: details.lineIndex, in: paragraphElements)
            let storedElement = details.lineIndex < paragraphElements.count ? paragraphElements[details.lineIndex] : nil
            let currentElement: ScreenplayEditorElement
            if details.lineText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                currentElement = ScreenplayEditorElement.nextElementAfterReturn(
                    currentLine: details.lineText,
                    currentElement: parent.activeScreenplayElement,
                    previousElementBeforeCurrentLine: previousElement
                )
            } else if let storedElement {
                currentElement = storedElement
            } else {
                currentElement = ScreenplayEditorElement.inferredElement(
                    for: details.lineText,
                    previousElement: previousElement
                )
            }
            return (details.lineRange, details.lineText, currentElement, previousElement)
        }

        private func setExplicitCurrentLineOverride(_ element: ScreenplayEditorElement, in textView: NSTextView) {
            explicitCurrentLineElement = element
            explicitCurrentLineLocation = currentLineLocation(in: textView)
            let lineIndex = screenplayLineIndex(for: explicitCurrentLineLocation ?? 0, in: textView.string)
            updateParagraphElementMetadata(element, lineIndex: lineIndex, in: textView.string)
        }

        private func clearExplicitCurrentLineOverrideIfNeeded(in textView: NSTextView) {
            guard let explicitCurrentLineLocation else { return }
            guard currentLineLocation(in: textView) != explicitCurrentLineLocation else { return }
            explicitCurrentLineElement = nil
            self.explicitCurrentLineLocation = nil
        }

        private func currentLineLocation(in textView: NSTextView) -> Int {
            let content = textView.string as NSString
            let selection = clampedSelection(from: textView.selectedRange(), maxLength: content.length)
            let safeLocation = max(0, min(selection.location, content.length))
            return content.lineRange(for: NSRange(location: safeLocation, length: 0)).location
        }

        private func rangeForLine(_ line: Int, in content: String) -> NSRange {
            let ns = content as NSString
            let length = ns.length
            if length <= 0 {
                return NSRange(location: 0, length: 0)
            }
            var currentLine = 1
            var cursor = 0
            while cursor < length && currentLine < line {
                let next = ns.range(of: "\n", options: [], range: NSRange(location: cursor, length: length - cursor))
                if next.location == NSNotFound {
                    return NSRange(location: length, length: 0)
                }
                cursor = next.location + 1
                currentLine += 1
            }
            let nextBreak = ns.range(of: "\n", options: [], range: NSRange(location: cursor, length: length - cursor))
            if nextBreak.location == NSNotFound {
                return NSRange(location: cursor, length: max(0, length - cursor))
            }
            return NSRange(location: cursor, length: max(0, nextBreak.location - cursor))
        }

        private func selectionSnapshot(in textView: NSTextView) -> ScreenplayEditorSelectionSnapshot? {
            let content = textView.string
            let ns = content as NSString
            let selection = clampedSelection(from: textView.selectedRange(), maxLength: ns.length)
            guard selection.length > 0 else { return nil }
            let selectedText = ns.substring(with: selection)
            let trimmed = selectedText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            let startLine = lineNumber(for: selection.location, in: content)
            let selectionEndLocation = max(selection.location, selection.location + max(selection.length - 1, 0))
            let endLine = lineNumber(for: selectionEndLocation, in: content)
            return ScreenplayEditorSelectionSnapshot(
                location: selection.location,
                length: selection.length,
                startLine: startLine,
                endLine: endLine,
                text: selectedText,
                sceneLabel: ScreenplayLiveDraftBridge.shared.currentSceneLabel(atOrBeforeLine: startLine)
            )
        }

        private func rangeForLines(startLine: Int, endLine: Int, in content: String) -> NSRange {
            let startRange = rangeForLine(max(1, startLine), in: content)
            let endRange = rangeForLine(max(startLine, endLine), in: content)
            let startLocation = startRange.location
            let endLocation = endRange.location + max(0, endRange.length)
            return NSRange(location: startLocation, length: max(0, endLocation - startLocation))
        }

        private func lineNumber(for location: Int, in content: String) -> Int {
            let ns = content as NSString
            let safeLocation = max(0, min(location, ns.length))
            var line = 1
            var cursor = 0
            while cursor < safeLocation {
                let next = ns.range(of: "\n", options: [], range: NSRange(location: cursor, length: safeLocation - cursor))
                if next.location == NSNotFound || next.location >= safeLocation {
                    break
                }
                line += 1
                cursor = next.location + 1
            }
            return line
        }

        private func clampedSelection(from range: NSRange, maxLength: Int) -> NSRange {
            let location = max(0, min(range.location, maxLength))
            let maxLen = max(0, maxLength - location)
            let length = max(0, min(range.length, maxLen))
            return NSRange(location: location, length: length)
        }

        private func applyStandardInsertion(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let current = textView.string
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            let fallbackSelection = clampedSelection(from: textView.selectedRange(), maxLength: (current as NSString).length)
            let insertionContext = resolvedInsertionContext(
                raw: request.text,
                existing: current,
                fallbackSelection: fallbackSelection
            )
            let selection = insertionContext.selection
            let insertion = insertionContext.text
            guard !insertion.isEmpty else {
                lastAppliedInsertionID = request.id
                DispatchQueue.main.async {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "insert-empty-clear",
                        target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                        detail: "Insertion context produced no text."
                    )
                    self.parent.pendingReplacementTarget = nil
                    self.parent.submittedReplacementTarget = nil
                    if self.parent.insertionRequest?.id == request.id {
                        self.parent.insertionRequest = nil
                    }
                }
                return
            }

            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: selection, with: insertion)
            let nextText = String(mutable)
            let caretLocation = min(selection.location + (insertion as NSString).length, (nextText as NSString).length)
            let highlightRange = insertionContext.isReplacement
                ? NSRange(location: selection.location, length: (trimmed as NSString).length)
                : committedHighlightRange(
                    trimmedText: trimmed,
                    insertion: insertion,
                    selection: selection
                )
            let committedLines = committedLineRange(for: highlightRange, in: nextText)

            isApplyingProgrammaticChange = true
            textView.string = nextText
            textView.setSelectedRange(NSRange(location: caretLocation, length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            let replacementTarget = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: insertionContext.isReplacement ? "commit-standard-replacement" : "commit-standard-insert",
                target: replacementTarget,
                detail: "Applied standard insertion."
            )
            parent.lastCommittedWrite = ScreenplayCommittedWrite(
                id: request.id,
                writeID: request.id.uuidString.lowercased(),
                previousDraft: current,
                committedDraft: nextText,
                insertedText: trimmed,
                replacementApplied: insertionContext.isReplacement,
                replacedWriteID: replacementTarget?.sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? replacementTarget?.sourceWriteID
                    : nil,
                startLine: committedLines.start,
                endLine: committedLines.end,
                committedAt: Date()
            )
            updateCurrentCursorLine()
            applyCommitHighlight(highlightRange, in: textView, contentLength: (nextText as NSString).length)
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "commit-standard-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Clearing replacement targets after standard insertion."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func applyStreamingPreview(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let current = textView.string
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }

            let previewText: String
            let replacementRange: NSRange

            if let existingRange = streamingPreviewRange {
                replacementRange = existingRange
                previewText = streamingPreviewPrefix + trimmed + streamingPreviewSuffix
            } else {
                let selection = clampedSelection(from: textView.selectedRange(), maxLength: (current as NSString).length)
                let replacementContext = resolvedReplacementContext(
                    existing: current,
                    fallbackSelection: selection
                )
                streamingPreviewBaseText = current
                let affixes: (prefix: String, suffix: String)
                if replacementContext.isReplacement {
                    affixes = ("", "")
                } else {
                    affixes = insertionAffixes(existing: current, selection: replacementContext.range)
                }
                streamingPreviewOriginalSelection = replacementContext.range
                streamingPreviewOriginalText = replacementContext.range.length > 0
                    ? (current as NSString).substring(with: replacementContext.range)
                    : ""
                streamingPreviewPrefix = affixes.prefix
                streamingPreviewSuffix = affixes.suffix
                replacementRange = replacementContext.range
                previewText = affixes.prefix + trimmed + affixes.suffix
            }

            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: previewText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (previewText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)

            isApplyingProgrammaticChange = true
            textView.string = nextText
            textView.setSelectedRange(NSRange(location: caretLocation, length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            updateCurrentCursorLine()
            streamingPreviewRange = nextRange
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func applyStreamingCommit(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                cancelStreamingPreview()
                return
            }

            if streamingPreviewRange == nil {
                applyStandardInsertion(ScreenplayInsertionRequest(id: request.id, text: request.text, mode: .insert))
                resetStreamingPreviewState()
                return
            }

            let current = textView.string
            guard let replacementRange = streamingPreviewRange else { return }
            let previewText = streamingPreviewPrefix + trimmed + streamingPreviewSuffix
            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: previewText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (previewText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)
            let highlightRange = NSRange(
                location: replacementRange.location + (streamingPreviewPrefix as NSString).length,
                length: (trimmed as NSString).length
            )
            let committedLines = committedLineRange(for: highlightRange, in: nextText)

            isApplyingProgrammaticChange = true
            textView.string = nextText
            textView.setSelectedRange(NSRange(location: caretLocation, length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            let replacementTarget = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: replacementTarget != nil ? "commit-stream-replacement" : "commit-stream-insert",
                target: replacementTarget,
                detail: "Applied streaming commit."
            )
            parent.lastCommittedWrite = ScreenplayCommittedWrite(
                id: request.id,
                writeID: request.id.uuidString.lowercased(),
                previousDraft: streamingPreviewBaseText.isEmpty ? current : streamingPreviewBaseText,
                committedDraft: nextText,
                insertedText: trimmed,
                replacementApplied: replacementTarget != nil,
                replacedWriteID: replacementTarget?.sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? replacementTarget?.sourceWriteID
                    : nil,
                startLine: committedLines.start,
                endLine: committedLines.end,
                committedAt: Date()
            )
            updateCurrentCursorLine()
            applyCommitHighlight(highlightRange, in: textView, contentLength: (nextText as NSString).length)
            resetStreamingPreviewState()
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "commit-stream-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Clearing replacement targets after streaming commit."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func applyStreamingInsertProgress(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }

            if streamingPreviewRange != nil {
                cancelStreamingPreview()
            }

            let current = textView.string
            let replacementRange: NSRange
            let renderedText: String

            if let existingRange = streamingInsertRange {
                replacementRange = existingRange
                renderedText = streamingInsertPrefix + trimmed + streamingInsertSuffix
            } else {
                let selection = clampedSelection(from: textView.selectedRange(), maxLength: (current as NSString).length)
                let replacementContext = resolvedReplacementContext(
                    existing: current,
                    fallbackSelection: selection
                )
                streamingInsertBaseText = current
                let affixes: (prefix: String, suffix: String)
                if replacementContext.isReplacement {
                    affixes = ("", "")
                } else {
                    affixes = insertionAffixes(existing: current, selection: replacementContext.range)
                }
                streamingInsertPrefix = affixes.prefix
                streamingInsertSuffix = affixes.suffix
                replacementRange = replacementContext.range
                renderedText = affixes.prefix + trimmed + affixes.suffix
            }

            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: renderedText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (renderedText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)

            isApplyingProgrammaticChange = true
            textView.string = nextText
            textView.setSelectedRange(NSRange(location: caretLocation, length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            updateCurrentCursorLine()
            streamingInsertRange = nextRange
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func finalizeStreamingInsert(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                cancelStreamingInsert()
                return
            }

            if streamingInsertRange == nil {
                applyStandardInsertion(ScreenplayInsertionRequest(id: request.id, text: request.text, mode: .insert))
                resetStreamingInsertState()
                return
            }

            let current = textView.string
            guard let replacementRange = streamingInsertRange else { return }
            let finalText = streamingInsertPrefix + trimmed + streamingInsertSuffix
            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: finalText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (finalText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)
            let highlightRange = NSRange(
                location: replacementRange.location + (streamingInsertPrefix as NSString).length,
                length: (trimmed as NSString).length
            )
            let committedLines = committedLineRange(for: highlightRange, in: nextText)

            isApplyingProgrammaticChange = true
            textView.string = nextText
            textView.setSelectedRange(NSRange(location: caretLocation, length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            let replacementTarget = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: replacementTarget != nil ? "commit-streaming-lines-replacement" : "commit-streaming-lines-insert",
                target: replacementTarget,
                detail: "Applied streamed line insertion."
            )
            parent.lastCommittedWrite = ScreenplayCommittedWrite(
                id: request.id,
                writeID: request.id.uuidString.lowercased(),
                previousDraft: streamingInsertBaseText.isEmpty ? current : streamingInsertBaseText,
                committedDraft: nextText,
                insertedText: trimmed,
                replacementApplied: replacementTarget != nil,
                replacedWriteID: replacementTarget?.sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? replacementTarget?.sourceWriteID
                    : nil,
                startLine: committedLines.start,
                endLine: committedLines.end,
                committedAt: Date()
            )
            updateCurrentCursorLine()
            applyCommitHighlight(highlightRange, in: textView, contentLength: (nextText as NSString).length)
            resetStreamingInsertState()
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "commit-streaming-lines-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Clearing replacement targets after streamed line insertion."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func cancelStreamingPreview() {
            guard let textView, let previewRange = streamingPreviewRange else { return }
            let current = textView.string
            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: previewRange, with: streamingPreviewOriginalText)
            let nextText = String(mutable)
            let caretLocation = min(
                streamingPreviewOriginalSelection.location + (streamingPreviewOriginalText as NSString).length,
                (nextText as NSString).length
            )

            isApplyingProgrammaticChange = true
            textView.string = nextText
            textView.setSelectedRange(NSRange(location: caretLocation, length: 0))
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            updateCurrentCursorLine()
            resetStreamingPreviewState()
            refreshAnchoredTextRectSnapshot()
            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "stream-cancel-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Cancelled streaming preview and cleared replacement targets."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
            }
        }

        private func cancelStreamingInsert() {
            resetStreamingInsertState()
        }

        private func resetStreamingPreviewState() {
            streamingPreviewRange = nil
            streamingPreviewOriginalSelection = NSRange(location: 0, length: 0)
            streamingPreviewOriginalText = ""
            streamingPreviewPrefix = ""
            streamingPreviewSuffix = ""
            streamingPreviewBaseText = ""
        }

        private func resetStreamingInsertState() {
            streamingInsertRange = nil
            streamingInsertPrefix = ""
            streamingInsertSuffix = ""
            streamingInsertBaseText = ""
        }

        private func committedHighlightRange(
            trimmedText: String,
            insertion: String,
            selection: NSRange
        ) -> NSRange {
            let insertedLength = (insertion as NSString).length
            let trimmedLength = (trimmedText as NSString).length
            if trimmedLength <= 0 { return NSRange(location: selection.location, length: 0) }
            let leadingWhitespaceLength = max(0, insertedLength - trimmedLength - trailingWhitespaceLength(insertion))
            return NSRange(
                location: selection.location + leadingWhitespaceLength,
                length: trimmedLength
            )
        }

        private func trailingWhitespaceLength(_ text: String) -> Int {
            let scalars = Array(text.unicodeScalars)
            var count = 0
            for scalar in scalars.reversed() {
                if CharacterSet.whitespacesAndNewlines.contains(scalar) {
                    count += 1
                } else {
                    break
                }
            }
            return count
        }

        private func committedLineRange(for range: NSRange, in text: String) -> (start: Int, end: Int) {
            let safeText = text as NSString
            let maxLength = safeText.length
            let safeLocation = max(0, min(range.location, maxLength))
            let safeEnd = max(safeLocation, min(range.location + range.length, maxLength))
            let start = lineNumber(at: safeLocation, in: text)
            let end = lineNumber(at: safeEnd, in: text)
            return (start, max(start, end))
        }

        private func lineNumber(at location: Int, in text: String) -> Int {
            let safeText = text as NSString
            let maxLength = safeText.length
            let safeLocation = max(0, min(location, maxLength))
            let prefix = safeText.substring(to: safeLocation)
            return max(1, prefix.reduce(into: 1) { count, character in
                if character == "\n" { count += 1 }
            })
        }

        private func applyCommitHighlight(_ range: NSRange, in textView: NSTextView, contentLength: Int) {
            clearCommitHighlight(in: textView)
            guard let textStorage = textView.textStorage else { return }
            let safeLocation = max(0, min(range.location, contentLength))
            let safeLength = max(0, min(range.length, contentLength - safeLocation))
            guard safeLength > 0 else { return }
            let safeRange = NSRange(location: safeLocation, length: safeLength)
            textStorage.addAttribute(
                .backgroundColor,
                value: NSColor.systemGreen.withAlphaComponent(0.16),
                range: safeRange
            )
            commitHighlightRange = safeRange

            let workItem = DispatchWorkItem { [weak self, weak textView] in
                guard let self, let textView else { return }
                self.clearCommitHighlight(in: textView)
            }
            commitHighlightWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.35, execute: workItem)
        }

        private func clearCommitHighlight(in textView: NSTextView) {
            commitHighlightWorkItem?.cancel()
            commitHighlightWorkItem = nil
            guard let textStorage = textView.textStorage,
                  let range = commitHighlightRange else {
                commitHighlightRange = nil
                return
            }
            let maxLength = textStorage.length
            guard maxLength > 0 else {
                commitHighlightRange = nil
                return
            }
            let safeLocation = max(0, min(range.location, maxLength))
            let safeLength = max(0, min(range.length, maxLength - safeLocation))
            if safeLength > 0 {
                textStorage.removeAttribute(.backgroundColor, range: NSRange(location: safeLocation, length: safeLength))
            }
            commitHighlightRange = nil
        }

        func refreshAnchoredTextRectSnapshot() {
            guard let request = activeAnchoredTextRectRequest,
                  let textView,
                  let layoutManager = textView.layoutManager,
                  let textContainer = textView.textContainer,
                  let scrollView = scrollView ?? textView.enclosingScrollView else {
                DispatchQueue.main.async {
                    self.parent.anchoredTextRectSnapshot = nil
                }
                return
            }

            let content = textView.string
            let nsContent = content as NSString
            guard nsContent.length > 0 else {
                DispatchQueue.main.async {
                    self.parent.anchoredTextRectSnapshot = nil
                }
                return
            }

            var characterRange = rangeForLines(
                startLine: request.startLine,
                endLine: request.endLine,
                in: content
            )
            if characterRange.length <= 0 {
                let safeLocation = max(0, min(characterRange.location, max(0, nsContent.length - 1)))
                characterRange = NSRange(
                    location: safeLocation,
                    length: min(1, max(0, nsContent.length - safeLocation))
                )
            }

            var glyphRange = layoutManager.glyphRange(forCharacterRange: characterRange, actualCharacterRange: nil)
            if glyphRange.length <= 0, layoutManager.numberOfGlyphs > 0 {
                let safeGlyph = max(0, min(glyphRange.location, max(0, layoutManager.numberOfGlyphs - 1)))
                glyphRange = NSRange(
                    location: safeGlyph,
                    length: min(1, max(0, layoutManager.numberOfGlyphs - safeGlyph))
                )
            }
            guard glyphRange.length > 0 else {
                DispatchQueue.main.async {
                    self.parent.anchoredTextRectSnapshot = nil
                }
                return
            }

            var rect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)
            rect.origin.x += textView.textContainerInset.width
            rect.origin.y += textView.textContainerInset.height
            rect.size.height = max(rect.height, (textView.font?.pointSize ?? 13) + 8)

            let clipView = scrollView.contentView
            let rectInClip = textView.convert(rect, to: clipView)
            let snapshot = ScreenplayAnchoredTextRectSnapshot(
                requestID: request.id,
                startLine: request.startLine,
                endLine: request.endLine,
                rect: rectInClip.integral,
                visibleRect: clipView.bounds.integral
            )
            DispatchQueue.main.async {
                self.parent.anchoredTextRectSnapshot = snapshot
            }
        }

        private func insertionAffixes(existing: String, selection: NSRange) -> (prefix: String, suffix: String) {
            guard !existing.isEmpty else { return ("", "") }

            let ns = existing as NSString
            let start = selection.location
            let end = selection.location + selection.length

            let before = start > 0 ? ns.substring(with: NSRange(location: start - 1, length: 1)) : ""
            let after = end < ns.length ? ns.substring(with: NSRange(location: end, length: 1)) : ""

            let prefix: String
            if before.isEmpty || before == "\n" {
                prefix = before.isEmpty ? "" : "\n"
            } else {
                prefix = "\n\n"
            }

            let suffix: String
            if after.isEmpty || after == "\n" {
                suffix = after.isEmpty ? "" : "\n"
            } else {
                suffix = "\n\n"
            }

            return (prefix, suffix)
        }

        private func insertionText(for raw: String, existing: String, selection: NSRange) -> String {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return "" }
            guard !existing.isEmpty else { return trimmed }

            let affixes = insertionAffixes(existing: existing, selection: selection)
            return affixes.prefix + trimmed + affixes.suffix
        }

        private func resolvedReplacementContext(
            existing: String,
            fallbackSelection: NSRange
        ) -> (range: NSRange, isReplacement: Bool) {
            guard let target = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget else {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "resolve-miss-no-target",
                    target: nil,
                    detail: "No replacement target available during resolution."
                )
                return (fallbackSelection, false)
            }

            let ns = existing as NSString
            let candidateRange = clampedSelection(
                from: rangeForLines(startLine: target.startLine, endLine: target.endLine, in: existing),
                maxLength: ns.length
            )
            let cleanTarget = target.currentText.trimmingCharacters(in: .whitespacesAndNewlines)

            if candidateRange.length > 0 {
                let candidateText = ns.substring(with: candidateRange).trimmingCharacters(in: .whitespacesAndNewlines)
                if candidateText.caseInsensitiveCompare(cleanTarget) == .orderedSame {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "resolve-match-line-range",
                        target: target,
                        detail: "Matched replacement target using stored line range."
                    )
                    return (candidateRange, true)
                }
            }

            if !cleanTarget.isEmpty {
                let exactRange = ns.range(of: cleanTarget)
                if exactRange.location != NSNotFound {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "resolve-match-exact",
                        target: target,
                        detail: "Matched replacement target using exact text."
                    )
                    return (exactRange, true)
                }

                let caseInsensitiveRange = ns.range(
                    of: cleanTarget,
                    options: [.caseInsensitive]
                )
                if caseInsensitiveRange.location != NSNotFound {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "resolve-match-case-insensitive",
                        target: target,
                        detail: "Matched replacement target using case-insensitive text."
                    )
                    return (caseInsensitiveRange, true)
                }
            }

            if candidateRange.length > 0 {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "resolve-fallback-line-range",
                    target: target,
                    detail: "Fell back to stored line range without exact text match."
                )
                return (candidateRange, true)
            }

            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: "resolve-fallback-selection",
                target: target,
                detail: "Could not resolve replacement target; falling back to editor selection."
            )
            return (fallbackSelection, false)
        }

        private func resolvedInsertionContext(
            raw: String,
            existing: String,
            fallbackSelection: NSRange
        ) -> (selection: NSRange, text: String, isReplacement: Bool) {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return (fallbackSelection, "", false) }
            guard !existing.isEmpty else { return (fallbackSelection, trimmed, false) }

            let replacement = resolvedReplacementContext(existing: existing, fallbackSelection: fallbackSelection)
            if replacement.isReplacement {
                return (replacement.range, trimmed, true)
            }

            return (
                fallbackSelection,
                insertionText(for: raw, existing: existing, selection: fallbackSelection),
                false
            )
        }
    }
}
#endif

#if os(iOS)
private final class HollywoodScreenplayUITextView: UITextView {
    var draftProvider: () -> String = { "" }
    var onElementShortcut: ((ScreenplayEditorElement) -> Void)?
    var onCycleElement: ((Bool) -> Void)?

    override var keyCommands: [UIKeyCommand]? {
        let elements: [(String, ScreenplayEditorElement)] = [
            ("1", .sceneHeading),
            ("2", .action),
            ("3", .character),
            ("4", .dialogue),
            ("5", .parenthetical),
            ("6", .transition),
        ]
        let shortcutCommands = elements.flatMap { input, element in
            [
                Self.makeKeyCommand(
                    input: input,
                    modifierFlags: [.command],
                    action: #selector(handleScreenplayShortcut(_:)),
                    title: element.title
                ),
                Self.makeKeyCommand(
                    input: input,
                    modifierFlags: [.control],
                    action: #selector(handleScreenplayShortcut(_:)),
                    title: element.title
                )
            ]
        }
        let cycleCommands = [
            Self.makeKeyCommand(
                input: "\t",
                modifierFlags: [],
                action: #selector(handleCycleForward),
                title: "Next screenplay element"
            ),
            Self.makeKeyCommand(
                input: "\t",
                modifierFlags: [.shift],
                action: #selector(handleCycleBackward),
                title: "Previous screenplay element"
            ),
        ]
        return shortcutCommands + cycleCommands
    }

    override func paste(_ sender: Any?) {
        let pasted = UIPasteboard.general.string ?? ""
        guard !pasted.isEmpty else {
            super.paste(sender)
            return
        }

        let normalized = FountainFormatter.normalizePastedScreenplayBlock(
            pasted,
            existingDraft: draftProvider()
        )
        guard !normalized.isEmpty, normalized != pasted else {
            super.paste(sender)
            return
        }

        if let range = selectedTextRange {
            replace(range, withText: normalized)
        }
    }

    @objc
    private func handleScreenplayShortcut(_ sender: UIKeyCommand) {
        guard let input = sender.input,
              let element = Self.screenplayElementShortcut(for: input) else { return }
        onElementShortcut?(element)
    }

    @objc
    private func handleCycleForward() {
        onCycleElement?(false)
    }

    @objc
    private func handleCycleBackward() {
        onCycleElement?(true)
    }

    private static func screenplayElementShortcut(for key: String) -> ScreenplayEditorElement? {
        switch key {
        case "1": return .sceneHeading
        case "2": return .action
        case "3": return .character
        case "4": return .dialogue
        case "5": return .parenthetical
        case "6": return .transition
        default: return nil
        }
    }

    private static func makeKeyCommand(
        input: String,
        modifierFlags: UIKeyModifierFlags,
        action: Selector,
        title: String
    ) -> UIKeyCommand {
        let command = UIKeyCommand(input: input, modifierFlags: modifierFlags, action: action)
        command.discoverabilityTitle = title
        return command
    }
}

private func hollywoodScreenplayEditorUIFont() -> UIFont {
    UIFont(name: "Courier", size: 12) ?? UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
}

private struct IOSCursorInsertTextEditor: UIViewRepresentable {
    @Binding var text: String
    @Binding var activeScreenplayElement: ScreenplayEditorElement
    @Binding var insertionRequest: ScreenplayInsertionRequest?
    @Binding var lineJumpRequest: ScreenplayLineJumpRequest?
    @Binding var lineHighlightRequest: ScreenplayLineHighlightRequest?
    @Binding var anchoredTextRectRequest: ScreenplayAnchoredTextRectRequest?
    @Binding var anchoredTextRectSnapshot: ScreenplayAnchoredTextRectSnapshot?
    @Binding var editorFocusRequest: ScreenplayEditorFocusRequest?
    @Binding var editorActionRequest: ScreenplayEditorActionRequest?
    @Binding var editorSelection: ScreenplayEditorSelectionSnapshot?
    @Binding var currentCursorLine: Int
    @Binding var lastCommittedWrite: ScreenplayCommittedWrite?
    @Binding var pendingReplacementTarget: ScreenplayPendingReplacementTarget?
    @Binding var submittedReplacementTarget: ScreenplayPendingReplacementTarget?
    var onUserEdit: (() -> Void)? = nil

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> HollywoodScreenplayUITextView {
        let textView = HollywoodScreenplayUITextView()
        textView.delegate = context.coordinator
        textView.backgroundColor = .white
        textView.textColor = .black
        textView.tintColor = .black
        textView.font = hollywoodScreenplayEditorUIFont()
        textView.keyboardDismissMode = .interactive
        textView.autocorrectionType = .no
        textView.autocapitalizationType = .sentences
        textView.smartDashesType = .no
        textView.smartQuotesType = .no
        textView.smartInsertDeleteType = .no
        textView.spellCheckingType = .no
        textView.textContainer.lineFragmentPadding = 0
        textView.textContainerInset = UIEdgeInsets(
            top: ScreenplayStackMetrics.editorTextInsetVertical,
            left: ScreenplayStackMetrics.editorTextInsetHorizontal,
            bottom: ScreenplayStackMetrics.editorTextInsetVertical,
            right: ScreenplayStackMetrics.editorTextInsetHorizontal
        )
        textView.text = text
        textView.draftProvider = { textView.text ?? "" }
        textView.onElementShortcut = { element in
            context.coordinator.applyShortcutElement(element)
        }
        textView.onCycleElement = { backward in
            context.coordinator.cycleActiveElement(backward: backward)
        }
        context.coordinator.textView = textView
        context.coordinator.primeParagraphElements(
            for: textView.text ?? "",
            attributedText: textView.attributedText
        )
        context.coordinator.refreshScreenplayPresentationAndTyping()
        return textView
    }

    func updateUIView(_ uiView: HollywoodScreenplayUITextView, context: Context) {
        let previousPendingID = context.coordinator.parent.pendingReplacementTarget?.id
        let previousSubmittedID = context.coordinator.parent.submittedReplacementTarget?.id
        let previousInsertionID = context.coordinator.parent.insertionRequest?.id
        context.coordinator.parent = self
        let currentPendingID = pendingReplacementTarget?.id
        let currentSubmittedID = submittedReplacementTarget?.id
        let currentInsertionID = insertionRequest?.id
        if previousPendingID != currentPendingID ||
            previousSubmittedID != currentSubmittedID ||
            previousInsertionID != currentInsertionID {
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: "ios-update-parent-sync",
                target: submittedReplacementTarget ?? pendingReplacementTarget,
                detail: "Synced representable parent. pending=\(previousPendingID?.uuidString.lowercased() ?? "nil")->\(currentPendingID?.uuidString.lowercased() ?? "nil") submitted=\(previousSubmittedID?.uuidString.lowercased() ?? "nil")->\(currentSubmittedID?.uuidString.lowercased() ?? "nil") insertion=\(previousInsertionID?.uuidString.lowercased() ?? "nil")->\(currentInsertionID?.uuidString.lowercased() ?? "nil")"
            )
        }
        context.coordinator.textView = uiView
        uiView.draftProvider = { uiView.text ?? "" }
        uiView.onElementShortcut = { element in
            context.coordinator.applyShortcutElement(element)
        }
        uiView.onCycleElement = { backward in
            context.coordinator.cycleActiveElement(backward: backward)
        }

        if context.coordinator.lastKnownActiveElement != activeScreenplayElement {
            context.coordinator.applyActiveElementFromBinding(activeScreenplayElement)
        }

        if !context.coordinator.isApplyingProgrammaticChange, uiView.text != text {
            let previousSelection = uiView.selectedRange
            context.coordinator.isApplyingProgrammaticChange = true
            uiView.text = text
            uiView.selectedRange = NSRange(location: min(previousSelection.location, (text as NSString).length), length: 0)
            context.coordinator.isApplyingProgrammaticChange = false
            context.coordinator.refreshScreenplayPresentationAndTyping()
            context.coordinator.updateCurrentCursorLine()
            context.coordinator.refreshAnchoredTextRectSnapshot()
        }

        if let request = insertionRequest,
           request.id != context.coordinator.lastAppliedInsertionID {
            context.coordinator.applyInsertion(request)
        }

        if let jump = lineJumpRequest,
           jump.id != context.coordinator.lastAppliedLineJumpID {
            context.coordinator.applyLineJump(jump)
        }

        if let highlight = lineHighlightRequest,
           highlight.id != context.coordinator.lastAppliedLineHighlightID {
            context.coordinator.applyLineHighlight(highlight)
        }

        if let anchored = anchoredTextRectRequest,
           anchored.id != context.coordinator.lastAppliedAnchoredTextRectRequestID {
            context.coordinator.applyAnchoredTextRectRequest(anchored)
        } else if anchoredTextRectRequest == nil,
                  context.coordinator.activeAnchoredTextRectRequest != nil {
            context.coordinator.clearAnchoredTextRectRequest()
        }

        if let focus = editorFocusRequest,
           focus.id != context.coordinator.lastAppliedEditorFocusID {
            context.coordinator.applyEditorFocus(focus)
        }

        if let action = editorActionRequest,
           action.id != context.coordinator.lastAppliedEditorActionID {
            context.coordinator.applyEditorAction(action)
        }
    }

    final class Coordinator: NSObject, UITextViewDelegate {
        var parent: IOSCursorInsertTextEditor
        weak var textView: UITextView?
        var lastKnownActiveElement: ScreenplayEditorElement
        var isApplyingProgrammaticChange = false
        var lastAppliedInsertionID: UUID?
        var lastAppliedLineJumpID: UUID?
        var lastAppliedLineHighlightID: UUID?
        var lastAppliedEditorFocusID: UUID?
        var lastAppliedEditorActionID: UUID?
        var streamingPreviewRange: NSRange?
        var streamingPreviewOriginalSelection: NSRange = NSRange(location: 0, length: 0)
        var streamingPreviewOriginalText: String = ""
        var streamingPreviewPrefix: String = ""
        var streamingPreviewSuffix: String = ""
        var streamingPreviewBaseText: String = ""
        var streamingInsertRange: NSRange?
        var streamingInsertPrefix: String = ""
        var streamingInsertSuffix: String = ""
        var streamingInsertBaseText: String = ""
        var commitHighlightRange: NSRange?
        var commitHighlightWorkItem: DispatchWorkItem?
        var lastAppliedAnchoredTextRectRequestID: UUID?
        var activeAnchoredTextRectRequest: ScreenplayAnchoredTextRectRequest?
        var explicitCurrentLineElement: ScreenplayEditorElement?
        var explicitCurrentLineLocation: Int?
        var paragraphElements: [ScreenplayEditorElement?] = []
        var lastKnownTextSnapshot: String

        init(_ parent: IOSCursorInsertTextEditor) {
            self.parent = parent
            self.lastKnownActiveElement = parent.activeScreenplayElement
            self.lastKnownTextSnapshot = parent.text
        }

        func primeParagraphElements(for text: String, attributedText: NSAttributedString? = nil) {
            paragraphElements = bootstrapScreenplayParagraphElements(for: text, attributedText: attributedText)
            lastKnownTextSnapshot = text
            ScreenplayLiveDraftBridge.shared.syncStructuredDraftSnapshot(text: text, elements: paragraphElements)
        }

        private func synchronizeParagraphElementsWithCurrentText(in textView: UITextView) {
            let nextText = textView.text ?? ""
            let activeLineIndex = screenplayLineIndex(for: currentLineLocation(in: textView), in: nextText)
            paragraphElements = reconcileScreenplayParagraphElements(
                previousText: lastKnownTextSnapshot,
                nextText: nextText,
                previousElements: paragraphElements,
                activeLineIndex: activeLineIndex,
                explicitCurrentLineElement: explicitCurrentLineElement
            )
            lastKnownTextSnapshot = nextText
            ScreenplayLiveDraftBridge.shared.syncStructuredDraftSnapshot(text: nextText, elements: paragraphElements)
        }

        private func updateParagraphElementMetadata(
            _ element: ScreenplayEditorElement?,
            lineIndex: Int,
            in text: String
        ) {
            let lines = screenplayLineTexts(text)
            if paragraphElements.count != lines.count {
                paragraphElements = reconcileScreenplayParagraphElements(
                    previousText: lastKnownTextSnapshot,
                    nextText: text,
                    previousElements: paragraphElements,
                    activeLineIndex: nil,
                    explicitCurrentLineElement: nil
                )
            }
            guard lineIndex >= 0, lineIndex < paragraphElements.count else {
                lastKnownTextSnapshot = text
                return
            }
            paragraphElements[lineIndex] = lines[lineIndex].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : element
            lastKnownTextSnapshot = text
            ScreenplayLiveDraftBridge.shared.syncStructuredDraftSnapshot(text: text, elements: paragraphElements)
        }

        func textViewDidChange(_ textView: UITextView) {
            guard !isApplyingProgrammaticChange else { return }
            synchronizeParagraphElementsWithCurrentText(in: textView)
            normalizeCurrentLineIfNeeded(in: textView)
            syncActiveElementFromSelection()
            refreshScreenplayPresentationAndTyping()
            let next = textView.text ?? ""
            if parent.text != next {
                parent.text = next
            }
            parent.onUserEdit?()
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
        }

        func textViewDidChangeSelection(_ textView: UITextView) {
            guard !isApplyingProgrammaticChange else { return }
            clearExplicitCurrentLineOverrideIfNeeded(in: textView)
            syncActiveElementFromSelection()
            refreshTypingAttributesOnly()
            updateCurrentCursorLine()
        }

        func textView(
            _ textView: UITextView,
            shouldChangeTextIn range: NSRange,
            replacementText: String
        ) -> Bool {
            if replacementText == "\n" {
                handleInsertNewline(in: textView, replacementRange: range)
                return false
            }
            return true
        }

        func applyInsertion(_ request: ScreenplayInsertionRequest) {
            switch request.mode {
            case .insert:
                applyStandardInsertion(request)
            case .streamPreview:
                applyStreamingPreview(request)
            case .streamCommit:
                applyStreamingCommit(request)
            case .streamCancel:
                cancelStreamingPreview()
                lastAppliedInsertionID = request.id
                DispatchQueue.main.async {
                    if self.parent.insertionRequest?.id == request.id {
                        self.parent.insertionRequest = nil
                    }
                }
            case .streamInsertProgress:
                applyStreamingInsertProgress(request)
            case .streamInsertFinalize:
                finalizeStreamingInsert(request)
            case .streamInsertCancel:
                cancelStreamingInsert()
                lastAppliedInsertionID = request.id
                DispatchQueue.main.async {
                    if self.parent.insertionRequest?.id == request.id {
                        self.parent.insertionRequest = nil
                    }
                }
            }
        }

        func applyLineJump(_ request: ScreenplayLineJumpRequest) {
            guard let textView else { return }
            let targetLine = max(1, request.line)
            let content = textView.text ?? ""
            let targetRange = rangeForLine(targetLine, in: content)
            textView.selectedRange = NSRange(location: targetRange.location, length: 0)
            textView.scrollRangeToVisible(targetRange)
            parent.currentCursorLine = targetLine
            refreshAnchoredTextRectSnapshot()
            lastAppliedLineJumpID = request.id
            DispatchQueue.main.async {
                if self.parent.lineJumpRequest?.id == request.id {
                    self.parent.lineJumpRequest = nil
                }
            }
        }

        func applyLineHighlight(_ request: ScreenplayLineHighlightRequest) {
            guard let textView else { return }
            let content = textView.text ?? ""
            let highlightRange = rangeForLines(
                startLine: request.startLine,
                endLine: request.endLine,
                in: content
            )
            applyCommitHighlight(highlightRange, in: textView, contentLength: (content as NSString).length)
            lastAppliedLineHighlightID = request.id
            DispatchQueue.main.async {
                if self.parent.lineHighlightRequest?.id == request.id {
                    self.parent.lineHighlightRequest = nil
                }
            }
        }

        func applyAnchoredTextRectRequest(_ request: ScreenplayAnchoredTextRectRequest) {
            activeAnchoredTextRectRequest = request
            lastAppliedAnchoredTextRectRequestID = request.id
            refreshAnchoredTextRectSnapshot()
        }

        func clearAnchoredTextRectRequest() {
            activeAnchoredTextRectRequest = nil
            lastAppliedAnchoredTextRectRequestID = nil
            DispatchQueue.main.async {
                self.parent.anchoredTextRectSnapshot = nil
            }
        }

        func applyEditorFocus(_ request: ScreenplayEditorFocusRequest) {
            guard let textView else { return }
            textView.becomeFirstResponder()
            textView.scrollRangeToVisible(textView.selectedRange)
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
            lastAppliedEditorFocusID = request.id
            DispatchQueue.main.async {
                if self.parent.editorFocusRequest?.id == request.id {
                    self.parent.editorFocusRequest = nil
                }
            }
        }

        func applyEditorAction(_ request: ScreenplayEditorActionRequest) {
            guard let textView else { return }
            textView.becomeFirstResponder()
            switch request.action {
            case .undo:
                textView.undoManager?.undo()
            case .redo:
                textView.undoManager?.redo()
            }
            synchronizeParagraphElementsWithCurrentText(in: textView)
            syncActiveElementFromSelection()
            refreshScreenplayPresentationAndTyping()
            let next = textView.text ?? ""
            if parent.text != next {
                parent.text = next
            }
            parent.onUserEdit?()
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
            lastAppliedEditorActionID = request.id
            DispatchQueue.main.async {
                if self.parent.editorActionRequest?.id == request.id {
                    self.parent.editorActionRequest = nil
                }
            }
        }

        func updateCurrentCursorLine() {
            guard let textView else { return }
            let line = lineNumber(for: textView.selectedRange.location, in: textView.text ?? "")
            if parent.currentCursorLine != line {
                parent.currentCursorLine = line
            }
            refreshEditorSelectionSnapshot()
        }

        private func refreshEditorSelectionSnapshot() {
            guard let textView else { return }
            let snapshot = selectionSnapshot(in: textView)
            if parent.editorSelection != snapshot {
                parent.editorSelection = snapshot
            }
        }

        func applyShortcutElement(_ element: ScreenplayEditorElement) {
            guard let textView else { return }
            applyActiveElement(element)
            setExplicitCurrentLineOverride(element, in: textView)
            applyParagraphNormalizationIfNeeded(for: element, in: textView)
            refreshScreenplayPresentationAndTyping()
        }

        func applyActiveElementFromBinding(_ element: ScreenplayEditorElement) {
            guard let textView else {
                lastKnownActiveElement = element
                return
            }
            applyActiveElement(element)
            setExplicitCurrentLineOverride(element, in: textView)
            applyParagraphNormalizationIfNeeded(for: element, in: textView)
            refreshScreenplayPresentationAndTyping()
        }

        func cycleActiveElement(backward: Bool) {
            let next = backward
                ? parent.activeScreenplayElement.screenplayTabBackward
                : parent.activeScreenplayElement.screenplayTabForward
            applyShortcutElement(next)
        }

        private func applyActiveElement(_ element: ScreenplayEditorElement) {
            lastKnownActiveElement = element
            if parent.activeScreenplayElement != element {
                parent.activeScreenplayElement = element
            }
        }

        private func handleInsertNewline(in textView: UITextView, replacementRange: NSRange) {
            let initialContext = currentLineContext(in: textView)
            applyParagraphNormalizationIfNeeded(for: initialContext.currentElement, in: textView)
            let context = currentLineContext(in: textView)
            let resolvedReplacementRange = textView.selectedRange
            let mutable = NSMutableString(string: textView.text ?? "")
            mutable.replaceCharacters(in: resolvedReplacementRange, with: "\n")
            let nextText = String(mutable)

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: resolvedReplacementRange.location + 1, length: 0)
            isApplyingProgrammaticChange = false

            synchronizeParagraphElementsWithCurrentText(in: textView)
            let nextElement = ScreenplayEditorElement.nextElementAfterReturn(
                currentLine: context.lineText,
                currentElement: context.currentElement,
                previousElementBeforeCurrentLine: context.previousElement
            )
            applyActiveElement(nextElement)
            setExplicitCurrentLineOverride(nextElement, in: textView)
            refreshScreenplayPresentationAndTyping()

            if parent.text != nextText {
                parent.text = nextText
            }
            parent.onUserEdit?()
            updateCurrentCursorLine()
            refreshAnchoredTextRectSnapshot()
        }

        private func syncActiveElementFromSelection() {
            guard let textView else { return }
            let context = currentLineContext(in: textView)
            let nextElement: ScreenplayEditorElement
            if context.lineText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                nextElement = ScreenplayEditorElement.nextElementAfterReturn(
                    currentLine: context.lineText,
                    currentElement: parent.activeScreenplayElement,
                    previousElementBeforeCurrentLine: context.previousElement
                )
            } else {
                nextElement = context.currentElement
            }
            applyActiveElement(nextElement)
        }

        func refreshScreenplayPresentationAndTyping() {
            applyScreenplayParagraphStyles()
            refreshTypingAttributesOnly()
        }

        private func refreshTypingAttributesOnly() {
            guard let textView else { return }
            let context = currentLineContext(in: textView)
            let paragraphStyle = screenplayParagraphStyle(
                for: parent.activeScreenplayElement,
                previousElement: context.previousElement,
                nextElement: nil,
                containerWidth: max(textView.textContainer.size.width, 420)
            )
            textView.typingAttributes = [
                .font: hollywoodScreenplayEditorUIFont(),
                .foregroundColor: UIColor.black,
                .paragraphStyle: paragraphStyle,
            ]
        }

        private func applyScreenplayParagraphStyles() {
            guard let textView else { return }
            synchronizeParagraphElementsWithCurrentText(in: textView)
            applyScreenplayParagraphAttributes(
                to: textView.textStorage,
                fullText: textView.text ?? "",
                elements: paragraphElements,
                containerWidth: max(textView.textContainer.size.width, 420),
                font: hollywoodScreenplayEditorUIFont(),
                foregroundColor: UIColor.black
            )
        }

        private func normalizeCurrentLineIfNeeded(in textView: UITextView) {
            let context = currentLineContext(in: textView)
            guard shouldNormalizeScreenplayLineDuringTyping(context.lineText, as: context.currentElement) else {
                return
            }
            let normalized = normalizedLineText(
                for: context.lineText,
                currentElement: context.currentElement
            )
            guard normalized != context.lineText else { return }

            let selection = textView.selectedRange
            let offsetIntoLine = max(0, selection.location - context.lineRange.location)
            let originalLength = (context.lineText as NSString).length
            let nextLength = (normalized as NSString).length
            let nextText = (textView.text as NSString?)?.replacingCharacters(in: context.lineRange, with: normalized) ?? normalized
            let adjustedLocation = min(
                context.lineRange.location + min(offsetIntoLine, nextLength),
                (nextText as NSString).length - originalLength + nextLength
            )

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: adjustedLocation, length: 0)
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
        }

        private func applyParagraphNormalizationIfNeeded(for element: ScreenplayEditorElement, in textView: UITextView) {
            let context = currentLineContext(in: textView)
            guard !context.lineText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
            let normalized = normalizedLineText(
                for: context.lineText,
                currentElement: element,
                forceParentheticalWrapping: true
            )
            guard normalized != context.lineText else { return }

            let selection = textView.selectedRange
            let offsetIntoLine = max(0, selection.location - context.lineRange.location)
            let nextLength = (normalized as NSString).length
            let nextText = (textView.text as NSString?)?.replacingCharacters(in: context.lineRange, with: normalized) ?? normalized

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(
                location: context.lineRange.location + min(offsetIntoLine, nextLength),
                length: 0
            )
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            parent.onUserEdit?()
        }

        private func normalizedLineText(
            for lineText: String,
            currentElement: ScreenplayEditorElement,
            forceParentheticalWrapping: Bool = false
        ) -> String {
            let trimmed = lineText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return lineText }

            let effectiveElement: ScreenplayEditorElement =
                forceParentheticalWrapping && currentElement == .parenthetical
                ? .parenthetical
                : currentElement

            return FountainFormatter.normalizeEditorLine(
                trimmed,
                as: effectiveElement,
                existingDraft: parent.text
            )
        }

        private func currentLineContext(in textView: UITextView) -> (lineRange: NSRange, lineText: String, currentElement: ScreenplayEditorElement, previousElement: ScreenplayEditorElement?) {
            let content = textView.text ?? ""
            let details = screenplayCurrentLineDetails(for: textView.selectedRange.location, in: content)
            let previousElement = screenplayPreviousFlowElement(before: details.lineIndex, in: paragraphElements)
            let storedElement = details.lineIndex < paragraphElements.count ? paragraphElements[details.lineIndex] : nil
            let currentElement: ScreenplayEditorElement
            if details.lineText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                currentElement = ScreenplayEditorElement.nextElementAfterReturn(
                    currentLine: details.lineText,
                    currentElement: parent.activeScreenplayElement,
                    previousElementBeforeCurrentLine: previousElement
                )
            } else if let storedElement {
                currentElement = storedElement
            } else {
                currentElement = ScreenplayEditorElement.inferredElement(
                    for: details.lineText,
                    previousElement: previousElement
                )
            }
            return (details.lineRange, details.lineText, currentElement, previousElement)
        }

        private func setExplicitCurrentLineOverride(_ element: ScreenplayEditorElement, in textView: UITextView) {
            explicitCurrentLineElement = element
            explicitCurrentLineLocation = currentLineLocation(in: textView)
            let lineIndex = screenplayLineIndex(for: explicitCurrentLineLocation ?? 0, in: textView.text ?? "")
            updateParagraphElementMetadata(element, lineIndex: lineIndex, in: textView.text ?? "")
        }

        private func clearExplicitCurrentLineOverrideIfNeeded(in textView: UITextView) {
            guard let explicitCurrentLineLocation else { return }
            guard currentLineLocation(in: textView) != explicitCurrentLineLocation else { return }
            explicitCurrentLineElement = nil
            self.explicitCurrentLineLocation = nil
        }

        private func currentLineLocation(in textView: UITextView) -> Int {
            let content = (textView.text ?? "") as NSString
            let safeLocation = max(0, min(textView.selectedRange.location, content.length))
            return content.lineRange(for: NSRange(location: safeLocation, length: 0)).location
        }

        private func rangeForLine(_ line: Int, in content: String) -> NSRange {
            let ns = content as NSString
            let length = ns.length
            if length <= 0 {
                return NSRange(location: 0, length: 0)
            }
            var currentLine = 1
            var cursor = 0
            while cursor < length && currentLine < line {
                let next = ns.range(of: "\n", options: [], range: NSRange(location: cursor, length: length - cursor))
                if next.location == NSNotFound {
                    return NSRange(location: length, length: 0)
                }
                cursor = next.location + 1
                currentLine += 1
            }
            let nextBreak = ns.range(of: "\n", options: [], range: NSRange(location: cursor, length: length - cursor))
            if nextBreak.location == NSNotFound {
                return NSRange(location: cursor, length: max(0, length - cursor))
            }
            return NSRange(location: cursor, length: max(0, nextBreak.location - cursor))
        }

        private func selectionSnapshot(in textView: UITextView) -> ScreenplayEditorSelectionSnapshot? {
            let content = textView.text ?? ""
            let ns = content as NSString
            let selection = clampedSelection(from: textView.selectedRange, maxLength: ns.length)
            guard selection.length > 0 else { return nil }
            let selectedText = ns.substring(with: selection)
            let trimmed = selectedText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            let startLine = lineNumber(for: selection.location, in: content)
            let selectionEndLocation = max(selection.location, selection.location + max(selection.length - 1, 0))
            let endLine = lineNumber(for: selectionEndLocation, in: content)
            return ScreenplayEditorSelectionSnapshot(
                location: selection.location,
                length: selection.length,
                startLine: startLine,
                endLine: endLine,
                text: selectedText,
                sceneLabel: ScreenplayLiveDraftBridge.shared.currentSceneLabel(atOrBeforeLine: startLine)
            )
        }

        private func rangeForLines(startLine: Int, endLine: Int, in content: String) -> NSRange {
            let startRange = rangeForLine(max(1, startLine), in: content)
            let endRange = rangeForLine(max(startLine, endLine), in: content)
            let startLocation = startRange.location
            let endLocation = endRange.location + max(0, endRange.length)
            return NSRange(location: startLocation, length: max(0, endLocation - startLocation))
        }

        private func lineNumber(for location: Int, in content: String) -> Int {
            let ns = content as NSString
            let safeLocation = max(0, min(location, ns.length))
            var line = 1
            var cursor = 0
            while cursor < safeLocation {
                let next = ns.range(of: "\n", options: [], range: NSRange(location: cursor, length: safeLocation - cursor))
                if next.location == NSNotFound || next.location >= safeLocation {
                    break
                }
                line += 1
                cursor = next.location + 1
            }
            return line
        }

        private func clampedSelection(from range: NSRange, maxLength: Int) -> NSRange {
            let location = max(0, min(range.location, maxLength))
            let maxLen = max(0, maxLength - location)
            let length = max(0, min(range.length, maxLen))
            return NSRange(location: location, length: length)
        }

        private func applyStandardInsertion(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let current = textView.text ?? ""
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            let fallbackSelection = clampedSelection(from: textView.selectedRange, maxLength: (current as NSString).length)
            let insertionContext = resolvedInsertionContext(
                raw: request.text,
                existing: current,
                fallbackSelection: fallbackSelection
            )
            let selection = insertionContext.selection
            let insertion = insertionContext.text
            guard !insertion.isEmpty else {
                lastAppliedInsertionID = request.id
                DispatchQueue.main.async {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "ios-insert-empty-clear",
                        target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                        detail: "Insertion context produced no text."
                    )
                    self.parent.pendingReplacementTarget = nil
                    self.parent.submittedReplacementTarget = nil
                    if self.parent.insertionRequest?.id == request.id {
                        self.parent.insertionRequest = nil
                    }
                }
                return
            }

            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: selection, with: insertion)
            let nextText = String(mutable)
            let caretLocation = min(selection.location + (insertion as NSString).length, (nextText as NSString).length)
            let highlightRange = insertionContext.isReplacement
                ? NSRange(location: selection.location, length: (trimmed as NSString).length)
                : committedHighlightRange(trimmedText: trimmed, insertion: insertion, selection: selection)
            let committedLines = committedLineRange(for: highlightRange, in: nextText)

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: caretLocation, length: 0)
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            let replacementTarget = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: insertionContext.isReplacement ? "ios-commit-standard-replacement" : "ios-commit-standard-insert",
                target: replacementTarget,
                detail: "Applied standard insertion."
            )
            parent.lastCommittedWrite = ScreenplayCommittedWrite(
                id: request.id,
                writeID: request.id.uuidString.lowercased(),
                previousDraft: current,
                committedDraft: nextText,
                insertedText: trimmed,
                replacementApplied: insertionContext.isReplacement,
                replacedWriteID: replacementTarget?.sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? replacementTarget?.sourceWriteID
                    : nil,
                startLine: committedLines.start,
                endLine: committedLines.end,
                committedAt: Date()
            )
            updateCurrentCursorLine()
            applyCommitHighlight(highlightRange, in: textView, contentLength: (nextText as NSString).length)
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "ios-commit-standard-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Clearing replacement targets after standard insertion."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func applyStreamingPreview(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let current = textView.text ?? ""
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }

            let previewText: String
            let replacementRange: NSRange

            if let existingRange = streamingPreviewRange {
                replacementRange = existingRange
                previewText = streamingPreviewPrefix + trimmed + streamingPreviewSuffix
            } else {
                let selection = clampedSelection(from: textView.selectedRange, maxLength: (current as NSString).length)
                let replacementContext = resolvedReplacementContext(
                    existing: current,
                    fallbackSelection: selection
                )
                streamingPreviewBaseText = current
                let affixes: (prefix: String, suffix: String)
                if replacementContext.isReplacement {
                    affixes = ("", "")
                } else {
                    affixes = insertionAffixes(existing: current, selection: replacementContext.range)
                }
                streamingPreviewOriginalSelection = replacementContext.range
                streamingPreviewOriginalText = replacementContext.range.length > 0
                    ? (current as NSString).substring(with: replacementContext.range)
                    : ""
                streamingPreviewPrefix = affixes.prefix
                streamingPreviewSuffix = affixes.suffix
                replacementRange = replacementContext.range
                previewText = affixes.prefix + trimmed + affixes.suffix
            }

            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: previewText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (previewText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: caretLocation, length: 0)
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            updateCurrentCursorLine()
            streamingPreviewRange = nextRange
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func applyStreamingCommit(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                cancelStreamingPreview()
                return
            }

            if streamingPreviewRange == nil {
                applyStandardInsertion(ScreenplayInsertionRequest(id: request.id, text: request.text, mode: .insert))
                resetStreamingPreviewState()
                return
            }

            let current = textView.text ?? ""
            guard let replacementRange = streamingPreviewRange else { return }
            let previewText = streamingPreviewPrefix + trimmed + streamingPreviewSuffix
            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: previewText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (previewText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)
            let highlightRange = NSRange(
                location: replacementRange.location + (streamingPreviewPrefix as NSString).length,
                length: (trimmed as NSString).length
            )
            let committedLines = committedLineRange(for: highlightRange, in: nextText)

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: caretLocation, length: 0)
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            let replacementTarget = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: replacementTarget != nil ? "ios-commit-stream-replacement" : "ios-commit-stream-insert",
                target: replacementTarget,
                detail: "Applied streaming commit."
            )
            parent.lastCommittedWrite = ScreenplayCommittedWrite(
                id: request.id,
                writeID: request.id.uuidString.lowercased(),
                previousDraft: streamingPreviewBaseText.isEmpty ? current : streamingPreviewBaseText,
                committedDraft: nextText,
                insertedText: trimmed,
                replacementApplied: replacementTarget != nil,
                replacedWriteID: replacementTarget?.sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? replacementTarget?.sourceWriteID
                    : nil,
                startLine: committedLines.start,
                endLine: committedLines.end,
                committedAt: Date()
            )
            updateCurrentCursorLine()
            applyCommitHighlight(highlightRange, in: textView, contentLength: (nextText as NSString).length)
            resetStreamingPreviewState()
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "ios-commit-stream-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Clearing replacement targets after streaming commit."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func applyStreamingInsertProgress(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }

            if streamingPreviewRange != nil {
                cancelStreamingPreview()
            }

            let current = textView.text ?? ""
            let replacementRange: NSRange
            let renderedText: String

            if let existingRange = streamingInsertRange {
                replacementRange = existingRange
                renderedText = streamingInsertPrefix + trimmed + streamingInsertSuffix
            } else {
                let selection = clampedSelection(from: textView.selectedRange, maxLength: (current as NSString).length)
                let replacementContext = resolvedReplacementContext(
                    existing: current,
                    fallbackSelection: selection
                )
                streamingInsertBaseText = current
                let affixes: (prefix: String, suffix: String)
                if replacementContext.isReplacement {
                    affixes = ("", "")
                } else {
                    affixes = insertionAffixes(existing: current, selection: replacementContext.range)
                }
                streamingInsertPrefix = affixes.prefix
                streamingInsertSuffix = affixes.suffix
                replacementRange = replacementContext.range
                renderedText = affixes.prefix + trimmed + affixes.suffix
            }

            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: renderedText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (renderedText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: caretLocation, length: 0)
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            updateCurrentCursorLine()
            streamingInsertRange = nextRange
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func finalizeStreamingInsert(_ request: ScreenplayInsertionRequest) {
            guard let textView else { return }
            let trimmed = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                cancelStreamingInsert()
                return
            }

            if streamingInsertRange == nil {
                applyStandardInsertion(ScreenplayInsertionRequest(id: request.id, text: request.text, mode: .insert))
                resetStreamingInsertState()
                return
            }

            let current = textView.text ?? ""
            guard let replacementRange = streamingInsertRange else { return }
            let finalText = streamingInsertPrefix + trimmed + streamingInsertSuffix
            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: replacementRange, with: finalText)
            let nextText = String(mutable)
            let nextRange = NSRange(location: replacementRange.location, length: (finalText as NSString).length)
            let caretLocation = min(nextRange.location + nextRange.length, (nextText as NSString).length)
            let highlightRange = NSRange(
                location: replacementRange.location + (streamingInsertPrefix as NSString).length,
                length: (trimmed as NSString).length
            )
            let committedLines = committedLineRange(for: highlightRange, in: nextText)

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: caretLocation, length: 0)
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            let replacementTarget = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget
            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: replacementTarget != nil ? "ios-commit-streaming-lines-replacement" : "ios-commit-streaming-lines-insert",
                target: replacementTarget,
                detail: "Applied streamed line insertion."
            )
            parent.lastCommittedWrite = ScreenplayCommittedWrite(
                id: request.id,
                writeID: request.id.uuidString.lowercased(),
                previousDraft: streamingInsertBaseText.isEmpty ? current : streamingInsertBaseText,
                committedDraft: nextText,
                insertedText: trimmed,
                replacementApplied: replacementTarget != nil,
                replacedWriteID: replacementTarget?.sourceWriteID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                    ? replacementTarget?.sourceWriteID
                    : nil,
                startLine: committedLines.start,
                endLine: committedLines.end,
                committedAt: Date()
            )
            updateCurrentCursorLine()
            applyCommitHighlight(highlightRange, in: textView, contentLength: (nextText as NSString).length)
            resetStreamingInsertState()
            refreshAnchoredTextRectSnapshot()
            lastAppliedInsertionID = request.id

            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "ios-commit-streaming-lines-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Clearing replacement targets after streamed line insertion."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
                if self.parent.insertionRequest?.id == request.id {
                    self.parent.insertionRequest = nil
                }
            }
        }

        private func cancelStreamingPreview() {
            guard let textView, let previewRange = streamingPreviewRange else { return }
            let current = textView.text ?? ""
            let mutable = NSMutableString(string: current)
            mutable.replaceCharacters(in: previewRange, with: streamingPreviewOriginalText)
            let nextText = String(mutable)
            let caretLocation = min(
                streamingPreviewOriginalSelection.location + (streamingPreviewOriginalText as NSString).length,
                (nextText as NSString).length
            )

            isApplyingProgrammaticChange = true
            textView.text = nextText
            textView.selectedRange = NSRange(location: caretLocation, length: 0)
            isApplyingProgrammaticChange = false
            synchronizeParagraphElementsWithCurrentText(in: textView)
            parent.text = nextText
            updateCurrentCursorLine()
            resetStreamingPreviewState()
            refreshAnchoredTextRectSnapshot()
            DispatchQueue.main.async {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "ios-stream-cancel-clear",
                    target: self.parent.pendingReplacementTarget ?? self.parent.submittedReplacementTarget,
                    detail: "Cancelled streaming preview and cleared replacement targets."
                )
                self.parent.pendingReplacementTarget = nil
                self.parent.submittedReplacementTarget = nil
            }
        }

        private func cancelStreamingInsert() {
            resetStreamingInsertState()
        }

        private func resetStreamingPreviewState() {
            streamingPreviewRange = nil
            streamingPreviewOriginalSelection = NSRange(location: 0, length: 0)
            streamingPreviewOriginalText = ""
            streamingPreviewPrefix = ""
            streamingPreviewSuffix = ""
            streamingPreviewBaseText = ""
        }

        private func resetStreamingInsertState() {
            streamingInsertRange = nil
            streamingInsertPrefix = ""
            streamingInsertSuffix = ""
            streamingInsertBaseText = ""
        }

        private func committedHighlightRange(trimmedText: String, insertion: String, selection: NSRange) -> NSRange {
            let insertedLength = (insertion as NSString).length
            let trimmedLength = (trimmedText as NSString).length
            if trimmedLength <= 0 { return NSRange(location: selection.location, length: 0) }
            let leadingWhitespaceLength = max(0, insertedLength - trimmedLength - trailingWhitespaceLength(insertion))
            return NSRange(location: selection.location + leadingWhitespaceLength, length: trimmedLength)
        }

        private func trailingWhitespaceLength(_ text: String) -> Int {
            let scalars = Array(text.unicodeScalars)
            var count = 0
            for scalar in scalars.reversed() {
                if CharacterSet.whitespacesAndNewlines.contains(scalar) {
                    count += 1
                } else {
                    break
                }
            }
            return count
        }

        private func committedLineRange(for range: NSRange, in text: String) -> (start: Int, end: Int) {
            let safeText = text as NSString
            let maxLength = safeText.length
            let safeLocation = max(0, min(range.location, maxLength))
            let safeEnd = max(safeLocation, min(range.location + range.length, maxLength))
            let start = lineNumber(at: safeLocation, in: text)
            let end = lineNumber(at: safeEnd, in: text)
            return (start, max(start, end))
        }

        private func lineNumber(at location: Int, in text: String) -> Int {
            let safeText = text as NSString
            let maxLength = safeText.length
            let safeLocation = max(0, min(location, maxLength))
            let prefix = safeText.substring(to: safeLocation)
            return max(1, prefix.reduce(into: 1) { count, character in
                if character == "\n" { count += 1 }
            })
        }

        private func applyCommitHighlight(_ range: NSRange, in textView: UITextView, contentLength: Int) {
            clearCommitHighlight(in: textView)
            let safeLocation = max(0, min(range.location, contentLength))
            let safeLength = max(0, min(range.length, contentLength - safeLocation))
            guard safeLength > 0 else { return }
            let safeRange = NSRange(location: safeLocation, length: safeLength)
            textView.textStorage.addAttribute(
                .backgroundColor,
                value: UIColor.systemGreen.withAlphaComponent(0.16),
                range: safeRange
            )
            commitHighlightRange = safeRange

            let workItem = DispatchWorkItem { [weak self, weak textView] in
                guard let self, let textView else { return }
                self.clearCommitHighlight(in: textView)
            }
            commitHighlightWorkItem = workItem
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.35, execute: workItem)
        }

        private func clearCommitHighlight(in textView: UITextView) {
            commitHighlightWorkItem?.cancel()
            commitHighlightWorkItem = nil
            guard let range = commitHighlightRange else { return }
            let maxLength = textView.textStorage.length
            guard maxLength > 0 else {
                commitHighlightRange = nil
                return
            }
            let safeLocation = max(0, min(range.location, maxLength))
            let safeLength = max(0, min(range.length, maxLength - safeLocation))
            if safeLength > 0 {
                textView.textStorage.removeAttribute(.backgroundColor, range: NSRange(location: safeLocation, length: safeLength))
            }
            commitHighlightRange = nil
        }

        func refreshAnchoredTextRectSnapshot() {
            guard let request = activeAnchoredTextRectRequest,
                  let textView else {
                DispatchQueue.main.async {
                    self.parent.anchoredTextRectSnapshot = nil
                }
                return
            }

            let content = textView.text ?? ""
            let nsContent = content as NSString
            guard nsContent.length > 0 else {
                DispatchQueue.main.async {
                    self.parent.anchoredTextRectSnapshot = nil
                }
                return
            }

            var characterRange = rangeForLines(
                startLine: request.startLine,
                endLine: request.endLine,
                in: content
            )
            if characterRange.length <= 0 {
                let safeLocation = max(0, min(characterRange.location, max(0, nsContent.length - 1)))
                characterRange = NSRange(location: safeLocation, length: min(1, max(0, nsContent.length - safeLocation)))
            }

            var glyphRange = textView.layoutManager.glyphRange(forCharacterRange: characterRange, actualCharacterRange: nil)
            if glyphRange.length <= 0, textView.layoutManager.numberOfGlyphs > 0 {
                let safeGlyph = max(0, min(glyphRange.location, max(0, textView.layoutManager.numberOfGlyphs - 1)))
                glyphRange = NSRange(location: safeGlyph, length: min(1, max(0, textView.layoutManager.numberOfGlyphs - safeGlyph)))
            }
            guard glyphRange.length > 0 else {
                DispatchQueue.main.async {
                    self.parent.anchoredTextRectSnapshot = nil
                }
                return
            }

            var rect = textView.layoutManager.boundingRect(forGlyphRange: glyphRange, in: textView.textContainer)
            rect.origin.x += textView.textContainerInset.left
            rect.origin.y += textView.textContainerInset.top
            rect.size.height = max(rect.height, (textView.font?.pointSize ?? 13) + 8)

            let rectInVisible = rect.offsetBy(dx: -textView.contentOffset.x, dy: -textView.contentOffset.y)
            let snapshot = ScreenplayAnchoredTextRectSnapshot(
                requestID: request.id,
                startLine: request.startLine,
                endLine: request.endLine,
                rect: rectInVisible.integral,
                visibleRect: CGRect(origin: .zero, size: textView.bounds.size).integral
            )
            DispatchQueue.main.async {
                self.parent.anchoredTextRectSnapshot = snapshot
            }
        }

        private func insertionAffixes(existing: String, selection: NSRange) -> (prefix: String, suffix: String) {
            guard !existing.isEmpty else { return ("", "") }

            let ns = existing as NSString
            let start = selection.location
            let end = selection.location + selection.length

            let before = start > 0 ? ns.substring(with: NSRange(location: start - 1, length: 1)) : ""
            let after = end < ns.length ? ns.substring(with: NSRange(location: end, length: 1)) : ""

            let prefix: String
            if before.isEmpty || before == "\n" {
                prefix = before.isEmpty ? "" : "\n"
            } else {
                prefix = "\n\n"
            }

            let suffix: String
            if after.isEmpty || after == "\n" {
                suffix = after.isEmpty ? "" : "\n"
            } else {
                suffix = "\n\n"
            }

            return (prefix, suffix)
        }

        private func insertionText(for raw: String, existing: String, selection: NSRange) -> String {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return "" }
            guard !existing.isEmpty else { return trimmed }

            let affixes = insertionAffixes(existing: existing, selection: selection)
            return affixes.prefix + trimmed + affixes.suffix
        }

        private func resolvedReplacementContext(
            existing: String,
            fallbackSelection: NSRange
        ) -> (range: NSRange, isReplacement: Bool) {
            guard let target = parent.pendingReplacementTarget ?? parent.submittedReplacementTarget else {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "ios-resolve-miss-no-target",
                    target: nil,
                    detail: "No replacement target available during resolution."
                )
                return (fallbackSelection, false)
            }

            let ns = existing as NSString
            let candidateRange = clampedSelection(
                from: rangeForLines(startLine: target.startLine, endLine: target.endLine, in: existing),
                maxLength: ns.length
            )
            let cleanTarget = target.currentText.trimmingCharacters(in: .whitespacesAndNewlines)

            if candidateRange.length > 0 {
                let candidateText = ns.substring(with: candidateRange).trimmingCharacters(in: .whitespacesAndNewlines)
                if candidateText.caseInsensitiveCompare(cleanTarget) == .orderedSame {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "ios-resolve-match-line-range",
                        target: target,
                        detail: "Matched replacement target using stored line range."
                    )
                    return (candidateRange, true)
                }
            }

            if !cleanTarget.isEmpty {
                let exactRange = ns.range(of: cleanTarget)
                if exactRange.location != NSNotFound {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "ios-resolve-match-exact",
                        target: target,
                        detail: "Matched replacement target using exact text."
                    )
                    return (exactRange, true)
                }

                let caseInsensitiveRange = ns.range(of: cleanTarget, options: [.caseInsensitive])
                if caseInsensitiveRange.location != NSNotFound {
                    ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                        kind: "ios-resolve-match-case-insensitive",
                        target: target,
                        detail: "Matched replacement target using case-insensitive text."
                    )
                    return (caseInsensitiveRange, true)
                }
            }

            if candidateRange.length > 0 {
                ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                    kind: "ios-resolve-fallback-line-range",
                    target: target,
                    detail: "Fell back to stored line range without exact text match."
                )
                return (candidateRange, true)
            }

            ScreenplayLiveDraftBridge.shared.debugTraceReplacementTarget(
                kind: "ios-resolve-fallback-selection",
                target: target,
                detail: "Could not resolve replacement target; falling back to editor selection."
            )
            return (fallbackSelection, false)
        }

        private func resolvedInsertionContext(
            raw: String,
            existing: String,
            fallbackSelection: NSRange
        ) -> (selection: NSRange, text: String, isReplacement: Bool) {
            let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return (fallbackSelection, "", false) }
            guard !existing.isEmpty else { return (fallbackSelection, trimmed, false) }

            let replacement = resolvedReplacementContext(existing: existing, fallbackSelection: fallbackSelection)
            if replacement.isReplacement {
                return (replacement.range, trimmed, true)
            }

            return (
                fallbackSelection,
                insertionText(for: raw, existing: existing, selection: fallbackSelection),
                false
            )
        }
    }
}
#endif

private func appendWithSpacing(existing: String, insertion: String) -> String {
    let trimmedExisting = existing.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmedExisting.isEmpty { return insertion }
    return trimmedExisting + "\n\n" + insertion
}
