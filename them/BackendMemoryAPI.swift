import Foundation
import Security

nonisolated extension Notification.Name {
    static let themTurnCommitted = Notification.Name("io.them.them.turnCommitted")
    static let themBackendSyncUpdated = Notification.Name("io.them.them.backendSyncUpdated")
    static let themScreenplayQuestionResolved = Notification.Name("io.them.them.screenplayQuestionResolved")
}

nonisolated private struct BackendNotificationPayload: @unchecked Sendable {
    let name: Notification.Name
    let userInfo: [AnyHashable: Any]
}

nonisolated private func postBackendNotificationOnMain(
    name: Notification.Name,
    userInfo: [AnyHashable: Any]
) {
    let payload = BackendNotificationPayload(name: name, userInfo: userInfo)
    if Thread.isMainThread {
        NotificationCenter.default.post(name: payload.name, object: nil, userInfo: payload.userInfo)
    } else {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: payload.name, object: nil, userInfo: payload.userInfo)
        }
    }
}

nonisolated struct BackendSyncState: Equatable {
    var status: String
    var sessionId: String
    var schemaVersion: Int
    var backendBuild: String
    var backendBootId: String
    var lastTurnId: String
    var lastUpdatedAt: TimeInterval
    var historyUpdatedAt: TimeInterval
    var memoryUpdatedAt: TimeInterval
    var stateVersion: String

    static let empty = BackendSyncState(
        status: "unknown",
        sessionId: "",
        schemaVersion: 0,
        backendBuild: "",
        backendBootId: "",
        lastTurnId: "",
        lastUpdatedAt: 0,
        historyUpdatedAt: 0,
        memoryUpdatedAt: 0,
        stateVersion: ""
    )
}

nonisolated struct BackendTurnCommittedEvent {
    let source: String
    let turnId: String
    let requestId: String?
    let sessionId: String
    let stateVersion: String
    let lastUpdatedAt: TimeInterval
    let historyUpdatedAt: TimeInterval
    let memoryUpdatedAt: TimeInterval
    let userMessage: String?
    let assistantMessage: String?
    let screenplayTarget: String?
    let screenplayPromptSource: String?
    let screenplayWriteId: String?
    let screenplayAnchorLine: Int?
    let screenplayAnchorEndLine: Int?
    let screenplayAnchorSceneLabel: String?
    let screenplayNoteTitle: String?
    let screenplayNoteBody: String?
    let screenplayInsertedText: String?
    let screenplayReplacementApplied: Bool?
    let screenplayReplacedWriteId: String?
    let screenplayRevisedBlockText: String?
    let screenplayResolvedAnchorExcerpt: String?

    init?(notification: Notification) {
        guard let userInfo = notification.userInfo else { return nil }
        let source = String(describing: userInfo[BackendMemoryAPI.NotificationKey.source] ?? "")
        let turnId = String(describing: userInfo[BackendMemoryAPI.NotificationKey.turnId] ?? "")
        if source.isEmpty || turnId.isEmpty { return nil }
        self.source = source
        self.turnId = turnId
        let requestId = String(describing: userInfo[BackendMemoryAPI.NotificationKey.requestId] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.requestId = requestId.isEmpty ? nil : requestId
        self.sessionId = String(describing: userInfo[BackendMemoryAPI.NotificationKey.sessionId] ?? "")
        self.stateVersion = String(describing: userInfo[BackendMemoryAPI.NotificationKey.stateVersion] ?? "")
        self.lastUpdatedAt = Double(String(describing: userInfo[BackendMemoryAPI.NotificationKey.lastUpdatedAt] ?? "")) ?? 0
        self.historyUpdatedAt = Double(String(describing: userInfo[BackendMemoryAPI.NotificationKey.historyUpdatedAt] ?? "")) ?? 0
        self.memoryUpdatedAt = Double(String(describing: userInfo[BackendMemoryAPI.NotificationKey.memoryUpdatedAt] ?? "")) ?? 0
        self.userMessage = userInfo[BackendMemoryAPI.NotificationKey.userMessage] as? String
        self.assistantMessage = userInfo[BackendMemoryAPI.NotificationKey.assistantMessage] as? String
        func cleanString(_ key: String) -> String? {
            let value = String(describing: userInfo[key] ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty ? nil : value
        }
        func cleanInt(_ key: String) -> Int? {
            if let value = userInfo[key] as? Int { return value }
            let raw = String(describing: userInfo[key] ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return raw.isEmpty ? nil : Int(raw)
        }
        self.screenplayTarget = cleanString(BackendMemoryAPI.NotificationKey.screenplayTarget)
        self.screenplayPromptSource = cleanString(BackendMemoryAPI.NotificationKey.screenplayPromptSource)
        self.screenplayWriteId = cleanString(BackendMemoryAPI.NotificationKey.screenplayWriteId)
        self.screenplayAnchorLine = cleanInt(BackendMemoryAPI.NotificationKey.screenplayAnchorLine)
        self.screenplayAnchorEndLine = cleanInt(BackendMemoryAPI.NotificationKey.screenplayAnchorEndLine)
        self.screenplayAnchorSceneLabel = cleanString(BackendMemoryAPI.NotificationKey.screenplayAnchorSceneLabel)
        self.screenplayNoteTitle = cleanString(BackendMemoryAPI.NotificationKey.screenplayNoteTitle)
        self.screenplayNoteBody = cleanString(BackendMemoryAPI.NotificationKey.screenplayNoteBody)
        self.screenplayInsertedText = cleanString(BackendMemoryAPI.NotificationKey.screenplayInsertedText)
        if let replacementApplied = userInfo[BackendMemoryAPI.NotificationKey.screenplayReplacementApplied] as? Bool {
            self.screenplayReplacementApplied = replacementApplied
        } else {
            let rawReplacement = String(describing: userInfo[BackendMemoryAPI.NotificationKey.screenplayReplacementApplied] ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            self.screenplayReplacementApplied = rawReplacement.isEmpty ? nil : ["1", "true", "yes"].contains(rawReplacement)
        }
        let replacedWriteId = String(describing: userInfo[BackendMemoryAPI.NotificationKey.screenplayReplacedWriteId] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.screenplayReplacedWriteId = replacedWriteId.isEmpty ? nil : replacedWriteId
        let revisedBlockText = String(describing: userInfo[BackendMemoryAPI.NotificationKey.screenplayRevisedBlockText] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.screenplayRevisedBlockText = revisedBlockText.isEmpty ? nil : revisedBlockText
        let resolvedAnchorExcerpt = String(describing: userInfo[BackendMemoryAPI.NotificationKey.screenplayResolvedAnchorExcerpt] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.screenplayResolvedAnchorExcerpt = resolvedAnchorExcerpt.isEmpty ? nil : resolvedAnchorExcerpt
    }
}

nonisolated struct BackendReadResult<Payload> {
    let payload: Payload
    let sync: BackendSyncState
    let notModified: Bool
}

nonisolated struct BackendRememberedName: Decodable, Hashable {
    let name: String
    let relation: String
}

nonisolated struct BackendHistoryThread: Decodable, Hashable, Identifiable {
    let id: String
    let turn: Int
    let title: String
    let preview: String
    let user: String
    let assistant: String
    let updatedAt: TimeInterval
    let requestId: String?
    let screenplayProjectId: String?
    let screenplayTarget: String?
    let screenplayPromptSource: String?
    let screenplayWriteId: String?
    let screenplayAnchorLine: Int?
    let screenplayAnchorEndLine: Int?
    let screenplayAnchorSceneLabel: String?
    let screenplayNoteTitle: String?
    let screenplayNoteBody: String?
    let screenplayInsertedText: String?
    let screenplayReplacementApplied: Bool?
    let screenplayReplacedWriteId: String?
    let screenplayRevisedBlockText: String?
    let screenplayResolvedAnchorExcerpt: String?
}

nonisolated struct BackendActionReceipt: Decodable, Hashable, Identifiable {
    let id: String
    let type: String
    let status: String
    let target: String
    let title: String?
    let summary: String
    let turnId: String?
    let sessionId: String?
    let requestId: String?
    let createdAt: TimeInterval
    let updatedAt: TimeInterval?
}

nonisolated struct BackendActionReceiptsPayload: Decodable, Hashable {
    let count: Int
    let lastActionReceiptAt: TimeInterval?
    let items: [BackendActionReceipt]
}

nonisolated struct BackendHistoryResponse: Decodable {
    let source: String
    let sourceIp: String
    let assistantName: String?
    let userName: String?
    let rememberedNames: [BackendRememberedName]
    let conversationCount: Int
    let lastConversationRecap: String?
    let lastConversationAt: TimeInterval?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let isDelta: Bool?
    let sinceTurnId: String?
    let actionReceipts: BackendActionReceiptsPayload?
    let threads: [BackendHistoryThread]
}

nonisolated struct BackendCharacterBibleArcMemory: Codable, Hashable {
    var act: String?
    var want: String?
    var need: String?
    var wound: String?
    var falseBelief: String?
    var relationshipPressure: String?
    var currentTactic: String?
    var nextEmotionalTurn: String?

    var isMeaningful: Bool {
        [
            act,
            want,
            need,
            wound,
            falseBelief,
            relationshipPressure,
            currentTactic,
            nextEmotionalTurn
        ]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .contains { !$0.isEmpty }
    }

    var payload: [String: String] {
        var out: [String: String] = [:]
        append("act", act, to: &out)
        append("want", want, to: &out)
        append("need", need, to: &out)
        append("wound", wound, to: &out)
        append("false_belief", falseBelief, to: &out)
        append("relationship_pressure", relationshipPressure, to: &out)
        append("current_tactic", currentTactic, to: &out)
        append("next_emotional_turn", nextEmotionalTurn, to: &out)
        return out
    }

    private func append(_ key: String, _ value: String?, to out: inout [String: String]) {
        let clean = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        out[key] = clean
    }
}

nonisolated struct BackendAuthoritativeCharacterField: Codable, Hashable {
    let id: String?
    let field: String
    let value: String
    let source: String?
    let sourceCorrectionId: String?
    let correctionText: String?
    let replacesFacts: [String]?
    let createdAt: TimeInterval?
}

nonisolated struct BackendLearnedFieldProvenance: Codable, Hashable {
    let id: String?
    let field: String
    let value: String
    let learnedValue: String?
    let source: String?
    let status: String?
    let questionId: String?
    let question: String?
    let targetLabel: String?
    let sourceCorrectionId: String?
    let correctionText: String?
    let learnedAt: TimeInterval?
    let updatedAt: TimeInterval?

    var isCorrected: Bool {
        status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "corrected"
    }

    var statusLabel: String {
        isCorrected ? "Corrected" : "Current"
    }

    var sourceLabel: String {
        if isCorrected { return "Writer correction" }
        let normalized = source?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        return normalized == "screenplay_learning_confirmation"
            ? "Learned from your answer"
            : "Story memory"
    }

    var fieldLabel: String {
        switch field.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "falseBelief": return "False belief"
        case "relationshipPressure": return "Relationship pressure"
        case "currentTactic": return "Current tactic"
        case "nextEmotionalTurn": return "Next emotional turn"
        case "protagonistWant": return "Protagonist want"
        case "protagonistNeed": return "Protagonist need"
        case "antagonisticForce": return "Antagonistic force"
        case "centralQuestion": return "Central question"
        case "themeArgument": return "Theme argument"
        case "endingImage": return "Ending image"
        case "sceneObjective": return "Scene objective"
        case "nextScenePlan": return "Next scene"
        case "nextSceneMoves": return "Next moves"
        case "unresolvedSetups": return "Unresolved setup"
        case "unresolvedStoryThreads": return "Unresolved thread"
        case "actThreePayoffPath": return "Act III payoff"
        default:
            return field
                .replacingOccurrences(of: "_", with: " ")
                .capitalized
        }
    }

    var accessibilityKey: String {
        let clean = field
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .map { $0.isLetter || $0.isNumber ? $0 : "-" }
        return String(clean).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}

nonisolated struct BackendCharacterBibleMemory: Codable, Hashable {
    var character: String
    var canon: [String]
    var corrections: [String]
    var correctedTerms: [String]
    var correctionReplacements: [String]
    var authoritativeFields: [BackendAuthoritativeCharacterField]? = nil
    var fieldProvenance: [BackendLearnedFieldProvenance]? = nil
    var arc: BackendCharacterBibleArcMemory?
    var voice: String?
    var tags: [String]?

    var isMeaningful: Bool {
        !character.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        (!canon.isEmpty ||
         !corrections.isEmpty ||
         !correctedTerms.isEmpty ||
         !correctionReplacements.isEmpty ||
         !(authoritativeFields ?? []).isEmpty ||
         !(fieldProvenance ?? []).isEmpty ||
         arc?.isMeaningful == true)
    }

    var payload: [String: Any] {
        var out: [String: Any] = [
            "character": character.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        let canonLines = cleanLines(canon)
        let correctionLines = cleanLines(corrections)
        let corrected = cleanLines(correctedTerms)
        let replacements = cleanLines(correctionReplacements)
        if !canonLines.isEmpty { out["canon"] = canonLines }
        if !correctionLines.isEmpty { out["corrections"] = correctionLines }
        if !corrected.isEmpty { out["corrected_terms"] = corrected }
        if !replacements.isEmpty { out["correction_replacements"] = replacements }
        if let arcPayload = arc?.payload, !arcPayload.isEmpty {
            out["arc"] = arcPayload
        }
        return out
    }

    private func cleanLines(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for value in values {
            let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            out.append(clean)
        }
        return out
    }
}

nonisolated struct BackendCanonCorrectionReceipt: Decodable, Hashable {
    let id: String
    let status: String
    let projectId: String?
    let projectTitle: String?
    let correctionText: String
    let matchedFacts: [String]
    let replacementFacts: [String]?
    let replacementFactIds: [String]?
    let structuredUpdates: [String]?
    let correctionMemoryId: String?
    let createdAt: TimeInterval
    let undoneAt: TimeInterval?

    var canUndo: Bool {
        status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "active"
    }
}

nonisolated struct BackendCanonCorrectionAmbiguity: Codable, Hashable {
    let id: String
    let status: String
    let projectId: String?
    let projectTitle: String?
    let correctionText: String
    let candidateFacts: [String]
    let correctionMemoryId: String?
    let selectedFact: String?
    let selectedFacts: [String]?
    let receiptId: String?
    let createdAt: TimeInterval
    let resolvedAt: TimeInterval?

    var isPending: Bool {
        status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "pending"
    }

    var resolvedFacts: [String] {
        let facts = (selectedFacts ?? [])
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !facts.isEmpty { return facts }
        let legacy = selectedFact?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return legacy.isEmpty ? [] : [legacy]
    }
}

nonisolated struct BackendMemoryCard: Decodable, Hashable, Identifiable {
    let id: String
    let key: String
    let title: String
    let summary: String
    let reason: String?
    let emotionalTone: String
    let salience: Double
    let confidence: Double
    let rememberedAt: TimeInterval
    let lastUsedAt: TimeInterval?
    let qualityScore: Double?
    let qualityHitCount: Int?
    let qualityCorrectionCount: Int?
    let qualityLastFeedbackAt: TimeInterval?
    let stalenessDays: Int?
    let stalenessBand: String?
    let editable: Bool?
    let snippets: [String]
    let referenceHint: String
    let source: String
    let characterBible: BackendCharacterBibleMemory?
    let episodicId: String?
    let projectId: String?
    let projectTitle: String?
    let characterNames: [String]?
    let tags: [String]?
    let isCorrectionMemory: Bool?
    let isSuperseded: Bool?
    let supersededAt: TimeInterval?
    let supersededByMemoryId: String?
    let supersededReason: String?
    let supersededTerms: [String]?
    let correctionReceipt: BackendCanonCorrectionReceipt?
    let correctionAmbiguity: BackendCanonCorrectionAmbiguity?
    let referenceCount: Int?
    let storySpine: BackendStorySpineMemory?
}

nonisolated struct BackendStorySpineMemory: Decodable, Hashable {
    let projectId: String?
    let projectTitle: String?
    let act: String?
    let featureSequence: String?
    let featureObligation: String?
    let sceneLabel: String?
    let sceneObjective: String?
    let sceneSummary: String?
    let currentBeat: String?
    let logline: String?
    let themeArgument: String?
    let centralQuestion: String?
    let protagonistWant: String?
    let protagonistNeed: String?
    let antagonisticForce: String?
    let endingImage: String?
    let actPressureState: String?
    let characterArcState: String?
    let lastSceneOutcome: String?
    let nextScenePlan: String?
    let nextSceneMoves: [String]?
    let nextThreeTurns: [String]?
    let actThreePayoffPath: [String]?
    let beatSequence: [String]?
    let characterFocus: [String]?
    let unresolvedSetups: [String]?
    let unresolvedStoryThreads: [String]?
    let characterArcTurns: [String]?
    let imageMotifs: [String]?
    let continuityNotes: [String]?
    let emotionalContinuity: String?
    let pageCount: Int?
    let targetPages: Int?
    let updatedAt: TimeInterval?
    var fieldProvenance: [BackendLearnedFieldProvenance]? = nil

    var payload: [String: Any] {
        var out: [String: Any] = [:]
        func put(_ key: String, _ value: String?) {
            let clean = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !clean.isEmpty { out[key] = clean }
        }
        func putList(_ key: String, _ value: [String]?) {
            let clean = (value ?? [])
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            if !clean.isEmpty { out[key] = clean }
        }
        put("project_id", projectId)
        put("project_title", projectTitle)
        put("act", act)
        put("feature_sequence", featureSequence)
        put("feature_obligation", featureObligation)
        put("scene_label", sceneLabel)
        put("scene_objective", sceneObjective)
        put("scene_summary", sceneSummary)
        put("current_beat", currentBeat)
        put("logline", logline)
        put("theme_argument", themeArgument)
        put("central_question", centralQuestion)
        put("protagonist_want", protagonistWant)
        put("protagonist_need", protagonistNeed)
        put("antagonistic_force", antagonisticForce)
        put("ending_image", endingImage)
        put("act_pressure_state", actPressureState)
        put("character_arc_state", characterArcState)
        put("last_scene_outcome", lastSceneOutcome)
        put("next_scene_plan", nextScenePlan)
        putList("next_scene_moves", nextSceneMoves)
        putList("next_three_turns", nextThreeTurns)
        putList("act_three_payoff_path", actThreePayoffPath)
        putList("beat_sequence", beatSequence)
        putList("character_focus", characterFocus)
        putList("unresolved_setups", unresolvedSetups)
        putList("unresolved_story_threads", unresolvedStoryThreads)
        putList("character_arc_turns", characterArcTurns)
        putList("image_motifs", imageMotifs)
        putList("continuity_notes", continuityNotes)
        put("emotional_continuity", emotionalContinuity)
        if let pageCount, pageCount > 0 { out["page_count"] = pageCount }
        if let targetPages, targetPages > 0 { out["target_pages"] = targetPages }
        return out
    }
}

nonisolated struct BackendMemoryQualitySnapshot: Decodable, Hashable {
    let avgQualityScore: Double?
    let totalCards: Int?
    let freshCards: Int?
    let warmCards: Int?
    let staleCards: Int?
    let staleThresholdDays: Int?
    let maxStalenessDays: Int?
    let hitCount: Int?
    let correctionCount: Int?
    let lastFeedbackAt: TimeInterval?
    let usefulnessLastAt: TimeInterval?
    let usefulnessLastTrigger: String?
    let usefulnessLastTurn: Int?
    let usefulnessLastPromotions: Int?
    let usefulnessLastDemotions: Int?
    let usefulnessLastDropped: Int?
    let usefulnessPromotionsTotal: Int?
    let usefulnessDemotionsTotal: Int?
    let backfillLastAt: TimeInterval?
    let backfillLastTrigger: String?
    let backfillLastCreated: Int?
    let backfillTotal: Int?
    let promptThemeCount: Int?
    let promptInjectedCount: Int?
    let promptSuppressedCount: Int?
    let promptLastAt: TimeInterval?
    let generatedAt: TimeInterval?
}

nonisolated struct BackendMemoriesResponse: Decodable {
    let source: String
    let sourceIp: String
    let assistantName: String?
    let userName: String?
    let relationshipDepthScore: Double?
    let behaviorMode: String?
    let cycleIndex: Int?
    let season: Int?
    let seasonProgress: Double?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let isDelta: Bool?
    let deltaNoChange: Bool?
    let actionReceipts: BackendActionReceiptsPayload?
    let memoryQuality: BackendMemoryQualitySnapshot?
    let memories: [BackendMemoryCard]
    let conversationSamples: [BackendHistoryThread]
}

nonisolated struct BackendStateDeltaResponse: Decodable {
    let source: String
    let sourceIp: String
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let isDelta: Bool?
    let deltaNoChange: Bool?
    let historyChanged: Bool?
    let memoryChanged: Bool?
    let sinceVersion: String?
    let sinceTurnId: String?
    let actionReceipts: BackendActionReceiptsPayload?
    let continuity: BackendSessionContinuitySnapshot?
    let historyDelta: [BackendHistoryThread]
    let memoriesDelta: [BackendMemoryCard]
}

nonisolated struct BackendActionReceiptsResponse: Decodable {
    let source: String
    let sourceIp: String
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let actionReceipts: BackendActionReceiptsPayload
}

nonisolated struct BackendTaskItem: Decodable, Hashable, Identifiable {
    let id: String
    let title: String
    let status: String
    let priority: String
    let dueAt: TimeInterval
    let createdAt: TimeInterval
    let completedAt: TimeInterval
    let source: String
}

nonisolated struct BackendTasksResponse: Decodable {
    let source: String
    let sourceIp: String
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let statusFilter: String
    let taskLastUpdatedAt: TimeInterval?
    let totalCount: Int
    let openCount: Int
    let completedCount: Int
    let tasks: [BackendTaskItem]
}

nonisolated struct BackendTaskUpdateResponse: Decodable {
    let ok: Bool
    let action: String
    let status: String
    let message: String?
    let task: BackendTaskItem?
    let removedCount: Int?
    let sessionId: String?
    let stateVersion: String?
    let lastTurnId: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let taskLastUpdatedAt: TimeInterval?
    let totalCount: Int?
    let openCount: Int?
    let completedCount: Int?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendDailyRecapStats: Decodable {
    let turnsToday: Int
    let openTasks: Int
    let completedToday: Int
    let totalTasks: Int
}

nonisolated struct BackendDailyRecapResponse: Decodable {
    let source: String
    let sourceIp: String
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let window: String?
    let windowLabel: String?
    let windowStartAt: TimeInterval?
    let windowEndAt: TimeInterval?
    let localDay: String
    let generatedAt: TimeInterval
    let recap: String
    let highlights: [String]
    let outcomes: [String]
    let nextActions: [String]
    let openTasks: [BackendTaskItem]
    let completedToday: [BackendTaskItem]
    let stats: BackendDailyRecapStats
}

nonisolated struct BackendSecretaryEmailResponse: Decodable {
    let stage: String?
    let mode: String?
    let draftSource: String?
    let to: String?
    let subject: String?
    let body: String?
    let status: String?
    let action: String?
    let target: String?
    let transport: String?
    let composeUrl: String?
    let error: String?
}

nonisolated struct BackendSecretaryEmailConnectResponse: Decodable {
    let stage: String?
    let provider: String?
    let mode: String?
    let oauthConfigured: Bool?
    let connectUrl: String?
    let error: String?
}

nonisolated struct BackendMemoryExportResponse: Decodable {
    let source: String
    let sourceIp: String
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let actionReceipts: BackendActionReceiptsPayload?
    let memoryQuality: BackendMemoryQualitySnapshot?
    let filename: String
    let exportedAt: TimeInterval
    let exportJson: String
}

nonisolated struct BackendDataControlResponse: Decodable {
    let ok: Bool
    let action: String
    let sessionId: String?
    let stateVersion: String?
    let lastTurnId: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let memoryQuality: BackendMemoryQualitySnapshot?
}

nonisolated struct BackendAccountDeletionResponse: Decodable, Equatable {
    let status: String
    let pendingDeletionAt: String?
    let hardDeleteAt: String?
    let recoveryWindowDays: Int?
}

nonisolated struct BackendAccountExportArtifact: Equatable {
    let filename: String
    let contentType: String
    let data: Data
}

nonisolated struct BackendMemoryStatsCounts: Decodable, Hashable {
    let characters: Int
    let charactersWithVoice: Int
    let charactersWithTraits: Int
    let toneSignals: Int
    let habitSignals: Int
}

nonisolated struct BackendMemoryStatsResponse: Decodable, Hashable {
    let schemaVersion: Int
    let hasMemory: Bool
    let counts: BackendMemoryStatsCounts
    let lastUpdatedMs: TimeInterval?
    let error: String?

    var lastUpdatedDate: Date? {
        guard let lastUpdatedMs, lastUpdatedMs > 0 else { return nil }
        return Date(timeIntervalSince1970: lastUpdatedMs / 1000.0)
    }

    var diagnosticsSummary: String {
        guard hasMemory else { return "No companion memory yet." }
        return [
            "\(counts.characters) characters",
            "\(counts.charactersWithVoice) voices",
            "\(counts.charactersWithTraits) trait sets",
            "\(counts.toneSignals) tone signals",
            "\(counts.habitSignals) habit signals",
        ].joined(separator: " · ")
    }
}

nonisolated struct BackendCharacterMentionReceipt: Decodable, Equatable {
    let ok: Bool?
    let action: String?
    let characterName: String?
    let source: String?
}

nonisolated struct BackendRealtimeTurnCommitResponse: Decodable {
    let ok: Bool
    let action: String
    let status: String
    let source: String?
    let turnId: String?
    let requestId: String?
    let sessionId: String?
    let stateVersion: String?
    let lastTurnId: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let canonClarification: BackendCanonCorrectionAmbiguity?
    let screenplayQuestionResolution: BackendRealtimeScreenplayQuestionResolution?
}

nonisolated struct BackendRealtimeScreenplayQuestionResolution: Decodable, Equatable {
    let questionId: String
    let responseStatus: String
    let targetField: String?
    let learningPromoted: Bool?
    let correctionProtected: Bool?
}

nonisolated struct BackendScreenplayCharacterArcMemory: Codable, Hashable {
    let character: String
    let act: String
    let want: String
    let need: String
    let wound: String
    let falseBelief: String
    let relationshipPressure: String
    let currentTactic: String
    let nextEmotionalTurn: String

    init(
        character: String = "",
        act: String = "",
        want: String = "",
        need: String = "",
        wound: String = "",
        falseBelief: String = "",
        relationshipPressure: String = "",
        currentTactic: String = "",
        nextEmotionalTurn: String = ""
    ) {
        self.character = Self.clean(character, limit: 80)
        self.act = Self.clean(act, limit: 80)
        self.want = Self.clean(want, limit: 180)
        self.need = Self.clean(need, limit: 180)
        self.wound = Self.clean(wound, limit: 180)
        self.falseBelief = Self.clean(falseBelief, limit: 180)
        self.relationshipPressure = Self.clean(relationshipPressure, limit: 180)
        self.currentTactic = Self.clean(currentTactic, limit: 180)
        self.nextEmotionalTurn = Self.clean(nextEmotionalTurn, limit: 180)
    }

    var isMeaningful: Bool {
        [
            want,
            need,
            wound,
            falseBelief,
            relationshipPressure,
            currentTactic,
            nextEmotionalTurn,
        ]
            .contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var payload: [String: String] {
        var out: [String: String] = [:]
        Self.append("character", character, to: &out)
        Self.append("act", act, to: &out)
        Self.append("want", want, to: &out)
        Self.append("need", need, to: &out)
        Self.append("wound", wound, to: &out)
        Self.append("false_belief", falseBelief, to: &out)
        Self.append("relationship_pressure", relationshipPressure, to: &out)
        Self.append("current_tactic", currentTactic, to: &out)
        Self.append("next_emotional_turn", nextEmotionalTurn, to: &out)
        return out
    }

    private static func append(_ key: String, _ value: String, to out: inout [String: String]) {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        out[key] = clean
    }

    private static func clean(_ value: String, limit: Int) -> String {
        let compact = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return String(compact.prefix(max(0, limit)))
    }
}

nonisolated struct BackendScreenplayCharacterVoiceFingerprint: Codable, Hashable {
    let tactics: [String]
    let silence: String
    let emotionalTells: [String]

    enum CodingKeys: String, CodingKey {
        case tactics
        case silence
        case emotionalTells = "emotional_tells"
    }

    init(
        tactics: [String] = [],
        silence: String = "",
        emotionalTells: [String] = []
    ) {
        self.tactics = Self.cleanList(tactics, maxItems: 6, itemLimit: 80)
        self.silence = Self.clean(silence, limit: 120)
        self.emotionalTells = Self.cleanList(emotionalTells, maxItems: 6, itemLimit: 100)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            tactics: try container.decodeIfPresent([String].self, forKey: .tactics) ?? [],
            silence: try container.decodeIfPresent(String.self, forKey: .silence) ?? "",
            emotionalTells: try container.decodeIfPresent([String].self, forKey: .emotionalTells) ?? []
        )
    }

    var isMeaningful: Bool {
        !tactics.isEmpty ||
        !silence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !emotionalTells.isEmpty
    }

    var payload: [String: Any] {
        var out: [String: Any] = [:]
        if !tactics.isEmpty { out["tactics"] = tactics }
        if !silence.isEmpty { out["silence"] = silence }
        if !emotionalTells.isEmpty { out["emotional_tells"] = emotionalTells }
        return out
    }

    private static func cleanList(_ values: [String], maxItems: Int, itemLimit: Int) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for value in values {
            let compact = clean(value, limit: itemLimit)
            guard !compact.isEmpty else { continue }
            let key = compact.lowercased()
            guard seen.insert(key).inserted else { continue }
            out.append(compact)
            if out.count >= maxItems { break }
        }
        return out
    }

    private static func clean(_ value: String, limit: Int) -> String {
        let compact = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return String(compact.prefix(max(0, limit)))
    }
}

nonisolated struct BackendScreenplayCharacterVoiceMemory: Codable, Hashable {
    let character: String
    let voiceFingerprint: BackendScreenplayCharacterVoiceFingerprint

    enum CodingKeys: String, CodingKey {
        case character
        case voiceFingerprint = "voice_fingerprint"
    }

    init(
        character: String,
        voiceFingerprint: BackendScreenplayCharacterVoiceFingerprint
    ) {
        self.character = character
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .prefix(80)
            .description
        self.voiceFingerprint = voiceFingerprint
    }

    var isMeaningful: Bool {
        !character.isEmpty && voiceFingerprint.isMeaningful
    }

    var payload: [String: Any] {
        guard isMeaningful else { return [:] }
        return [
            "character": character,
            "voice_fingerprint": voiceFingerprint.payload,
        ]
    }
}

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

nonisolated struct BackendMemoryMutationResponse: Decodable {
    let ok: Bool
    let action: String
    let status: String
    let message: String?
    let memoryCard: BackendMemoryCard?
    let forgottenId: String?
    let themeKey: String?
    let storySpineRepaired: Bool?
    let storySpineRepairCount: Int?
    let correctionReceipt: BackendCanonCorrectionReceipt?
    let correctionAmbiguity: BackendCanonCorrectionAmbiguity?
    let sessionId: String?
    let stateVersion: String?
    let lastTurnId: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendDueStoryThread: Decodable, Hashable {
    let kind: String
    let setup: String
    let promisedPayoff: String
    let sourceSceneHeading: String
    let sourceSceneSummary: String
    let sourceSceneOutcome: String
    let sourceAct: String
    let ageInScenes: Int
    let acceptedSceneCount: Int

    var isMeaningful: Bool {
        !setup.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !promisedPayoff.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private enum CodingKeys: String, CodingKey {
        case kind
        case setup
        case promisedPayoff
        case sourceSceneHeading
        case sourceSceneSummary
        case sourceSceneOutcome
        case sourceAct
        case ageInScenes
        case acceptedSceneCount
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decodeIfPresent(String.self, forKey: .kind) ?? ""
        setup = try container.decodeIfPresent(String.self, forKey: .setup) ?? ""
        promisedPayoff = try container.decodeIfPresent(String.self, forKey: .promisedPayoff) ?? ""
        sourceSceneHeading = try container.decodeIfPresent(String.self, forKey: .sourceSceneHeading) ?? ""
        sourceSceneSummary = try container.decodeIfPresent(String.self, forKey: .sourceSceneSummary) ?? ""
        sourceSceneOutcome = try container.decodeIfPresent(String.self, forKey: .sourceSceneOutcome) ?? ""
        sourceAct = try container.decodeIfPresent(String.self, forKey: .sourceAct) ?? ""
        ageInScenes = try container.decodeIfPresent(Int.self, forKey: .ageInScenes) ?? 0
        acceptedSceneCount = try container.decodeIfPresent(Int.self, forKey: .acceptedSceneCount) ?? 0
    }
}

nonisolated struct BackendAcceptedCausalFact: Decodable, Hashable {
    let kind: String
    let fact: String
    let authority: String
    let sourceCorrectionId: String
    let replacesFacts: [String]
    let structuredUpdates: [String]
    let createdAt: TimeInterval
    let sourceSceneHeading: String
    let sourceAct: String
    let ageInScenes: Int

    var isMeaningful: Bool {
        !fact.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private enum CodingKeys: String, CodingKey {
        case kind
        case fact
        case authority
        case sourceCorrectionId
        case replacesFacts
        case structuredUpdates
        case createdAt
        case sourceSceneHeading
        case sourceAct
        case ageInScenes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decodeIfPresent(String.self, forKey: .kind) ?? ""
        fact = try container.decodeIfPresent(String.self, forKey: .fact) ?? ""
        authority = try container.decodeIfPresent(String.self, forKey: .authority) ?? ""
        sourceCorrectionId = try container.decodeIfPresent(String.self, forKey: .sourceCorrectionId) ?? ""
        replacesFacts = try container.decodeIfPresent([String].self, forKey: .replacesFacts) ?? []
        structuredUpdates = try container.decodeIfPresent([String].self, forKey: .structuredUpdates) ?? []
        createdAt = try container.decodeIfPresent(TimeInterval.self, forKey: .createdAt) ?? 0
        sourceSceneHeading = try container.decodeIfPresent(String.self, forKey: .sourceSceneHeading) ?? ""
        sourceAct = try container.decodeIfPresent(String.self, forKey: .sourceAct) ?? ""
        ageInScenes = try container.decodeIfPresent(Int.self, forKey: .ageInScenes) ?? 0
    }
}

nonisolated struct BackendSessionContinuitySnapshot: Decodable, Hashable {
    let hasContinuity: Bool
    let source: String
    let openingLine: String
    let projectId: String
    let projectTitle: String
    let act: String
    let featureSequence: String
    let featureObligation: String
    let sceneObjective: String
    let sceneSummary: String
    let currentBeat: String
    let logline: String
    let themeArgument: String
    let centralQuestion: String
    let protagonistWant: String
    let protagonistNeed: String
    let antagonisticForce: String
    let endingImage: String
    let actPressureState: String
    let characterArcState: String
    let lastSceneOutcome: String
    let nextScenePlan: String
    let nextSceneMoves: [String]
    let nextThreeTurns: [String]
    let actThreePayoffPath: [String]
    let characterFocus: [String]
    let unresolvedSetups: [String]
    let unresolvedStoryThreads: [String]
    let characterArcTurns: [String]
    let imageMotifs: [String]
    let continuityNotes: [String]
    let emotionalContinuity: String
    let pageCount: Int
    let targetPages: Int
    let memoryExcerpt: String
    let isCorrection: Bool
    let updatedAt: TimeInterval
    let acceptedCausalFacts: [BackendAcceptedCausalFact]
    let dueStoryThread: BackendDueStoryThread?

    var isMeaningful: Bool {
        hasContinuity && ([
            openingLine,
            projectTitle,
            projectId,
            act,
            featureSequence,
            featureObligation,
            sceneObjective,
            sceneSummary,
            currentBeat,
            logline,
            themeArgument,
            centralQuestion,
            protagonistWant,
            protagonistNeed,
            antagonisticForce,
            endingImage,
            actPressureState,
            characterArcState,
            lastSceneOutcome,
            nextScenePlan,
            emotionalContinuity,
            memoryExcerpt
        ]
            .contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty } ||
            !nextSceneMoves.isEmpty ||
            !nextThreeTurns.isEmpty ||
            !actThreePayoffPath.isEmpty ||
            !characterFocus.isEmpty ||
            !unresolvedSetups.isEmpty ||
            !unresolvedStoryThreads.isEmpty ||
            !characterArcTurns.isEmpty ||
            !imageMotifs.isEmpty ||
            !continuityNotes.isEmpty ||
            acceptedCausalFacts.contains(where: \.isMeaningful) ||
            dueStoryThread?.isMeaningful == true ||
            pageCount > 0 ||
            targetPages > 0)
    }

    private enum CodingKeys: String, CodingKey {
        case hasContinuity
        case source
        case openingLine
        case projectId
        case projectTitle
        case act
        case featureSequence
        case featureObligation
        case sceneObjective
        case sceneSummary
        case currentBeat
        case logline
        case themeArgument
        case centralQuestion
        case protagonistWant
        case protagonistNeed
        case antagonisticForce
        case endingImage
        case actPressureState
        case characterArcState
        case lastSceneOutcome
        case nextScenePlan
        case nextSceneMoves
        case nextThreeTurns
        case actThreePayoffPath
        case characterFocus
        case unresolvedSetups
        case unresolvedStoryThreads
        case characterArcTurns
        case imageMotifs
        case continuityNotes
        case emotionalContinuity
        case pageCount
        case targetPages
        case memoryExcerpt
        case isCorrection
        case updatedAt
        case acceptedCausalFacts
        case dueStoryThread
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        hasContinuity = try container.decodeIfPresent(Bool.self, forKey: .hasContinuity) ?? false
        source = try container.decodeIfPresent(String.self, forKey: .source) ?? ""
        openingLine = try container.decodeIfPresent(String.self, forKey: .openingLine) ?? ""
        projectId = try container.decodeIfPresent(String.self, forKey: .projectId) ?? ""
        projectTitle = try container.decodeIfPresent(String.self, forKey: .projectTitle) ?? ""
        act = try container.decodeIfPresent(String.self, forKey: .act) ?? ""
        featureSequence = try container.decodeIfPresent(String.self, forKey: .featureSequence) ?? ""
        featureObligation = try container.decodeIfPresent(String.self, forKey: .featureObligation) ?? ""
        sceneObjective = try container.decodeIfPresent(String.self, forKey: .sceneObjective) ?? ""
        sceneSummary = try container.decodeIfPresent(String.self, forKey: .sceneSummary) ?? ""
        currentBeat = try container.decodeIfPresent(String.self, forKey: .currentBeat) ?? ""
        logline = try container.decodeIfPresent(String.self, forKey: .logline) ?? ""
        themeArgument = try container.decodeIfPresent(String.self, forKey: .themeArgument) ?? ""
        centralQuestion = try container.decodeIfPresent(String.self, forKey: .centralQuestion) ?? ""
        protagonistWant = try container.decodeIfPresent(String.self, forKey: .protagonistWant) ?? ""
        protagonistNeed = try container.decodeIfPresent(String.self, forKey: .protagonistNeed) ?? ""
        antagonisticForce = try container.decodeIfPresent(String.self, forKey: .antagonisticForce) ?? ""
        endingImage = try container.decodeIfPresent(String.self, forKey: .endingImage) ?? ""
        actPressureState = try container.decodeIfPresent(String.self, forKey: .actPressureState) ?? ""
        characterArcState = try container.decodeIfPresent(String.self, forKey: .characterArcState) ?? ""
        lastSceneOutcome = try container.decodeIfPresent(String.self, forKey: .lastSceneOutcome) ?? ""
        nextScenePlan = try container.decodeIfPresent(String.self, forKey: .nextScenePlan) ?? ""
        nextSceneMoves = try container.decodeIfPresent([String].self, forKey: .nextSceneMoves) ?? []
        nextThreeTurns = try container.decodeIfPresent([String].self, forKey: .nextThreeTurns) ?? []
        actThreePayoffPath = try container.decodeIfPresent([String].self, forKey: .actThreePayoffPath) ?? []
        characterFocus = try container.decodeIfPresent([String].self, forKey: .characterFocus) ?? []
        unresolvedSetups = try container.decodeIfPresent([String].self, forKey: .unresolvedSetups) ?? []
        unresolvedStoryThreads = try container.decodeIfPresent([String].self, forKey: .unresolvedStoryThreads) ?? []
        characterArcTurns = try container.decodeIfPresent([String].self, forKey: .characterArcTurns) ?? []
        imageMotifs = try container.decodeIfPresent([String].self, forKey: .imageMotifs) ?? []
        continuityNotes = try container.decodeIfPresent([String].self, forKey: .continuityNotes) ?? []
        emotionalContinuity = try container.decodeIfPresent(String.self, forKey: .emotionalContinuity) ?? ""
        pageCount = try container.decodeIfPresent(Int.self, forKey: .pageCount) ?? 0
        targetPages = try container.decodeIfPresent(Int.self, forKey: .targetPages) ?? 0
        memoryExcerpt = try container.decodeIfPresent(String.self, forKey: .memoryExcerpt) ?? ""
        isCorrection = try container.decodeIfPresent(Bool.self, forKey: .isCorrection) ?? false
        updatedAt = try container.decodeIfPresent(TimeInterval.self, forKey: .updatedAt) ?? 0
        acceptedCausalFacts = try container.decodeIfPresent([BackendAcceptedCausalFact].self, forKey: .acceptedCausalFacts) ?? []
        dueStoryThread = try container.decodeIfPresent(BackendDueStoryThread.self, forKey: .dueStoryThread)
    }
}

nonisolated struct BackendSessionResponse: Decodable {
    let userId: String?
    let authenticated: Bool?
    let clientToken: String
    let sessionId: String?
    let expiresIn: Int
    let assistantName: String?
    let assistantSelfName: String?
    let userName: String?
    let rememberedNames: [BackendRememberedName]
    let lastConversationRecap: String?
    let lastConversationSnapshot: String?
    let lastConversationAt: TimeInterval?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let evolutionSync: BackendEvolutionSyncSnapshot?
    let continuity: BackendSessionContinuitySnapshot?
    let pendingScreenplayQuestion: BackendPendingScreenplayQuestion?
}

nonisolated struct BackendPendingScreenplayQuestion: Decodable, Equatable {
    let id: String
    let projectId: String
    let projectTitle: String
    let targetField: String
    let targetLabel: String
    let question: String
    let askedAt: TimeInterval?
}

nonisolated struct BackendScreenplayQuestionResolutionResponse: Decodable, Equatable {
    let ok: Bool
    let action: String?
    let status: String
    let questionId: String
    let responseStatus: String
    let targetField: String?
    let learningPromoted: Bool?
    let correctionProtected: Bool?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendAuthUser: Codable, Hashable {
    let userId: String
    let email: String
    let authProvider: String?
    let emailVerified: Bool
    let emailVerifiedAt: TimeInterval?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
}

nonisolated enum BackendAuthDebugSessionPolicy {
    static func syntheticUser(
        signedIn: Bool,
        accessToken: String,
        userID: String,
        email: String
    ) -> BackendAuthUser? {
        let cleanToken = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanUserID = userID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard signedIn, !cleanToken.isEmpty, !cleanUserID.isEmpty else { return nil }
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return BackendAuthUser(
            userId: cleanUserID,
            email: cleanEmail,
            authProvider: "debug",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }
}

nonisolated struct BackendAuthEmailDelivery: Decodable, Hashable {
    let status: String?
    let action: String?
    let transport: String?
    let composeUrl: String?
    let error: String?
}

nonisolated struct BackendAuthEnvelope: Decodable {
    let ok: Bool
    let user: BackendAuthUser?
    let token: String?
    let accessToken: String?
    let accessExpiresIn: Int?
    let refreshToken: String?
    let refreshExpiresIn: Int?
    let refreshTokenTransport: String?
    let refreshCookieSet: Bool?
    let currentSessionId: String?
    let currentFamilyId: String?
    let tokenType: String?
    let expiresIn: Int?
    let pendingEmailVerification: Bool?
    let verificationRequired: Bool?
    let passwordResetRequested: Bool?
    let passwordReset: Bool?
    let emailVerificationRequested: Bool?
    let emailVerified: Bool?
    let alreadyVerified: Bool?
    let loggedOut: Bool?
    let revokedAccessToken: Bool?
    let revokedRefreshToken: Bool?
    let refreshCookieCleared: Bool?
    let emailDelivery: BackendAuthEmailDelivery?
    let debugPasswordResetToken: String?
    let debugEmailVerificationToken: String?
}

nonisolated struct BackendAuthManagedSession: Decodable, Hashable, Identifiable {
    let sessionId: String
    let familyId: String?
    let userId: String?
    let email: String?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
    let expiresAt: TimeInterval?
    let revokedAt: TimeInterval?
    let replacedBySessionId: String?
    let device: BackendAuthSessionDevice?
    let state: String

    var id: String { sessionId }
    var isActive: Bool { state == "active" }
}

nonisolated struct BackendAuthSessionDevice: Decodable, Hashable {
    let label: String?
    let clientName: String?
    let clientPlatform: String?
    let clientVersion: String?
    let clientBuild: String?
    let userAgent: String?
    let authTransport: String?
    let lastSeenAt: TimeInterval?
}

nonisolated struct BackendAuthSessionsResponse: Decodable {
    let ok: Bool
    let sessions: [BackendAuthManagedSession]
}

nonisolated struct BackendAuthSessionRevokeResponse: Decodable {
    let ok: Bool
    let revoked: Bool?
    let session: BackendAuthManagedSession?
    let familyId: String?
    let userId: String?

}

nonisolated struct BackendAuthSessionState: Equatable {
    let user: BackendAuthUser?
    let accessTokenPresent: Bool
    let refreshTokenPresent: Bool
    let accessExpiresAt: TimeInterval
    let refreshExpiresAt: TimeInterval
    let currentSessionId: String
    let currentFamilyId: String
    let tokenType: String
    let pendingEmailVerification: Bool
    let verificationRequired: Bool

    var isAuthenticated: Bool {
        user != nil && accessTokenPresent
    }

    var email: String {
        user?.email ?? ""
    }

    var emailVerified: Bool {
        user?.emailVerified ?? false
    }

    var accessExpired: Bool {
        accessExpiresAt > 0 && accessExpiresAt <= Date().timeIntervalSince1970
    }

    static let signedOut = BackendAuthSessionState(
        user: nil,
        accessTokenPresent: false,
        refreshTokenPresent: false,
        accessExpiresAt: 0,
        refreshExpiresAt: 0,
        currentSessionId: "",
        currentFamilyId: "",
        tokenType: "Bearer",
        pendingEmailVerification: false,
        verificationRequired: false
    )
}

nonisolated struct BackendEvolutionSyncSnapshot: Decodable {
    let stage: Int?
    let depthScore: Double?
    let romanceTension: Double?
    let sessionCount: Int?
    let reassuranceNeed: Double?
    let boundaryNeed: Double?
    let playfulMomentum: Double?
    let trustSignal: Double?
    let lastThemeCue: String?
    let preferredName: String?
    let isScreenwriter: Bool?
}

nonisolated struct BackendScreenplayVersion: Decodable, Hashable {
    let id: String
    let projectId: String?
    let phase: String?
    let source: String?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
    let prompt: String?
    let notes: String?
    let formatScore: Double?
    let storyScore: Double?
    let confidenceClass: String?
    let warnings: [String]?
    let draft: String?
    let draftExcerpt: String?
    let studioWriteAnchors: [BackendScreenplayWriteAnchor]?
    let screenplayBindings: [BackendScreenplayBindingRecord]?
}

nonisolated struct BackendScreenplayWriteAnchor: Codable, Hashable {
    let writeId: String
    let anchorLine: Int?
    let anchorEndLine: Int?
    let anchorSceneLabel: String?
    let anchorExcerpt: String?
    let insertedText: String?
    let updatedAt: TimeInterval?
}

nonisolated struct BackendScreenplayBindingRecord: Codable, Hashable {
    let draftSceneId: String
    let draftLine: Int?
    let draftEndLine: Int?
    let draftSlugline: String?
    let draftShortLabel: String?
    let outlineSceneId: String?
    let outlineSceneTitle: String?
    let outlineSceneSlugline: String?
    let outlineBeatIds: [String]?
    let outlineBeatLabels: [String]?
    let actTitle: String?
    let matchedBy: String?
    let updatedAt: TimeInterval?
}

nonisolated struct BackendScreenplayThreadViewState: Codable, Hashable {
    let searchText: String?
    let selectedFilterRaw: String?
    let selectedSceneKey: String?
    let scrollTargetKey: String?
    let collapsedSectionKeys: [String]?
    let focusedDiffKey: String?
    let reopenedLineageKeys: [String]?
    let latestReopenedWriteID: String?

    private enum CodingKeys: String, CodingKey {
        case searchText
        case selectedFilterRaw
        case selectedSceneKey
        case scrollTargetKey
        case collapsedSectionKeys
        case focusedDiffKey
        case reopenedLineageKeys
        case latestReopenedWriteID = "latestReopenedWriteId"
    }
}

nonisolated struct BackendScreenplayDiffAcknowledgementEntry: Codable, Hashable {
    let key: String?
    let fingerprint: String?
    let writeId: String?
}

nonisolated struct BackendScreenplayDiffAcknowledgementState: Codable, Hashable {
    let keys: [String]?
    let entries: [BackendScreenplayDiffAcknowledgementEntry]?
}

nonisolated struct BackendScreenplayStudioExchange: Codable, Hashable {
    let id: String
    let backendThreadId: String?
    let backendTurn: Int?
    let requestId: String?
    let prompt: String?
    let target: String?
    let source: String?
    let noteTitle: String?
    let noteBody: String?
    let developmentText: String?
    let writeId: String?
    let replacedWriteId: String?
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
    let timestamp: String?
}

nonisolated struct BackendScreenplayCollaborator: Decodable, Hashable {
    let id: String?
    let email: String
    let status: String?
    let approvedAt: TimeInterval?
    let updatedAt: TimeInterval?
    let invitedBy: String?
    let note: String?
}

nonisolated struct BackendScreenplayComment: Decodable, Hashable {
    let id: String
    let projectId: String?
    let versionId: String?
    let type: String?
    let text: String?
    let authorEmail: String?
    let authorName: String?
    let anchorLine: Int?
    let parentCommentId: String?
    let threadRootId: String?
    let isDeleted: Bool?
    let deletedAt: TimeInterval?
    let resolved: Bool?
    let resolvedAt: TimeInterval?
    let resolvedBy: String?
    let voiceUrl: String?
    let voiceTranscript: String?
    let voiceDurationMs: Int?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
    let canEdit: Bool?
}

nonisolated struct BackendScreenplayAct: Codable, Hashable {
    let id: String
    let title: String
    let summary: String?
    let order: Int?
    let sceneIds: [String]?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
}

nonisolated struct BackendScreenplayScene: Codable, Hashable {
    let id: String
    let slugline: String?
    let title: String
    let objective: String?
    let summary: String?
    let actId: String?
    let order: Int?
    let status: String?
    let beatIds: [String]?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
}

nonisolated struct BackendScreenplayBeat: Codable, Hashable {
    let id: String
    let label: String
    let summary: String?
    let sceneId: String?
    let actId: String?
    let order: Int?
    let status: String?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
}

nonisolated struct BackendScreenplayOutline: Decodable, Hashable {
    let updatedAt: TimeInterval?
    let actCount: Int?
    let sceneCount: Int?
    let beatCount: Int?
    let acts: [BackendScreenplayAct]
    let scenes: [BackendScreenplayScene]
    let beats: [BackendScreenplayBeat]
}

nonisolated struct BackendScreenplayProjectSummary: Decodable, Hashable {
    let id: String
    let title: String
    let archived: Bool?
    let tags: [String]?
    let characters: [String]?
    let setting: String?
    let tone: String?
    let promptSeed: String?
    let logline: String?
    let themeArgument: String?
    let centralQuestion: String?
    let protagonistWant: String?
    let protagonistNeed: String?
    let antagonisticForce: String?
    let actPosition: String?
    let endingImage: String?
    let unresolvedSetups: [String]?
    let createdAt: TimeInterval?
    let updatedAt: TimeInterval?
    let versionCount: Int?
    let lastPhase: String?
    let activeVersionId: String?
    let lastVersionId: String?
    let lastVersionAt: TimeInterval?
    let formatScore: Double?
    let storyScore: Double?
    let confidenceClass: String?
    let latestExcerpt: String?
    let actCount: Int?
    let sceneCount: Int?
    let beatCount: Int?
    let outlineUpdatedAt: TimeInterval?
    let collaboratorCount: Int?
    let approvedEmails: [String]?
    let commentCount: Int?
    let lastCommentAt: TimeInterval?
    let studioThreadViewState: BackendScreenplayThreadViewState?
    let studioDiffAcknowledged: BackendScreenplayDiffAcknowledgementState?
    let studioAskNoteHistory: [BackendScreenplayStudioExchange]?
    let collaborators: [BackendScreenplayCollaborator]?
    let comments: [BackendScreenplayComment]?
    let versions: [BackendScreenplayVersion]?
    let outline: BackendScreenplayOutline?
}

nonisolated struct BackendScreenplayCompanionStateResponse: Decodable {
    let stage: String?
    let status: String?
    let source: String?
    let sourceIp: String?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let modeRaw: String
    let recentTurns: [ScreenplayConversationTurn]
    let analytics: ScreenplayCompanionAnalyticsSnapshot
    let signals: CreativeCompanionSignalState

    private enum CodingKeys: String, CodingKey {
        case stage
        case status
        case source
        case sourceIp
        case sessionId
        case stateVersion
        case lastUpdatedAt
        case historyUpdatedAt
        case memoryUpdatedAt
        case lastTurnId
        case schemaVersion
        case backendBuild
        case backendBootId
        case modeRaw
        case recentTurns
        case analytics
        case signals
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        stage = try container.decodeIfPresent(String.self, forKey: .stage)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        source = try container.decodeIfPresent(String.self, forKey: .source)
        sourceIp = try container.decodeIfPresent(String.self, forKey: .sourceIp)
        sessionId = try container.decodeIfPresent(String.self, forKey: .sessionId)
        stateVersion = try container.decodeIfPresent(String.self, forKey: .stateVersion)
        lastUpdatedAt = try container.decodeIfPresent(TimeInterval.self, forKey: .lastUpdatedAt)
        historyUpdatedAt = try container.decodeIfPresent(TimeInterval.self, forKey: .historyUpdatedAt)
        memoryUpdatedAt = try container.decodeIfPresent(TimeInterval.self, forKey: .memoryUpdatedAt)
        lastTurnId = try container.decodeIfPresent(String.self, forKey: .lastTurnId)
        schemaVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion)
        backendBuild = try container.decodeIfPresent(String.self, forKey: .backendBuild)
        backendBootId = try container.decodeIfPresent(String.self, forKey: .backendBootId)
        modeRaw = try container.decodeIfPresent(String.self, forKey: .modeRaw) ?? StudioCompanionMode.coach.rawValue
        recentTurns = try container.decodeIfPresent([ScreenplayConversationTurn].self, forKey: .recentTurns) ?? []
        analytics = try container.decodeIfPresent(ScreenplayCompanionAnalyticsSnapshot.self, forKey: .analytics) ?? .empty
        signals = try container.decodeIfPresent(CreativeCompanionSignalState.self, forKey: .signals) ?? .empty
    }
}

nonisolated struct BackendScreenplayProjectsResponse: Decodable {
    let stage: String?
    let source: String?
    let sourceIp: String?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let screenplayActiveProjectId: String?
    let screenplayProjectCount: Int?
    let screenplayProjects: [BackendScreenplayProjectSummary]
}

nonisolated struct BackendScreenplayProjectResponse: Decodable {
    let stage: String?
    let source: String?
    let sourceIp: String?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let screenplayActiveProjectId: String?
    let screenplayProjectCount: Int?
    let project: BackendScreenplayProjectSummary?
}

nonisolated struct BackendScreenplayProjectMutationResponse: Decodable {
    let stage: String?
    let status: String?
    let created: Bool?
    let projectId: String?
    let project: BackendScreenplayProjectSummary?
    let screenplayActiveProjectId: String?
    let screenplayProjectCount: Int?
    let screenplayProjects: [BackendScreenplayProjectSummary]?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendScreenplayOutlineResponse: Decodable {
    let stage: String?
    let source: String?
    let sourceIp: String?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
    let projectId: String?
    let outline: BackendScreenplayOutline?
    let project: BackendScreenplayProjectSummary?
}

nonisolated struct BackendScreenplayOutlineMutationResponse: Decodable {
    let stage: String?
    let status: String?
    let createdProject: Bool?
    let projectId: String?
    let project: BackendScreenplayProjectSummary?
    let outline: BackendScreenplayOutline?
    let screenplayActiveProjectId: String?
    let screenplayProjectCount: Int?
    let screenplayProjects: [BackendScreenplayProjectSummary]?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendScreenplaySceneMutationResponse: Decodable {
    let stage: String?
    let status: String?
    let projectId: String?
    let sceneId: String?
    let scene: BackendScreenplayScene?
    let project: BackendScreenplayProjectSummary?
    let outline: BackendScreenplayOutline?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendScreenplayBeatMutationResponse: Decodable {
    let stage: String?
    let status: String?
    let projectId: String?
    let beatId: String?
    let beat: BackendScreenplayBeat?
    let project: BackendScreenplayProjectSummary?
    let outline: BackendScreenplayOutline?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendScreenplayCollaboratorsResponse: Decodable {
    let stage: String?
    let status: String?
    let projectId: String?
    let collaboratorCount: Int?
    let approvedEmails: [String]?
    let collaborator: BackendScreenplayCollaborator?
    let collaborators: [BackendScreenplayCollaborator]
    let project: BackendScreenplayProjectSummary?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendScreenplayCommentsResponse: Decodable {
    let stage: String?
    let status: String?
    let projectId: String?
    let commentCount: Int?
    let comment: BackendScreenplayComment?
    let comments: [BackendScreenplayComment]
    let project: BackendScreenplayProjectSummary?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendScreenplayVersionMutationResponse: Decodable {
    let stage: String?
    let status: String?
    let createdProject: Bool?
    let projectId: String?
    let versionId: String?
    let version: BackendScreenplayVersion?
    let project: BackendScreenplayProjectSummary?
    let formatScore: Double?
    let storyScore: Double?
    let confidenceClass: String?
    let warnings: [String]?
    let baseVersionId: String?
    let serverVersionId: String?
    let serverVersion: BackendScreenplayVersion?
    let conflict: Bool?
    let sessionId: String?
    let stateVersion: String?
    let lastUpdatedAt: TimeInterval?
    let historyUpdatedAt: TimeInterval?
    let memoryUpdatedAt: TimeInterval?
    let lastTurnId: String?
    let schemaVersion: Int?
    let backendBuild: String?
    let backendBootId: String?
}

nonisolated struct BackendScreenplayPaginationPage: Decodable, Hashable {
    let page: Int
    let startLine: Int
    let endLine: Int
    let lineCount: Int
    let preview: String?
    let estMinutes: Double?
}

nonisolated struct BackendScreenplayPaginateResponse: Decodable {
    let stage: String?
    let mode: String?
    let title: String?
    let phase: String?
    let targetPages: Int?
    let pageCount: Int
    let lineCount: Int
    let linesPerPage: Int
    let pages: [BackendScreenplayPaginationPage]
    let lengthProfile: String?
}

nonisolated struct BackendScreenplayRevisionSummary: Decodable, Hashable {
    let unchanged: Int
    let revised: Int
    let added: Int
    let moved: Int
    let removed: Int
}

nonisolated struct BackendScreenplayRevisionRange: Decodable, Hashable {
    let startLine: Int
    let endLine: Int
    let status: String
    let color: String
}

nonisolated struct BackendScreenplayRevisionResponse: Decodable {
    let stage: String?
    let mode: String?
    let revisionColor: String?
    let lineCount: Int?
    let baseLineCount: Int?
    let summary: BackendScreenplayRevisionSummary?
    let ranges: [BackendScreenplayRevisionRange]
}

nonisolated struct BackendScreenplayExportArtifact {
    let format: String
    let filename: String
    let contentType: String
    let data: Data
}

nonisolated struct BackendScreenplayExportRejection: Decodable, Hashable {
    let stage: String?
    let error: String?
    let message: String?
    let alternativeFormats: [String]
    let docsPath: String?

    var displayMessage: String {
        let cleanMessage = (message ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanMessage.isEmpty {
            return cleanMessage
        }
        let cleanError = (error ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanStage = (stage ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanError.isEmpty, !cleanStage.isEmpty {
            return "\(cleanStage): \(cleanError)"
        }
        if !cleanError.isEmpty {
            return cleanError
        }
        return "Screenplay export failed."
    }

    var alternativesSummary: String {
        let titles = alternativeFormats
            .map(Self.displayName(for:))
            .filter { !$0.isEmpty }
        guard !titles.isEmpty else { return "" }
        return "Try \(titles.joined(separator: ", "))."
    }

    private static func displayName(for format: String) -> String {
        switch format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "fdx":
            return "FDX"
        case "md", "markdown":
            return "Markdown"
        case "fountain", "txt":
            return "Fountain"
        case "pdf":
            return "PDF"
        default:
            return format.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        }
    }
}

nonisolated enum BackendScreenplayExportError: LocalizedError {
    case rejected(status: Int, payload: BackendScreenplayExportRejection)

    var errorDescription: String? {
        switch self {
        case .rejected(let status, let payload):
            let alternatives = payload.alternativesSummary
            let docs = (payload.docsPath ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let suffix = [
                alternatives,
                docs.isEmpty ? "" : "See \(docs).",
            ]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            return "Backend error \(status): \(payload.displayMessage)\(suffix.isEmpty ? "" : " \(suffix)")"
        }
    }
}

nonisolated struct BackendScreenplayExportFormat: Decodable, Hashable, Identifiable {
    let format: String
    let fileExtension: String
    let mediaType: String
    let description: String
    let supported: Bool

    var id: String { format }

    private enum CodingKeys: String, CodingKey {
        case format
        case fileExtension = "extension"
        case mediaType
        case description
        case supported
    }
}

nonisolated struct BackendScreenplayExportFormatsResponse: Decodable, Hashable {
    let schemaVersion: Int
    let defaultFormat: String
    let formats: [BackendScreenplayExportFormat]
}

nonisolated struct BackendScreenplayImportResponse: Decodable, Hashable {
    let schemaVersion: Int
    let screenplay: BackendImportedScreenplay
}

nonisolated struct BackendImportedScreenplay: Decodable, Hashable {
    let title: BackendImportedScreenplayTitle?
    let scenes: [BackendImportedScreenplayScene]

    var fountainDraft: String {
        var blocks: [String] = []
        if let titleBlock = title?.fountainBlock, !titleBlock.isEmpty {
            blocks.append(titleBlock)
        }
        for scene in scenes {
            let block = scene.fountainBlock
            if !block.isEmpty {
                blocks.append(block)
            }
        }
        return blocks.joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

nonisolated struct BackendImportedScreenplayTitle: Decodable, Hashable {
    let title: String?
    let author: String?

    var fountainBlock: String {
        var lines: [String] = []
        if let title = title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty {
            lines.append("Title: \(title)")
        }
        if let author = author?.trimmingCharacters(in: .whitespacesAndNewlines), !author.isEmpty {
            lines.append("Author: \(author)")
        }
        return lines.joined(separator: "\n")
    }
}

nonisolated struct BackendImportedScreenplayScene: Decodable, Hashable {
    let heading: String?
    let lines: [BackendImportedScreenplayLine]

    var fountainBlock: String {
        var blocks: [String] = []
        if let heading = heading?.trimmingCharacters(in: .whitespacesAndNewlines), !heading.isEmpty {
            blocks.append(heading)
        }
        for line in lines {
            let block = line.fountainBlock
            if !block.isEmpty {
                blocks.append(block)
            }
        }
        return blocks.joined(separator: "\n\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

nonisolated struct BackendImportedScreenplayLine: Decodable, Hashable {
    let kind: String
    let text: String?
    let name: String?
    let parenthetical: String?
    let dialogue: [String]?

    var fountainBlock: String {
        switch kind.lowercased() {
        case "section":
            return prefixedText("#")
        case "synopsis":
            return prefixedText("=")
        case "character":
            return characterBlock
        default:
            return text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        }
    }

    private func prefixedText(_ prefix: String) -> String {
        guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return ""
        }
        return "\(prefix) \(text)"
    }

    private var characterBlock: String {
        guard let cleanName = name?.trimmingCharacters(in: .whitespacesAndNewlines), !cleanName.isEmpty else {
            return ""
        }
        var lines = [cleanName]
        if let parenthetical = parenthetical?.trimmingCharacters(in: .whitespacesAndNewlines), !parenthetical.isEmpty {
            lines.append("(\(parenthetical))")
        }
        for dialogueLine in dialogue ?? [] {
            let cleanDialogue = dialogueLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleanDialogue.isEmpty {
                lines.append(cleanDialogue)
            }
        }
        return lines.joined(separator: "\n")
    }
}

nonisolated struct BackendScreenplaySceneDraft: Hashable {
    var id: String?
    var slugline: String
    var title: String
    var objective: String
    var summary: String
    var actId: String?
    var order: Int?
    var status: String?
    var beatIds: [String]

    init(
        id: String? = nil,
        slugline: String = "",
        title: String = "",
        objective: String = "",
        summary: String = "",
        actId: String? = nil,
        order: Int? = nil,
        status: String? = nil,
        beatIds: [String] = []
    ) {
        self.id = id
        self.slugline = slugline
        self.title = title
        self.objective = objective
        self.summary = summary
        self.actId = actId
        self.order = order
        self.status = status
        self.beatIds = beatIds
    }
}

nonisolated struct BackendScreenplayBeatDraft: Hashable {
    var id: String?
    var label: String
    var summary: String
    var sceneId: String?
    var actId: String?
    var order: Int?
    var status: String?

    init(
        id: String? = nil,
        label: String = "",
        summary: String = "",
        sceneId: String? = nil,
        actId: String? = nil,
        order: Int? = nil,
        status: String? = nil
    ) {
        self.id = id
        self.label = label
        self.summary = summary
        self.sceneId = sceneId
        self.actId = actId
        self.order = order
        self.status = status
    }
}

nonisolated struct BackendHealthStatus {
    let ok: Bool
    let status: String
    let raw: String
    let sessionId: String
    let schemaVersion: Int
    let backendBuild: String
    let backendBootId: String
    let lastTurnId: String
    let lastUpdatedAt: TimeInterval
    let historyUpdatedAt: TimeInterval
    let memoryUpdatedAt: TimeInterval
    let stateVersion: String
    let turnReliability: BackendTurnReliabilitySnapshot
}

nonisolated struct BackendOpsRoute: Codable, Hashable, Identifiable {
    let method: String
    let path: String
    let group: String

    var id: String { "\(method.uppercased()) \(path)" }
}

nonisolated struct BackendOpsRouteManifestResponse: Codable, Hashable {
    let schemaVersion: Int
    let scope: String
    let total: Int
    let routes: [BackendOpsRoute]

    var routeCountForDiagnostics: Int {
        total > 0 ? total : routes.count
    }

    var diagnosticsSummary: String {
        let groups = groupCountsForDiagnostics
        guard !groups.isEmpty else {
            return "\(routeCountForDiagnostics) routes"
        }
        let groupText = groups
            .map { "\($0.group) \($0.count)" }
            .joined(separator: ", ")
        return "\(routeCountForDiagnostics) routes across \(groups.count) groups: \(groupText)"
    }

    var groupNamesForDiagnostics: [String] {
        groupCountsForDiagnostics.map(\.group)
    }

    private var groupCountsForDiagnostics: [(group: String, count: Int)] {
        let counts = Dictionary(grouping: routes) { route in
            route.group.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return counts
            .map { (group: $0.key.isEmpty ? "ungrouped" : $0.key, count: $0.value.count) }
            .sorted { lhs, rhs in lhs.group < rhs.group }
    }
}

nonisolated struct BackendTurnReliabilitySnapshot {
    let sampleCount: Int
    let silentTurnRate: Double
    let bargeInStopP95Ms: Double?
    let bargeInStopSampleCount: Int
    let medianEndToEndMs: Double?
    let source: String

    static let empty = BackendTurnReliabilitySnapshot(
        sampleCount: 0,
        silentTurnRate: 0,
        bargeInStopP95Ms: nil,
        bargeInStopSampleCount: 0,
        medianEndToEndMs: nil,
        source: "none"
    )
}

nonisolated struct BackendTalkMetricBucket: Codable, Hashable {
    let median: Double
    let p90: Double
    let max: Double
}

nonisolated struct BackendTalkReplyRoleCounts: Codable, Hashable {
    let preview: Int
    let final: Int
}

nonisolated struct BackendTalkAgeBuckets: Codable, Hashable {
    let last5min: Int
    let last1h: Int
    let last24h: Int
    let older: Int
}

nonisolated struct BackendTalkStatsResponse: Codable, Hashable {
    let schemaVersion: Int
    let total: Int
    let audioDurationMs: BackendTalkMetricBucket
    let transcriptChars: BackendTalkMetricBucket
    let replyChars: BackendTalkMetricBucket
    let uniqueUserCount: Int
    let uniqueSessionCount: Int
    let replyRoleCounts: BackendTalkReplyRoleCounts
    let authoritativePageTextRate: Double
    let syncReadyRate: Double
    let ageBuckets: BackendTalkAgeBuckets
    let newestCreatedAtMs: Double
    let oldestCreatedAtMs: Double

    var diagnosticsSummary: String {
        guard total > 0 else { return "0 turns recorded" }
        let pageRate = Int((max(0, min(1, authoritativePageTextRate)) * 100).rounded())
        let syncRate = Int((max(0, min(1, syncReadyRate)) * 100).rounded())
        return "\(total) turns, \(pageRate)% page text, \(syncRate)% sync ready, p90 audio \(Int(audioDurationMs.p90)) ms"
    }
}

nonisolated struct BackendTalkErrorsResponse: Codable, Hashable {
    let schemaVersion: Int
    let total: Int
    let counts: [String: Int]
    let lastOccurrence: [String: Double]
    let sinceMs: Double
    let observedAtMs: Double
    let errorRatePerHour: Double

    var diagnosticsSummary: String {
        guard total > 0 else { return "0 talk errors" }
        let top = counts
            .sorted { lhs, rhs in
                if lhs.value == rhs.value { return lhs.key < rhs.key }
                return lhs.value > rhs.value
            }
            .prefix(3)
            .map { "\($0.key) \($0.value)" }
            .joined(separator: ", ")
        let rate = String(format: "%.1f", errorRatePerHour)
        return "\(total) errors, \(rate)/hr\(top.isEmpty ? "" : " · \(top)")"
    }
}

nonisolated enum BackendMemoryAPIError: LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Invalid backend base URL."
        case .invalidResponse:
            return "Backend returned an invalid response."
        case .server(let status, let message):
            return "Backend error \(status): \(message)"
        }
    }
}

nonisolated enum BackendCredentialMigration {
    static func normalizedNonEmpty(_ raw: String?) -> String {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "" : trimmed
    }

    static func readString(
        account: String,
        defaultsKey: String,
        defaults: UserDefaults = .standard,
        readKeychain: (String) -> String?,
        writeKeychain: (String, String) -> Bool,
        normalize: (String?) -> String = BackendCredentialMigration.normalizedNonEmpty
    ) -> String? {
        let legacy = normalize(defaults.string(forKey: defaultsKey))
#if os(macOS)
        if !legacy.isEmpty {
            return legacy
        }
        return nil
#else
        if !legacy.isEmpty {
            if writeKeychain(legacy, account) {
                defaults.removeObject(forKey: defaultsKey)
            }
            return legacy
        }

        let existing = normalize(readKeychain(account))
        if !existing.isEmpty {
            defaults.removeObject(forKey: defaultsKey)
            return existing
        }

        return nil
#endif
    }

    @discardableResult
    static func writeString(
        _ value: String,
        account: String,
        defaultsKey: String,
        defaults: UserDefaults = .standard,
        writeKeychain: (String, String) -> Bool,
        deleteKeychain: (String) -> Void,
        normalize: (String?) -> String = BackendCredentialMigration.normalizedNonEmpty
    ) -> Bool {
        let normalized = normalize(value)
        guard !normalized.isEmpty else {
            deleteString(
                account: account,
                defaultsKey: defaultsKey,
                defaults: defaults,
                deleteKeychain: deleteKeychain
            )
            return false
        }
#if os(macOS)
        defaults.set(normalized, forKey: defaultsKey)
        return true
#else
        let wrote = writeKeychain(normalized, account)
        if wrote {
            defaults.removeObject(forKey: defaultsKey)
        } else {
            defaults.set(normalized, forKey: defaultsKey)
        }
        return true
#endif
    }

    static func deleteString(
        account: String,
        defaultsKey: String,
        defaults: UserDefaults = .standard,
        deleteKeychain: (String) -> Void
    ) {
#if !os(macOS)
        deleteKeychain(account)
#endif
        defaults.removeObject(forKey: defaultsKey)
    }
}

nonisolated enum BackendAuthClient {
    private enum DefaultsKey {
        static let baseURL = "backend_base_url"
        static let appToken = "app_token"
        static let userId = "user_id"
        static let authUserEmail = "auth_user_email"
        static let authUserVerified = "auth_user_verified"
        static let authUserPayload = "auth_user_payload"
        static let authAccessToken = "auth_access_token"
        static let authRefreshToken = "auth_refresh_token"
        static let authAccessExpiresAt = "auth_access_expires_at"
        static let authRefreshExpiresAt = "auth_refresh_expires_at"
        static let authPendingEmailVerification = "auth_pending_email_verification"
        static let authVerificationRequired = "auth_verification_required"
        static let authCurrentSessionId = "auth_current_session_id"
        static let authCurrentFamilyId = "auth_current_family_id"
        static let authSignedIn = "auth_signed_in"
        static let clientTokenCachedAt = "client_token_cached_at"
        static let clientTokenBaseURL = "client_token_base_url"
    }

    private static let personaFlowKey = "clementine"
    private static let keychainService = "io.them.client"
    private static let authAccessTokenAccount = "auth_access_token"
    private static let authRefreshTokenAccount = "auth_refresh_token"
    private static let appTokenAccount = "app_token"
    private static let clientTokenAccount = "session_client_token"
    private static let clientTokenExpiryAccount = "session_client_token_expiry"
    private static let userIDAccount = "stable_user_id"
    private static let devFallbackAppToken: String? = {
#if DEBUG
        "them-dev"
#else
        nil
#endif
    }()

    static func currentAuthSessionState() -> BackendAuthSessionState {
        let accessTokenValue = accessToken() ?? ""
        let refreshTokenValue = refreshToken() ?? ""
        let accessExpiresAt = UserDefaults.standard.double(forKey: DefaultsKey.authAccessExpiresAt)
        let refreshExpiresAt = UserDefaults.standard.double(forKey: DefaultsKey.authRefreshExpiresAt)
        let currentSessionId = UserDefaults.standard.string(forKey: DefaultsKey.authCurrentSessionId) ?? ""
        let currentFamilyId = UserDefaults.standard.string(forKey: DefaultsKey.authCurrentFamilyId) ?? ""
        let pendingEmailVerification = UserDefaults.standard.bool(forKey: DefaultsKey.authPendingEmailVerification)
        let verificationRequired = UserDefaults.standard.bool(forKey: DefaultsKey.authVerificationRequired)
        return BackendAuthSessionState(
            user: storedAuthUser(),
            accessTokenPresent: !accessTokenValue.isEmpty,
            refreshTokenPresent: !refreshTokenValue.isEmpty,
            accessExpiresAt: accessExpiresAt,
            refreshExpiresAt: refreshExpiresAt,
            currentSessionId: currentSessionId,
            currentFamilyId: currentFamilyId,
            tokenType: "Bearer",
            pendingEmailVerification: pendingEmailVerification,
            verificationRequired: verificationRequired
        )
    }

    static func signUp(email: String, password: String) async throws -> BackendAuthSessionState {
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/signup")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
        ], options: [])
        let payload = try await run(request, as: BackendAuthEnvelope.self)
        persistAuthEnvelope(payload)
        await BackendMemoryAPI.shared.invalidateResolvedSession(clearSharedUserID: false)
        return currentAuthSessionState()
    }

    static func login(email: String, password: String) async throws -> BackendAuthSessionState {
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/login")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
        ], options: [])
        let payload = try await run(request, as: BackendAuthEnvelope.self)
        persistAuthEnvelope(payload)
        await BackendMemoryAPI.shared.invalidateResolvedSession(clearSharedUserID: false)
        return currentAuthSessionState()
    }

    static func signInWithApple(
        identityToken: String,
        authorizationCode: String? = nil,
        userIdentifier: String,
        email: String? = nil,
        givenName: String? = nil,
        familyName: String? = nil
    ) async throws -> BackendAuthSessionState {
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/apple")
        var body: [String: Any] = [
            "identity_token": identityToken.trimmingCharacters(in: .whitespacesAndNewlines),
            "user_id": userIdentifier.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        let normalizedAuthorizationCode = (authorizationCode ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedAuthorizationCode.isEmpty {
            body["authorization_code"] = normalizedAuthorizationCode
        }
        let normalizedEmail = (email ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedEmail.isEmpty {
            body["email"] = normalizedEmail
        }
        let normalizedGivenName = (givenName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedGivenName.isEmpty {
            body["given_name"] = normalizedGivenName
        }
        let normalizedFamilyName = (familyName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedFamilyName.isEmpty {
            body["family_name"] = normalizedFamilyName
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let payload = try await run(request, as: BackendAuthEnvelope.self)
        persistAuthEnvelope(payload)
        await BackendMemoryAPI.shared.invalidateResolvedSession(clearSharedUserID: false)
        return currentAuthSessionState()
    }

    static func refreshAuthSession(force: Bool = false) async throws -> BackendAuthSessionState {
        if !force {
            let current = currentAuthSessionState()
            if current.isAuthenticated, !current.accessExpired {
                return current
            }
        }
        let refreshTokenValue = refreshToken() ?? ""
        guard !refreshTokenValue.isEmpty else {
            throw BackendMemoryAPIError.server(status: 401, message: "refresh_token_required")
        }
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/refresh")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "refresh_token": refreshTokenValue,
        ], options: [])
        let payload = try await run(request, as: BackendAuthEnvelope.self)
        persistAuthEnvelope(payload)
        return currentAuthSessionState()
    }

    static func logout() async throws {
        let accessTokenValue = accessToken() ?? ""
        let refreshTokenValue = refreshToken() ?? ""
        var pendingError: Error?
        if !accessTokenValue.isEmpty || !refreshTokenValue.isEmpty {
            do {
                var request = try makeAuthWriteRequest(path: "/auth/logout")
                request.httpBody = try JSONSerialization.data(withJSONObject: [
                    "refresh_token": refreshTokenValue,
                ], options: [])
                _ = try await run(request, as: BackendAuthEnvelope.self)
            } catch {
                pendingError = error
            }
        }
        clearAuthSession()
        await BackendMemoryAPI.shared.invalidateResolvedSession(clearSharedUserID: true)
        if let pendingError {
            throw pendingError
        }
    }

    static func clearLocalSessionAfterAccountDeletion() async {
        clearAuthSession()
        await BackendMemoryAPI.shared.invalidateResolvedSession(clearSharedUserID: true)
    }

    static func requestPasswordReset(email: String) async throws -> BackendAuthEnvelope {
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/request_password_reset")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
        ], options: [])
        return try await run(request, as: BackendAuthEnvelope.self)
    }

    static func resetPassword(token: String, newPassword: String) async throws -> BackendAuthSessionState {
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/reset_password")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "token": token.trimmingCharacters(in: .whitespacesAndNewlines),
            "new_password": newPassword,
        ], options: [])
        let payload = try await run(request, as: BackendAuthEnvelope.self)
        if payload.passwordReset == true {
            clearAuthSession()
            await BackendMemoryAPI.shared.invalidateResolvedSession(clearSharedUserID: true)
        }
        return currentAuthSessionState()
    }

    static func requestEmailVerification(email: String? = nil) async throws -> BackendAuthEnvelope {
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/request_email_verification")
        var body: [String: Any] = [:]
        let normalizedEmail = (email ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedEmail.isEmpty {
            body["email"] = normalizedEmail
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])
        let payload = try await run(request, as: BackendAuthEnvelope.self)
        let currentSessionId = (payload.currentSessionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentSessionId.isEmpty {
            UserDefaults.standard.set(currentSessionId, forKey: DefaultsKey.authCurrentSessionId)
        }
        let currentFamilyId = (payload.currentFamilyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentFamilyId.isEmpty {
            UserDefaults.standard.set(currentFamilyId, forKey: DefaultsKey.authCurrentFamilyId)
        }
        if let user = payload.user {
            persistAuthUser(user)
        }
        return payload
    }

    static func verifyEmail(token: String) async throws -> BackendAuthSessionState {
        try await prepareVerifiedBackendForAuth()
        var request = try makeAuthWriteRequest(path: "/auth/verify_email")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "token": token.trimmingCharacters(in: .whitespacesAndNewlines),
        ], options: [])
        let payload = try await run(request, as: BackendAuthEnvelope.self)
        let currentSessionId = (payload.currentSessionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentSessionId.isEmpty {
            UserDefaults.standard.set(currentSessionId, forKey: DefaultsKey.authCurrentSessionId)
        }
        let currentFamilyId = (payload.currentFamilyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentFamilyId.isEmpty {
            UserDefaults.standard.set(currentFamilyId, forKey: DefaultsKey.authCurrentFamilyId)
        }
        if let user = payload.user {
            persistAuthUser(user)
        } else if var currentUser = storedAuthUser() {
            currentUser = BackendAuthUser(
                userId: currentUser.userId,
                email: currentUser.email,
                authProvider: currentUser.authProvider,
                emailVerified: true,
                emailVerifiedAt: Date().timeIntervalSince1970,
                createdAt: currentUser.createdAt,
                updatedAt: Date().timeIntervalSince1970
            )
            persistAuthUser(currentUser)
        }
        UserDefaults.standard.set(false, forKey: DefaultsKey.authPendingEmailVerification)
        UserDefaults.standard.set(false, forKey: DefaultsKey.authVerificationRequired)
        return currentAuthSessionState()
    }

    private static func makeAuthWriteRequest(path: String) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL(), resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        components.path = path
        guard let url = components.url else {
            throw BackendMemoryAPIError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        applyStandardHeaders(
            to: &request,
            includeContentType: true,
            includeUserIdentity: false,
            includeClientToken: false
        )
        return request
    }

    private static func prepareVerifiedBackendForAuth() async throws {
        _ = try await BackendMemoryAPI.shared.fetchHealth()
    }

    private static func applyStandardHeaders(
        to request: inout URLRequest,
        includeContentType: Bool = false,
        includeUserIdentity: Bool = true,
        includeClientToken: Bool = true,
        includeAuthToken: Bool = true
    ) {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if includeContentType {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token = appToken(), !token.isEmpty {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        if includeUserIdentity {
            if let userId = sharedUserID(), !userId.isEmpty {
                request.setValue(userId, forHTTPHeaderField: "X-User-Id")
            }
        }
        if includeClientToken {
            if let clientToken = sharedClientToken(), !clientToken.isEmpty {
                request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
            }
        }
        if includeAuthToken, let token = accessToken(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.setValue("them", forHTTPHeaderField: "X-Them-Client-Name")
        #if os(macOS)
        request.setValue("macOS", forHTTPHeaderField: "X-Them-Client-Platform")
        #elseif os(iOS)
        request.setValue("iOS", forHTTPHeaderField: "X-Them-Client-Platform")
        #else
        request.setValue("Apple", forHTTPHeaderField: "X-Them-Client-Platform")
        #endif
        let version = (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !version.isEmpty {
            request.setValue(version, forHTTPHeaderField: "X-Them-Client-Version")
        }
        let build = (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !build.isEmpty {
            request.setValue(build, forHTTPHeaderField: "X-Them-Client-Build")
        }
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
    }

    private static func run<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard BackendAPIResponseValidator.hasMatchingOrigin(
            requestURL: request.url,
            responseURL: http.url
        ), BackendAPIResponseValidator.isJSONResponse(http, data: data) else {
            throw BackendMemoryAPIError.server(
                status: 502,
                message: "Backend service unavailable. Please try again."
            )
        }
        guard (200...299).contains(http.statusCode) else {
            throw BackendMemoryAPIError.server(status: http.statusCode, message: decodeErrorMessage(from: data))
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }

    private static func storedAuthUser() -> BackendAuthUser? {
        if let data = UserDefaults.standard.data(forKey: DefaultsKey.authUserPayload),
           let user = try? JSONDecoder().decode(BackendAuthUser.self, from: data) {
            return user
        }
#if DEBUG
        let signedIn = preferenceStringValues(forKey: DefaultsKey.authSignedIn).contains { rawValue in
            let normalized = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return ["1", "true", "yes", "on"].contains(normalized)
        } || UserDefaults.standard.bool(forKey: DefaultsKey.authSignedIn)
        return BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: signedIn,
            accessToken: accessToken() ?? "",
            userID: preferenceString(forKey: DefaultsKey.userId),
            email: preferenceString(forKey: DefaultsKey.authUserEmail)
        )
#else
        return nil
#endif
    }

    private static func persistAuthEnvelope(_ payload: BackendAuthEnvelope) {
        let normalizedAccessToken = (payload.accessToken ?? payload.token ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedAccessToken.isEmpty {
#if os(macOS)
            UserDefaults.standard.set(normalizedAccessToken, forKey: DefaultsKey.authAccessToken)
#else
            writeKeychainString(normalizedAccessToken, account: authAccessTokenAccount)
#endif
            let ttl = max(60, payload.accessExpiresIn ?? payload.expiresIn ?? 0)
            UserDefaults.standard.set(Date().timeIntervalSince1970 + Double(ttl), forKey: DefaultsKey.authAccessExpiresAt)
        }

        let normalizedRefreshToken = (payload.refreshToken ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedRefreshToken.isEmpty {
#if os(macOS)
            UserDefaults.standard.set(normalizedRefreshToken, forKey: DefaultsKey.authRefreshToken)
#else
            writeKeychainString(normalizedRefreshToken, account: authRefreshTokenAccount)
#endif
            let ttl = max(60, payload.refreshExpiresIn ?? 0)
            if ttl > 0 {
                UserDefaults.standard.set(Date().timeIntervalSince1970 + Double(ttl), forKey: DefaultsKey.authRefreshExpiresAt)
            }
        }

        let currentSessionId = (payload.currentSessionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentSessionId.isEmpty {
            UserDefaults.standard.set(currentSessionId, forKey: DefaultsKey.authCurrentSessionId)
        }
        let currentFamilyId = (payload.currentFamilyId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentFamilyId.isEmpty {
            UserDefaults.standard.set(currentFamilyId, forKey: DefaultsKey.authCurrentFamilyId)
        }
        if let user = payload.user {
            persistAuthUser(user)
        }
        if payload.emailVerified == true, var currentUser = storedAuthUser() {
            currentUser = BackendAuthUser(
                userId: currentUser.userId,
                email: currentUser.email,
                authProvider: currentUser.authProvider,
                emailVerified: true,
                emailVerifiedAt: Date().timeIntervalSince1970,
                createdAt: currentUser.createdAt,
                updatedAt: Date().timeIntervalSince1970
            )
            persistAuthUser(currentUser)
        }
        UserDefaults.standard.set(payload.pendingEmailVerification ?? false, forKey: DefaultsKey.authPendingEmailVerification)
        UserDefaults.standard.set(payload.verificationRequired ?? false, forKey: DefaultsKey.authVerificationRequired)
        let signedIn = (accessToken() != nil) && (storedAuthUser() != nil)
        UserDefaults.standard.set(signedIn, forKey: DefaultsKey.authSignedIn)
    }

    private static func persistAuthUser(_ user: BackendAuthUser) {
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: DefaultsKey.authUserPayload)
        }
        UserDefaults.standard.set(user.email, forKey: DefaultsKey.authUserEmail)
        UserDefaults.standard.set(user.emailVerified, forKey: DefaultsKey.authUserVerified)
        persistSharedUserID(user.userId)
        if user.emailVerified {
            UserDefaults.standard.set(false, forKey: DefaultsKey.authPendingEmailVerification)
            UserDefaults.standard.set(false, forKey: DefaultsKey.authVerificationRequired)
        }
    }

    private static func clearAuthSession() {
        deleteKeychainString(account: authAccessTokenAccount)
        deleteKeychainString(account: authRefreshTokenAccount)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authUserPayload)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authUserEmail)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authUserVerified)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authAccessExpiresAt)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authRefreshExpiresAt)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authPendingEmailVerification)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authVerificationRequired)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authSignedIn)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authCurrentSessionId)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authCurrentFamilyId)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authAccessToken)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.authRefreshToken)
        clearSharedClientToken()
        clearSharedUserID()
    }

    fileprivate static func accessToken() -> String? {
#if DEBUG
        let debugAccessEnabled = preferenceStringValues(forKey: "auth_debug_access_token_enabled").contains { rawValue in
            let normalized = rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return ["1", "true", "yes", "on"].contains(normalized)
        } || UserDefaults.standard.bool(forKey: "auth_debug_access_token_enabled")
        if debugAccessEnabled {
            let trimmedDebugToken = preferenceString(forKey: "auth_debug_access_token")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedDebugToken.isEmpty {
                return trimmedDebugToken
            }
        }
#endif
        guard !IOThemRuntime.isRunningTests else { return nil }
#if os(macOS)
        let defaultsToken = UserDefaults.standard.string(forKey: DefaultsKey.authAccessToken) ?? ""
        let trimmedDefaultsToken = defaultsToken.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedDefaultsToken.isEmpty ? nil : trimmedDefaultsToken
#else
        let token = readKeychainString(account: authAccessTokenAccount) ?? ""
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
#endif
    }

    static func authorizationHeaderValue() -> String? {
        guard let token = accessToken(), !token.isEmpty else { return nil }
        return "Bearer \(token)"
    }

    private static func refreshToken() -> String? {
        guard !IOThemRuntime.isRunningTests else { return nil }
#if os(macOS)
        let defaultsToken = UserDefaults.standard.string(forKey: DefaultsKey.authRefreshToken) ?? ""
        let trimmedDefaultsToken = defaultsToken.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedDefaultsToken.isEmpty ? nil : trimmedDefaultsToken
#else
        let token = readKeychainString(account: authRefreshTokenAccount) ?? ""
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
#endif
    }

    @discardableResult
    private static func writeKeychainString(_ value: String, account: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(item as CFDictionary, nil) == errSecSuccess
    }

    private static func readKeychainString(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func deleteKeychainString(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private static func normalizedStoredUserID(_ raw: String?) -> String {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        guard trimmed.count >= 8 && trimmed.count <= 128 else { return "" }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-")
        if trimmed.rangeOfCharacter(from: allowed.inverted) != nil { return "" }
        return trimmed
    }

    private static func preferenceDomains() -> [String] {
        var domains: [String] = []
        if let bundleID = Bundle.main.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines),
           !bundleID.isEmpty {
            domains.append(bundleID)
        }
        #if os(macOS)
        let fallbackDomain = "io.them.them"
        if !domains.contains(fallbackDomain) {
            domains.append(fallbackDomain)
        }
        #endif
        return domains
    }

    private static func suiteDefaults(forPreferenceDomain domain: String) -> UserDefaults? {
        if let bundleID = Bundle.main.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines),
           domain == bundleID {
            return nil
        }
        return UserDefaults(suiteName: domain)
    }

    private static func preferencePlistURLs(for domain: String) -> [URL] {
        #if os(macOS)
        let libraryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library")
        let filename = domain.hasSuffix(".plist") ? domain : "\(domain).plist"
        return [
            libraryURL
                .appendingPathComponent("Containers")
                .appendingPathComponent(domain)
                .appendingPathComponent("Data/Library/Preferences")
                .appendingPathComponent(filename),
            libraryURL
                .appendingPathComponent("Preferences")
                .appendingPathComponent(filename),
        ]
        #else
        return []
        #endif
    }

    private static func preferenceValues(forKey key: String) -> [Any] {
        var values: [Any] = []
        var seenFingerprints: Set<String> = []

        func append(_ value: Any?) {
            guard let value else { return }
            let fingerprint = "\(type(of: value))::\(String(describing: value))"
            guard seenFingerprints.insert(fingerprint).inserted else { return }
            values.append(value)
        }

        UserDefaults.standard.synchronize()
        append(UserDefaults.standard.object(forKey: key))
        for domain in preferenceDomains() {
            if let suite = suiteDefaults(forPreferenceDomain: domain) {
                suite.synchronize()
                append(suite.object(forKey: key))
            }
            #if os(macOS)
            let domainRef = domain as CFString
            CFPreferencesAppSynchronize(domainRef)
            append(CFPreferencesCopyAppValue(key as CFString, domainRef))
            for url in preferencePlistURLs(for: domain) {
                if let dictionary = NSDictionary(contentsOf: url) {
                    append(dictionary[key])
                }
            }
            #endif
        }
        return values
    }

    fileprivate static func preferenceString(forKey key: String, fallback: String = "") -> String {
        for value in preferenceStringValues(forKey: key) {
            return value
        }
        return fallback
    }

    fileprivate static func preferenceStringValues(forKey key: String) -> [String] {
        preferenceValues(forKey: key).compactMap { value in
            if let string = value as? String {
                let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed.isEmpty ? nil : trimmed
            }
            if let number = value as? NSNumber {
                return number.stringValue
            }
            return nil
        }
    }

    private static func baseURL() -> URL {
        if let uiTestURL = BackendDefaultBaseURLPolicy.currentUITestOverrideBaseURL {
            return uiTestURL
        }
        let fromBaseEnv = ProcessInfo.processInfo.environment["BACKEND_BASE_URL"] ?? ""
        if isUsableConfigValue(fromBaseEnv), let url = URL(string: fromBaseEnv), isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        let fromEnv = ProcessInfo.processInfo.environment["BACKEND_URL"] ?? ""
        if isUsableConfigValue(fromEnv), let url = URL(string: fromEnv), isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "BACKEND_BASE_URL") as? String,
           isUsableConfigValue(fromInfo),
           let url = URL(string: fromInfo),
           isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "BACKEND_URL") as? String,
           isUsableConfigValue(fromInfo),
           let url = URL(string: fromInfo),
           isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        let fromDefaults = preferenceString(forKey: DefaultsKey.baseURL)
        if isUsableConfigValue(fromDefaults), let url = URL(string: fromDefaults), isUsableBackendURL(url) {
            let resolvedURL = canonicalizeLoopbackURL(url)
            if BackendDefaultBaseURLPolicy.currentShouldUseStoredBaseURL(resolvedURL) {
                return resolvedURL
            }
            UserDefaults.standard.removeObject(forKey: DefaultsKey.baseURL)
            UserDefaults.standard.synchronize()
        }
        return BackendDefaultBaseURLPolicy.currentPrimaryBaseURL
    }

    private static func canonicalizeLoopbackURL(_ url: URL) -> URL {
        guard let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            return url
        }
        guard isLoopbackHost(host) else {
            return url
        }
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        components.host = "127.0.0.1"
        return components.url ?? url
    }

    private static func isUsableBackendURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return false
        }
        guard let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines), !host.isEmpty else {
            return false
        }
        #if !DEBUG
        if isLoopbackHost(host) {
            return false
        }
        #endif
        return true
    }

    private static func isLoopbackHost(_ host: String) -> Bool {
        let normalized = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized == "localhost"
            || normalized == "127.0.0.1"
            || normalized == "::1"
            || normalized == "[::1]"
    }

    private static func appToken() -> String? {
        let fromDefaults = UserDefaults.standard.string(forKey: DefaultsKey.appToken) ?? ""
        if isUsableConfigValue(fromDefaults) {
            return fromDefaults
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "APP_TOKEN") as? String,
           isUsableConfigValue(fromInfo) {
            return fromInfo
        }
        let envValue = ProcessInfo.processInfo.environment["APP_TOKEN"] ?? ""
        if isUsableConfigValue(envValue) {
            return envValue
        }
        if let fallback = devFallbackAppToken, isUsableConfigValue(fallback) {
            return fallback
        }
        if let fromKeychain = sharedAppToken(), isUsableConfigValue(fromKeychain) {
            return fromKeychain
        }
        return devFallbackAppToken
    }

    static func sharedAppToken() -> String? {
        BackendCredentialMigration.readString(
            account: appTokenAccount,
            defaultsKey: DefaultsKey.appToken,
            readKeychain: readKeychainString,
            writeKeychain: writeKeychainString,
            normalize: { raw in
                let value = BackendCredentialMigration.normalizedNonEmpty(raw)
                return isUsableConfigValue(value) ? value : ""
            }
        )
    }

    static func sharedClientToken() -> String? {
        #if DEBUG
        if let debugOverride = studioDebugClientTokenOverride() {
            return debugOverride
        }
        #endif
        return BackendCredentialMigration.readString(
            account: clientTokenAccount,
            defaultsKey: "client_token",
            readKeychain: readKeychainString,
            writeKeychain: writeKeychainString
        )
    }

    static func studioDebugClientTokenOverride(defaults: UserDefaults = .standard) -> String? {
        #if DEBUG
        guard isStudioDebugClientTokenOverrideActive(defaults: defaults) else { return nil }
        let token = studioDebugPreferenceString(forKey: "client_token", defaults: defaults)
        return token.isEmpty ? nil : token
        #else
        return nil
        #endif
    }

    static func isStudioDebugClientTokenOverrideActive(defaults: UserDefaults = .standard) -> Bool {
        #if DEBUG
        let token = studioDebugPreferenceString(forKey: "client_token", defaults: defaults)
        let projectID = studioDebugPreferenceString(forKey: "studio_debug_load_project_id", defaults: defaults)
        let loadToken = studioDebugPreferenceInt(forKey: "studio_debug_load_project_token", defaults: defaults)
        let ackToken = studioDebugPreferenceInt(forKey: "studio_debug_load_project_ack_token", defaults: defaults)
        return !token.isEmpty && !projectID.isEmpty && loadToken > 0 && loadToken != ackToken
        #else
        return false
        #endif
    }

    #if DEBUG
    private static func studioDebugPreferenceString(
        forKey key: String,
        defaults: UserDefaults
    ) -> String {
        if defaults !== UserDefaults.standard {
            return BackendCredentialMigration.normalizedNonEmpty(defaults.string(forKey: key))
        }
        return preferenceString(forKey: key)
    }

    private static func studioDebugPreferenceInt(
        forKey key: String,
        defaults: UserDefaults
    ) -> Int {
        if defaults !== UserDefaults.standard {
            return defaults.integer(forKey: key)
        }
        return preferenceValues(forKey: key).reduce(0) { best, value in
            let parsed: Int
            if let number = value as? NSNumber {
                parsed = number.intValue
            } else if let string = value as? String {
                parsed = Int(string.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
            } else {
                parsed = 0
            }
            return max(best, parsed)
        }
    }
    #endif

    static func sharedClientTokenExpiry() -> String? {
        BackendCredentialMigration.readString(
            account: clientTokenExpiryAccount,
            defaultsKey: "client_token_expiry",
            readKeychain: readKeychainString,
            writeKeychain: writeKeychainString
        )
    }

    static func sharedClientTokenCachedAt(defaults: UserDefaults = .standard) -> Date? {
        let raw = defaults.double(forKey: DefaultsKey.clientTokenCachedAt)
        guard raw > 0 else { return nil }
        return Date(timeIntervalSince1970: raw)
    }

    static func sharedClientTokenBaseURL(defaults: UserDefaults = .standard) -> String? {
        let raw = defaults.string(forKey: DefaultsKey.clientTokenBaseURL) ?? ""
        let normalized = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : normalized
    }

    @discardableResult
    static func persistSharedClientToken(
        _ token: String,
        expiryRaw: String?,
        baseURLRaw: String? = nil
    ) -> Bool {
        let wroteToken = BackendCredentialMigration.writeString(
            token,
            account: clientTokenAccount,
            defaultsKey: "client_token",
            writeKeychain: writeKeychainString,
            deleteKeychain: deleteKeychainString
        )
        if let expiryRaw {
            _ = BackendCredentialMigration.writeString(
                expiryRaw,
                account: clientTokenExpiryAccount,
                defaultsKey: "client_token_expiry",
                writeKeychain: writeKeychainString,
                deleteKeychain: deleteKeychainString
            )
        } else {
            BackendCredentialMigration.deleteString(
                account: clientTokenExpiryAccount,
                defaultsKey: "client_token_expiry",
                deleteKeychain: deleteKeychainString
            )
        }
        if wroteToken {
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: DefaultsKey.clientTokenCachedAt)
            let normalizedBaseURL = (baseURLRaw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if normalizedBaseURL.isEmpty {
                UserDefaults.standard.removeObject(forKey: DefaultsKey.clientTokenBaseURL)
            } else {
                UserDefaults.standard.set(normalizedBaseURL, forKey: DefaultsKey.clientTokenBaseURL)
            }
        }
        return wroteToken
    }

    static func clearSharedClientToken() {
        BackendCredentialMigration.deleteString(
            account: clientTokenAccount,
            defaultsKey: "client_token",
            deleteKeychain: deleteKeychainString
        )
        BackendCredentialMigration.deleteString(
            account: clientTokenExpiryAccount,
            defaultsKey: "client_token_expiry",
            deleteKeychain: deleteKeychainString
        )
        UserDefaults.standard.removeObject(forKey: DefaultsKey.clientTokenCachedAt)
        UserDefaults.standard.removeObject(forKey: DefaultsKey.clientTokenBaseURL)
    }

    static func sharedUserID() -> String? {
        BackendCredentialMigration.readString(
            account: userIDAccount,
            defaultsKey: DefaultsKey.userId,
            readKeychain: readKeychainString,
            writeKeychain: writeKeychainString,
            normalize: normalizedStoredUserID
        )
    }

    @discardableResult
    static func persistSharedUserID(_ userID: String) -> Bool {
        BackendCredentialMigration.writeString(
            userID,
            account: userIDAccount,
            defaultsKey: DefaultsKey.userId,
            writeKeychain: writeKeychainString,
            deleteKeychain: deleteKeychainString,
            normalize: normalizedStoredUserID
        )
    }

    static func clearSharedUserID() {
        BackendCredentialMigration.deleteString(
            account: userIDAccount,
            defaultsKey: DefaultsKey.userId,
            deleteKeychain: deleteKeychainString
        )
    }

    private static func isUsableConfigValue(_ raw: String) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return false }
        if value.hasPrefix("$("), value.hasSuffix(")") { return false }
        return true
    }

    private static func decodeErrorMessage(from data: Data) -> String {
        struct ErrorPayload: Decodable {
            let error: String?
            let stage: String?
        }
        if let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data),
           let error = payload.error,
           !error.isEmpty {
            if let stage = payload.stage, !stage.isEmpty {
                return "\(stage): \(error)"
            }
            return error
        }
        return BackendErrorMessageSanitizer.displayMessage(from: data)
    }
}

actor BackendMemoryAPI {
    static let shared = BackendMemoryAPI()
    private let personaFlowKey = "clementine"

    enum NotificationKey {
        static let source = "source"
        static let turnId = "turn_id"
        static let requestId = "request_id"
        static let sessionId = "session_id"
        static let stateVersion = "state_version"
        static let lastUpdatedAt = "last_updated_at"
        static let historyUpdatedAt = "history_updated_at"
        static let memoryUpdatedAt = "memory_updated_at"
        static let userMessage = "user_message"
        static let assistantMessage = "assistant_message"
        static let screenplayTarget = "screenplay_target"
        static let screenplayPromptSource = "screenplay_prompt_source"
        static let screenplayWriteId = "screenplay_write_id"
        static let screenplayAnchorLine = "screenplay_anchor_line"
        static let screenplayAnchorEndLine = "screenplay_anchor_end_line"
        static let screenplayAnchorSceneLabel = "screenplay_anchor_scene_label"
        static let screenplayNoteTitle = "screenplay_note_title"
        static let screenplayNoteBody = "screenplay_note_body"
        static let screenplayInsertedText = "screenplay_inserted_text"
        static let screenplayReplacementApplied = "screenplay_replacement_applied"
        static let screenplayReplacedWriteId = "screenplay_replaced_write_id"
        static let screenplayRevisedBlockText = "screenplay_revised_block_text"
        static let screenplayResolvedAnchorExcerpt = "screenplay_resolved_anchor_excerpt"
        static let status = "status"
        static let schemaVersion = "schema_version"
        static let backendBuild = "backend_build"
        static let backendBootId = "backend_boot_id"
        static let lastTurnId = "last_turn_id"
    }

    enum DefaultsKey {
        static let baseURL = "backend_base_url"
        static let appToken = "app_token"
        static let clientToken = "client_token"
        static let userId = "user_id"
        static let assistantName = "assistant_self_name"
        static let userName = "user_primary_name"
    }

    static func studioTurnPayload(_ studioMetadata: BackendStudioThreadCommitMetadata) -> [String: Any] {
        var payload: [String: Any] = [:]

        func appendString(_ key: String, _ value: String, limit: Int = 1_000) {
            let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { return }
            payload[key] = String(clean.prefix(limit))
        }

        func appendStrings(_ key: String, _ values: [String], maxItems: Int = 12, limit: Int = 240) {
            let cleanValues = values
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .prefix(maxItems)
                .map { String($0.prefix(limit)) }
            guard !cleanValues.isEmpty else { return }
            payload[key] = Array(cleanValues)
        }

        func appendInt(_ key: String, _ value: Int?) {
            guard let value, value > 0 else { return }
            payload[key] = value
        }

        func appendDictionary(_ key: String, _ value: [String: String]) {
            guard !value.isEmpty else { return }
            payload[key] = value
        }

        func appendDictionaries(_ key: String, _ values: [[String: Any]], maxItems: Int = 8) {
            let cleanValues = values.filter { !$0.isEmpty }.prefix(maxItems)
            guard !cleanValues.isEmpty else { return }
            payload[key] = Array(cleanValues)
        }

        appendString("screenplay_project_id", studioMetadata.screenplayProjectId, limit: 96)
        appendString("screenplay_document_revision_id", studioMetadata.screenplayDocumentRevisionId, limit: 96)
        appendString("screenplay_target", studioMetadata.screenplayTarget, limit: 80)
        appendString("screenplay_prompt_source", studioMetadata.screenplayPromptSource, limit: 120)
        appendString("screenplay_write_id", studioMetadata.screenplayWriteId, limit: 120)
        appendInt("screenplay_anchor_line", studioMetadata.screenplayAnchorLine)
        appendInt("screenplay_anchor_end_line", studioMetadata.screenplayAnchorEndLine)
        appendString("screenplay_insertion_mode", studioMetadata.screenplayInsertionMode, limit: 80)
        appendString("screenplay_anchor_scene_label", studioMetadata.screenplayAnchorSceneLabel, limit: 160)
        appendString("screenplay_anchor_draft_scene_id", studioMetadata.screenplayAnchorDraftSceneId, limit: 120)
        appendString("screenplay_anchor_outline_scene_id", studioMetadata.screenplayAnchorOutlineSceneId, limit: 120)
        appendStrings("screenplay_anchor_outline_beat_ids", studioMetadata.screenplayAnchorOutlineBeatIds, maxItems: 16, limit: 120)
        appendString("screenplay_anchor_script_node_id", studioMetadata.screenplayAnchorScriptNodeId, limit: 120)
        appendString("screenplay_note_title", studioMetadata.screenplayNoteTitle, limit: 240)
        appendString("screenplay_note_body", studioMetadata.screenplayNoteBody, limit: 2_000)
        appendString("screenplay_inserted_text", studioMetadata.screenplayInsertedText, limit: 12_000)
        payload["screenplay_replacement_applied"] = studioMetadata.screenplayReplacementApplied
        appendString("screenplay_replaced_write_id", studioMetadata.screenplayReplacedWriteId, limit: 120)
        appendString("screenplay_revised_block_text", studioMetadata.screenplayRevisedBlockText, limit: 12_000)
        appendString("screenplay_resolved_anchor_excerpt", studioMetadata.screenplayResolvedAnchorExcerpt, limit: 280)
        appendString("screenplay_draft_excerpt", studioMetadata.screenplayDraftExcerpt, limit: 6_000)
        appendString("screenplay_act", studioMetadata.screenplayAct, limit: 120)
        appendString("screenplay_scene_objective", studioMetadata.screenplaySceneObjective, limit: 280)
        appendString("screenplay_scene_summary", studioMetadata.screenplaySceneSummary, limit: 280)
        appendString("screenplay_current_beat", studioMetadata.screenplayCurrentBeat, limit: 220)
        appendString("screenplay_logline", studioMetadata.screenplayLogline, limit: 280)
        appendString("screenplay_theme_argument", studioMetadata.screenplayThemeArgument, limit: 280)
        appendString("screenplay_central_question", studioMetadata.screenplayCentralQuestion, limit: 280)
        appendString("screenplay_protagonist_want", studioMetadata.screenplayProtagonistWant, limit: 240)
        appendString("screenplay_protagonist_need", studioMetadata.screenplayProtagonistNeed, limit: 240)
        appendString("screenplay_antagonistic_force", studioMetadata.screenplayAntagonisticForce, limit: 260)
        appendString("screenplay_ending_image", studioMetadata.screenplayEndingImage, limit: 240)
        appendString("screenplay_feature_sequence", studioMetadata.screenplayFeatureSequence, limit: 220)
        appendString("screenplay_feature_obligation", studioMetadata.screenplayFeatureObligation, limit: 280)
        appendString("screenplay_act_pressure_state", studioMetadata.screenplayActPressureState, limit: 280)
        appendString("screenplay_character_arc_state", studioMetadata.screenplayCharacterArcState, limit: 280)
        appendDictionary("screenplay_character_arc_memory", studioMetadata.screenplayCharacterArcMemory?.payload ?? [:])
        appendDictionaries(
            "screenplay_character_voice_memories",
            studioMetadata.screenplayCharacterVoiceMemories.map(\.payload)
        )
        appendString("screenplay_last_scene_outcome", studioMetadata.screenplayLastSceneOutcome, limit: 240)
        appendString("screenplay_next_scene_plan", studioMetadata.screenplayNextScenePlan, limit: 340)
        appendStrings("screenplay_next_scene_moves", studioMetadata.screenplayNextSceneMoves, maxItems: 5, limit: 180)
        appendStrings("screenplay_next_three_turns", studioMetadata.screenplayNextThreeTurns, maxItems: 3, limit: 180)
        appendStrings("screenplay_act_three_payoff_path", studioMetadata.screenplayActThreePayoffPath, maxItems: 5, limit: 200)
        appendStrings("screenplay_beat_sequence", studioMetadata.screenplayBeatSequence, maxItems: 8, limit: 180)
        appendStrings("screenplay_character_focus", studioMetadata.screenplayCharacterFocus, maxItems: 8, limit: 120)
        appendStrings("screenplay_unresolved_setups", studioMetadata.screenplayUnresolvedSetups, maxItems: 8, limit: 220)
        appendStrings("screenplay_unresolved_story_threads", studioMetadata.screenplayUnresolvedStoryThreads, maxItems: 8, limit: 220)
        appendStrings("screenplay_character_arc_turns", studioMetadata.screenplayCharacterArcTurns, maxItems: 6, limit: 180)
        appendStrings("screenplay_image_motifs", studioMetadata.screenplayImageMotifs, maxItems: 6, limit: 140)
        appendStrings("screenplay_continuity_notes", studioMetadata.screenplayContinuityNotes, maxItems: 8, limit: 220)
        appendString("screenplay_emotional_continuity", studioMetadata.screenplayEmotionalContinuity, limit: 280)
        appendInt("screenplay_page_count", studioMetadata.screenplayPageCount)
        appendInt("screenplay_target_pages", studioMetadata.screenplayTargetPages)

        return payload
    }

    private var clientNameHeaderValue: String {
        "them"
    }

    private var clientPlatformHeaderValue: String {
        #if os(macOS)
        return "macOS"
        #elseif os(iOS)
        return "iOS"
        #else
        return "Apple"
        #endif
    }

    private var clientVersionHeaderValue: String {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var clientBuildHeaderValue: String {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        return raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private struct HistoryCacheEntry {
        let etag: String
        let payload: BackendHistoryResponse
        let sync: BackendSyncState
    }

    private struct MemoriesCacheEntry {
        let etag: String
        let payload: BackendMemoriesResponse
        let sync: BackendSyncState
    }

    private struct HealthPayload: Decodable {
        let ok: Bool?
        let status: String?
        let sessionId: String?
        let schemaVersion: Int?
        let backendBuild: String?
        let backendBootId: String?
        let lastTurnId: String?
        let lastUpdatedAt: TimeInterval?
        let historyUpdatedAt: TimeInterval?
        let memoryUpdatedAt: TimeInterval?
        let stateVersion: String?
        let talkMetrics: HealthTalkMetricsPayload?
        let productKpis: HealthProductKpisPayload?
    }

    private struct HealthTalkMetricsPayload: Decodable {
        let sampleCount: Int?
        let userLiveSampleCount: Int?
        let silentTurnRate: Double?
        let bargeInStopSampleCount: Int?
        let p95BargeInStopMs: Double?
        let medianEndToEndMs: Double?
    }

    private struct HealthProductKpisPayload: Decodable {
        let voiceSampleCount: Int?
        let silentTurnRate: Double?
        let bargeInStopP95Ms: Double?
        let bargeInStopSampleCount: Int?
        let medianEndToEndMs: Double?
    }

    private let devFallbackAppToken: String? = {
#if DEBUG
        "them-dev"
#else
        nil
#endif
    }()
    private let session: URLSession
    private let baseURLOverride: URL?
    private var healthyBaseURL: URL?
    private var cachedSession: BackendSessionResponse?
    private var cachedSessionAt: Date?
    private var sessionBootstrapTask: (id: Int, task: Task<SessionBootstrapHTTPResult, Error>)?
    private var nextSessionBootstrapTaskID: Int = 0
    private var syncState: BackendSyncState = .empty
    private var historyCacheByLimit: [Int: HistoryCacheEntry] = [:]
    private var memoriesCacheByLimit: [Int: MemoriesCacheEntry] = [:]
    private var latestSeenStateVersion: String = ""
    private var inFlightStateVersions: Set<String> = []
    private var lastForcedSessionRefreshAt: Date?
    private let forcedSessionRefreshCooldown: TimeInterval = 8
    private let sessionCacheTTL: TimeInterval = 90
    private let storedSessionRefreshSkew: TimeInterval = 30

    private struct SessionBootstrapHTTPResult: @unchecked Sendable {
        let data: Data
        let statusCode: Int
        let responsePersonaKey: String
        let path: String
    }

    init(session: URLSession = .shared, baseURL: URL? = nil) {
        self.session = session
        self.baseURLOverride = baseURL
    }

    func currentSyncState() -> BackendSyncState {
        syncState
    }

    func invalidateResolvedSession(clearSharedUserID: Bool = false) {
        invalidateReadCaches(clearSyncState: true)
        lastForcedSessionRefreshAt = nil
        BackendAuthClient.clearSharedClientToken()
        if clearSharedUserID {
            BackendAuthClient.clearSharedUserID()
        }
    }

    func authObservabilityEnabled() -> Bool {
        BackendAuthClient.currentAuthSessionState().isAuthenticated
    }

    func fetchAuthSessions(
        limit: Int = 24,
        includeRevoked: Bool = false,
        email: String? = nil
    ) async throws -> [BackendAuthManagedSession] {
        guard authObservabilityEnabled() else {
            throw BackendMemoryAPIError.server(status: 401, message: "user_auth_required")
        }
        var queryItems = [
            URLQueryItem(name: "limit", value: String(max(1, limit))),
            URLQueryItem(name: "include_revoked", value: includeRevoked ? "1" : "0"),
        ]
        let normalizedEmail = (email ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedEmail.isEmpty {
            queryItems.append(URLQueryItem(name: "email", value: normalizedEmail))
        }
        let request = try makeRequest(path: "/auth/sessions", extraQueryItems: queryItems)
        let response = try await run(request, as: BackendAuthSessionsResponse.self)
        return response.sessions.sorted { ($0.updatedAt ?? 0) > ($1.updatedAt ?? 0) }
    }

    @discardableResult
    func revokeAuthSession(sessionId: String) async throws -> BackendAuthManagedSession? {
        let normalizedSessionId = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedSessionId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "session_id_required")
        }
        guard authObservabilityEnabled() else {
            throw BackendMemoryAPIError.server(status: 401, message: "user_auth_required")
        }
        var request = try makeWriteRequest(path: "/auth/sessions/revoke")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["session_id": normalizedSessionId], options: [])
        let response = try await run(request, as: BackendAuthSessionRevokeResponse.self)
        return response.session
    }

    func revokeOtherAuthSessions(currentSessionId: String) async throws -> [BackendAuthManagedSession] {
        let normalizedCurrentSessionId = currentSessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let current = BackendAuthClient.currentAuthSessionState()
        let sessions = try await fetchAuthSessions(
            limit: 64,
            includeRevoked: false,
            email: current.email.isEmpty ? nil : current.email
        )
        var revoked: [BackendAuthManagedSession] = []
        for session in sessions where session.isActive && session.sessionId != normalizedCurrentSessionId {
            if let item = try await revokeAuthSession(sessionId: session.sessionId) {
                revoked.append(item)
            }
        }
        return revoked
    }

    func bootstrapSession(force: Bool = false) async throws -> BackendSessionResponse {
        let now = Date()
        if force {
            cachedSession = nil
            cachedSessionAt = nil
        }
        if !force,
           let cachedSession,
           let cachedSessionAt,
           now.timeIntervalSince(cachedSessionAt) < sessionCacheTTL {
            return cachedSession
        }
        if !force, let storedSession = storedSessionFromRecentSharedToken(now: now) {
            cachedSession = storedSession
            cachedSessionAt = now
            return storedSession
        }
        if let sessionBootstrapTask {
            return try await completeSessionBootstrap(sessionBootstrapTask.task, id: sessionBootstrapTask.id)
        }
        var request = try makeRequest(path: "/session")
        request.httpMethod = "POST"
        let urlSession = session
        let requestPath = request.url?.path ?? "/session"
        nextSessionBootstrapTaskID += 1
        let taskID = nextSessionBootstrapTaskID
        let task = Task { () throws -> SessionBootstrapHTTPResult in
            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw BackendMemoryAPIError.invalidResponse
            }
            return SessionBootstrapHTTPResult(
                data: data,
                statusCode: http.statusCode,
                responsePersonaKey: http.value(forHTTPHeaderField: "x-persona-key") ?? "",
                path: requestPath
            )
        }
        sessionBootstrapTask = (id: taskID, task: task)
        return try await completeSessionBootstrap(task, id: taskID)
    }

    private func completeSessionBootstrap(
        _ task: Task<SessionBootstrapHTTPResult, Error>,
        id taskID: Int
    ) async throws -> BackendSessionResponse {
        do {
            let result = try await task.value
            if sessionBootstrapTask?.id == taskID {
                sessionBootstrapTask = nil
            }
            validatePersonaContract(responsePersonaKey: result.responsePersonaKey, path: result.path)
            guard (200...299).contains(result.statusCode) else {
                let message = decodeErrorMessage(from: result.data)
                throw BackendMemoryAPIError.server(status: result.statusCode, message: message)
            }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let payload = try decoder.decode(BackendSessionResponse.self, from: result.data)
            cacheSession(payload)
            updateSyncState(syncFromSession(payload), emitTurnEvent: false)
            return payload
        } catch {
            if sessionBootstrapTask?.id == taskID {
                sessionBootstrapTask = nil
            }
            throw error
        }
    }

    private func storedSessionFromRecentSharedToken(now: Date) -> BackendSessionResponse? {
        guard let token = clientToken(), !token.isEmpty else { return nil }
        guard let cachedAt = BackendAuthClient.sharedClientTokenCachedAt(),
              now.timeIntervalSince(cachedAt) < sessionCacheTTL else {
            return nil
        }
        guard BackendAuthClient.sharedClientTokenBaseURL() == baseURL().absoluteString else {
            return nil
        }

        let formatter = ISO8601DateFormatter()
        guard let expiryRaw = BackendAuthClient.sharedClientTokenExpiry(),
              let expiry = formatter.date(from: expiryRaw) else {
            return nil
        }
        let secondsRemaining = expiry.timeIntervalSince(now)
        guard secondsRemaining > storedSessionRefreshSkew else { return nil }

        return BackendSessionResponse(
            userId: BackendAuthClient.sharedUserID(),
            authenticated: nil,
            clientToken: token,
            sessionId: nil,
            expiresIn: Int(max(60, secondsRemaining.rounded(.down))),
            assistantName: UserDefaults.standard.string(forKey: DefaultsKey.assistantName),
            assistantSelfName: UserDefaults.standard.string(forKey: DefaultsKey.assistantName),
            userName: UserDefaults.standard.string(forKey: DefaultsKey.userName),
            rememberedNames: [],
            lastConversationRecap: nil,
            lastConversationSnapshot: nil,
            lastConversationAt: nil,
            stateVersion: nil,
            lastUpdatedAt: nil,
            historyUpdatedAt: nil,
            memoryUpdatedAt: nil,
            lastTurnId: nil,
            schemaVersion: nil,
            backendBuild: nil,
            backendBootId: nil,
            evolutionSync: nil,
            continuity: nil,
            pendingScreenplayQuestion: nil
        )
    }

    private func validatePersonaContract(responsePersonaKey: String, path: String) {
        let responsePersona = responsePersonaKey
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if !responsePersona.isEmpty, responsePersona != personaFlowKey {
            print(
                "[BackendMemoryAPI] persona contract mismatch path=\(path) response=\(responsePersona) expected=\(personaFlowKey)"
            )
        }
    }

    func fetchHealth() async throws -> BackendHealthStatus {
        var lastError: Error = BackendMemoryAPIError.invalidResponse
        for candidate in healthBaseURLCandidates() {
            do {
                let status = try await fetchHealth(path: "/bridge", baseURL: candidate)
                adoptHealthyBaseURL(candidate)
                return status
            } catch {
                lastError = error
            }
            do {
                let status = try await fetchHealth(path: "/health", baseURL: candidate)
                adoptHealthyBaseURL(candidate)
                return status
            } catch {
                lastError = error
            }
        }
        throw lastError
    }

    func fetchOpsRoutesManifest() async throws -> BackendOpsRouteManifestResponse {
        let request = try makeRequest(path: "/ops/routes")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendOpsRouteManifestResponse.self, from: data)
    }

    func fetchMemoryStats() async throws -> BackendMemoryStatsResponse {
        let request = try makeRequest(path: "/memory/stats")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        return try JSONDecoder().decode(BackendMemoryStatsResponse.self, from: data)
    }

    func fetchTalkStats() async throws -> BackendTalkStatsResponse {
        let request = try makeRequest(path: "/talk/stats")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        return try JSONDecoder().decode(BackendTalkStatsResponse.self, from: data)
    }

    func fetchTalkErrors(sinceMs: Double? = nil) async throws -> BackendTalkErrorsResponse {
        var queryItems: [URLQueryItem] = []
        if let sinceMs, sinceMs > 0 {
            queryItems.append(URLQueryItem(name: "sinceMs", value: String(Int(sinceMs.rounded()))))
        }
        let request = try makeRequest(path: "/talk/errors", extraQueryItems: queryItems)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        return try JSONDecoder().decode(BackendTalkErrorsResponse.self, from: data)
    }

    private func fetchHealth(path: String, baseURL: URL) async throws -> BackendHealthStatus {
        let request = try makeRequest(path: path, baseURL: baseURL)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        validatePersonaContract(response: http, path: path)
        let raw = String(data: data, encoding: .utf8) ?? ""
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try? decoder.decode(HealthPayload.self, from: data)
        guard (200...299).contains(http.statusCode) else {
            throw BackendMemoryAPIError.server(
                status: http.statusCode,
                message: decodeErrorMessage(from: data)
            )
        }
        guard BackendAPIResponseValidator.hasMatchingOrigin(
            requestURL: request.url,
            responseURL: http.url
        ), BackendAPIResponseValidator.isJSONResponse(http, data: data), payload?.ok == true else {
            throw BackendMemoryAPIError.server(
                status: 502,
                message: "Backend service unavailable. Please try again."
            )
        }
        let headerSync = syncFromHeaders(http, fallbackStatus: (200...299).contains(http.statusCode) ? "up" : "down")
        let payloadSync = syncFromHealthPayload(payload, ok: (200...299).contains(http.statusCode))
        let incomingSync = mergeSyncStates(base: payloadSync, incoming: headerSync)
        let previous = syncState
        updateSyncState(incomingSync, emitTurnEvent: false)
        if shouldForceSessionRefresh(previous: previous, current: syncState), canForceSessionRefreshNow() {
            lastForcedSessionRefreshAt = Date()
            invalidateReadCaches(clearSyncState: false)
            _ = try? await bootstrapSession(force: true)
        }
        let latest = syncState
        let healthStatus = payload?.status?.trimmingCharacters(in: .whitespacesAndNewlines)
        let turnReliability = buildTurnReliabilitySnapshot(from: payload)
        return BackendHealthStatus(
            ok: payload?.ok == true,
            status: healthStatus?.isEmpty == false ? healthStatus! : latest.status,
            raw: raw,
            sessionId: latest.sessionId,
            schemaVersion: latest.schemaVersion,
            backendBuild: latest.backendBuild,
            backendBootId: latest.backendBootId,
            lastTurnId: latest.lastTurnId,
            lastUpdatedAt: latest.lastUpdatedAt,
            historyUpdatedAt: latest.historyUpdatedAt,
            memoryUpdatedAt: latest.memoryUpdatedAt,
            stateVersion: latest.stateVersion,
            turnReliability: turnReliability
        )
    }

    private func buildTurnReliabilitySnapshot(from payload: HealthPayload?) -> BackendTurnReliabilitySnapshot {
        guard let payload else { return .empty }

        let talk = payload.talkMetrics
        let kpis = payload.productKpis
        let source = talk != nil ? "talk_metrics" : (kpis != nil ? "product_kpis" : "none")

        let sampleCount = max(
            talk?.userLiveSampleCount ?? 0,
            talk?.sampleCount ?? 0,
            kpis?.voiceSampleCount ?? 0
        )
        let silentTurnRate = talk?.silentTurnRate ?? kpis?.silentTurnRate ?? 0
        let bargeInStopP95Ms = talk?.p95BargeInStopMs ?? kpis?.bargeInStopP95Ms
        let bargeInStopSampleCount = max(
            talk?.bargeInStopSampleCount ?? 0,
            kpis?.bargeInStopSampleCount ?? 0
        )
        let medianEndToEndMs = talk?.medianEndToEndMs ?? kpis?.medianEndToEndMs

        return BackendTurnReliabilitySnapshot(
            sampleCount: sampleCount,
            silentTurnRate: max(0, silentTurnRate),
            bargeInStopP95Ms: bargeInStopP95Ms,
            bargeInStopSampleCount: bargeInStopSampleCount,
            medianEndToEndMs: medianEndToEndMs,
            source: source
        )
    }

    func hardResync() async {
        invalidateReadCaches(clearSyncState: false)
        _ = try? await bootstrapSession(force: true)
    }

    func fetchHistory(
        limit: Int = 120,
        force: Bool = false,
        sinceTurnId: String? = nil,
        screenplayProjectId: String? = nil
    ) async throws -> BackendReadResult<BackendHistoryResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedSince = sinceTurnId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let normalizedProjectId = screenplayProjectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        var extraQuery: [URLQueryItem] = normalizedSince.isEmpty
            ? []
            : [URLQueryItem(name: "sinceTurnId", value: normalizedSince)]
        if !normalizedProjectId.isEmpty {
            extraQuery.append(URLQueryItem(name: "screenplayProjectId", value: normalizedProjectId))
        }
        var request = try makeRequest(path: "/history", limit: limit, extraQueryItems: extraQuery)
        let canUseSharedCache = normalizedSince.isEmpty && normalizedProjectId.isEmpty
        if !force, canUseSharedCache, let cached = historyCacheByLimit[limit], !cached.etag.isEmpty {
            request.setValue(cached.etag, forHTTPHeaderField: "If-None-Match")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }

        if canUseSharedCache, http.statusCode == 304, let cached = historyCacheByLimit[limit] {
            let headerSync = syncFromHeaders(http, fallbackStatus: "up")
            let incoming = mergeSyncStates(base: cached.sync, incoming: headerSync)
            updateSyncState(incoming, emitTurnEvent: false)
            return BackendReadResult(payload: cached.payload, sync: syncState, notModified: true)
        }

        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendHistoryResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromHistoryPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        let etag = normalizedEtag(from: http, fallbackStateVersion: syncState.stateVersion)
        if canUseSharedCache {
            historyCacheByLimit[limit] = HistoryCacheEntry(etag: etag, payload: payload, sync: syncState)
        }
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchMemories(
        limit: Int = 36,
        force: Bool = false,
        sinceVersion: String? = nil
    ) async throws -> BackendReadResult<BackendMemoriesResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedSince = sinceVersion?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let extraQuery: [URLQueryItem] = normalizedSince.isEmpty
            ? []
            : [URLQueryItem(name: "sinceVersion", value: normalizedSince)]
        var request = try makeRequest(path: "/memories", limit: limit, extraQueryItems: extraQuery)
        if !force, normalizedSince.isEmpty, let cached = memoriesCacheByLimit[limit], !cached.etag.isEmpty {
            request.setValue(cached.etag, forHTTPHeaderField: "If-None-Match")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }

        if normalizedSince.isEmpty, http.statusCode == 304, let cached = memoriesCacheByLimit[limit] {
            let headerSync = syncFromHeaders(http, fallbackStatus: "up")
            let incoming = mergeSyncStates(base: cached.sync, incoming: headerSync)
            updateSyncState(incoming, emitTurnEvent: false)
            return BackendReadResult(payload: cached.payload, sync: syncState, notModified: true)
        }

        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendMemoriesResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromMemoriesPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        let etag = normalizedEtag(from: http, fallbackStateVersion: syncState.stateVersion)
        if normalizedSince.isEmpty {
            memoriesCacheByLimit[limit] = MemoriesCacheEntry(etag: etag, payload: payload, sync: syncState)
        }
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func resolvePendingScreenplayQuestion(
        _ pending: BackendPendingScreenplayQuestion,
        responseStatus: String,
        answer: String = ""
    ) async throws -> BackendReadResult<BackendScreenplayQuestionResolutionResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedStatus = responseStatus
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard normalizedStatus == "answered" || normalizedStatus == "declined" else {
            throw BackendMemoryAPIError.server(
                status: 400,
                message: "response_status must be answered or declined"
            )
        }
        let normalizedAnswer = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalizedStatus == "answered", normalizedAnswer.isEmpty {
            throw BackendMemoryAPIError.server(status: 400, message: "answer is required")
        }

        var request = try makeWriteRequest(path: "/memory/screenplay-question/resolve")
        let idempotencyKey = String(
            "screenplay-question-\(pending.id)-\(normalizedStatus)".prefix(128)
        )
        request.setValue(idempotencyKey, forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue(
            "screenplay_question_resolution",
            forHTTPHeaderField: "X-Them-Outbox-Action"
        )
        request.setValue(
            String(pending.id.prefix(120)),
            forHTTPHeaderField: "X-Screenplay-Question-ID"
        )
        let body = try JSONSerialization.data(withJSONObject: [
            "question_id": pending.id,
            "project_id": pending.projectId,
            "project_title": pending.projectTitle,
            "response_status": normalizedStatus,
            "answer": normalizedAnswer,
        ])
        request.httpBody = body

        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw BackendMemoryAPIError.invalidResponse
            }
            guard (200...299).contains(http.statusCode) else {
                throw BackendMemoryAPIError.server(
                    status: http.statusCode,
                    message: decodeErrorMessage(from: data)
                )
            }
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let payload = try decoder.decode(
                BackendScreenplayQuestionResolutionResponse.self,
                from: data
            )
            cachedSession = nil
            cachedSessionAt = nil
            let headerSync = syncFromHeaders(http, fallbackStatus: payload.ok ? "up" : "degraded")
            let bodySync = syncFromScreenplayEnvelope(
                sessionId: payload.sessionId,
                stateVersion: payload.stateVersion,
                lastUpdatedAt: payload.lastUpdatedAt,
                historyUpdatedAt: payload.historyUpdatedAt,
                memoryUpdatedAt: payload.memoryUpdatedAt,
                lastTurnId: payload.lastTurnId,
                schemaVersion: payload.schemaVersion,
                backendBuild: payload.backendBuild,
                backendBootId: payload.backendBootId
            )
            updateSyncState(
                mergeSyncStates(base: bodySync, incoming: headerSync),
                emitTurnEvent: true
            )
            return BackendReadResult(payload: payload, sync: syncState, notModified: false)
        } catch {
            guard shouldQueueScreenplayQuestionResolution(error) else { throw error }
            let queued = try await OfflineTalkOutbox.shared.enqueue(
                request: request,
                body: body,
                reason: error.localizedDescription
            )
            cachedSession = nil
            cachedSessionAt = nil
            throw BackendTalkQueuedError(
                entryID: queued.entry.id,
                snapshot: queued.snapshot,
                reason: error.localizedDescription
            )
        }
    }

    func fetchStateDelta(
        sinceVersion: String,
        sinceTurnId: String? = nil,
        historyLimit: Int = 140,
        memoriesLimit: Int = 72
    ) async throws -> BackendReadResult<BackendStateDeltaResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedVersion = sinceVersion.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedTurn = sinceTurnId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        var extraQuery: [URLQueryItem] = [
            URLQueryItem(name: "sinceVersion", value: normalizedVersion),
            URLQueryItem(name: "historyLimit", value: String(max(1, historyLimit))),
            URLQueryItem(name: "memoriesLimit", value: String(max(1, memoriesLimit))),
        ]
        if !normalizedTurn.isEmpty {
            extraQuery.append(URLQueryItem(name: "sinceTurnId", value: normalizedTurn))
        }
        let request = try makeRequest(
            path: "/state",
            limit: max(1, historyLimit),
            extraQueryItems: extraQuery
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }

        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendStateDeltaResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromStatePayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    private func shouldQueueScreenplayQuestionResolution(_ error: Error) -> Bool {
        if error is CancellationError { return false }
        if let urlError = error as? URLError {
            return [
                .timedOut,
                .networkConnectionLost,
                .cannotConnectToHost,
                .cannotFindHost,
                .dnsLookupFailed,
                .notConnectedToInternet,
            ].contains(urlError.code)
        }
        guard let backendError = error as? BackendMemoryAPIError else { return false }
        switch backendError {
        case .invalidResponse:
            return true
        case .invalidBaseURL:
            return false
        case .server(let status, _):
            return status == 408 ||
                status == 425 ||
                status == 429 ||
                (500...599).contains(status)
        }
    }

    func fetchActionReceipts(
        limit: Int = 24,
        force: Bool = false
    ) async throws -> BackendReadResult<BackendActionReceiptsResponse> {
        _ = try? await bootstrapSession(force: false)
        let request = try makeRequest(path: "/actions/receipts", limit: limit)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendActionReceiptsResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromActionReceiptsPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        _ = force // parity with other read methods
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func clearHistory() async throws -> BackendReadResult<BackendDataControlResponse> {
        try await runDataControl(path: "/data/history/clear")
    }

    func clearMemories() async throws -> BackendReadResult<BackendDataControlResponse> {
        try await runDataControl(path: "/data/memories/clear")
    }

    func exportAccountData() async throws -> BackendAccountExportArtifact {
        _ = try? await bootstrapSession(force: false)
        var request = try makeRequest(path: "/account/export")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let contentType = headerValue(http, "Content-Type").trimmingCharacters(in: .whitespacesAndNewlines)
        let disposition = headerValue(http, "Content-Disposition")
        let filename = disposition.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "io-them-account-export.json"
            : parseDispositionFilename(disposition, fallbackFormat: "json")
        return BackendAccountExportArtifact(
            filename: filename,
            contentType: contentType.isEmpty ? "application/json" : contentType,
            data: data
        )
    }

    func requestAccountDeletion(reason: String = "") async throws -> BackendAccountDeletionResponse {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/account")
        request.httpMethod = "DELETE"
        let normalizedReason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "reason": String(normalizedReason.prefix(280)),
        ], options: [])
        let payload = try await run(request, as: BackendAccountDeletionResponse.self)
        await BackendAuthClient.clearLocalSessionAfterAccountDeletion()
        invalidateReadCaches(clearSyncState: true)
        return payload
    }

    func fetchTasks(
        limit: Int = 80,
        status: String = "all",
        force: Bool = false
    ) async throws -> BackendReadResult<BackendTasksResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedStatus = status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let request = try makeRequest(
            path: "/tasks",
            limit: max(1, limit),
            extraQueryItems: [URLQueryItem(name: "status", value: normalizedStatus.isEmpty ? "all" : normalizedStatus)]
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendTasksResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromTasksPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        _ = force // reserved for parity with other read methods.
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchDailyRecap(window: String = "today") async throws -> BackendReadResult<BackendDailyRecapResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedWindow = window.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let windowValue = normalizedWindow.isEmpty ? "today" : normalizedWindow
        let request = try makeRequest(
            path: "/recap",
            extraQueryItems: [URLQueryItem(name: "window", value: windowValue)]
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendDailyRecapResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromDailyRecapPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: false)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchScreenplayProjects(
        limit: Int = 12,
        includeVersions: Bool = false,
        includeDrafts: Bool = false
    ) async throws -> BackendReadResult<BackendScreenplayProjectsResponse> {
        _ = try? await bootstrapSession(force: false)
        let request = try makeRequest(
            path: "/screenplay/projects",
            limit: max(1, limit),
            extraQueryItems: [
                URLQueryItem(name: "include_versions", value: includeVersions ? "1" : "0"),
                URLQueryItem(name: "include_drafts", value: includeDrafts ? "1" : "0"),
            ]
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendScreenplayProjectsResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: payload.sessionId,
            stateVersion: payload.stateVersion,
            lastUpdatedAt: payload.lastUpdatedAt,
            historyUpdatedAt: payload.historyUpdatedAt,
            memoryUpdatedAt: payload.memoryUpdatedAt,
            lastTurnId: payload.lastTurnId,
            schemaVersion: payload.schemaVersion,
            backendBuild: payload.backendBuild,
            backendBootId: payload.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchScreenplayProject(
        projectId: String,
        includeDrafts: Bool = true,
        versionLimit: Int = 16,
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayProjectResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var request = try makeRequest(
            path: "/screenplay/projects/\(normalizedProjectId)",
            extraQueryItems: [
                URLQueryItem(name: "include_drafts", value: includeDrafts ? "1" : "0"),
                URLQueryItem(name: "version_limit", value: String(max(1, versionLimit))),
            ]
        )
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendScreenplayProjectResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: payload.sessionId,
            stateVersion: payload.stateVersion,
            lastUpdatedAt: payload.lastUpdatedAt,
            historyUpdatedAt: payload.historyUpdatedAt,
            memoryUpdatedAt: payload.memoryUpdatedAt,
            lastTurnId: payload.lastTurnId,
            schemaVersion: payload.schemaVersion,
            backendBuild: payload.backendBuild,
            backendBootId: payload.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchScreenplayCompanionState() async throws -> BackendReadResult<BackendScreenplayCompanionStateResponse> {
        _ = try? await bootstrapSession(force: false)
        let request = try makeRequest(path: "/screenplay/companion/state")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        let payload = try decoder.decode(BackendScreenplayCompanionStateResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: payload.sessionId,
            stateVersion: payload.stateVersion,
            lastUpdatedAt: payload.lastUpdatedAt,
            historyUpdatedAt: payload.historyUpdatedAt,
            memoryUpdatedAt: payload.memoryUpdatedAt,
            lastTurnId: payload.lastTurnId,
            schemaVersion: payload.schemaVersion,
            backendBuild: payload.backendBuild,
            backendBootId: payload.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchScreenplayOutline(
        projectId: String,
        includeProject: Bool = true,
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayOutlineResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var request = try makeRequest(
            path: "/screenplay/projects/\(normalizedProjectId)/outline",
            extraQueryItems: [
                URLQueryItem(name: "include_project", value: includeProject ? "1" : "0"),
            ]
        )
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendScreenplayOutlineResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: payload.sessionId,
            stateVersion: payload.stateVersion,
            lastUpdatedAt: payload.lastUpdatedAt,
            historyUpdatedAt: payload.historyUpdatedAt,
            memoryUpdatedAt: payload.memoryUpdatedAt,
            lastTurnId: payload.lastTurnId,
            schemaVersion: payload.schemaVersion,
            backendBuild: payload.backendBuild,
            backendBootId: payload.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func upsertScreenplayProject(
        projectId: String? = nil,
        title: String,
        phase: String = "scene_draft",
        tags: [String] = [],
        characters: [String] = [],
        setting: String = "",
        tone: String = "",
        logline: String? = nil,
        themeArgument: String? = nil,
        centralQuestion: String? = nil,
        protagonistWant: String? = nil,
        protagonistNeed: String? = nil,
        antagonisticForce: String? = nil,
        actPosition: String? = nil,
        endingImage: String? = nil,
        unresolvedSetups: [String]? = nil,
        studioThreadViewState: BackendScreenplayThreadViewState? = nil,
        studioDiffAcknowledgedKeys: [String]? = nil,
        studioDiffAcknowledgedEntries: [BackendScreenplayDiffAcknowledgementEntry]? = nil,
        studioAskNoteHistory: [BackendScreenplayStudioExchange]? = nil
    ) async throws -> BackendReadResult<BackendScreenplayProjectMutationResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/screenplay/projects")
        var payload: [String: Any] = [
            "title": title,
            "phase": phase,
            "tags": tags,
            "characters": characters,
            "setting": setting,
            "tone": tone,
            "activate": true,
        ]
        if let logline {
            payload["logline"] = logline
        }
        if let themeArgument {
            payload["theme_argument"] = themeArgument
        }
        if let centralQuestion {
            payload["central_question"] = centralQuestion
        }
        if let protagonistWant {
            payload["protagonist_want"] = protagonistWant
        }
        if let protagonistNeed {
            payload["protagonist_need"] = protagonistNeed
        }
        if let antagonisticForce {
            payload["antagonistic_force"] = antagonisticForce
        }
        if let actPosition {
            payload["act_position"] = actPosition
        }
        if let endingImage {
            payload["ending_image"] = endingImage
        }
        if let unresolvedSetups {
            payload["unresolved_setups"] = unresolvedSetups
        }
        if let projectId, !projectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["project_id"] = projectId
        }
        if let studioThreadViewState,
           let encoded = try? JSONEncoder().encode(studioThreadViewState),
           let statePayload = try? JSONSerialization.jsonObject(with: encoded) {
            payload["studio_thread_view_state"] = statePayload
        }
        if let studioDiffAcknowledgedKeys {
            payload["studio_diff_acknowledged_keys"] = studioDiffAcknowledgedKeys
        }
        if let studioDiffAcknowledgedEntries,
           let encoded = try? JSONEncoder().encode(studioDiffAcknowledgedEntries),
           let entriesPayload = try? JSONSerialization.jsonObject(with: encoded) {
            payload["studio_diff_acknowledged_entries"] = entriesPayload
        }
        if let studioAskNoteHistory,
           let encoded = try? JSONEncoder().encode(studioAskNoteHistory),
           let historyPayload = try? JSONSerialization.jsonObject(with: encoded) {
            payload["studio_ask_note_history"] = historyPayload
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayProjectMutationResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func activateScreenplayProject(
        projectId: String,
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayProjectMutationResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/projects/\(normalizedProjectId)/activate")
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        request.httpBody = Data("{}".utf8)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayProjectMutationResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func upsertScreenplayOutline(
        projectId: String,
        acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene],
        beats: [BackendScreenplayBeat],
        merge: Bool = true,
        title: String? = nil,
        phase: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayOutlineMutationResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/projects/\(normalizedProjectId)/outline")
        var payload: [String: Any] = [
            "merge": merge,
            "acts": acts.map(screenplayActPayload),
            "scenes": scenes.map(screenplayScenePayload),
            "beats": beats.map(screenplayBeatPayload),
        ]
        if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["title"] = title
        }
        if let phase, !phase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["phase"] = phase
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayOutlineMutationResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func upsertScreenplayScene(
        projectId: String,
        scene: BackendScreenplaySceneDraft,
        title: String? = nil,
        phase: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplaySceneMutationResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/projects/\(normalizedProjectId)/scenes")
        var payload: [String: Any] = [
            "scene": screenplaySceneDraftPayload(scene),
        ]
        if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["title"] = title
        }
        if let phase, !phase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["phase"] = phase
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplaySceneMutationResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func upsertScreenplayBeat(
        projectId: String,
        beat: BackendScreenplayBeatDraft,
        title: String? = nil,
        phase: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayBeatMutationResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/projects/\(normalizedProjectId)/beats")
        var payload: [String: Any] = [
            "beat": screenplayBeatDraftPayload(beat),
        ]
        if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["title"] = title
        }
        if let phase, !phase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["phase"] = phase
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayBeatMutationResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func exportMemories() async throws -> BackendReadResult<BackendMemoryExportResponse> {
        _ = try? await bootstrapSession(force: false)
        let request = try makeRequest(path: "/memories/export")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendMemoryExportResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromMemoryExportPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: false)
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func fetchScreenplayCollaborators(
        projectId: String,
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayCollaboratorsResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var request = try makeRequest(path: "/screenplay/projects/\(normalizedProjectId)/collaborators")
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayCollaboratorsResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func upsertScreenplayCollaborator(
        projectId: String,
        email: String,
        action: String = "approve",
        note: String = "",
        invitedBy: String = "",
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayCollaboratorsResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "valid_email_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/projects/\(normalizedProjectId)/collaborators")
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        let payload: [String: Any] = [
            "email": normalizedEmail,
            "action": action,
            "note": note,
            "invited_by": invitedBy,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayCollaboratorsResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func fetchScreenplayComments(
        projectId: String,
        limit: Int = 120,
        actorEmail: String = "",
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayCommentsResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        var query: [URLQueryItem] = []
        let normalizedActorEmail = actorEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedActorEmail.isEmpty {
            query.append(URLQueryItem(name: "actor_email", value: normalizedActorEmail))
        }
        var request = try makeRequest(
            path: "/screenplay/projects/\(normalizedProjectId)/comments",
            limit: max(1, limit),
            extraQueryItems: query
        )
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayCommentsResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func upsertScreenplayComment(
        projectId: String,
        text: String,
        authorEmail: String = "",
        authorName: String = "",
        anchorLine: Int? = nil,
        versionId: String = "",
        voiceURL: String = "",
        voiceTranscript: String = "",
        voiceDurationMs: Int = 0,
        type: String = "text",
        action: String = "upsert",
        commentId: String = "",
        parentCommentId: String = "",
        actorEmail: String = "",
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayCommentsResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVoiceURL = voiceURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVoiceTranscript = voiceTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedAction = action.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let isDeleteAction = normalizedAction == "delete" || normalizedAction == "remove"
        let isResolveAction = normalizedAction == "resolve" || normalizedAction == "unresolve" || normalizedAction == "mark_resolved" || normalizedAction == "mark_open" || normalizedAction == "reopen"
        guard isDeleteAction || isResolveAction || !normalizedText.isEmpty || !normalizedVoiceURL.isEmpty || !normalizedVoiceTranscript.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "comment_or_voice_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/projects/\(normalizedProjectId)/comments")
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        var payload: [String: Any] = [
            "text": text,
            "author_email": authorEmail,
            "author_name": authorName,
            "voice_url": voiceURL,
            "voice_transcript": voiceTranscript,
            "voice_duration_ms": max(0, voiceDurationMs),
            "type": type,
            "action": action,
        ]
        let normalizedActorEmail = actorEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedActorEmail.isEmpty {
            payload["actor_email"] = normalizedActorEmail
        }
        let normalizedCommentId = commentId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedCommentId.isEmpty {
            payload["comment_id"] = normalizedCommentId
        }
        let normalizedParentCommentId = parentCommentId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedParentCommentId.isEmpty {
            payload["parent_comment_id"] = normalizedParentCommentId
        }
        let normalizedVersionId = versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedVersionId.isEmpty {
            payload["version_id"] = normalizedVersionId
        }
        if let anchorLine, anchorLine > 0 {
            payload["anchor_line"] = anchorLine
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayCommentsResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func upsertScreenplayProjectVersion(
        projectId: String,
        draft: String,
        title: String = "",
        phase: String = "scene_draft",
        notes: String = "",
        source: String = "studio_autosave",
        targetPages: Int? = nil,
        studioWriteAnchors: [BackendScreenplayWriteAnchor] = [],
        screenplayBindings: [BackendScreenplayBindingRecord] = [],
        baseVersionId: String = "",
        conflictStrategy: String = "reject_if_stale",
        includeUserIdentity: Bool = true,
        includeAuthToken: Bool = true,
        clientTokenOverride: String? = nil
    ) async throws -> BackendReadResult<BackendScreenplayVersionMutationResponse> {
        _ = try? await bootstrapSession(force: false)
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "project_id_required")
        }
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "draft_required")
        }

        var request = try makeWriteRequest(path: "/screenplay/projects/\(normalizedProjectId)/version")
        applyProjectOwnerHeaders(
            to: &request,
            includeUserIdentity: includeUserIdentity,
            includeAuthToken: includeAuthToken,
            clientTokenOverride: clientTokenOverride
        )
        var payload: [String: Any] = [
            "draft": draft,
            "phase": phase,
            "source": source,
        ]
        if !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["title"] = title
        }
        if !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["notes"] = notes
        }
        if let targetPages, targetPages > 0 {
            payload["target_pages"] = targetPages
        }
        if !studioWriteAnchors.isEmpty,
           let anchorsPayload = try? JSONSerialization.jsonObject(
            with: JSONEncoder().encode(studioWriteAnchors)
           ) {
            payload["studio_write_anchors"] = anchorsPayload
        }
        if !screenplayBindings.isEmpty,
           let bindingsPayload = try? JSONSerialization.jsonObject(
            with: JSONEncoder().encode(screenplayBindings)
           ) {
            payload["screenplay_bindings"] = bindingsPayload
        }
        let normalizedBaseVersionId = baseVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedBaseVersionId.isEmpty {
            payload["base_version_id"] = normalizedBaseVersionId
        }
        let normalizedConflictStrategy = conflictStrategy.trimmingCharacters(in: .whitespacesAndNewlines)
        if !normalizedConflictStrategy.isEmpty {
            payload["conflict_strategy"] = normalizedConflictStrategy
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        if http.statusCode == 409 {
            let parsed = try decoder.decode(BackendScreenplayVersionMutationResponse.self, from: data)
            let headerSync = syncFromHeaders(http, fallbackStatus: "up")
            let bodySync = syncFromScreenplayEnvelope(
                sessionId: parsed.sessionId,
                stateVersion: parsed.stateVersion,
                lastUpdatedAt: parsed.lastUpdatedAt,
                historyUpdatedAt: parsed.historyUpdatedAt,
                memoryUpdatedAt: parsed.memoryUpdatedAt,
                lastTurnId: parsed.lastTurnId,
                schemaVersion: parsed.schemaVersion,
                backendBuild: parsed.backendBuild,
                backendBootId: parsed.backendBootId
            )
            updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
            return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let parsed = try decoder.decode(BackendScreenplayVersionMutationResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func updateScreenplayCompanionState(
        mode: StudioCompanionMode,
        recentTurns: [ScreenplayConversationTurn],
        analytics: ScreenplayCompanionAnalyticsSnapshot,
        signals: CreativeCompanionSignalState
    ) async throws -> BackendReadResult<BackendScreenplayCompanionStateResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/screenplay/companion/state")
        var payload: [String: Any] = [
            "mode_raw": mode.rawValue,
        ]
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if let recentTurnsPayload = try? JSONSerialization.jsonObject(
            with: encoder.encode(Array(recentTurns.suffix(6)))
        ) {
            payload["recent_turns"] = recentTurnsPayload
        }
        if let analyticsPayload = try? JSONSerialization.jsonObject(
            with: encoder.encode(analytics)
        ) {
            payload["analytics"] = analyticsPayload
        }
        if let signalsPayload = try? JSONSerialization.jsonObject(
            with: encoder.encode(signals)
        ) {
            payload["signals"] = signalsPayload
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .iso8601
        let parsed = try decoder.decode(BackendScreenplayCompanionStateResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromScreenplayEnvelope(
            sessionId: parsed.sessionId,
            stateVersion: parsed.stateVersion,
            lastUpdatedAt: parsed.lastUpdatedAt,
            historyUpdatedAt: parsed.historyUpdatedAt,
            memoryUpdatedAt: parsed.memoryUpdatedAt,
            lastTurnId: parsed.lastTurnId,
            schemaVersion: parsed.schemaVersion,
            backendBuild: parsed.backendBuild,
            backendBootId: parsed.backendBootId
        )
        updateSyncState(mergeSyncStates(base: bodySync, incoming: headerSync), emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func paginateScreenplayDraft(
        draft: String,
        title: String = "",
        phase: String = "scene_draft",
        targetPages: Int? = nil,
        linesPerPage: Int = 55
    ) async throws -> BackendReadResult<BackendScreenplayPaginateResponse> {
        _ = try? await bootstrapSession(force: false)
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "draft_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/paginate")
        var payload: [String: Any] = [
            "draft": draft,
            "phase": phase,
            "lines_per_page": max(24, linesPerPage),
        ]
        if !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["title"] = title
        }
        if let targetPages, targetPages > 0 {
            payload["target_pages"] = targetPages
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayPaginateResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        updateSyncState(headerSync, emitTurnEvent: false)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func fetchScreenplayRevisionColors(
        baseDraft: String,
        draft: String,
        revisionColor: String = "blue"
    ) async throws -> BackendReadResult<BackendScreenplayRevisionResponse> {
        _ = try? await bootstrapSession(force: false)
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "draft_required")
        }
        var request = try makeWriteRequest(path: "/screenplay/revision-colors")
        let payload: [String: Any] = [
            "base_draft": baseDraft,
            "draft": draft,
            "revision_color": revisionColor,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendScreenplayRevisionResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        updateSyncState(headerSync, emitTurnEvent: false)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func exportScreenplayDraft(
        draft: String,
        title: String = "",
        phase: String = "scene_draft",
        format: String = "fountain",
        projectId: String? = nil,
        versionId: String? = nil,
        targetPages: Int? = nil
    ) async throws -> BackendScreenplayExportArtifact {
        _ = try? await bootstrapSession(force: false)
        let normalizedFormat = format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedFormat == "fdx" {
            return try await exportFinalDraftXML(
                draft: draft,
                title: title,
                format: normalizedFormat
            )
        }
        var request = try makeWriteRequest(path: "/screenplay/export")
        var payload: [String: Any] = [
            "draft": draft,
            "phase": phase,
            "format": normalizedFormat.isEmpty ? format : normalizedFormat,
        ]
        if !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["title"] = title
        }
        if let projectId, !projectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["project_id"] = projectId
        }
        if let versionId, !versionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["version_id"] = versionId
        }
        if let targetPages, targetPages > 0 {
            payload["target_pages"] = targetPages
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            throw decodeScreenplayExportError(status: http.statusCode, data: data)
        }
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        updateSyncState(headerSync, emitTurnEvent: false)
        let contentType = headerValue(http, "Content-Type").trimmingCharacters(in: .whitespacesAndNewlines)
        let disposition = headerValue(http, "Content-Disposition")
        let filename = parseDispositionFilename(disposition, fallbackFormat: normalizedFormat.isEmpty ? format : normalizedFormat)
        let resolvedFormat = headerValue(http, "x-screenplay-format").trimmingCharacters(in: .whitespacesAndNewlines)
        return BackendScreenplayExportArtifact(
            format: resolvedFormat.isEmpty ? (normalizedFormat.isEmpty ? format : normalizedFormat) : resolvedFormat,
            filename: filename,
            contentType: contentType.isEmpty ? "application/octet-stream" : contentType,
            data: data
        )
    }

    private func exportFinalDraftXML(
        draft: String,
        title: String,
        format: String
    ) async throws -> BackendScreenplayExportArtifact {
        var request = try makeWriteRequest(path: "/screenplay/export/fdx")
        request.setValue("application/xml", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(
            withJSONObject: screenplayExportDocumentPayload(draft: draft, title: title),
            options: []
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            throw decodeScreenplayExportError(status: http.statusCode, data: data)
        }
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        updateSyncState(headerSync, emitTurnEvent: false)
        let contentType = headerValue(http, "Content-Type").trimmingCharacters(in: .whitespacesAndNewlines)
        let filename = parseDispositionFilename(
            headerValue(http, "Content-Disposition"),
            fallbackFormat: format
        )
        return BackendScreenplayExportArtifact(
            format: "fdx",
            filename: filename,
            contentType: contentType.isEmpty ? "application/xml; charset=utf-8" : contentType,
            data: data
        )
    }

    private func screenplayExportDocumentPayload(draft: String, title: String) -> [String: Any] {
        var payload: [String: Any] = [:]
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanTitle.isEmpty {
            payload["title"] = ["title": cleanTitle]
        }
        payload["scenes"] = screenplayExportScenes(from: draft)
        return payload
    }

    private func screenplayExportScenes(from draft: String) -> [[String: Any]] {
        let rawLines = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
        var scenes: [[String: Any]] = []
        var heading = ""
        var exportLines: [[String: Any]] = []

        func flushScene() {
            guard !heading.isEmpty || !exportLines.isEmpty else { return }
            var scene: [String: Any] = [:]
            if !heading.isEmpty {
                scene["heading"] = heading
            }
            scene["lines"] = exportLines
            scenes.append(scene)
            heading = ""
            exportLines = []
        }

        var index = rawLines.startIndex
        while index < rawLines.endIndex {
            let trimmed = rawLines[index].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                index += 1
                continue
            }

            if isScreenplayExportSceneHeading(trimmed) {
                flushScene()
                heading = trimmed
                index += 1
                continue
            }

            if isScreenplayExportTransition(trimmed) {
                exportLines.append(["kind": "transition", "text": trimmed])
                index += 1
                continue
            }

            if isScreenplayExportCharacterCue(trimmed) {
                var parenthetical = ""
                var dialogue: [String] = []
                var cursor = index + 1
                while cursor < rawLines.endIndex {
                    let next = rawLines[cursor].trimmingCharacters(in: .whitespacesAndNewlines)
                    if next.isEmpty { break }
                    if isScreenplayExportSceneHeading(next)
                        || isScreenplayExportTransition(next)
                        || isScreenplayExportCharacterCue(next) {
                        break
                    }
                    if parenthetical.isEmpty, isScreenplayExportParenthetical(next) {
                        parenthetical = next
                    } else {
                        dialogue.append(next)
                    }
                    cursor += 1
                }
                if !dialogue.isEmpty {
                    var line: [String: Any] = [
                        "kind": "character",
                        "name": trimmed,
                        "dialogue": dialogue,
                    ]
                    if !parenthetical.isEmpty {
                        line["parenthetical"] = parenthetical
                    }
                    exportLines.append(line)
                    index = max(cursor, index + 1)
                    continue
                }
            }

            exportLines.append(["kind": "action", "text": trimmed])
            index += 1
        }

        flushScene()
        return scenes
    }

    private func isScreenplayExportSceneHeading(_ text: String) -> Bool {
        text.range(
            of: #"^(INT|EXT|EST|INT/EXT|I/E)\."#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    private func isScreenplayExportTransition(_ text: String) -> Bool {
        text.range(
            of: #"^(CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|WIPE TO:|INTERCUT WITH:|FADE IN:|FADE IN ON:|FADE OUT:|FADE OUT\.|FADE TO BLACK:|FADE TO BLACK\.|SMASH TO BLACK:|THE END)$"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    private func isScreenplayExportParenthetical(_ text: String) -> Bool {
        text.hasPrefix("(") && text.hasSuffix(")") && text.count <= 80
    }

    private func isScreenplayExportCharacterCue(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 32 else { return false }
        guard trimmed == trimmed.uppercased() else { return false }
        guard trimmed.rangeOfCharacter(from: .letters) != nil else { return false }
        return !trimmed.contains(":") && !trimmed.contains(".")
    }

    func fetchScreenplayExportFormats() async throws -> BackendScreenplayExportFormatsResponse {
        _ = try? await bootstrapSession(force: false)
        let request = try makeRequest(path: "/screenplay/export/formats")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayExportFormatsResponse.self, from: data)
    }

    func importFountainDraft(text: String) async throws -> BackendScreenplayImportResponse {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/screenplay/import/fountain")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["text": text], options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        updateSyncState(headerSync, emitTurnEvent: false)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendScreenplayImportResponse.self, from: data)
    }

    func updateMemoryCard(
        id: String,
        key: String? = nil,
        title: String,
        summary: String,
        reason: String,
        storySpine: BackendStorySpineMemory? = nil
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        var payload: [String: Any] = [
            "card_id": id,
            "title": title,
            "summary": summary,
            "reason": reason,
        ]
        if let storySpine {
            payload["story_spine"] = storySpine.payload
        }
        if let key, !key.isEmpty { payload["key"] = key }
        return try await runMemoryMutation(path: "/memories/update", payload: payload)
    }

    func updateCharacterBibleMemory(
        id: String,
        key: String? = nil,
        characterBible: BackendCharacterBibleMemory
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        var payload: [String: Any] = [
            "card_id": id,
            "character_bible": characterBible.payload
        ]
        if let key, !key.isEmpty { payload["key"] = key }
        return try await runMemoryMutation(path: "/memories/character-bible/update", payload: payload)
    }

    func forgetMemoryCard(
        id: String,
        key: String? = nil
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        var payload: [String: Any] = ["card_id": id]
        if let key, !key.isEmpty { payload["key"] = key }
        return try await runMemoryMutation(path: "/memories/forget", payload: payload)
    }

    func undoCanonCorrection(
        receiptID: String
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        return try await runMemoryMutation(
            path: "/memories/corrections/undo",
            payload: ["receipt_id": receiptID]
        )
    }

    func resolveCanonCorrection(
        ambiguityID: String,
        selectedFacts: [String]
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        var seen = Set<String>()
        let cleanFacts = selectedFacts.compactMap { value -> String? in
            let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { return nil }
            let key = clean.lowercased()
            guard seen.insert(key).inserted else { return nil }
            return String(clean.prefix(220))
        }
        guard !cleanFacts.isEmpty else {
            throw BackendMemoryAPIError.server(
                status: 400,
                message: "Choose at least one accepted canon fact."
            )
        }
        return try await runMemoryMutation(
            path: "/memories/corrections/resolve",
            payload: [
                "ambiguity_id": ambiguityID,
                "selected_facts": cleanFacts,
            ]
        )
    }

    func resolveCanonCorrection(
        ambiguityID: String,
        selectedFact: String
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        try await resolveCanonCorrection(
            ambiguityID: ambiguityID,
            selectedFacts: [selectedFact]
        )
    }

    func promoteMemoryCard(
        id: String,
        key: String? = nil,
        title: String? = nil,
        summary: String? = nil,
        reason: String? = nil
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        var payload: [String: Any] = ["card_id": id]
        if let key, !key.isEmpty { payload["key"] = key }
        if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["title"] = title
        }
        if let summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["summary"] = summary
        }
        if let reason, !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["reason"] = reason
        }
        return try await runMemoryMutation(path: "/memories/promote", payload: payload)
    }

    func markMemoryQuality(
        id: String,
        key: String? = nil,
        signal: String,
        note: String? = nil
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        var payload: [String: Any] = [
            "card_id": id,
            "signal": signal
        ]
        if let key, !key.isEmpty { payload["key"] = key }
        if let note, !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["note"] = note
        }
        return try await runMemoryMutation(path: "/memories/feedback", payload: payload)
    }

    func updateTask(
        action: String,
        taskID: String? = nil,
        title: String? = nil,
        query: String? = nil,
        dueAt: TimeInterval? = nil,
        priority: String? = nil
    ) async throws -> BackendReadResult<BackendTaskUpdateResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/tasks/update")
        var payload: [String: Any] = ["action": action]
        if let taskID, !taskID.isEmpty { payload["task_id"] = taskID }
        if let title, !title.isEmpty { payload["title"] = title }
        if let query, !query.isEmpty { payload["query"] = query }
        if let dueAt, dueAt > 0 { payload["due_at"] = dueAt }
        if let priority, !priority.isEmpty { payload["priority"] = priority }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendTaskUpdateResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromTaskUpdatePayload(parsed)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func composeSecretaryEmail(
        to: String,
        subject: String,
        body: String,
        provider: String = "mailto",
        sendNow: Bool = true
    ) async throws -> BackendReadResult<BackendSecretaryEmailResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/secretary/email")
        let payload: [String: Any] = [
            "to": to,
            "subject": subject,
            "body": body,
            "target": provider,
            "send_now": sendNow,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendSecretaryEmailResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: (200...299).contains(http.statusCode) ? "up" : "degraded")
        updateSyncState(headerSync, emitTurnEvent: false)

        if !(200...299).contains(http.statusCode),
           (parsed.composeUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let message = (parsed.error ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            throw BackendMemoryAPIError.server(
                status: http.statusCode,
                message: message.isEmpty ? decodeErrorMessage(from: data) : message
            )
        }
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    nonisolated static func characterMentionPayload(
        mention: ScreenplayRenderedCharacterMention,
        writeID: String,
        projectID: String = "",
        versionID: String = "",
        source: String = "ios_screenplay_render"
    ) -> [String: Any] {
        let characterName = mention.characterName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedWriteID = writeID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVersionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
        var metadata: [String: Any] = [
            "line": max(0, mention.line),
            "source": normalizedSource.isEmpty ? "ios_screenplay_render" : normalizedSource,
        ]
        if !normalizedWriteID.isEmpty {
            metadata["screenplay_write_id"] = normalizedWriteID
        }
        if !normalizedProjectID.isEmpty {
            metadata["screenplay_project_id"] = normalizedProjectID
        }
        if !normalizedVersionID.isEmpty {
            metadata["screenplay_version_id"] = normalizedVersionID
        }
        return [
            "character_name": characterName,
            "characterName": characterName,
            "voice": "",
            "tags": mention.tags,
            "source": normalizedSource.isEmpty ? "ios_screenplay_render" : normalizedSource,
            "write_id": normalizedWriteID,
            "line": max(0, mention.line),
            "metadata": metadata,
        ]
    }

    func recordCharacterMentionFromScreenplayReply(
        _ mention: ScreenplayRenderedCharacterMention,
        writeID: String,
        projectID: String = "",
        versionID: String = "",
        source: String = "ios_screenplay_render"
    ) async throws -> BackendCharacterMentionReceipt {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/memory/record-character-mention")
        request.httpBody = try JSONSerialization.data(
            withJSONObject: Self.characterMentionPayload(
                mention: mention,
                writeID: writeID,
                projectID: projectID,
                versionID: versionID,
                source: source
            ),
            options: []
        )
        return try await run(request, as: BackendCharacterMentionReceipt.self)
    }

    func recordCharacterMentionsFromScreenplayReply(
        _ mentions: [ScreenplayRenderedCharacterMention],
        writeID: String,
        projectID: String = "",
        versionID: String = "",
        source: String = "ios_screenplay_render"
    ) async throws {
        for mention in mentions {
            _ = try await recordCharacterMentionFromScreenplayReply(
                mention,
                writeID: writeID,
                projectID: projectID,
                versionID: versionID,
                source: source
            )
        }
    }

    func commitRealtimeTurn(
        userMessage: String,
        assistantMessage: String,
        requestId: String? = nil,
        studioMetadata: BackendStudioThreadCommitMetadata? = nil
    ) async throws -> BackendReadResult<BackendRealtimeTurnCommitResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/realtime/turn_commit")
        let normalizedRequestId = requestId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !normalizedRequestId.isEmpty {
            request.setValue(
                String(normalizedRequestId.prefix(128)),
                forHTTPHeaderField: "X-Idempotency-Key"
            )
        }
        var payload: [String: Any] = [
            "transcript": userMessage,
            "reply": assistantMessage,
            "request_id": normalizedRequestId
        ]
        if let studioMetadata, studioMetadata.isMeaningful {
            payload["studio"] = Self.studioTurnPayload(studioMetadata)
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendRealtimeTurnCommitResponse.self, from: data)
        if let resolution = parsed.screenplayQuestionResolution {
            cachedSession = nil
            cachedSessionAt = nil
            postBackendNotificationOnMain(
                name: .themScreenplayQuestionResolved,
                userInfo: [
                    "questionId": resolution.questionId,
                    "responseStatus": resolution.responseStatus,
                    "targetField": resolution.targetField ?? "",
                    "learningPromoted": resolution.learningPromoted ?? false,
                    "correctionProtected": resolution.correctionProtected ?? false,
                ]
            )
        }
        let headerSync = syncFromHeaders(http, fallbackStatus: parsed.ok ? "up" : "degraded")
        let bodySync = syncFromRealtimeTurnCommitPayload(parsed)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: false)
        let emittedTurnId = (parsed.turnId ?? parsed.lastTurnId ?? incoming.lastTurnId)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !emittedTurnId.isEmpty {
            postTurnCommitted(
                source: "authoritative",
                turnId: emittedTurnId,
                requestId: (parsed.requestId ?? requestId)?.trimmingCharacters(in: .whitespacesAndNewlines),
                sessionId: syncState.sessionId,
                stateVersion: syncState.stateVersion,
                lastUpdatedAt: syncState.lastUpdatedAt,
                historyUpdatedAt: syncState.historyUpdatedAt,
                memoryUpdatedAt: syncState.memoryUpdatedAt,
                userMessage: userMessage,
                assistantMessage: assistantMessage,
                studioMetadata: studioMetadata
            )
        }
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func annotateTurnHistory(
        turnId: String,
        studioMetadata: BackendStudioThreadCommitMetadata
    ) async throws -> BackendReadResult<BackendRealtimeTurnCommitResponse> {
        let normalizedTurnId = turnId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTurnId.isEmpty else {
            throw BackendMemoryAPIError.server(status: 400, message: "turn_id_required")
        }
        guard studioMetadata.isMeaningful else {
            throw BackendMemoryAPIError.server(status: 400, message: "studio_metadata_required")
        }
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: "/history/annotate_turn")
        let payload: [String: Any] = [
            "turn_id": normalizedTurnId,
            "studio": Self.studioTurnPayload(studioMetadata)
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendRealtimeTurnCommitResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: parsed.ok ? "up" : "degraded")
        let bodySync = syncFromRealtimeTurnCommitPayload(parsed)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    func fetchSecretaryEmailConnectURL(
        provider: String = "gmail"
    ) async throws -> BackendReadResult<BackendSecretaryEmailConnectResponse> {
        _ = try? await bootstrapSession(force: false)
        let request = try makeRequest(
            path: "/secretary/email/connect-url",
            extraQueryItems: [URLQueryItem(name: "provider", value: provider)]
        )
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed = try decoder.decode(BackendSecretaryEmailConnectResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: (200...299).contains(http.statusCode) ? "up" : "degraded")
        updateSyncState(headerSync, emitTurnEvent: false)

        if !(200...299).contains(http.statusCode),
           (parsed.connectUrl ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let message = (parsed.error ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            throw BackendMemoryAPIError.server(
                status: http.statusCode,
                message: message.isEmpty ? decodeErrorMessage(from: data) : message
            )
        }
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    private func runMemoryMutation(
        path: String,
        payload: [String: Any]
    ) async throws -> BackendReadResult<BackendMemoryMutationResponse> {
        if baseURLOverride == nil, healthyBaseURL == nil {
            _ = try? await fetchHealth()
        }
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: path)
        request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        guard BackendAPIResponseValidator.hasMatchingOrigin(
            requestURL: request.url,
            responseURL: http.url
        ), BackendAPIResponseValidator.isJSONResponse(http, data: data) else {
            throw BackendMemoryAPIError.server(
                status: 502,
                message: "Backend service unavailable. Please try again."
            )
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let parsed: BackendMemoryMutationResponse
        do {
            parsed = try decoder.decode(BackendMemoryMutationResponse.self, from: data)
        } catch {
            throw BackendMemoryAPIError.server(
                status: 502,
                message: "Backend returned an incompatible API response. Please try again."
            )
        }
        let headerSync = syncFromHeaders(http, fallbackStatus: parsed.ok ? "up" : "degraded")
        let bodySync = syncFromMemoryMutationPayload(parsed)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: true)
        historyCacheByLimit.removeAll()
        memoriesCacheByLimit.removeAll()
        return BackendReadResult(payload: parsed, sync: syncState, notModified: false)
    }

    private func runDataControl(path: String) async throws -> BackendReadResult<BackendDataControlResponse> {
        _ = try? await bootstrapSession(force: false)
        var request = try makeWriteRequest(path: path)
        request.httpBody = Data("{}".utf8)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let payload = try decoder.decode(BackendDataControlResponse.self, from: data)
        let headerSync = syncFromHeaders(http, fallbackStatus: "up")
        let bodySync = syncFromDataControlPayload(payload)
        let incoming = mergeSyncStates(base: bodySync, incoming: headerSync)
        updateSyncState(incoming, emitTurnEvent: false)
        historyCacheByLimit.removeAll()
        memoriesCacheByLimit.removeAll()
        return BackendReadResult(payload: payload, sync: syncState, notModified: false)
    }

    func publishOptimisticTurn(
        userMessage: String,
        assistantMessage: String = "",
        turnId: String? = nil,
        lastUpdatedAt: TimeInterval = Date().timeIntervalSince1970 * 1000
    ) {
        let normalizedUser = userMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedAssistant = assistantMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextTurn = turnId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackTurn = syncState.lastTurnId.isEmpty ? "optimistic-\(Int(lastUpdatedAt))" : syncState.lastTurnId
        postTurnCommitted(
            source: "optimistic",
            turnId: (nextTurn?.isEmpty == false ? nextTurn! : fallbackTurn),
            sessionId: syncState.sessionId,
            stateVersion: syncState.stateVersion,
            lastUpdatedAt: lastUpdatedAt,
            historyUpdatedAt: syncState.historyUpdatedAt,
            memoryUpdatedAt: syncState.memoryUpdatedAt,
            userMessage: normalizedUser.isEmpty ? nil : normalizedUser,
            assistantMessage: normalizedAssistant.isEmpty ? nil : normalizedAssistant
        )
    }

    func recordTurnCommitted(
        turnId: String,
        requestId: String? = nil,
        sessionId: String? = nil,
        stateVersion: String? = nil,
        lastUpdatedAt: TimeInterval? = nil,
        historyUpdatedAt: TimeInterval? = nil,
        memoryUpdatedAt: TimeInterval? = nil,
        userMessage: String? = nil,
        assistantMessage: String? = nil
    ) {
        var incoming = BackendSyncState.empty
        incoming.status = "up"
        incoming.lastTurnId = turnId
        incoming.sessionId = sessionId ?? syncState.sessionId
        incoming.stateVersion = stateVersion ?? syncState.stateVersion
        incoming.lastUpdatedAt = lastUpdatedAt ?? max(syncState.lastUpdatedAt, Date().timeIntervalSince1970 * 1000)
        incoming.historyUpdatedAt = historyUpdatedAt ?? syncState.historyUpdatedAt
        incoming.memoryUpdatedAt = memoryUpdatedAt ?? syncState.memoryUpdatedAt
        updateSyncState(incoming, emitTurnEvent: false)
        postTurnCommitted(
            source: "authoritative",
            turnId: turnId,
            requestId: requestId,
            sessionId: syncState.sessionId,
            stateVersion: syncState.stateVersion,
            lastUpdatedAt: incoming.lastUpdatedAt,
            historyUpdatedAt: syncState.historyUpdatedAt,
            memoryUpdatedAt: syncState.memoryUpdatedAt,
            userMessage: userMessage,
            assistantMessage: assistantMessage
        )
    }

    func recordTurnCommitted(from response: HTTPURLResponse, userMessage: String? = nil, assistantMessage: String? = nil) {
        let turnId = headerValue(response, "x-turn-id").trimmingCharacters(in: .whitespacesAndNewlines)
        if turnId.isEmpty { return }
        let requestId = headerValue(response, "x-request-id").trimmingCharacters(in: .whitespacesAndNewlines)
        let sessionId = headerValue(response, "x-session-id")
        let stateVersion = headerValue(response, "x-state-version")
        let lastUpdated = Double(headerValue(response, "x-last-updated-at")) ?? (Date().timeIntervalSince1970 * 1000)
        let historyUpdated = Double(headerValue(response, "x-history-updated-at")) ?? 0
        let memoryUpdated = Double(headerValue(response, "x-memory-updated-at")) ?? 0
        onTurnCommittedBarrier(
            turnId: turnId,
            requestId: requestId.isEmpty ? nil : requestId,
            sessionId: sessionId.isEmpty ? nil : sessionId,
            stateVersion: stateVersion.isEmpty ? nil : stateVersion,
            lastUpdatedAt: lastUpdated,
            historyUpdatedAt: historyUpdated > 0 ? historyUpdated : nil,
            memoryUpdatedAt: memoryUpdated > 0 ? memoryUpdated : nil,
            userMessage: userMessage,
            assistantMessage: assistantMessage
        )
    }

    /// Syncs client-side emotional state from HerEvolutionStore to the backend after each turn.
    /// This reconciles the two memory systems so the server's persona has the same emotional
    /// context as the local relationship tracker (depth, romance tension, trust, etc.).
    /// Fire-and-forget — errors are logged but never surface to the user.
    func syncEvolutionState(
        stage: Int,
        depthScore: Double,
        romanceTension: Double,
        sessionCount: Int,
        reassuranceNeed: Double,
        boundaryNeed: Double,
        playfulMomentum: Double,
        trustSignal: Double,
        lastThemeCue: String,
        preferredName: String,
        isScreenwriter: Bool,
        latestUserMessage: String? = nil
    ) {
        Task {
            do {
                guard BackendEvolutionSyncPolicy.shouldAutoSync(
                    sessionId: syncState.sessionId,
                    cachedSessionAvailable: cachedSession != nil
                ) else {
                    return
                }
                let url = baseURL().appendingPathComponent("session").appendingPathComponent("evolution")
                var request = URLRequest(url: url)
                request.httpMethod = "PATCH"
                request.timeoutInterval = 8
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("application/json", forHTTPHeaderField: "Accept")
                if let token = appToken(), !token.isEmpty {
                    request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
                }
                if let userId = userID(), !userId.isEmpty {
                    request.setValue(userId, forHTTPHeaderField: "X-User-Id")
                }
                if let ct = clientToken(), !ct.isEmpty {
                    request.setValue(ct, forHTTPHeaderField: "X-Client-Token")
                }
                request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")

                var payload: [String: Any] = [
                    "stage": stage,
                    "depth_score": round(depthScore * 100) / 100,
                    "romance_tension": round(romanceTension * 100) / 100,
                    "session_count": sessionCount,
                    "reassurance_need": round(reassuranceNeed * 1000) / 1000,
                    "boundary_need": round(boundaryNeed * 1000) / 1000,
                    "playful_momentum": round(playfulMomentum * 1000) / 1000,
                    "trust_signal": round(trustSignal * 1000) / 1000,
                ]
                let trimmedCue = lastThemeCue.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmedCue.isEmpty { payload["last_theme_cue"] = trimmedCue }
                let trimmedName = preferredName.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmedName.isEmpty { payload["preferred_name"] = String(trimmedName.prefix(64)) }
                payload["is_screenwriter"] = isScreenwriter
                let latestMessage = (latestUserMessage ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !latestMessage.isEmpty {
                    payload["latest_user_message"] = String(latestMessage.prefix(220))
                }

                let loweredMessage = latestMessage.lowercased()
                let loveTopicActive = loweredMessage.contains("love") ||
                    loweredMessage.contains("relationship") ||
                    loweredMessage.contains("romance") ||
                    loweredMessage.contains("dating") ||
                    loweredMessage.contains("miss you") ||
                    loweredMessage.contains("heart")
                if loveTopicActive {
                    payload["love_topic_active"] = true
                }
                let reassuranceStyleHint: String = {
                    if loweredMessage.contains("be direct") ||
                        loweredMessage.contains("straight up") ||
                        loweredMessage.contains("no sugarcoat") {
                        return "direct"
                    }
                    if loweredMessage.contains("hype me") ||
                        loweredMessage.contains("pep talk") {
                        return "hype"
                    }
                    if loweredMessage.contains("gentle") ||
                        loweredMessage.contains("comfort me") ||
                        loweredMessage.contains("hold space") {
                        return "motherly"
                    }
                    return reassuranceNeed > 0.62 ? "soft" : "direct"
                }()
                payload["reassurance_style_hint"] = reassuranceStyleHint

                let affectionStyleHint: String = {
                    if loveTopicActive {
                        if playfulMomentum > 0.62 { return "playful" }
                        if trustSignal > 0.68 && romanceTension > 2.2 { return "tender" }
                        if romanceTension > 4.2 { return "intimate" }
                    }
                    return "casual"
                }()
                payload["affection_style_hint"] = affectionStyleHint
                payload["romance_depth_hint"] = round(min(max(romanceTension / 10.0, 0), 1) * 1000) / 1000
                payload["support_intent_hint"] = reassuranceNeed > 0.58 ? "comfort_first" : "clarity_then_comfort"

                request.httpBody = try JSONSerialization.data(withJSONObject: payload)
                let (_, response) = try await URLSession.shared.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? -1
                // 404 = backend doesn't support this endpoint yet — silently skip.
                if status != 200 && status != 204 && status != 404 {
                    print("[BackendMemoryAPI] syncEvolutionState status=\(status)")
                }
            } catch {
                print("[BackendMemoryAPI] syncEvolutionState error=\(error.localizedDescription)")
            }
        }
    }

    func onTurnCommittedBarrier(
        turnId: String,
        requestId: String? = nil,
        sessionId: String? = nil,
        stateVersion: String? = nil,
        lastUpdatedAt: TimeInterval? = nil,
        historyUpdatedAt: TimeInterval? = nil,
        memoryUpdatedAt: TimeInterval? = nil,
        userMessage: String? = nil,
        assistantMessage: String? = nil
    ) {
        let normalizedTurn = turnId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTurn.isEmpty else { return }
        let normalizedSession = (sessionId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !shouldAcceptIncomingSession(current: syncState.sessionId, incoming: normalizedSession) {
            print("[BackendMemoryAPI] turn commit dropped due to session drift incoming=\(normalizedSession) current=\(syncState.sessionId)")
            return
        }
        let normalizedState = stateVersion?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if normalizedTurn == syncState.lastTurnId &&
            (normalizedState.isEmpty || normalizedState == syncState.stateVersion) {
            return
        }
        let incomingLast = max(
            lastUpdatedAt ?? 0,
            historyUpdatedAt ?? 0,
            memoryUpdatedAt ?? 0
        )
        let knownLast = max(syncState.lastUpdatedAt, syncState.historyUpdatedAt, syncState.memoryUpdatedAt)
        if incomingLast > 0,
           knownLast > 0,
           incomingLast <= knownLast,
           (!normalizedState.isEmpty && normalizedState == syncState.stateVersion) {
            return
        }
        let versionKey = normalizedState.isEmpty ? normalizedTurn : normalizedState
        if !versionKey.isEmpty {
            if versionKey == latestSeenStateVersion { return }
            if inFlightStateVersions.contains(versionKey) { return }
            inFlightStateVersions.insert(versionKey)
        }
        defer {
            if !versionKey.isEmpty {
                inFlightStateVersions.remove(versionKey)
            }
        }
        recordTurnCommitted(
            turnId: normalizedTurn,
            requestId: requestId,
            sessionId: normalizedSession.isEmpty ? nil : normalizedSession,
            stateVersion: normalizedState.isEmpty ? nil : normalizedState,
            lastUpdatedAt: lastUpdatedAt,
            historyUpdatedAt: historyUpdatedAt,
            memoryUpdatedAt: memoryUpdatedAt,
            userMessage: userMessage,
            assistantMessage: assistantMessage
        )
        if !versionKey.isEmpty {
            latestSeenStateVersion = versionKey
        }
    }

    private func shouldAcceptIncomingSession(current: String, incoming: String) -> Bool {
        let currentNormalized = current.trimmingCharacters(in: .whitespacesAndNewlines)
        let incomingNormalized = incoming.trimmingCharacters(in: .whitespacesAndNewlines)
        if incomingNormalized.isEmpty || currentNormalized.isEmpty { return true }
        if incomingNormalized == currentNormalized { return true }
        let currentIsIpScoped = currentNormalized.hasPrefix("ip:")
        let incomingIsIpScoped = incomingNormalized.hasPrefix("ip:")
        // Allow secure session promotion (ip -> token/user), but reject drift and token->ip downgrade.
        if currentIsIpScoped, !incomingIsIpScoped { return true }
        return false
    }

    private func makeRequest(
        path: String,
        limit: Int,
        extraQueryItems: [URLQueryItem] = []
    ) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL(), resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        components.path = path
        components.queryItems = [
            URLQueryItem(name: "limit", value: String(max(1, limit)))
        ] + extraQueryItems
        guard let url = components.url else {
            throw BackendMemoryAPIError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        applyStandardHeaders(to: &request)
        return request
    }

    private func makeRequest(path: String) throws -> URLRequest {
        try makeRequest(path: path, baseURL: baseURL())
    }

    private func makeRequest(path: String, baseURL: URL) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        components.path = path
        guard let url = components.url else {
            throw BackendMemoryAPIError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        applyStandardHeaders(to: &request)
        return request
    }

    private func makeRequest(
        path: String,
        extraQueryItems: [URLQueryItem]
    ) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL(), resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        components.path = path
        if !extraQueryItems.isEmpty {
            components.queryItems = extraQueryItems
        }
        guard let url = components.url else {
            throw BackendMemoryAPIError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        applyStandardHeaders(to: &request)
        return request
    }

    private func makeWriteRequest(path: String) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL(), resolvingAgainstBaseURL: false) else {
            throw BackendMemoryAPIError.invalidBaseURL
        }
        components.path = path
        guard let url = components.url else {
            throw BackendMemoryAPIError.invalidBaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        applyStandardHeaders(to: &request, includeContentType: true)
        return request
    }

    private func applyStandardHeaders(
        to request: inout URLRequest,
        includeContentType: Bool = false,
        includeUserIdentity: Bool = true,
        includeClientToken: Bool = true,
        includeAuthToken: Bool = true
    ) {
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if includeContentType {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let token = appToken(), !token.isEmpty {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        if includeUserIdentity, let userId = userID(), !userId.isEmpty {
            request.setValue(userId, forHTTPHeaderField: "X-User-Id")
        }
        if includeClientToken, let clientToken = clientToken(), !clientToken.isEmpty {
            request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        }
        if includeAuthToken, let token = BackendAuthClient.accessToken(), !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.setValue(clientNameHeaderValue, forHTTPHeaderField: "X-Them-Client-Name")
        request.setValue(clientPlatformHeaderValue, forHTTPHeaderField: "X-Them-Client-Platform")
        if !clientVersionHeaderValue.isEmpty {
            request.setValue(clientVersionHeaderValue, forHTTPHeaderField: "X-Them-Client-Version")
        }
        if !clientBuildHeaderValue.isEmpty {
            request.setValue(clientBuildHeaderValue, forHTTPHeaderField: "X-Them-Client-Build")
        }
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
    }

    private func applyProjectOwnerHeaders(
        to request: inout URLRequest,
        includeUserIdentity: Bool,
        includeAuthToken: Bool,
        clientTokenOverride: String?
    ) {
        if !includeUserIdentity {
            request.setValue(nil, forHTTPHeaderField: "X-User-Id")
        }
        if !includeAuthToken {
            request.setValue(nil, forHTTPHeaderField: "Authorization")
        }
        let cleanClientToken = (clientTokenOverride ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanClientToken.isEmpty {
            request.setValue(cleanClientToken, forHTTPHeaderField: "X-Client-Token")
        }
    }

    private func run<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendMemoryAPIError.invalidResponse
        }
        validatePersonaContract(response: http, path: request.url?.path ?? "unknown")
        guard (200...299).contains(http.statusCode) else {
            let message = decodeErrorMessage(from: data)
            throw BackendMemoryAPIError.server(status: http.statusCode, message: message)
        }

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(T.self, from: data)
    }

    private func syncFromSession(_ payload: BackendSessionResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? payload.clientToken,
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromHealthPayload(_ payload: HealthPayload?, ok: Bool) -> BackendSyncState {
        BackendSyncState(
            status: payload?.status ?? (ok ? "up" : "down"),
            sessionId: payload?.sessionId ?? "",
            schemaVersion: payload?.schemaVersion ?? 0,
            backendBuild: payload?.backendBuild ?? "",
            backendBootId: payload?.backendBootId ?? "",
            lastTurnId: payload?.lastTurnId ?? "",
            lastUpdatedAt: payload?.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload?.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload?.memoryUpdatedAt ?? 0,
            stateVersion: payload?.stateVersion ?? ""
        )
    }

    private func syncFromHistoryPayload(_ payload: BackendHistoryResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? payload.lastConversationAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? payload.lastUpdatedAt ?? payload.lastConversationAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromMemoriesPayload(_ payload: BackendMemoriesResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromStatePayload(_ payload: BackendStateDeltaResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromTasksPayload(_ payload: BackendTasksResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromDailyRecapPayload(_ payload: BackendDailyRecapResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? payload.generatedAt,
            historyUpdatedAt: payload.historyUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromMemoryExportPayload(_ payload: BackendMemoryExportResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? payload.exportedAt,
            historyUpdatedAt: payload.historyUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromActionReceiptsPayload(_ payload: BackendActionReceiptsResponse) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromTaskUpdatePayload(_ payload: BackendTaskUpdateResponse) -> BackendSyncState {
        BackendSyncState(
            status: payload.ok ? "up" : "degraded",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromMemoryMutationPayload(_ payload: BackendMemoryMutationResponse) -> BackendSyncState {
        BackendSyncState(
            status: payload.ok ? "up" : "degraded",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromDataControlPayload(_ payload: BackendDataControlResponse) -> BackendSyncState {
        BackendSyncState(
            status: payload.ok ? "up" : "degraded",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromRealtimeTurnCommitPayload(_ payload: BackendRealtimeTurnCommitResponse) -> BackendSyncState {
        BackendSyncState(
            status: payload.ok ? "up" : "degraded",
            sessionId: payload.sessionId ?? "",
            schemaVersion: payload.schemaVersion ?? 0,
            backendBuild: payload.backendBuild ?? "",
            backendBootId: payload.backendBootId ?? "",
            lastTurnId: payload.lastTurnId ?? payload.turnId ?? "",
            lastUpdatedAt: payload.lastUpdatedAt ?? 0,
            historyUpdatedAt: payload.historyUpdatedAt ?? 0,
            memoryUpdatedAt: payload.memoryUpdatedAt ?? payload.lastUpdatedAt ?? 0,
            stateVersion: payload.stateVersion ?? ""
        )
    }

    private func syncFromScreenplayEnvelope(
        sessionId: String?,
        stateVersion: String?,
        lastUpdatedAt: TimeInterval?,
        historyUpdatedAt: TimeInterval?,
        memoryUpdatedAt: TimeInterval?,
        lastTurnId: String?,
        schemaVersion: Int?,
        backendBuild: String?,
        backendBootId: String?
    ) -> BackendSyncState {
        BackendSyncState(
            status: "up",
            sessionId: sessionId ?? "",
            schemaVersion: schemaVersion ?? 0,
            backendBuild: backendBuild ?? "",
            backendBootId: backendBootId ?? "",
            lastTurnId: lastTurnId ?? "",
            lastUpdatedAt: lastUpdatedAt ?? 0,
            historyUpdatedAt: historyUpdatedAt ?? 0,
            memoryUpdatedAt: memoryUpdatedAt ?? lastUpdatedAt ?? 0,
            stateVersion: stateVersion ?? ""
        )
    }

    private func screenplayActPayload(_ act: BackendScreenplayAct) -> [String: Any] {
        var payload: [String: Any] = [
            "id": act.id,
            "title": act.title,
        ]
        if let summary = act.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["summary"] = summary
        }
        if let order = act.order { payload["order"] = order }
        if let sceneIds = act.sceneIds, !sceneIds.isEmpty { payload["sceneIds"] = sceneIds }
        return payload
    }

    private func screenplayScenePayload(_ scene: BackendScreenplayScene) -> [String: Any] {
        var payload: [String: Any] = [
            "id": scene.id,
            "title": scene.title,
        ]
        if let slugline = scene.slugline, !slugline.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["slugline"] = slugline
        }
        if let objective = scene.objective, !objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["objective"] = objective
        }
        if let summary = scene.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["summary"] = summary
        }
        if let actId = scene.actId, !actId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["actId"] = actId
        }
        if let order = scene.order { payload["order"] = order }
        if let status = scene.status, !status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["status"] = status
        }
        if let beatIds = scene.beatIds, !beatIds.isEmpty { payload["beatIds"] = beatIds }
        return payload
    }

    private func screenplayBeatPayload(_ beat: BackendScreenplayBeat) -> [String: Any] {
        var payload: [String: Any] = [
            "id": beat.id,
            "label": beat.label,
        ]
        if let summary = beat.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["summary"] = summary
        }
        if let sceneId = beat.sceneId, !sceneId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["sceneId"] = sceneId
        }
        if let actId = beat.actId, !actId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["actId"] = actId
        }
        if let order = beat.order { payload["order"] = order }
        if let status = beat.status, !status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["status"] = status
        }
        return payload
    }

    private func screenplaySceneDraftPayload(_ scene: BackendScreenplaySceneDraft) -> [String: Any] {
        var payload: [String: Any] = [:]
        let title = scene.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty { payload["title"] = title }
        let slugline = scene.slugline.trimmingCharacters(in: .whitespacesAndNewlines)
        if !slugline.isEmpty { payload["slugline"] = slugline }
        let objective = scene.objective.trimmingCharacters(in: .whitespacesAndNewlines)
        if !objective.isEmpty { payload["objective"] = objective }
        let summary = scene.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !summary.isEmpty { payload["summary"] = summary }
        if let id = scene.id?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty {
            payload["id"] = id
        }
        if let actId = scene.actId?.trimmingCharacters(in: .whitespacesAndNewlines), !actId.isEmpty {
            payload["actId"] = actId
        }
        if let order = scene.order { payload["order"] = order }
        if let status = scene.status?.trimmingCharacters(in: .whitespacesAndNewlines), !status.isEmpty {
            payload["status"] = status
        }
        if !scene.beatIds.isEmpty {
            payload["beatIds"] = scene.beatIds
        }
        return payload
    }

    private func screenplayBeatDraftPayload(_ beat: BackendScreenplayBeatDraft) -> [String: Any] {
        var payload: [String: Any] = [:]
        let label = beat.label.trimmingCharacters(in: .whitespacesAndNewlines)
        if !label.isEmpty { payload["label"] = label }
        let summary = beat.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !summary.isEmpty { payload["summary"] = summary }
        if let id = beat.id?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty {
            payload["id"] = id
        }
        if let sceneId = beat.sceneId?.trimmingCharacters(in: .whitespacesAndNewlines), !sceneId.isEmpty {
            payload["sceneId"] = sceneId
        }
        if let actId = beat.actId?.trimmingCharacters(in: .whitespacesAndNewlines), !actId.isEmpty {
            payload["actId"] = actId
        }
        if let order = beat.order { payload["order"] = order }
        if let status = beat.status?.trimmingCharacters(in: .whitespacesAndNewlines), !status.isEmpty {
            payload["status"] = status
        }
        return payload
    }

    private func syncFromHeaders(_ http: HTTPURLResponse, fallbackStatus: String) -> BackendSyncState {
        BackendSyncState(
            status: headerValue(http, "x-backend-status").isEmpty ? fallbackStatus : headerValue(http, "x-backend-status"),
            sessionId: headerValue(http, "x-session-id"),
            schemaVersion: Int(headerValue(http, "x-schema-version")) ?? 0,
            backendBuild: headerValue(http, "x-backend-build"),
            backendBootId: headerValue(http, "x-backend-boot-id"),
            lastTurnId: headerValue(http, "x-last-turn-id"),
            lastUpdatedAt: Double(headerValue(http, "x-last-updated-at")) ?? 0,
            historyUpdatedAt: Double(headerValue(http, "x-history-updated-at")) ?? 0,
            memoryUpdatedAt: Double(headerValue(http, "x-memory-updated-at")) ?? 0,
            stateVersion: headerValue(http, "x-state-version")
        )
    }

    private func mergeSyncStates(base: BackendSyncState, incoming: BackendSyncState) -> BackendSyncState {
        var merged = base
        if !incoming.status.isEmpty, incoming.status != "unknown" { merged.status = incoming.status }
        let canAdoptIncomingSession = shouldAcceptIncomingSession(current: base.sessionId, incoming: incoming.sessionId)
        if canAdoptIncomingSession, !incoming.sessionId.isEmpty {
            merged.sessionId = incoming.sessionId
        }
        if incoming.schemaVersion > 0 { merged.schemaVersion = incoming.schemaVersion }
        if !incoming.backendBuild.isEmpty { merged.backendBuild = incoming.backendBuild }
        if !incoming.backendBootId.isEmpty { merged.backendBootId = incoming.backendBootId }
        if canAdoptIncomingSession {
            if !incoming.lastTurnId.isEmpty { merged.lastTurnId = incoming.lastTurnId }
            if incoming.lastUpdatedAt > 0 { merged.lastUpdatedAt = incoming.lastUpdatedAt }
            if incoming.historyUpdatedAt > 0 { merged.historyUpdatedAt = incoming.historyUpdatedAt }
            if incoming.memoryUpdatedAt > 0 { merged.memoryUpdatedAt = incoming.memoryUpdatedAt }
            if !incoming.stateVersion.isEmpty { merged.stateVersion = incoming.stateVersion }
        }
        return merged
    }

    private func updateSyncState(_ incoming: BackendSyncState, emitTurnEvent: Bool) {
        let previous = syncState
        let merged = mergeSyncStates(base: previous, incoming: incoming)
        let syncChanged = merged != previous
        syncState = merged
        if !merged.stateVersion.isEmpty {
            latestSeenStateVersion = merged.stateVersion
        }
        if syncChanged {
            postBackendNotificationOnMain(
                name: .themBackendSyncUpdated,
                userInfo: [
                    NotificationKey.status: merged.status,
                    NotificationKey.sessionId: merged.sessionId,
                    NotificationKey.schemaVersion: merged.schemaVersion,
                    NotificationKey.backendBuild: merged.backendBuild,
                    NotificationKey.backendBootId: merged.backendBootId,
                    NotificationKey.lastTurnId: merged.lastTurnId,
                    NotificationKey.lastUpdatedAt: merged.lastUpdatedAt,
                    NotificationKey.historyUpdatedAt: merged.historyUpdatedAt,
                    NotificationKey.memoryUpdatedAt: merged.memoryUpdatedAt,
                    NotificationKey.stateVersion: merged.stateVersion,
                ]
            )
        }
        if emitTurnEvent,
           !merged.lastTurnId.isEmpty,
           merged.lastTurnId != previous.lastTurnId {
            postTurnCommitted(
                source: "authoritative",
                turnId: merged.lastTurnId,
                sessionId: merged.sessionId,
                stateVersion: merged.stateVersion,
                lastUpdatedAt: merged.lastUpdatedAt,
                historyUpdatedAt: merged.historyUpdatedAt,
                memoryUpdatedAt: merged.memoryUpdatedAt,
                userMessage: nil,
                assistantMessage: nil
            )
        }
    }

    private func invalidateReadCaches(clearSyncState: Bool) {
        cachedSession = nil
        cachedSessionAt = nil
        sessionBootstrapTask?.task.cancel()
        sessionBootstrapTask = nil
        historyCacheByLimit.removeAll()
        memoriesCacheByLimit.removeAll()
        inFlightStateVersions.removeAll()
        if clearSyncState {
            syncState = .empty
            latestSeenStateVersion = ""
        }
    }

    private func shouldForceSessionRefresh(previous: BackendSyncState, current: BackendSyncState) -> Bool {
        let previousBoot = previous.backendBootId.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentBoot = current.backendBootId.trimmingCharacters(in: .whitespacesAndNewlines)
        if !previousBoot.isEmpty, !currentBoot.isEmpty, previousBoot != currentBoot {
            return true
        }
        let previousSession = previous.sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentSession = current.sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
        if previousSession.isEmpty || currentSession.isEmpty { return false }
        let previousWasToken = !previousSession.hasPrefix("ip:")
        let currentIsIpScoped = currentSession.hasPrefix("ip:")
        if previousWasToken && currentIsIpScoped {
            return true
        }
        return false
    }

    private func canForceSessionRefreshNow() -> Bool {
        guard let last = lastForcedSessionRefreshAt else { return true }
        return Date().timeIntervalSince(last) >= forcedSessionRefreshCooldown
    }

    private func postTurnCommitted(
        source: String,
        turnId: String,
        requestId: String? = nil,
        sessionId: String,
        stateVersion: String,
        lastUpdatedAt: TimeInterval,
        historyUpdatedAt: TimeInterval,
        memoryUpdatedAt: TimeInterval,
        userMessage: String?,
        assistantMessage: String?,
        studioMetadata: BackendStudioThreadCommitMetadata? = nil
    ) {
        var userInfo: [AnyHashable: Any] = [
            NotificationKey.source: source,
            NotificationKey.turnId: turnId,
            NotificationKey.sessionId: sessionId,
            NotificationKey.stateVersion: stateVersion,
            NotificationKey.lastUpdatedAt: lastUpdatedAt,
            NotificationKey.historyUpdatedAt: historyUpdatedAt,
            NotificationKey.memoryUpdatedAt: memoryUpdatedAt,
        ]
        if let requestId, !requestId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            userInfo[NotificationKey.requestId] = requestId.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if let userMessage, !userMessage.isEmpty {
            userInfo[NotificationKey.userMessage] = userMessage
        }
        if let assistantMessage, !assistantMessage.isEmpty {
            userInfo[NotificationKey.assistantMessage] = assistantMessage
        }
        if let studioMetadata {
            let target = studioMetadata.screenplayTarget.trimmingCharacters(in: .whitespacesAndNewlines)
            if !target.isEmpty {
                userInfo[NotificationKey.screenplayTarget] = target
            }
            let promptSource = studioMetadata.screenplayPromptSource.trimmingCharacters(in: .whitespacesAndNewlines)
            if !promptSource.isEmpty {
                userInfo[NotificationKey.screenplayPromptSource] = promptSource
            }
            let writeId = studioMetadata.screenplayWriteId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !writeId.isEmpty {
                userInfo[NotificationKey.screenplayWriteId] = writeId
            }
            if let anchorLine = studioMetadata.screenplayAnchorLine {
                userInfo[NotificationKey.screenplayAnchorLine] = anchorLine
            }
            if let anchorEndLine = studioMetadata.screenplayAnchorEndLine {
                userInfo[NotificationKey.screenplayAnchorEndLine] = anchorEndLine
            }
            let anchorSceneLabel = studioMetadata.screenplayAnchorSceneLabel.trimmingCharacters(in: .whitespacesAndNewlines)
            if !anchorSceneLabel.isEmpty {
                userInfo[NotificationKey.screenplayAnchorSceneLabel] = anchorSceneLabel
            }
            let noteTitle = studioMetadata.screenplayNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            if !noteTitle.isEmpty {
                userInfo[NotificationKey.screenplayNoteTitle] = noteTitle
            }
            let noteBody = studioMetadata.screenplayNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
            if !noteBody.isEmpty {
                userInfo[NotificationKey.screenplayNoteBody] = noteBody
            }
            let insertedText = studioMetadata.screenplayInsertedText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !insertedText.isEmpty {
                userInfo[NotificationKey.screenplayInsertedText] = insertedText
            }
            userInfo[NotificationKey.screenplayReplacementApplied] = studioMetadata.screenplayReplacementApplied
            let replacedWriteId = studioMetadata.screenplayReplacedWriteId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !replacedWriteId.isEmpty {
                userInfo[NotificationKey.screenplayReplacedWriteId] = replacedWriteId
            }
            let revisedBlockText = studioMetadata.screenplayRevisedBlockText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !revisedBlockText.isEmpty {
                userInfo[NotificationKey.screenplayRevisedBlockText] = revisedBlockText
            }
            let resolvedAnchorExcerpt = studioMetadata.screenplayResolvedAnchorExcerpt.trimmingCharacters(in: .whitespacesAndNewlines)
            if !resolvedAnchorExcerpt.isEmpty {
                userInfo[NotificationKey.screenplayResolvedAnchorExcerpt] = resolvedAnchorExcerpt
            }
        }
        postBackendNotificationOnMain(name: .themTurnCommitted, userInfo: userInfo)
    }

    private func normalizedEtag(from http: HTTPURLResponse, fallbackStateVersion: String) -> String {
        let etag = headerValue(http, "ETag")
        if !etag.isEmpty { return etag }
        if !fallbackStateVersion.isEmpty { return "W/\"\(fallbackStateVersion)\"" }
        return ""
    }

    private func validatePersonaContract(response: HTTPURLResponse, path: String) {
        let responsePersona = headerValue(response, "x-persona-key")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if !responsePersona.isEmpty, responsePersona != personaFlowKey {
            print(
                "[BackendMemoryAPI] persona contract mismatch path=\(path) response=\(responsePersona) expected=\(personaFlowKey)"
            )
        }
    }

    private func headerValue(_ response: HTTPURLResponse, _ name: String) -> String {
        if let value = response.value(forHTTPHeaderField: name), !value.isEmpty {
            return value
        }
        return ""
    }

    private func parseDispositionFilename(_ header: String, fallbackFormat: String) -> String {
        let source = header.trimmingCharacters(in: .whitespacesAndNewlines)
        if source.isEmpty {
            return "screenplay.\(fallbackExtension(for: fallbackFormat))"
        }
        let parts = source.split(separator: ";")
        for rawPart in parts {
            let part = rawPart.trimmingCharacters(in: .whitespacesAndNewlines)
            if part.lowercased().hasPrefix("filename=") {
                let value = part.dropFirst("filename=".count)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "\""))
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !value.isEmpty {
                    return value
                }
            }
        }
        return "screenplay.\(fallbackExtension(for: fallbackFormat))"
    }

    private func fallbackExtension(for format: String) -> String {
        switch format.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "fdx":
            return "fdx"
        case "pdf":
            return "pdf"
        case "json":
            return "json"
        case "md", "markdown":
            return "md"
        case "txt":
            return "txt"
        default:
            return "fountain"
        }
    }

    private func decodeErrorMessage(from data: Data) -> String {
        struct ErrorPayload: Decodable {
            let error: String?
            let stage: String?
            let message: String?
            let alternativeFormats: [String]?

            private enum CodingKeys: String, CodingKey {
                case error
                case stage
                case message
                case alternativeFormats = "alternative_formats"
            }
        }
        if let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data) {
            if let message = payload.message?.trimmingCharacters(in: .whitespacesAndNewlines),
               !message.isEmpty {
                let alternatives = payload.alternativeFormats?
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                    .joined(separator: ", ") ?? ""
                if alternatives.isEmpty {
                    return message
                }
                return "\(message) Alternatives: \(alternatives)."
            }
            if let error = payload.error, !error.isEmpty {
                if let stage = payload.stage, !stage.isEmpty {
                    return "\(stage): \(error)"
                }
                return error
            }
        }
        return BackendErrorMessageSanitizer.displayMessage(from: data)
    }

    private func decodeScreenplayExportError(status: Int, data: Data) -> Error {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        if let payload = try? decoder.decode(BackendScreenplayExportRejection.self, from: data) {
            return BackendScreenplayExportError.rejected(status: status, payload: payload)
        }
        return BackendMemoryAPIError.server(status: status, message: decodeErrorMessage(from: data))
    }

    private func baseURL() -> URL {
        if let baseURLOverride {
            return baseURLOverride
        }
        if let healthyBaseURL {
            return healthyBaseURL
        }
        if let uiTestURL = BackendDefaultBaseURLPolicy.currentUITestOverrideBaseURL {
            return uiTestURL
        }
        let fromBaseEnv = ProcessInfo.processInfo.environment["BACKEND_BASE_URL"] ?? ""
        if isUsableConfigValue(fromBaseEnv), let url = URL(string: fromBaseEnv), isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        let fromEnv = ProcessInfo.processInfo.environment["BACKEND_URL"] ?? ""
        if isUsableConfigValue(fromEnv), let url = URL(string: fromEnv), isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "BACKEND_BASE_URL") as? String,
           isUsableConfigValue(fromInfo),
           let url = URL(string: fromInfo),
           isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "BACKEND_URL") as? String,
           isUsableConfigValue(fromInfo),
           let url = URL(string: fromInfo),
           isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }
        let fromDefaults = BackendAuthClient.preferenceString(forKey: DefaultsKey.baseURL)
        if isUsableConfigValue(fromDefaults), let url = URL(string: fromDefaults), isUsableBackendURL(url) {
            let resolvedURL = canonicalizeLoopbackURL(url)
            if BackendDefaultBaseURLPolicy.currentShouldUseStoredBaseURL(resolvedURL) {
                return resolvedURL
            }
            UserDefaults.standard.removeObject(forKey: DefaultsKey.baseURL)
            UserDefaults.standard.synchronize()
        }
        return BackendDefaultBaseURLPolicy.currentPrimaryBaseURL
    }

    private func healthBaseURLCandidates() -> [URL] {
        if let baseURLOverride {
            return [baseURLOverride]
        }
        var candidates = [baseURL()]
        let storedRaw = BackendAuthClient.preferenceString(forKey: DefaultsKey.baseURL)
        if isUsableConfigValue(storedRaw),
           let stored = URL(string: storedRaw),
           isUsableBackendURL(stored) {
            candidates.append(canonicalizeLoopbackURL(stored))
        }
        candidates.append(BackendDefaultBaseURLPolicy.currentFallbackBaseURL)

        var seen = Set<String>()
        return candidates.filter { candidate in
            seen.insert(candidate.absoluteString.lowercased()).inserted
        }
    }

    private func adoptHealthyBaseURL(_ url: URL) {
        let resolved = canonicalizeLoopbackURL(url)
        healthyBaseURL = resolved
        UserDefaults.standard.set(resolved.absoluteString, forKey: DefaultsKey.baseURL)
        UserDefaults.standard.synchronize()
    }

    private func canonicalizeLoopbackURL(_ url: URL) -> URL {
        guard let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            return url
        }
        guard isLoopbackHost(host) else {
            return url
        }
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        components.host = "127.0.0.1"
        return components.url ?? url
    }

    private func isUsableBackendURL(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return false
        }
        guard let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines), !host.isEmpty else {
            return false
        }
        #if !DEBUG
        if isLoopbackHost(host) {
            return false
        }
        #endif
        return true
    }

    private func isLoopbackHost(_ host: String) -> Bool {
        let normalized = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized == "localhost"
            || normalized == "127.0.0.1"
            || normalized == "::1"
            || normalized == "[::1]"
    }

    private func appToken() -> String? {
        let fromDefaults = UserDefaults.standard.string(forKey: "app_token") ?? ""
        if isUsableConfigValue(fromDefaults) {
            return fromDefaults
        }
        if let fromInfo = Bundle.main.object(forInfoDictionaryKey: "APP_TOKEN") as? String,
           isUsableConfigValue(fromInfo) {
            return fromInfo
        }
        let envValue = ProcessInfo.processInfo.environment["APP_TOKEN"] ?? ""
        if isUsableConfigValue(envValue) {
            return envValue
        }
        if let fallback = devFallbackAppToken, isUsableConfigValue(fallback) {
            return fallback
        }
        if let fromKeychain = BackendAuthClient.sharedAppToken(), isUsableConfigValue(fromKeychain) {
            return fromKeychain
        }
        return devFallbackAppToken
    }

    private func isUsableConfigValue(_ raw: String) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return false }
        // Reject unresolved placeholders like "$(BACKEND_URL)".
        if value.hasPrefix("$("), value.hasSuffix(")") { return false }
        return true
    }

    private func clientToken() -> String? {
        BackendAuthClient.sharedClientToken()
    }

    private func userID() -> String? {
        let current = normalizedUserID(BackendAuthClient.sharedUserID() ?? "")
        if !current.isEmpty {
            return current
        }
        let generated = generatedUserID()
        BackendAuthClient.persistSharedUserID(generated)
        return generated
    }

    private func generatedUserID() -> String {
        let compact = UUID().uuidString
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
        return "usr_\(compact)"
    }

    private func normalizedUserID(_ raw: String) -> String {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return "" }
        guard value.count >= 8 && value.count <= 128 else { return "" }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-")
        if value.rangeOfCharacter(from: allowed.inverted) != nil { return "" }
        return value
    }

    private func cacheSession(_ sessionPayload: BackendSessionResponse) {
        cachedSession = sessionPayload
        cachedSessionAt = Date()

        if !BackendAuthClient.isStudioDebugClientTokenOverrideActive() {
            let expiry = Date().addingTimeInterval(TimeInterval(max(60, sessionPayload.expiresIn)))
            let expiryRaw = ISO8601DateFormatter().string(from: expiry)
            BackendAuthClient.persistSharedClientToken(
                sessionPayload.clientToken,
                expiryRaw: expiryRaw,
                baseURLRaw: baseURL().absoluteString
            )
        }
        if let userId = sessionPayload.userId {
            let normalized = normalizedUserID(userId)
            if !normalized.isEmpty {
                BackendAuthClient.persistSharedUserID(normalized)
            }
        }
        if let assistant = sessionPayload.assistantSelfName ?? sessionPayload.assistantName,
           !assistant.isEmpty {
            UserDefaults.standard.set(assistant, forKey: DefaultsKey.assistantName)
        }
        if let user = sessionPayload.userName, !user.isEmpty {
            UserDefaults.standard.set(user, forKey: DefaultsKey.userName)
        }
    }
}

func themDateFromEpoch(_ value: TimeInterval) -> Date {
    if value <= 0 { return .distantPast }
    if value > 10_000_000_000 {
        return Date(timeIntervalSince1970: value / 1000.0)
    }
    return Date(timeIntervalSince1970: value)
}
