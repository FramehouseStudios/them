import Foundation
import ScreenplayStudio
import os
import Security

nonisolated enum BackendClientCredentialStorePolicy {
    static func shouldUseKeychainForClientTokens(isMacOS: Bool, isDebug: Bool) -> Bool {
        !(isMacOS && isDebug)
    }

    static var currentShouldUseKeychainForClientTokens: Bool {
        #if os(macOS) && DEBUG
        return shouldUseKeychainForClientTokens(isMacOS: true, isDebug: true)
        #elseif os(macOS)
        return shouldUseKeychainForClientTokens(isMacOS: true, isDebug: false)
        #elseif DEBUG
        return shouldUseKeychainForClientTokens(isMacOS: false, isDebug: true)
        #else
        return shouldUseKeychainForClientTokens(isMacOS: false, isDebug: false)
        #endif
    }
}

nonisolated enum BackendDefaultBaseURLPolicy {
    static let productionBaseURLRawValue = "https://api.them.io"
    static let localPrimaryDebugBaseURLRawValue = "http://127.0.0.1:3000"
    static let localFallbackDebugBaseURLRawValue = "http://localhost:3001"

    static func primaryBaseURL(isMacOS _: Bool, isDebug: Bool) -> URL {
        if isDebug {
            return URL(string: localPrimaryDebugBaseURLRawValue)!
        }
        return URL(string: productionBaseURLRawValue)!
    }

    static func fallbackBaseURL(isMacOS _: Bool, isDebug: Bool) -> URL {
        if isDebug {
            return URL(string: localFallbackDebugBaseURLRawValue)!
        }
        return URL(string: productionBaseURLRawValue)!
    }

    static var currentPrimaryBaseURL: URL {
        #if os(macOS) && DEBUG
        return primaryBaseURL(isMacOS: true, isDebug: true)
        #elseif os(macOS)
        return primaryBaseURL(isMacOS: true, isDebug: false)
        #elseif DEBUG
        return primaryBaseURL(isMacOS: false, isDebug: true)
        #else
        return primaryBaseURL(isMacOS: false, isDebug: false)
        #endif
    }

    static var currentFallbackBaseURL: URL {
        #if os(macOS) && DEBUG
        return fallbackBaseURL(isMacOS: true, isDebug: true)
        #elseif os(macOS)
        return fallbackBaseURL(isMacOS: true, isDebug: false)
        #elseif DEBUG
        return fallbackBaseURL(isMacOS: false, isDebug: true)
        #else
        return fallbackBaseURL(isMacOS: false, isDebug: false)
        #endif
    }

    static func uiTestOverrideBaseURL(
        isDebug: Bool,
        launchArguments: [String],
        environment: [String: String]
    ) -> URL? {
        guard isDebug, launchArguments.contains("--ui-testing") else { return nil }
        let raw = (environment["THEM_UITEST_BACKEND_BASE_URL"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard isUsableConfigValue(raw),
              let url = URL(string: raw),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines),
              !host.isEmpty else {
            return nil
        }
        guard isLoopbackBackendURL(url),
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return url
        }
        components.host = "127.0.0.1"
        return components.url ?? url
    }

    static var currentUITestOverrideBaseURL: URL? {
        #if DEBUG
        return uiTestOverrideBaseURL(
            isDebug: true,
            launchArguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment
        )
        #else
        return nil
        #endif
    }

    static func shouldUseStoredBaseURL(
        _ url: URL,
        isMacOS _: Bool,
        isDebug _: Bool,
        launchArguments _: [String],
        environment _: [String: String],
        debugTokenValues _: [String],
        now _: Date
    ) -> Bool {
        guard let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines),
              !host.isEmpty else {
            return false
        }
        return true
    }

    static func currentShouldUseStoredBaseURL(_ url: URL, defaults _: UserDefaults = .standard) -> Bool {
        #if os(macOS) && DEBUG
        return shouldUseStoredBaseURL(
            url,
            isMacOS: true,
            isDebug: true,
            launchArguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment,
            debugTokenValues: [],
            now: Date()
        )
        #elseif os(macOS)
        return shouldUseStoredBaseURL(
            url,
            isMacOS: true,
            isDebug: false,
            launchArguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment,
            debugTokenValues: [],
            now: Date()
        )
        #elseif DEBUG
        return shouldUseStoredBaseURL(
            url,
            isMacOS: false,
            isDebug: true,
            launchArguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment,
            debugTokenValues: [],
            now: Date()
        )
        #else
        return shouldUseStoredBaseURL(
            url,
            isMacOS: false,
            isDebug: false,
            launchArguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment,
            debugTokenValues: [],
            now: Date()
        )
        #endif
    }

    static func isLoopbackBackendURL(_ url: URL) -> Bool {
        guard let host = url.host?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            return false
        }
        return host == "localhost"
            || host == "127.0.0.1"
            || host == "::1"
            || host == "[::1]"
    }

    private static func isUsableConfigValue(_ raw: String) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return false }
        if value.hasPrefix("$("), value.hasSuffix(")") {
            return false
        }
        return true
    }
}

struct BackendTalkUIReflection {
    let cycleIndex: Int
    let orbSaturation: Double
    let orbReactivity: Double
    let orbSmoothing: Double
    let voiceSpeed: Double
    let overAttachmentSafeguardActive: Bool

    static let `default` = BackendTalkUIReflection(
        cycleIndex: 0,
        orbSaturation: 1.0,
        orbReactivity: 1.0,
        orbSmoothing: 0.55,
        voiceSpeed: 1.2,
        overAttachmentSafeguardActive: false
    )
}

struct BackendTurnCommitSignal {
    let sessionId: String
    let turnId: String
    let requestId: String?
    let stateVersion: String
    let lastUpdatedAt: TimeInterval
    let historyUpdatedAt: TimeInterval
    let memoryUpdatedAt: TimeInterval
}

enum BackendBlockSignalLevel: String, Codable, Equatable {
    case low
    case medium
    case high
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = BackendBlockSignalLevel(rawValue: raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) ?? .unknown
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct BackendBlockSignalComponent: Codable, Equatable {
    let key: String
    let value: Double
    let weight: Double
}

struct BackendBlockSignalHabitsObserved: Codable, Equatable {
    let lastSceneAttemptAtMs: Double?
    let lastSceneCompletionAtMs: Double?
    let lastTalkTurnAtMs: Double?
    let scenesAttempted: Int
    let scenesCompleted: Int
    let recentShortTurns: Int

    enum CodingKeys: String, CodingKey {
        case lastSceneAttemptAtMs = "last_scene_attempt_at"
        case lastSceneCompletionAtMs = "last_scene_completion_at"
        case lastTalkTurnAtMs = "last_talk_turn_at"
        case scenesAttempted = "scenes_attempted"
        case scenesCompleted = "scenes_completed"
        case recentShortTurns = "recent_short_turns"
    }
}

struct BackendBlockSignalResponse: Codable, Equatable {
    let schemaVersion: Int
    let score: Double
    let level: BackendBlockSignalLevel
    let signals: [BackendBlockSignalComponent]
    let summary: String
    let habitsObserved: BackendBlockSignalHabitsObserved
    let error: String?
}

struct BackendBlockSignalHistoryEntry: Codable, Equatable {
    let at: Double
    let score: Double
    let level: BackendBlockSignalLevel
}

struct BackendBlockSignalHistoryCountsByLevel: Codable, Equatable {
    let low: Int
    let medium: Int
    let high: Int
}

struct BackendBlockSignalHistoryCounts: Codable, Equatable {
    let total: Int
    let byLevel: BackendBlockSignalHistoryCountsByLevel
}

struct BackendBlockSignalHistoryResponse: Codable, Equatable {
    let schemaVersion: Int
    let entries: [BackendBlockSignalHistoryEntry]
    let counts: BackendBlockSignalHistoryCounts
    let newestAt: Double?
    let oldestAt: Double?
    let error: String?
}

struct BackendBlockSignalNudgeState: Equatable {
    let shouldRender: Bool
    let title: String
    let summary: String
    let scoreLabel: String
    let detailLabel: String
    let topSignalLabel: String
    let progress: Double
    let level: BackendBlockSignalLevel

    static func make(signal: BackendBlockSignalResponse?) -> BackendBlockSignalNudgeState {
        guard let signal else {
            return BackendBlockSignalNudgeState(
                shouldRender: false,
                title: "Momentum",
                summary: "",
                scoreLabel: "0%",
                detailLabel: "No signal yet",
                topSignalLabel: "",
                progress: 0,
                level: .low
            )
        }
        let score = min(max(signal.score, 0), 1)
        let percent = Int((score * 100).rounded())
        let summary = signal.summary.trimmingCharacters(in: .whitespacesAndNewlines)
        let topSignal = signal.signals.first?.key ?? ""
        let shouldRender = signal.level == .medium || signal.level == .high
        return BackendBlockSignalNudgeState(
            shouldRender: shouldRender,
            title: signal.level == .high ? "Momentum needs care" : "Momentum check",
            summary: summary.isEmpty ? "Try one small page move to keep the draft warm." : summary,
            scoreLabel: "\(percent)%",
            detailLabel: "\(signal.habitsObserved.scenesCompleted)/\(signal.habitsObserved.scenesAttempted) scenes finished - \(signal.habitsObserved.recentShortTurns) short turns",
            topSignalLabel: Self.label(for: topSignal),
            progress: score,
            level: signal.level
        )
    }

    private static func label(for key: String) -> String {
        switch key {
        case "scene_completion_gap": return "Scene gap"
        case "attempt_completion_dropoff": return "Started vs. finished"
        case "short_turn_ratio": return "Short prompts"
        case "talk_turn_gap": return "Time away"
        default: return "Momentum"
        }
    }
}

struct BackendBlockSignalHistoryTrendState: Equatable {
    let shouldRender: Bool
    let title: String
    let countLabel: String
    let trendLabel: String
    let levelMixLabel: String
    let sparklineScores: [Double]
    let latestLevel: BackendBlockSignalLevel

    static func make(history: BackendBlockSignalHistoryResponse?) -> BackendBlockSignalHistoryTrendState {
        guard let history else {
            return BackendBlockSignalHistoryTrendState(
                shouldRender: false,
                title: "Momentum history",
                countLabel: "No samples",
                trendLabel: "Waiting for a few writing passes",
                levelMixLabel: "",
                sparklineScores: [],
                latestLevel: .low
            )
        }

        let sortedEntries = history.entries.sorted { $0.at < $1.at }
        let clampedScores = sortedEntries
            .suffix(12)
            .map { min(max($0.score, 0), 1) }
        let latestLevel = sortedEntries.last?.level ?? .low
        let total = max(history.counts.total, sortedEntries.count)
        let countLabel = total == 1 ? "1 sample" : "\(total) samples"
        let trend = trendLabel(for: clampedScores)
        let mixLabel = "High \(history.counts.byLevel.high) / Medium \(history.counts.byLevel.medium)"

        return BackendBlockSignalHistoryTrendState(
            shouldRender: clampedScores.count >= 2,
            title: "Momentum history",
            countLabel: countLabel,
            trendLabel: trend,
            levelMixLabel: mixLabel,
            sparklineScores: clampedScores,
            latestLevel: latestLevel
        )
    }

    private static func trendLabel(for scores: [Double]) -> String {
        guard let first = scores.first, let last = scores.last else {
            return "Waiting for a few writing passes"
        }
        let delta = last - first
        if delta >= 0.15 { return "Momentum rising" }
        if delta <= -0.15 { return "Momentum settling" }
        return "Momentum steady"
    }
}


struct BackendCharacterSpeechStyle: Codable, Equatable {
    let pace: String
    let syntax: String

    enum CodingKeys: String, CodingKey {
        case pace
        case syntax
    }

    init(pace: String = "", syntax: String = "") {
        self.pace = pace
        self.syntax = syntax
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        pace = (try container.decodeIfPresent(String.self, forKey: .pace)) ?? ""
        syntax = (try container.decodeIfPresent(String.self, forKey: .syntax)) ?? ""
    }
}

struct BackendCharacterTraits: Codable, Equatable {
    let vocabulary: [String]
    let keywords: [String]
    let speechStyle: BackendCharacterSpeechStyle
    let emotionalDefault: String
    let goals: [String]
    let relationships: [String: String]
    let voiceFingerprint: BackendScreenplayCharacterVoiceFingerprint

    enum CodingKeys: String, CodingKey {
        case vocabulary
        case keywords
        case speechStyle = "speech_style"
        case emotionalDefault = "emotional_default"
        case goals
        case relationships
        case voiceFingerprint = "voice_fingerprint"
    }

    init(
        vocabulary: [String] = [],
        keywords: [String] = [],
        speechStyle: BackendCharacterSpeechStyle = BackendCharacterSpeechStyle(),
        emotionalDefault: String = "",
        goals: [String] = [],
        relationships: [String: String] = [:],
        voiceFingerprint: BackendScreenplayCharacterVoiceFingerprint = BackendScreenplayCharacterVoiceFingerprint()
    ) {
        self.vocabulary = vocabulary
        self.keywords = keywords
        self.speechStyle = speechStyle
        self.emotionalDefault = emotionalDefault
        self.goals = goals
        self.relationships = relationships
        self.voiceFingerprint = voiceFingerprint
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        vocabulary = (try container.decodeIfPresent([String].self, forKey: .vocabulary)) ?? []
        keywords = (try container.decodeIfPresent([String].self, forKey: .keywords)) ?? []
        speechStyle = (try container.decodeIfPresent(BackendCharacterSpeechStyle.self, forKey: .speechStyle)) ?? BackendCharacterSpeechStyle()
        emotionalDefault = (try container.decodeIfPresent(String.self, forKey: .emotionalDefault)) ?? ""
        goals = (try container.decodeIfPresent([String].self, forKey: .goals)) ?? []
        relationships = (try container.decodeIfPresent([String: String].self, forKey: .relationships)) ?? [:]
        voiceFingerprint = (try container.decodeIfPresent(BackendScreenplayCharacterVoiceFingerprint.self, forKey: .voiceFingerprint)) ?? BackendScreenplayCharacterVoiceFingerprint()
    }

    var hasContent: Bool {
        !vocabulary.isEmpty ||
        !keywords.isEmpty ||
        !speechStyle.pace.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !speechStyle.syntax.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !emotionalDefault.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !goals.isEmpty ||
        !relationships.isEmpty ||
        voiceFingerprint.isMeaningful
    }
}

struct BackendCharacterTraitRecord: Codable, Equatable {
    let name: String
    let traits: BackendCharacterTraits?
}

struct BackendCharacterTraitsResponse: Codable, Equatable {
    let schemaVersion: Int
    let userId: String?
    let characters: [BackendCharacterTraitRecord]
    let error: String?
}

struct BackendCharacterArchetypeCandidate: Codable, Equatable {
    let archetype: String
    let score: Double
    let signals: [String]

    init(archetype: String = "", score: Double = 0, signals: [String] = []) {
        self.archetype = archetype
        self.score = score
        self.signals = signals
    }
}

struct BackendCharacterArchetypeEntry: Codable, Equatable {
    let name: String
    let primary: BackendCharacterArchetypeCandidate?
    let candidates: [BackendCharacterArchetypeCandidate]
    let summary: String

    init(
        name: String = "",
        primary: BackendCharacterArchetypeCandidate? = nil,
        candidates: [BackendCharacterArchetypeCandidate] = [],
        summary: String = ""
    ) {
        self.name = name
        self.primary = primary
        self.candidates = candidates
        self.summary = summary
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        name = (try container.decodeIfPresent(String.self, forKey: .name)) ?? ""
        primary = try container.decodeIfPresent(BackendCharacterArchetypeCandidate.self, forKey: .primary)
        candidates = (try container.decodeIfPresent([BackendCharacterArchetypeCandidate].self, forKey: .candidates)) ?? []
        summary = (try container.decodeIfPresent(String.self, forKey: .summary)) ?? ""
    }
}

struct BackendCharacterArchetypesResponse: Codable, Equatable {
    let schemaVersion: Int
    let userId: String?
    let entries: [BackendCharacterArchetypeEntry]
    let error: String?
}

struct BackendCharacterTraitCardState: Identifiable, Equatable {
    let id: String
    let name: String
    let summary: String
    let chips: [String]
    let detail: String
    let hasTraits: Bool
    let archetypeLabel: String
    let archetypeSummary: String
    let archetypeScoreLabel: String
    let hasArchetype: Bool

    static func make(
        response: BackendCharacterTraitsResponse?,
        archetypes: BackendCharacterArchetypesResponse? = nil
    ) -> [BackendCharacterTraitCardState] {
        guard let response else { return [] }
        var archetypesByName: [String: BackendCharacterArchetypeEntry] = [:]
        for entry in archetypes?.entries ?? [] {
            let key = clean(entry.name).lowercased()
            if !key.isEmpty, archetypesByName[key] == nil {
                archetypesByName[key] = entry
            }
        }
        return response.characters.prefix(4).enumerated().map { index, record in
            let cleanedName = clean(record.name)
            let traits = record.traits
            let archetypeEntry = archetypesByName[cleanedName.lowercased()]
            let primaryArchetype = clean(archetypeEntry?.primary?.archetype ?? "")
            let score = archetypeEntry?.primary?.score ?? 0
            let archetypeLabel = displayArchetype(primaryArchetype)
            let scoreLabel = score > 0 ? "\(Int((score * 100).rounded()))%" : ""
            let styleParts = [
                clean(traits?.speechStyle.pace ?? ""),
                clean(traits?.speechStyle.syntax ?? "")
            ].filter { !$0.isEmpty }
            let emotionalDefault = clean(traits?.emotionalDefault ?? "")
            let goals = (traits?.goals ?? []).map { clean($0) }.filter { !$0.isEmpty }
            let vocabulary = (traits?.vocabulary ?? []).map { clean($0) }.filter { !$0.isEmpty }
            let keywords = (traits?.keywords ?? []).map { clean($0) }.filter { !$0.isEmpty }
            let relationships = traits?.relationships ?? [:]
            let summary: String
            if !emotionalDefault.isEmpty {
                summary = "Default: \(emotionalDefault)"
            } else if !styleParts.isEmpty {
                summary = "Voice: \(styleParts.joined(separator: ", "))"
            } else if let firstGoal = goals.first {
                summary = "Wants: \(firstGoal)"
            } else {
                summary = "Known character; voice inventory is still learning."
            }
            let chipSource = keywords + styleParts + Array(goals.prefix(1))
            let chips = Array(chipSource.prefix(4))
            let detailBits = [
                vocabulary.isEmpty ? nil : "\(vocabulary.count) phrase\(vocabulary.count == 1 ? "" : "s")",
                goals.isEmpty ? nil : "\(goals.count) goal\(goals.count == 1 ? "" : "s")",
                relationships.isEmpty ? nil : "\(relationships.count) tie\(relationships.count == 1 ? "" : "s")"
            ].compactMap { $0 }
            return BackendCharacterTraitCardState(
                id: "\(cleanedName.lowercased())-\(index)",
                name: cleanedName.isEmpty ? "Unknown" : cleanedName,
                summary: summary,
                chips: chips,
                detail: detailBits.isEmpty ? "Waiting for more dialogue evidence" : detailBits.joined(separator: " | "),
                hasTraits: traits?.hasContent ?? false,
                archetypeLabel: archetypeLabel,
                archetypeSummary: clean(archetypeEntry?.summary ?? ""),
                archetypeScoreLabel: scoreLabel,
                hasArchetype: !archetypeLabel.isEmpty
            )
        }
    }

    private static func clean(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func displayArchetype(_ value: String) -> String {
        let cleaned = clean(value)
        guard !cleaned.isEmpty else { return "" }
        return cleaned
            .split(separator: "_")
            .map { part in
                let lower = part.lowercased()
                return lower.prefix(1).uppercased() + lower.dropFirst()
            }
            .joined(separator: " ")
    }
}

private struct BackendTalkTurnMetaPayload: Decodable {
    let turnID: String?
    let sessionID: String?
    let stateVersion: String?
    let transcript: String?
    let reply: String?
    let audioDurationMs: Int?
    let timingSource: String?
    let screenplayCues: [BackendTalkScreenplayCue]?
    let screenplayOutput: BackendTalkScreenplayOutput?
    let dialogueTimeline: BackendTalkDialogueTimelineRevision?
    let renderContract: BackendTalkTurnMetaRenderContractPayload?
    let knowledgeTopics: [String]?
    let knowledgeCitations: [String]?
    let knowledgeQueryRaw: String?
    let knowledgeQueryRewrite: String?
    let knowledgeContradictionRisk: Double?

    enum CodingKeys: String, CodingKey {
        case turnID = "turn_id"
        case sessionID = "session_id"
        case stateVersion = "state_version"
        case transcript
        case reply
        case audioDurationMs = "audio_duration_ms"
        case timingSource = "timing_source"
        case screenplayCues = "screenplay_cues"
        case screenplayOutput = "screenplay_output"
        case dialogueTimeline = "dialogue_timeline"
        case renderContract = "render_contract"
        case knowledgeTopics = "knowledge_topics"
        case knowledgeCitations = "knowledge_citations"
        case knowledgeQueryRaw = "knowledge_query_raw"
        case knowledgeQueryRewrite = "knowledge_query_rewrite"
        case knowledgeContradictionRisk = "knowledge_contradiction_risk"
    }
}

private struct BackendTalkTurnMetaRenderContractPayload: Decodable {
    let replyRoleRaw: String?
    let authoritativePageTextAvailable: Bool?
    let syncReady: Bool?

    enum CodingKeys: String, CodingKey {
        case replyRoleRaw = "reply_role"
        case authoritativePageTextAvailable = "authoritative_page_text_available"
        case syncReady = "sync_ready"
    }

    var renderContract: BackendTalkRenderContract {
        BackendTalkRenderContract(
            replyRole: BackendTalkRenderContract.ReplyRole(
                rawValue: String(replyRoleRaw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            ) ?? .final,
            authoritativePageTextAvailable: authoritativePageTextAvailable ?? false,
            syncReady: syncReady ?? false
        )
    }
}

private struct BackendTalkTurnMetaRateLimitEnvelope: Decodable {
    let error: String?
    let retryAfterMs: Int?

    enum CodingKeys: String, CodingKey {
        case error
        case retryAfterMs = "retry_after_ms"
    }
}

struct BackendTalkTurnMetaRateLimitNotice: Equatable {
    let turnId: String
    let retryAfterMs: Int?

    init?(
        turnId: String,
        statusCode: Int,
        data: Data,
        retryAfterHeader: String?
    ) {
        guard statusCode == 429 else { return nil }
        let envelope = try? JSONDecoder().decode(BackendTalkTurnMetaRateLimitEnvelope.self, from: data)
        let error = (envelope?.error ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard error.isEmpty || error == "rate_limited" else { return nil }

        let headerRetryMs = retryAfterHeader
            .flatMap { Double($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
            .map { Int(ceil(max(0, $0) * 1000)) }
        let parsedRetryMs = envelope?.retryAfterMs ?? headerRetryMs

        self.turnId = turnId.trimmingCharacters(in: .whitespacesAndNewlines)
        self.retryAfterMs = parsedRetryMs.map { max(0, $0) }
    }

    var retryDelayLabel: String {
        guard let retryAfterMs else { return "a moment" }
        if retryAfterMs <= 0 { return "now" }
        if retryAfterMs < 1000 { return "less than a second" }
        let seconds = max(1, Int(ceil(Double(retryAfterMs) / 1000.0)))
        return seconds == 1 ? "1 second" : "\(seconds) seconds"
    }

    var bannerText: String {
        let retryPhrase = retryDelayLabel == "now"
            ? "retry now"
            : "retry in \(retryDelayLabel)"
        return "Saved the response. Extra turn details are cooling down; \(retryPhrase)."
    }
}

private struct BackendTalkTurnMetaRateLimitError: LocalizedError {
    let notice: BackendTalkTurnMetaRateLimitNotice

    var errorDescription: String? {
        notice.bannerText
    }
}

struct BackendTalkKnowledgeTrace {
    let topics: [String]
    let citations: [String]
    let confidenceClass: String
    let contradictionRisk: Double
    let contradictionGuard: Bool
    let rawQuery: String?
    let rewrittenQuery: String?

    static let empty = BackendTalkKnowledgeTrace(
        topics: [],
        citations: [],
        confidenceClass: "UNKNOWN",
        contradictionRisk: 0,
        contradictionGuard: false,
        rawQuery: nil,
        rewrittenQuery: nil
    )
}

struct BackendTalkCreativeMemoryCharacterTrace: Codable, Equatable {
    let name: String
    let hasBible: Bool
    let hasCorrections: Bool
    let correctedTerms: [String]
    let correctionReplacements: [String]

    enum CodingKeys: String, CodingKey {
        case name
        case hasBible = "has_bible"
        case hasCorrections = "has_corrections"
        case correctedTerms = "corrected_terms"
        case correctionReplacements = "correction_replacements"
    }

    init(
        name: String,
        hasBible: Bool = false,
        hasCorrections: Bool = false,
        correctedTerms: [String] = [],
        correctionReplacements: [String] = []
    ) {
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.hasBible = hasBible
        self.hasCorrections = hasCorrections
        self.correctedTerms = correctedTerms
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.correctionReplacements = correctionReplacements
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            name: try container.decodeIfPresent(String.self, forKey: .name) ?? "",
            hasBible: try container.decodeIfPresent(Bool.self, forKey: .hasBible) ?? false,
            hasCorrections: try container.decodeIfPresent(Bool.self, forKey: .hasCorrections) ?? false,
            correctedTerms: try container.decodeIfPresent([String].self, forKey: .correctedTerms) ?? [],
            correctionReplacements: try container.decodeIfPresent([String].self, forKey: .correctionReplacements) ?? []
        )
    }
}

struct BackendTalkCreativeMemoryEpisodeTrace: Codable, Equatable {
    let summary: String
    let excerpt: String
    let projectId: String?
    let projectTitle: String?
    let characters: [String]
    let tags: [String]
    let correction: Bool

    enum CodingKeys: String, CodingKey {
        case summary
        case excerpt
        case projectId = "project_id"
        case projectTitle = "project_title"
        case characters
        case tags
        case correction
    }

    init(
        summary: String,
        excerpt: String,
        projectId: String? = nil,
        projectTitle: String? = nil,
        characters: [String] = [],
        tags: [String] = [],
        correction: Bool = false
    ) {
        self.summary = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        self.excerpt = excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProjectId = projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanProjectTitle = projectTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.projectId = cleanProjectId.isEmpty ? nil : cleanProjectId
        self.projectTitle = cleanProjectTitle.isEmpty ? nil : cleanProjectTitle
        self.characters = characters
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.tags = tags
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.correction = correction
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            summary: try container.decodeIfPresent(String.self, forKey: .summary) ?? "",
            excerpt: try container.decodeIfPresent(String.self, forKey: .excerpt) ?? "",
            projectId: try container.decodeIfPresent(String.self, forKey: .projectId),
            projectTitle: try container.decodeIfPresent(String.self, forKey: .projectTitle),
            characters: try container.decodeIfPresent([String].self, forKey: .characters) ?? [],
            tags: try container.decodeIfPresent([String].self, forKey: .tags) ?? [],
            correction: try container.decodeIfPresent(Bool.self, forKey: .correction) ?? false
        )
    }
}

struct BackendTalkCreativeMemoryTrace: Codable, Equatable {
    let applied: Bool
    let projectId: String?
    let projectTitle: String?
    let queryChars: Int
    let characterCount: Int
    let characters: [BackendTalkCreativeMemoryCharacterTrace]
    let episodicCount: Int
    let episodic: [BackendTalkCreativeMemoryEpisodeTrace]
    let correctionCount: Int
    let correctedTerms: [String]
    let correctionReplacements: [String]
    let screenplayProjectMemory: BackendTalkScreenplayProjectMemoryTrace?
    let styleApplied: Bool
    let toneApplied: Bool
    let habitsApplied: Bool
    let canonClarification: BackendCanonCorrectionAmbiguity?

    enum CodingKeys: String, CodingKey {
        case applied
        case projectId = "project_id"
        case projectTitle = "project_title"
        case queryChars = "query_chars"
        case characterCount = "character_count"
        case characters
        case episodicCount = "episodic_count"
        case episodic
        case correctionCount = "correction_count"
        case correctedTerms = "corrected_terms"
        case correctionReplacements = "correction_replacements"
        case screenplayProjectMemory = "screenplay_project_memory"
        case styleApplied = "style_applied"
        case toneApplied = "tone_applied"
        case habitsApplied = "habits_applied"
        case canonClarification = "canon_clarification"
    }

    init(
        applied: Bool,
        projectId: String? = nil,
        projectTitle: String? = nil,
        queryChars: Int = 0,
        characterCount: Int = 0,
        characters: [BackendTalkCreativeMemoryCharacterTrace] = [],
        episodicCount: Int = 0,
        episodic: [BackendTalkCreativeMemoryEpisodeTrace] = [],
        correctionCount: Int = 0,
        correctedTerms: [String] = [],
        correctionReplacements: [String] = [],
        screenplayProjectMemory: BackendTalkScreenplayProjectMemoryTrace? = nil,
        styleApplied: Bool = false,
        toneApplied: Bool = false,
        habitsApplied: Bool = false,
        canonClarification: BackendCanonCorrectionAmbiguity? = nil
    ) {
        self.applied = applied
        let cleanProjectId = projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanProjectTitle = projectTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.projectId = cleanProjectId.isEmpty ? nil : cleanProjectId
        self.projectTitle = cleanProjectTitle.isEmpty ? nil : cleanProjectTitle
        self.queryChars = max(0, queryChars)
        self.characters = characters.filter { !$0.name.isEmpty }
        self.characterCount = max(max(0, characterCount), self.characters.count)
        self.episodic = episodic.filter { !$0.summary.isEmpty || !$0.excerpt.isEmpty }
        self.episodicCount = max(max(0, episodicCount), self.episodic.count)
        self.correctionCount = max(0, correctionCount)
        self.correctedTerms = correctedTerms
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.correctionReplacements = correctionReplacements
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.screenplayProjectMemory = screenplayProjectMemory?.hasContent == true ? screenplayProjectMemory : nil
        self.styleApplied = styleApplied
        self.toneApplied = toneApplied
        self.habitsApplied = habitsApplied
        self.canonClarification = canonClarification?.isPending == true && (canonClarification?.candidateFacts.count ?? 0) >= 2
            ? canonClarification
            : nil
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            applied: try container.decodeIfPresent(Bool.self, forKey: .applied) ?? false,
            projectId: try container.decodeIfPresent(String.self, forKey: .projectId),
            projectTitle: try container.decodeIfPresent(String.self, forKey: .projectTitle),
            queryChars: try container.decodeIfPresent(Int.self, forKey: .queryChars) ?? 0,
            characterCount: try container.decodeIfPresent(Int.self, forKey: .characterCount) ?? 0,
            characters: try container.decodeIfPresent([BackendTalkCreativeMemoryCharacterTrace].self, forKey: .characters) ?? [],
            episodicCount: try container.decodeIfPresent(Int.self, forKey: .episodicCount) ?? 0,
            episodic: try container.decodeIfPresent([BackendTalkCreativeMemoryEpisodeTrace].self, forKey: .episodic) ?? [],
            correctionCount: try container.decodeIfPresent(Int.self, forKey: .correctionCount) ?? 0,
            correctedTerms: try container.decodeIfPresent([String].self, forKey: .correctedTerms) ?? [],
            correctionReplacements: try container.decodeIfPresent([String].self, forKey: .correctionReplacements) ?? [],
            screenplayProjectMemory: try container.decodeIfPresent(BackendTalkScreenplayProjectMemoryTrace.self, forKey: .screenplayProjectMemory),
            styleApplied: try container.decodeIfPresent(Bool.self, forKey: .styleApplied) ?? false,
            toneApplied: try container.decodeIfPresent(Bool.self, forKey: .toneApplied) ?? false,
            habitsApplied: try container.decodeIfPresent(Bool.self, forKey: .habitsApplied) ?? false,
            canonClarification: try container.decodeIfPresent(BackendCanonCorrectionAmbiguity.self, forKey: .canonClarification)
        )
    }

    func attachingCanonClarification(_ clarification: BackendCanonCorrectionAmbiguity?) -> Self {
        Self(
            applied: applied,
            projectId: projectId,
            projectTitle: projectTitle,
            queryChars: queryChars,
            characterCount: characterCount,
            characters: characters,
            episodicCount: episodicCount,
            episodic: episodic,
            correctionCount: correctionCount,
            correctedTerms: correctedTerms,
            correctionReplacements: correctionReplacements,
            screenplayProjectMemory: screenplayProjectMemory,
            styleApplied: styleApplied,
            toneApplied: toneApplied,
            habitsApplied: habitsApplied,
            canonClarification: clarification
        )
    }

    static let empty = BackendTalkCreativeMemoryTrace(applied: false)
}

struct BackendTalkScreenplayProjectMemoryTrace: Codable, Equatable {
    let applied: Bool
    let projectId: String?
    let projectTitle: String?
    let act: String
    let featureSequence: String
    let currentBeat: String
    let nextScenePlan: String
    let nextThreeTurns: [String]
    let actThreePayoffPath: [String]
    let unresolvedSetups: [String]
    let unresolvedStoryThreads: [String]
    let characterArcTurns: [String]
    let imageMotifs: [String]

    enum CodingKeys: String, CodingKey {
        case applied
        case projectId = "project_id"
        case projectTitle = "project_title"
        case act
        case featureSequence = "feature_sequence"
        case currentBeat = "current_beat"
        case nextScenePlan = "next_scene_plan"
        case nextThreeTurns = "next_three_turns"
        case actThreePayoffPath = "act_three_payoff_path"
        case unresolvedSetups = "unresolved_setups"
        case unresolvedStoryThreads = "unresolved_story_threads"
        case characterArcTurns = "character_arc_turns"
        case imageMotifs = "image_motifs"
    }

    var hasContent: Bool {
        applied ||
            !(projectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !(projectTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !act.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !featureSequence.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !currentBeat.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !nextScenePlan.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !nextThreeTurns.isEmpty ||
            !actThreePayoffPath.isEmpty ||
            !unresolvedSetups.isEmpty ||
            !unresolvedStoryThreads.isEmpty ||
            !characterArcTurns.isEmpty ||
            !imageMotifs.isEmpty
    }

    init(
        applied: Bool = false,
        projectId: String? = nil,
        projectTitle: String? = nil,
        act: String = "",
        featureSequence: String = "",
        currentBeat: String = "",
        nextScenePlan: String = "",
        nextThreeTurns: [String] = [],
        actThreePayoffPath: [String] = [],
        unresolvedSetups: [String] = [],
        unresolvedStoryThreads: [String] = [],
        characterArcTurns: [String] = [],
        imageMotifs: [String] = []
    ) {
        let cleanProjectId = projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanProjectTitle = projectTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.applied = applied
        self.projectId = cleanProjectId.isEmpty ? nil : cleanProjectId
        self.projectTitle = cleanProjectTitle.isEmpty ? nil : cleanProjectTitle
        self.act = act.trimmingCharacters(in: .whitespacesAndNewlines)
        self.featureSequence = featureSequence.trimmingCharacters(in: .whitespacesAndNewlines)
        self.currentBeat = currentBeat.trimmingCharacters(in: .whitespacesAndNewlines)
        self.nextScenePlan = nextScenePlan.trimmingCharacters(in: .whitespacesAndNewlines)
        self.nextThreeTurns = Self.cleanList(nextThreeTurns)
        self.actThreePayoffPath = Self.cleanList(actThreePayoffPath)
        self.unresolvedSetups = Self.cleanList(unresolvedSetups)
        self.unresolvedStoryThreads = Self.cleanList(unresolvedStoryThreads)
        self.characterArcTurns = Self.cleanList(characterArcTurns)
        self.imageMotifs = Self.cleanList(imageMotifs)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            applied: try container.decodeIfPresent(Bool.self, forKey: .applied) ?? false,
            projectId: try container.decodeIfPresent(String.self, forKey: .projectId),
            projectTitle: try container.decodeIfPresent(String.self, forKey: .projectTitle),
            act: try container.decodeIfPresent(String.self, forKey: .act) ?? "",
            featureSequence: try container.decodeIfPresent(String.self, forKey: .featureSequence) ?? "",
            currentBeat: try container.decodeIfPresent(String.self, forKey: .currentBeat) ?? "",
            nextScenePlan: try container.decodeIfPresent(String.self, forKey: .nextScenePlan) ?? "",
            nextThreeTurns: try container.decodeIfPresent([String].self, forKey: .nextThreeTurns) ?? [],
            actThreePayoffPath: try container.decodeIfPresent([String].self, forKey: .actThreePayoffPath) ?? [],
            unresolvedSetups: try container.decodeIfPresent([String].self, forKey: .unresolvedSetups) ?? [],
            unresolvedStoryThreads: try container.decodeIfPresent([String].self, forKey: .unresolvedStoryThreads) ?? [],
            characterArcTurns: try container.decodeIfPresent([String].self, forKey: .characterArcTurns) ?? [],
            imageMotifs: try container.decodeIfPresent([String].self, forKey: .imageMotifs) ?? []
        )
    }

    private static func cleanList(_ values: [String], limit: Int = 8) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values {
            let clean = value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard seen.insert(key).inserted else { continue }
            result.append(String(clean.prefix(220)))
            if result.count >= limit { break }
        }
        return result
    }
}

struct BackendTalkScreenplayTrace {
    let modeEnabled: Bool
    let phase: String
    let pack: String
    let packLock: Bool
    let projectId: String?
    let versionId: String?
    let repairAttempted: Bool
    let repairOutcome: String
    let repairMs: Int?
    let repairReason: String?

    init(
        modeEnabled: Bool,
        phase: String,
        pack: String,
        packLock: Bool,
        projectId: String?,
        versionId: String?,
        repairAttempted: Bool = false,
        repairOutcome: String = "none",
        repairMs: Int? = nil,
        repairReason: String? = nil
    ) {
        self.modeEnabled = modeEnabled
        self.phase = phase.trimmingCharacters(in: .whitespacesAndNewlines)
        self.pack = pack.trimmingCharacters(in: .whitespacesAndNewlines)
        self.packLock = packLock
        let cleanProjectId = projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let cleanVersionId = versionId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.projectId = cleanProjectId.isEmpty ? nil : cleanProjectId
        self.versionId = cleanVersionId.isEmpty ? nil : cleanVersionId
        self.repairAttempted = repairAttempted
        let cleanOutcome = repairOutcome.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        self.repairOutcome = cleanOutcome.isEmpty ? "none" : cleanOutcome
        let cleanRepairMs = max(0, repairMs ?? 0)
        self.repairMs = cleanRepairMs > 0 ? cleanRepairMs : nil
        let cleanReason = repairReason?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.repairReason = cleanReason?.isEmpty == true ? nil : cleanReason
    }

    var hasRenderableOutput: Bool {
        modeEnabled && (
            !pack.isEmpty ||
            !(phase.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        )
    }

    static let empty = BackendTalkScreenplayTrace(
        modeEnabled: false,
        phase: "",
        pack: "",
        packLock: false,
        projectId: nil,
        versionId: nil
    )
}

struct BackendTalkScreenplayOutputLine: Codable, Equatable {
    let index: Int
    let text: String
    let element: String
}

struct BackendTalkScreenplayQuality: Codable, Equatable {
    let ok: Bool
    let reason: String
    let source: String
    let confidence: String
    let featureAct: String?
    let matchedTokens: [String]
    let counts: [String: Int]
    let minimumSpecificActions: Int?
    let repairDirectives: [String]

    enum CodingKeys: String, CodingKey {
        case ok
        case reason
        case source
        case confidence
        case featureAct = "feature_act"
        case matchedTokens = "matched_tokens"
        case counts
        case minimumSpecificActions = "minimum_specific_actions"
        case repairDirectives = "repair_directives"
    }

    init(
        ok: Bool,
        reason: String,
        source: String,
        confidence: String,
        featureAct: String? = nil,
        matchedTokens: [String] = [],
        counts: [String: Int] = [:],
        minimumSpecificActions: Int? = nil,
        repairDirectives: [String] = []
    ) {
        self.ok = ok
        self.reason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        self.source = source.trimmingCharacters(in: .whitespacesAndNewlines)
        self.confidence = confidence.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanFeatureAct = featureAct?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.featureAct = cleanFeatureAct?.isEmpty == true ? nil : cleanFeatureAct
        self.matchedTokens = matchedTokens
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        self.counts = counts.filter { !$0.key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        let cleanMinimum = max(0, minimumSpecificActions ?? 0)
        self.minimumSpecificActions = cleanMinimum > 0 ? cleanMinimum : nil
        var seenDirectives = Set<String>()
        var cleanedDirectives: [String] = []
        for directive in repairDirectives {
            let clean = directive
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard seenDirectives.insert(key).inserted else { continue }
            cleanedDirectives.append(String(clean.prefix(220)))
            if cleanedDirectives.count >= 5 { break }
        }
        self.repairDirectives = cleanedDirectives
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            ok: try container.decodeIfPresent(Bool.self, forKey: .ok) ?? false,
            reason: try container.decodeIfPresent(String.self, forKey: .reason) ?? "",
            source: try container.decodeIfPresent(String.self, forKey: .source) ?? "",
            confidence: try container.decodeIfPresent(String.self, forKey: .confidence) ?? "",
            featureAct: try container.decodeIfPresent(String.self, forKey: .featureAct),
            matchedTokens: try container.decodeIfPresent([String].self, forKey: .matchedTokens) ?? [],
            counts: try container.decodeIfPresent([String: Int].self, forKey: .counts) ?? [:],
            minimumSpecificActions: try container.decodeIfPresent(Int.self, forKey: .minimumSpecificActions),
            repairDirectives: try container.decodeIfPresent([String].self, forKey: .repairDirectives) ?? []
        )
    }
}

struct BackendTalkScreenplayOutput: Codable, Equatable {
    let target: String
    let format: String
    let source: String
    let quality: BackendTalkScreenplayQuality?
    let text: String
    let lines: [BackendTalkScreenplayOutputLine]

    var writesToPage: Bool {
        target == "page" && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

struct BackendTalkScreenplayCue: Codable, Equatable {
    let index: Int
    let text: String
    let element: String
    let startMs: Int
    let endMs: Int

    enum CodingKeys: String, CodingKey {
        case index
        case text
        case element
        case startMs = "start_ms"
        case endMs = "end_ms"
    }
}

struct BackendTalkPageAnchor: Codable, Equatable {
    let projectId: String
    let sceneId: String
    let beatId: String?
    let scriptNodeId: String
    let pageIndex: Int?
    let rangeStart: Int
    let rangeEnd: Int
    let anchorLine: Int?
    let anchorEndLine: Int?
    let insertMode: String?

    enum CodingKeys: String, CodingKey {
        case projectId = "project_id"
        case sceneId = "scene_id"
        case beatId = "beat_id"
        case scriptNodeId = "script_node_id"
        case pageIndex = "page_index"
        case rangeStart = "range_start"
        case rangeEnd = "range_end"
        case anchorLine = "anchor_line"
        case anchorEndLine = "anchor_end_line"
        case insertMode = "insert_mode"
    }
}

struct BackendTalkRevealUnit: Codable, Equatable {
    let id: String
    let text: String
    let startMs: Int
    let endMs: Int
    let utf16Start: Int
    let utf16End: Int

    enum CodingKeys: String, CodingKey {
        case id
        case text
        case startMs = "start_ms"
        case endMs = "end_ms"
        case utf16Start = "utf16_start"
        case utf16End = "utf16_end"
    }
}

struct BackendTalkDialogueSegment: Codable, Equatable {
    let id: String
    let lineId: String
    let kind: String
    let text: String
    let startMs: Int
    let endMs: Int
    let pageAnchor: BackendTalkPageAnchor
    let revealUnits: [BackendTalkRevealUnit]

    enum CodingKeys: String, CodingKey {
        case id
        case lineId = "line_id"
        case kind
        case text
        case startMs = "start_ms"
        case endMs = "end_ms"
        case pageAnchor = "page_anchor"
        case revealUnits = "reveal_units"
    }
}

struct BackendTalkDialogueTimelineRevision: Codable, Equatable {
    let turnId: String
    let revisionId: String
    let audioAssetId: String
    let durationMs: Int
    let documentRevisionId: String
    let insertionAnchor: BackendTalkPageAnchor
    let segments: [BackendTalkDialogueSegment]

    enum CodingKeys: String, CodingKey {
        case turnId = "turn_id"
        case revisionId = "revision_id"
        case audioAssetId = "audio_asset_id"
        case durationMs = "duration_ms"
        case documentRevisionId = "document_revision_id"
        case insertionAnchor = "insertion_anchor"
        case segments
    }
}

struct BackendTalkSpeculativeTrace {
    let reused: Bool
    let speculativeKey: String?
    let promptHash: String?

    static let none = BackendTalkSpeculativeTrace(
        reused: false,
        speculativeKey: nil,
        promptHash: nil
    )
}

struct BackendTalkResult {
    let audioURL: URL
    let streamedFirstSegment: Bool
    let streamedRemainderURL: URL?
    let audioDurationMs: Int?
    let renderContract: BackendTalkRenderContract
    let timingSource: String?
    let transcript: String?
    let reply: String?
    let screenplayOutput: BackendTalkScreenplayOutput?
    let screenplayQuality: BackendTalkScreenplayQuality?
    let screenplayCues: [BackendTalkScreenplayCue]
    let dialogueTimeline: BackendTalkDialogueTimelineRevision?
    let assistantSelfName: String?
    let userName: String?
    let uiReflection: BackendTalkUIReflection
    let knowledgeTrace: BackendTalkKnowledgeTrace
    let creativeMemoryTrace: BackendTalkCreativeMemoryTrace
    let screenplayTrace: BackendTalkScreenplayTrace
    let turnStatus: String
    let turnContinueReason: String?
    let turnErrorStage: String?
    let turnErrorMessage: String?
    let noteAction: BackendNoteCaptureAction?
    let emailAction: BackendEmailComposeAction?
    let calendarAction: BackendCalendarComposeAction?
    let taskAction: BackendTaskAction?
    let speculativeTrace: BackendTalkSpeculativeTrace
    let turnMetaRateLimitNotice: BackendTalkTurnMetaRateLimitNotice?
    let commit: BackendTurnCommitSignal?
}

struct BackendTalkRenderContract: Equatable {
    enum ReplyRole: String, Equatable {
        case preview
        case final
    }

    let replyRole: ReplyRole
    let authoritativePageTextAvailable: Bool
    let syncReady: Bool

    static let `default` = BackendTalkRenderContract(
        replyRole: .final,
        authoritativePageTextAvailable: false,
        syncReady: false
    )

    var previewReplyOnly: Bool {
        replyRole == .preview
    }

    func merged(with fallback: BackendTalkRenderContract?) -> BackendTalkRenderContract {
        guard let fallback else { return self }
        return BackendTalkRenderContract(
            replyRole: (replyRole == .preview || fallback.replyRole == .preview) ? .preview : .final,
            authoritativePageTextAvailable: authoritativePageTextAvailable || fallback.authoritativePageTextAvailable,
            syncReady: syncReady || fallback.syncReady
        )
    }
}

struct BackendTalkResponseMetadata {
    let audioDurationMs: Int?
    let renderContract: BackendTalkRenderContract
    let timingSource: String?
    let screenplayOutput: BackendTalkScreenplayOutput?
    let screenplayQuality: BackendTalkScreenplayQuality?
    let screenplayCues: [BackendTalkScreenplayCue]
    let dialogueTimeline: BackendTalkDialogueTimelineRevision?
    let creativeMemoryTrace: BackendTalkCreativeMemoryTrace
    let screenplayTrace: BackendTalkScreenplayTrace
    let reply: String?
}

struct BackendTalkDebugEvent {
    let stage: String
    let resolvedBaseURL: String?
    let requestURL: String?
    let clientTokenResolved: Bool?
    let errorDomain: String?
    let errorCode: Int?
    let errorDescription: String?
}

private struct BackendSpeculativePreparePayload: Decodable {
    let ok: Bool
    let action: String?
    let speculativeKey: String?
    let promptHash: String?

    enum CodingKeys: String, CodingKey {
        case ok
        case action
        case speculativeKey = "speculative_key"
        case promptHash = "prompt_hash"
    }
}

struct BackendSpeculativePrepareReceipt {
    let speculativeKey: String
    let promptHash: String
}

struct BackendRealtimeClientSecretPayload: Decodable {
    let value: String
    let expiresAt: TimeInterval
    let sessionExpiresAt: TimeInterval?

    enum CodingKeys: String, CodingKey {
        case value
        case expiresAt = "expires_at"
        case sessionExpiresAt = "session_expires_at"
    }
}

struct BackendRealtimeSessionPayload: Decodable {
    let type: String
    let model: String
    let voice: String
    let instructions: String
    let outputModalities: [String]

    enum CodingKeys: String, CodingKey {
        case type
        case model
        case voice
        case instructions
        case outputModalities = "output_modalities"
    }
}

struct BackendRealtimeBootstrapPayload: Decodable {
    let transport: String
    let realtimeProvider: String?
    let fallback: Bool?
    let fallbackReason: String?
    let primarySupplier: String?
    let assistantName: String?
    let model: String
    let voice: String
    let session: BackendRealtimeSessionPayload
    let clientSecret: BackendRealtimeClientSecretPayload
    let issuedAt: TimeInterval

    enum CodingKeys: String, CodingKey {
        case transport
        case realtimeProvider = "realtime_provider"
        case fallback
        case fallbackReason = "fallback_reason"
        case primarySupplier = "primary_supplier"
        case assistantName = "assistant_name"
        case model
        case voice
        case session
        case clientSecret = "client_secret"
        case issuedAt = "issued_at"
    }
}

struct BackendRealtimeUnavailable: Equatable {
    let statusCode: Int
    let stage: String
    let code: String
    let realtimeProvider: String?
    let fallback: Bool?
    let degraded: Bool
    let message: String

    var userMessage: String {
        let normalizedCode = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedCode == "realtime_stub_disabled_in_production" {
            return "Realtime preview is unavailable with the stub provider in production. Switch to Server Default or OpenAI, or use Standard voice."
        }
        if degraded {
            return "Realtime preview is temporarily unavailable. Standard voice still works."
        }
        let cleanMessage = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanMessage.isEmpty {
            return "Realtime preview is unavailable. Standard voice still works."
        }
        return "Realtime preview is unavailable: \(cleanMessage)"
    }
}

private struct BackendRealtimeUnavailablePayload: Decodable {
    let stage: String?
    let code: String?
    let realtimeProvider: String?
    let fallback: Bool?
    let degraded: Bool?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case stage
        case code
        case realtimeProvider = "realtime_provider"
        case fallback
        case degraded
        case error
    }
}

struct BackendRealtimeStudioRenderPayload: Decodable {
    let ok: Bool
    let action: String?
    let reply: String?
    let memoryApplied: BackendRealtimeStudioMemoryApplied?
    let screenplayQuality: BackendRealtimeStudioScreenplayQuality?

    enum CodingKeys: String, CodingKey {
        case ok
        case action
        case reply
        case memoryApplied = "memory_applied"
        case screenplayQuality = "screenplay_quality"
    }
}

private struct BackendRealtimeStudioRenderErrorPayload: Decodable {
    let stage: String?
    let error: String?
    let screenplayQuality: BackendRealtimeStudioScreenplayQuality?

    enum CodingKeys: String, CodingKey {
        case stage
        case error
        case screenplayQuality = "screenplay_quality"
    }
}

struct BackendRealtimeStudioScreenplayQuality: Decodable, Equatable, Sendable {
    let ok: Bool
    let reason: String
    let source: String
    let requestedPages: Int
    let attemptedRepair: Bool
    let repairOutcome: String
    let initialReason: String?
    let repairMs: Int
    let counts: [String: Int]
    let canonFactsChecked: Int
    let canonViolationCount: Int
    let canonViolationTypes: [String]
    let canonCorrectionOverride: Bool

    enum CodingKeys: String, CodingKey {
        case ok
        case reason
        case source
        case requestedPages = "requested_pages"
        case attemptedRepair = "attempted_repair"
        case repairOutcome = "repair_outcome"
        case initialReason = "initial_reason"
        case repairMs = "repair_ms"
        case counts
        case canonFactsChecked = "canon_facts_checked"
        case canonViolationCount = "canon_violation_count"
        case canonViolationTypes = "canon_violation_types"
        case canonCorrectionOverride = "canon_correction_override"
    }

    init(
        ok: Bool,
        reason: String,
        source: String,
        requestedPages: Int = 0,
        attemptedRepair: Bool = false,
        repairOutcome: String = "",
        initialReason: String? = nil,
        repairMs: Int = 0,
        counts: [String: Int] = [:],
        canonFactsChecked: Int = 0,
        canonViolationCount: Int = 0,
        canonViolationTypes: [String] = [],
        canonCorrectionOverride: Bool = false
    ) {
        self.ok = ok
        self.reason = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        self.source = source.trimmingCharacters(in: .whitespacesAndNewlines)
        self.requestedPages = max(0, requestedPages)
        self.attemptedRepair = attemptedRepair
        self.repairOutcome = repairOutcome.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let cleanInitialReason = initialReason?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.initialReason = cleanInitialReason?.isEmpty == true ? nil : cleanInitialReason
        self.repairMs = max(0, repairMs)
        self.counts = counts.filter { !$0.key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        self.canonFactsChecked = max(0, canonFactsChecked)
        self.canonViolationCount = max(0, canonViolationCount)
        self.canonViolationTypes = canonViolationTypes
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty }
        self.canonCorrectionOverride = canonCorrectionOverride
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.init(
            ok: try container.decodeIfPresent(Bool.self, forKey: .ok) ?? false,
            reason: try container.decodeIfPresent(String.self, forKey: .reason) ?? "",
            source: try container.decodeIfPresent(String.self, forKey: .source) ?? "",
            requestedPages: try container.decodeIfPresent(Int.self, forKey: .requestedPages) ?? 0,
            attemptedRepair: try container.decodeIfPresent(Bool.self, forKey: .attemptedRepair) ?? false,
            repairOutcome: try container.decodeIfPresent(String.self, forKey: .repairOutcome) ?? "",
            initialReason: try container.decodeIfPresent(String.self, forKey: .initialReason),
            repairMs: try container.decodeIfPresent(Int.self, forKey: .repairMs) ?? 0,
            counts: try container.decodeIfPresent([String: Int].self, forKey: .counts) ?? [:],
            canonFactsChecked: try container.decodeIfPresent(Int.self, forKey: .canonFactsChecked) ?? 0,
            canonViolationCount: try container.decodeIfPresent(Int.self, forKey: .canonViolationCount) ?? 0,
            canonViolationTypes: try container.decodeIfPresent([String].self, forKey: .canonViolationTypes) ?? [],
            canonCorrectionOverride: try container.decodeIfPresent(Bool.self, forKey: .canonCorrectionOverride) ?? false
        )
    }

    var talkQuality: BackendTalkScreenplayQuality {
        BackendTalkScreenplayQuality(
            ok: ok,
            reason: reason,
            source: source,
            confidence: repairOutcome,
            counts: counts
        )
    }

    var permitsSingleFallbackRender: Bool {
        repairOutcome == "supplier_failed" || repairOutcome == "unavailable"
    }
}

struct BackendRealtimeStudioMemoryApplied: Decodable, Equatable, Hashable, Sendable {
    let creativeMemory: Bool?
    let characterBible: Bool?
    let characterCorrections: Bool?
    let correctionAppliedToPrompt: Bool?
    let characters: [String]?
    let correctedTerms: [String]?
    let correctionReplacements: [String]?
    let acceptedCausalFacts: Int?

    enum CodingKeys: String, CodingKey {
        case creativeMemory = "creative_memory"
        case characterBible = "character_bible"
        case characterCorrections = "character_corrections"
        case correctionAppliedToPrompt = "correction_applied_to_prompt"
        case characters
        case correctedTerms = "corrected_terms"
        case correctionReplacements = "correction_replacements"
        case acceptedCausalFacts = "accepted_causal_facts"
    }

    var hasSignal: Bool {
        creativeMemory == true ||
        characterBible == true ||
        characterCorrections == true ||
        correctionAppliedToPrompt == true ||
        !(characters ?? []).isEmpty ||
        !(correctedTerms ?? []).isEmpty ||
        !(correctionReplacements ?? []).isEmpty ||
        (acceptedCausalFacts ?? 0) > 0
    }
}

struct BackendRealtimeStudioRenderResult: Equatable, Sendable {
    let reply: String
    let memoryApplied: BackendRealtimeStudioMemoryApplied?
    let screenplayQuality: BackendRealtimeStudioScreenplayQuality?
}

private struct BackendRealtimeStudioRenderStreamEvent: Decodable {
    let action: String?
    let kind: String?
    let delta: String?
    let reply: String?
    let error: String?
    let stage: String?
    let requestID: String?
    let startedAtISO8601: String?
    let firstDeltaMs: Int?
    let totalMs: Int?
    let deltaChunks: Int?
    let memoryApplied: BackendRealtimeStudioMemoryApplied?
    let screenplayQuality: BackendRealtimeStudioScreenplayQuality?

    enum CodingKeys: String, CodingKey {
        case action
        case kind
        case delta
        case reply
        case error
        case stage
        case requestID = "request_id"
        case startedAtISO8601 = "started_at"
        case firstDeltaMs = "first_delta_ms"
        case totalMs = "total_ms"
        case deltaChunks = "delta_chunks"
        case memoryApplied = "memory_applied"
        case screenplayQuality = "screenplay_quality"
    }
}

struct BackendRealtimeStudioRenderStreamTrace: Sendable {
    let action: String
    let kind: String
    let requestID: String
    let startedAtISO8601: String?
    let firstDeltaMs: Int?
    let totalMs: Int?
    let deltaChunks: Int?
    let memoryApplied: BackendRealtimeStudioMemoryApplied?
    let screenplayQuality: BackendRealtimeStudioScreenplayQuality?
}

struct BackendVisualContextEnvelope {
    let summary: String
    let promptAddendum: String
    let appName: String
    let windowTitle: String
    let source: String
    let capturedAt: TimeInterval
}

private struct BackendVisualContextPayload: Decodable {
    let ok: Bool
    let summary: String?
    let promptAddendum: String?
    let appName: String?
    let windowTitle: String?
    let source: String?
    let capturedAt: TimeInterval?

    enum CodingKeys: String, CodingKey {
        case ok
        case summary
        case promptAddendum = "prompt_addendum"
        case appName = "app_name"
        case windowTitle = "window_title"
        case source
        case capturedAt = "captured_at"
    }
}

struct BackendNoteCaptureAction {
    let captured: Bool
    let status: String
    let target: String
    let title: String?
    let noteText: String?
    let createdAt: TimeInterval?
    let path: String?
    let fallbackFrom: String?
    let error: String?
}

struct BackendEmailComposeAction {
    let action: String
    let status: String
    let target: String
    let to: String?
    let subject: String?
    let composeURL: URL?
    let composed: Bool
}

struct BackendCalendarComposeAction {
    let action: String
    let status: String
    let target: String
    let title: String?
    let startAt: TimeInterval?
    let endAt: TimeInterval?
    let composeURL: URL?
    let composed: Bool
}

struct BackendTaskAction {
    let action: String
    let status: String
    let taskID: String?
    let title: String?
    let priority: String?
    let dueAt: TimeInterval?
    let completedAt: TimeInterval?
}

enum BackendError: LocalizedError {
    case stage(String, String)
    case http(Int, String)
    case realtimeUnavailable(BackendRealtimeUnavailable)
    case studioRenderQuality(BackendRealtimeStudioScreenplayQuality, String)
    case continueListening
    case emptyAudio
    case invalidAudioType(String)

    var requiresUserAuthentication: Bool {
        switch self {
        case let .stage(stage, message):
            let normalizedStage = stage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let normalizedMessage = message.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return normalizedStage == "auth_user" ||
                normalizedMessage == "user_auth_required" ||
                normalizedMessage == "expired_user_token" ||
                normalizedMessage == "invalid_user_token" ||
                normalizedMessage == "revoked_user_token"
        case let .http(status, message):
            return status == 401 && message.lowercased().contains("user_auth")
        case .realtimeUnavailable:
            return false
        case .studioRenderQuality:
            return false
        default:
            return false
        }
    }

    var errorDescription: String? {
        switch self {
        case let .stage(stage, message):
            if requiresUserAuthentication {
                return "Sign in to use live writing, voice, and visual context."
            }
            let label: String
            switch stage.lowercased() {
            case "auth_client":
                label = "Session"
            case "stt":
                label = "Voice capture"
            case "chat":
                label = "Response"
            case "tts":
                label = "Voice playback"
            case "upload":
                label = "Upload"
            case "session":
                label = "Session"
            case "studio_render":
                label = "Studio render"
            case "visual_context":
                label = "Visual context"
            default:
                label = stage.uppercased()
            }
            return "\(label) error: \(message)"
        case let .http(status, message):
            return "HTTP \(status): \(BackendErrorMessageSanitizer.displayMessage(message, status: status))"
        case let .realtimeUnavailable(unavailable):
            return unavailable.userMessage
        case .studioRenderQuality:
            return "Clementine held this page back because it did not pass the screenplay quality check. Your draft is unchanged."
        case .continueListening:
            return "Continue listening."
        case .emptyAudio:
            return "Backend returned empty audio."
        case let .invalidAudioType(type):
            return "Backend returned non-audio response (\(type))."
        }
    }
}

nonisolated enum BackendErrorMessageSanitizer {
    static func displayMessage(
        from data: Data,
        status: Int? = nil,
        fallback: String = "Request failed."
    ) -> String {
        let raw = String(data: data, encoding: .utf8) ?? ""
        return displayMessage(raw, status: status, fallback: fallback)
    }

    static func displayMessage(
        _ raw: String,
        status: Int? = nil,
        fallback: String = "Request failed."
    ) -> String {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return fallback }
        if looksLikeHTML(trimmed) {
            if let status, status >= 500 {
                return "Backend service unavailable. Please try again."
            }
            return "Backend returned an HTML error page."
        }
        if trimmed.count > 500 {
            return "\(trimmed.prefix(500))..."
        }
        return trimmed
    }

    private static func looksLikeHTML(_ raw: String) -> Bool {
        let normalized = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return normalized.hasPrefix("<!doctype html")
            || normalized.hasPrefix("<html")
            || normalized.contains("<head>")
            || normalized.contains("<body")
    }
}

nonisolated enum BackendAPIResponseValidator {
    static func hasMatchingOrigin(requestURL: URL?, responseURL: URL?) -> Bool {
        guard let requestURL,
              let responseURL,
              let requestScheme = requestURL.scheme?.lowercased(),
              let responseScheme = responseURL.scheme?.lowercased(),
              let requestHost = requestURL.host?.lowercased(),
              let responseHost = responseURL.host?.lowercased() else {
            return false
        }
        return requestScheme == responseScheme
            && requestHost == responseHost
            && effectivePort(for: requestURL) == effectivePort(for: responseURL)
    }

    static func isJSONResponse(_ response: HTTPURLResponse, data: Data) -> Bool {
        let mimeType = (response.mimeType ?? "").lowercased()
        if mimeType == "application/json" || mimeType.hasSuffix("+json") {
            return true
        }
        return (try? JSONSerialization.jsonObject(with: data)) != nil
    }

    static func isHealthyResponse(
        requestURL: URL?,
        response: HTTPURLResponse,
        data: Data
    ) -> Bool {
        guard hasMatchingOrigin(requestURL: requestURL, responseURL: response.url) else {
            return false
        }
        guard response.statusCode == 304 || (200...299).contains(response.statusCode) else {
            return false
        }
        if response.statusCode == 304 {
            return true
        }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           object["ok"] as? Bool == true {
            return true
        }
        let text = String(data: data, encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return text == "ok"
    }

    private static func effectivePort(for url: URL) -> Int? {
        if let port = url.port { return port }
        switch url.scheme?.lowercased() {
        case "http": return 80
        case "https": return 443
        default: return nil
        }
    }
}

final class BackendClient {
    private static let craftSchemaVersion = 1
    private static let sharedBackendBaseURLDefaultsKeyStatic = "backend_base_url"
    private var baseURL: URL
    private let fallbackURL: URL
    private let urlSession: URLSession
    private let shouldPersistBackendBaseURL: Bool
    private let shouldAttachUserIDHeader: Bool
    private let devFallbackAppToken: String? = {
#if DEBUG
        "them-dev"
#else
        nil
#endif
    }()
    private let maxUploadBytes = 25 * 1024 * 1024
    private let requestTimeout: TimeInterval = 40
    private let preferStreamedTalkAudio = true
    private let sessionRefreshSkew: TimeInterval = 30
    private let maxTalkAttempts = 2
    private let maxAudioValidationRetries = 1
    private let minPlayableSegmentBytes = 900
    private let streamChunkFlushBytes = 4096
    private let retryableHTTPStatus: Set<Int> = [408, 425, 429, 500, 502, 503, 504]
    private let retryableURLErrors: Set<URLError.Code> = [
        .timedOut,
        .networkConnectionLost,
        .cannotConnectToHost,
        .cannotFindHost,
        .dnsLookupFailed,
        .notConnectedToInternet,
        .internationalRoamingOff,
        .callIsActive,
        .dataNotAllowed,
    ]

    private let keychainService = "io.them.client"
    private let keychainTokenAccount = "session_client_token"
    private let keychainExpiryAccount = "session_client_token_expiry"
    private let sharedBackendBaseURLDefaultsKey = "backend_base_url"
    private let personaFlowKey = "clementine"

    private var cachedClientToken: String?
    private var cachedClientTokenExpiry: Date?
    private var cachedUserID: String?

    // Health check cache — avoids a full /health round-trip before every /talk
    private let healthCacheTTL: TimeInterval = 30
    private var cachedHealthyURL: URL?
    private var cachedHealthyAt: Date = .distantPast

    private static var defaultPrimaryBaseURL: URL {
        BackendDefaultBaseURLPolicy.currentPrimaryBaseURL
    }

    private static var defaultFallbackBaseURL: URL {
        BackendDefaultBaseURLPolicy.currentFallbackBaseURL
    }

    init(
        baseURL: URL = BackendClient.resolveURL(
            fromEnv: "BACKEND_URL",
            infoPlistKey: "BACKEND_URL",
            fallback: BackendClient.defaultPrimaryBaseURL
        ),
        fallbackURL: URL = BackendClient.resolveURL(
            fromEnv: "BACKEND_FALLBACK_URL",
            infoPlistKey: "BACKEND_FALLBACK_URL",
            fallback: BackendClient.defaultFallbackBaseURL
        ),
        urlSession: URLSession = .shared,
        persistBackendBaseURL: Bool = true,
        attachUserIDHeader: Bool = true
    ) {
        self.baseURL = baseURL
        self.fallbackURL = fallbackURL
        self.urlSession = urlSession
        self.shouldPersistBackendBaseURL = persistBackendBaseURL
        self.shouldAttachUserIDHeader = attachUserIDHeader
        persistSharedBackendBaseURL(baseURL)
    }

    func health() async throws -> Bool {
        if await isHealthy(baseURL) {
            persistSharedBackendBaseURL(baseURL)
            return true
        }
        if await isHealthy(fallbackURL) {
            baseURL = fallbackURL
            persistSharedBackendBaseURL(fallbackURL)
            return true
        }
        throw BackendError.http(-1, "Server offline")
    }

    func fetchCraftFrameworks() async throws -> ScreenplayCraftFrameworkListResponse {
        try await performCraftRequest(
            pathComponents: ["craft", "frameworks"],
            responseType: ScreenplayCraftFrameworkListResponse.self
        )
    }

    func fetchCraftFramework(id frameworkId: String) async throws -> ScreenplayCraftFramework {
        try await performCraftRequest(
            pathComponents: ["craft", "frameworks", try requiredCraftPathValue(frameworkId, field: "frameworkId")],
            responseType: ScreenplayCraftFramework.self
        )
    }

    func fetchCraftReportSchema() async throws -> ScreenplayCraftSchemaDocument {
        try await performCraftRequest(
            pathComponents: ["craft", "schemas", "report"],
            responseType: ScreenplayCraftSchemaDocument.self
        )
    }

    func fetchCraftFrameworkSchema() async throws -> ScreenplayCraftSchemaDocument {
        try await performCraftRequest(
            pathComponents: ["craft", "schemas", "framework"],
            responseType: ScreenplayCraftSchemaDocument.self
        )
    }

    func fetchCraftReport(
        projectId: String,
        versionId: String? = nil
    ) async throws -> ScreenplayCraftReport {
        var components = [
            "craft",
            "reports",
            try requiredCraftPathValue(projectId, field: "projectId")
        ]
        if let versionId = try optionalCraftPathValue(versionId, field: "versionId") {
            components.append(versionId)
        }
        return try await performCraftRequest(
            pathComponents: components,
            responseType: ScreenplayCraftReport.self
        )
    }

    func fetchCraftSnapshot(
        projectId: String,
        versionId: String? = nil
    ) async throws -> ScreenplayCraftSnapshotReference? {
        try await fetchCraftReport(projectId: projectId, versionId: versionId).snapshot
    }

    func analyzeCraft(
        projectId: String,
        versionId: String? = nil,
        frameworkId: String? = nil,
        screenplay: ScreenplayCraftAnalysisScreenplay
    ) async throws -> ScreenplayCraftReport {
        let request = ScreenplayCraftAnalysisRequest(
            projectId: try requiredCraftBodyValue(projectId, field: "projectId"),
            versionId: try optionalCraftBodyValue(versionId, field: "versionId"),
            frameworkId: try optionalCraftBodyValue(frameworkId, field: "frameworkId"),
            screenplay: screenplay
        )
        return try await performCraftRequest(
            method: "POST",
            pathComponents: ["craft", "analyze"],
            body: request,
            responseType: ScreenplayCraftReport.self
        )
    }

    func distillCraftLogline(
        text: String,
        projectId: String,
        versionId: String? = nil,
        frameworkId: String? = nil
    ) async throws -> ScreenplayCraftLoglineDistillResponse {
        let request = ScreenplayCraftLoglineDistillRequest(
            text: try requiredCraftBodyValue(text, field: "text"),
            projectId: try requiredCraftBodyValue(projectId, field: "projectId"),
            versionId: try optionalCraftBodyValue(versionId, field: "versionId"),
            frameworkId: try optionalCraftBodyValue(frameworkId, field: "frameworkId")
        )
        return try await performCraftRequest(
            method: "POST",
            pathComponents: ["craft", "logline", "distill"],
            body: request,
            responseType: ScreenplayCraftLoglineDistillResponse.self
        )
    }

    func fetchCraftLoglineDrift(
        projectId: String,
        currentLogline: String? = nil
    ) async throws -> ScreenplayCraftLoglineDriftResponse {
        var queryItems = [
            URLQueryItem(name: "projectId", value: try requiredCraftBodyValue(projectId, field: "projectId"))
        ]
        if let current = try optionalCraftBodyValue(currentLogline, field: "currentLogline") {
            queryItems.append(URLQueryItem(name: "currentLogline", value: current))
        }
        return try await performCraftRequest(
            pathComponents: ["craft", "logline", "drift"],
            queryItems: queryItems,
            responseType: ScreenplayCraftLoglineDriftResponse.self
        )
    }

    func fetchCraftLoglineHistory(
        projectId: String
    ) async throws -> ScreenplayCraftLoglineHistoryResponse {
        try await performCraftRequest(
            pathComponents: ["craft", "logline", "history"],
            queryItems: [URLQueryItem(name: "projectId", value: try requiredCraftBodyValue(projectId, field: "projectId"))],
            responseType: ScreenplayCraftLoglineHistoryResponse.self
        )
    }

    func suggestCraftTwists(
        frameworkId: String,
        currentBeatId: String,
        sceneSummary: String? = nil,
        count: Int? = 3
    ) async throws -> ScreenplayCraftTwistSuggestResponse {
        let request = ScreenplayCraftTwistSuggestRequest(
            frameworkId: try requiredCraftBodyValue(frameworkId, field: "frameworkId"),
            currentBeatId: try requiredCraftBodyValue(currentBeatId, field: "currentBeatId"),
            sceneSummary: try optionalCraftBodyValue(sceneSummary, field: "sceneSummary"),
            count: count
        )
        return try await performCraftRequest(
            method: "POST",
            pathComponents: ["craft", "twist", "suggest"],
            body: request,
            responseType: ScreenplayCraftTwistSuggestResponse.self
        )
    }

    func recordAcceptedCraftTwist(
        projectId: String,
        versionId: String? = nil,
        frameworkId: String? = nil,
        beatId: String? = nil,
        twist: ScreenplayCraftTwistSuggestion,
        sceneId: String? = nil,
        note: String? = nil
    ) async throws -> ScreenplayCraftAcceptedTwistResponse {
        _ = try requiredCraftBodyValue(twist.id, field: "twist.id")
        let request = ScreenplayCraftAcceptedTwistRequest(
            projectId: try requiredCraftBodyValue(projectId, field: "projectId"),
            versionId: try optionalCraftBodyValue(versionId, field: "versionId"),
            frameworkId: try optionalCraftBodyValue(frameworkId, field: "frameworkId"),
            beatId: try optionalCraftBodyValue(beatId, field: "beatId"),
            twist: twist,
            sceneId: try optionalCraftBodyValue(sceneId, field: "sceneId"),
            note: try optionalCraftBodyValue(note, field: "note")
        )
        return try await performCraftRequest(
            method: "POST",
            pathComponents: ["craft", "twist", "accepted"],
            body: request,
            responseType: ScreenplayCraftAcceptedTwistResponse.self
        )
    }

    func fetchAcceptedCraftTwists(
        projectId: String
    ) async throws -> ScreenplayCraftAcceptedTwistListResponse {
        try await performCraftRequest(
            pathComponents: ["craft", "twist", "accepted"],
            queryItems: [URLQueryItem(name: "projectId", value: try requiredCraftBodyValue(projectId, field: "projectId"))],
            responseType: ScreenplayCraftAcceptedTwistListResponse.self
        )
    }

    func deleteAcceptedCraftTwist(
        twistId: String,
        projectId: String,
        versionId: String? = nil
    ) async throws -> ScreenplayCraftAcceptedTwistDeleteResponse {
        var queryItems = [
            URLQueryItem(name: "projectId", value: try requiredCraftBodyValue(projectId, field: "projectId"))
        ]
        if let versionId = try optionalCraftBodyValue(versionId, field: "versionId") {
            queryItems.append(URLQueryItem(name: "versionId", value: versionId))
        }
        return try await performCraftRequest(
            method: "DELETE",
            pathComponents: ["craft", "twist", "accepted", try requiredCraftPathValue(twistId, field: "twistId")],
            queryItems: queryItems,
            responseType: ScreenplayCraftAcceptedTwistDeleteResponse.self
        )
    }

    func fetchMemoryBlockSignal() async throws -> BackendBlockSignalResponse {
        persistSharedBackendBaseURL(baseURL)
        var url = baseURL
        url.appendPathComponent("memory")
        url.appendPathComponent("block-signal")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if shouldAttachUserIDHeader {
            let userID = resolveUserID()
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid block-signal response.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let stageError = parseStageError(from: data) {
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }
        do {
            return try JSONDecoder().decode(BackendBlockSignalResponse.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid block-signal payload." : raw)
        }
    }

    func fetchMemoryBlockSignalHistory() async throws -> BackendBlockSignalHistoryResponse {
        persistSharedBackendBaseURL(baseURL)
        var url = baseURL
        url.appendPathComponent("memory")
        url.appendPathComponent("block-signal")
        url.appendPathComponent("history")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if shouldAttachUserIDHeader {
            let userID = resolveUserID()
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid block-signal history response.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let stageError = parseStageError(from: data) {
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }
        do {
            return try JSONDecoder().decode(BackendBlockSignalHistoryResponse.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid block-signal history payload." : raw)
        }
    }


    func fetchMemoryCharacterTraits(
        characterName: String? = nil,
        projectID: String? = nil,
        projectTitle: String? = nil
    ) async throws -> BackendCharacterTraitsResponse {
        persistSharedBackendBaseURL(baseURL)
        var url = baseURL
        url.appendPathComponent("memory")
        url.appendPathComponent("character-traits")

        let normalizedName = characterName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let normalizedProjectID = projectID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let normalizedProjectTitle = projectTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !normalizedName.isEmpty || !normalizedProjectID.isEmpty || !normalizedProjectTitle.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.queryItems = [
                normalizedName.isEmpty ? nil : URLQueryItem(name: "characterName", value: normalizedName),
                normalizedProjectID.isEmpty ? nil : URLQueryItem(name: "projectId", value: normalizedProjectID),
                normalizedProjectTitle.isEmpty ? nil : URLQueryItem(name: "projectTitle", value: normalizedProjectTitle)
            ].compactMap { $0 }
            if let componentURL = components?.url {
                url = componentURL
            }
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if shouldAttachUserIDHeader {
            let userID = resolveUserID()
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid character-traits response.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let stageError = parseStageError(from: data) {
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }
        do {
            return try JSONDecoder().decode(BackendCharacterTraitsResponse.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid character-traits payload." : raw)
        }
    }

    func fetchMemoryCharacterArchetypes() async throws -> BackendCharacterArchetypesResponse {
        persistSharedBackendBaseURL(baseURL)
        var url = baseURL
        url.appendPathComponent("memory")
        url.appendPathComponent("character-archetypes")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if shouldAttachUserIDHeader {
            let userID = resolveUserID()
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid character-archetypes response.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let stageError = parseStageError(from: data) {
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }
        do {
            return try JSONDecoder().decode(BackendCharacterArchetypesResponse.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid character-archetypes payload." : raw)
        }
    }

    func lintCraftFormat(
        text: String,
        frameworkId: String? = nil
    ) async throws -> ScreenplayFormatLintReport {
        let request = ScreenplayFormatLintRequest(
            text: try requiredCraftBodyValue(text, field: "text"),
            frameworkId: try optionalCraftBodyValue(frameworkId, field: "frameworkId")
        )
        return try await performCraftRequest(
            method: "POST",
            pathComponents: ["craft", "format", "lint"],
            body: request,
            responseType: ScreenplayFormatLintReport.self
        )
    }

    func recordCraftTurnOverride(
        _ override: ScreenplayCraftTurnOverrideMutation
    ) async throws -> ScreenplayCraftTurnOverride {
        _ = try requiredCraftBodyValue(override.turnId, field: "turnId")
        _ = try requiredCraftBodyValue(override.action, field: "action")
        return try await performCraftRequest(
            method: "POST",
            pathComponents: ["craft", "overrides"],
            body: override,
            responseType: ScreenplayCraftTurnOverride.self
        )
    }

    func deleteCraftTurnOverride(id overrideId: String) async throws -> Bool {
        let response: ScreenplayCraftDeleteOverrideResponse = try await performCraftRequest(
            method: "DELETE",
            pathComponents: ["craft", "overrides", try requiredCraftPathValue(overrideId, field: "overrideId")],
            responseType: ScreenplayCraftDeleteOverrideResponse.self
        )
        return response.ok
    }

    func buildScreenplayModelPrompt(
        _ promptRequest: BackendScreenplayPromptBuildRequest
    ) async throws -> BackendScreenplayPromptBuildResponse {
        let resolvedBaseURL = baseURL
        persistSharedBackendBaseURL(resolvedBaseURL)
        let userID = resolveUserID()
        let bodyData = try JSONEncoder().encode(promptRequest)
        let promptClientToken: String? = {
            let trimmed = (readSharedClientToken() ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            guard let expiryRaw = readSharedClientTokenExpiry(),
                  let expiry = ISO8601DateFormatter().date(from: expiryRaw) else {
                return trimmed
            }
            return expiry.timeIntervalSince(Date()) > sessionRefreshSkew ? trimmed : nil
        }()

        func performRequest(
            clientToken: String?,
            allowClientTokenRefresh: Bool
        ) async throws -> BackendScreenplayPromptBuildResponse {
            var request = URLRequest(
                url: resolvedBaseURL
                    .appendingPathComponent("screenplay")
                    .appendingPathComponent("prompt")
                    .appendingPathComponent("build")
            )
            request.httpMethod = "POST"
            request.timeoutInterval = min(6, requestTimeout)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
            if let clientToken, !clientToken.isEmpty {
                request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
            }
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
            if let token = appToken() {
                request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
            }
            attachAuthorizationHeader(to: &request)
            request.httpBody = bodyData

            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw BackendError.http(-1, "Invalid screenplay prompt response.")
            }
            guard (200...299).contains(http.statusCode) else {
                let parsedStageError = parseStageError(from: data)
                if let stageError = parsedStageError {
                    if allowClientTokenRefresh,
                       isUserAuthStage(stageError.stage),
                       await refreshUserAuthForRetryIfPossible() {
                        return try await performRequest(clientToken: clientToken, allowClientTokenRefresh: false)
                    }
                    if allowClientTokenRefresh, stageError.stage.lowercased() == "auth_client" {
                        clearSessionToken()
                        let refreshed = try await refreshClientToken(for: resolvedBaseURL, userID: userID)
                        return try await performRequest(clientToken: refreshed, allowClientTokenRefresh: false)
                    }
                    throw BackendError.stage(stageError.stage, stageError.message)
                }
                if http.statusCode == 401,
                   allowClientTokenRefresh,
                   !isUserAuthStage(parsedStageError?.stage ?? "") {
                    clearSessionToken()
                    let refreshed = try await refreshClientToken(for: resolvedBaseURL, userID: userID)
                    return try await performRequest(clientToken: refreshed, allowClientTokenRefresh: false)
                }
                let raw = String(data: data, encoding: .utf8) ?? ""
                throw BackendError.http(http.statusCode, raw)
            }

            do {
                return try JSONDecoder().decode(BackendScreenplayPromptBuildResponse.self, from: data)
            } catch {
                let raw = String(data: data, encoding: .utf8) ?? ""
                throw BackendError.http(502, raw.isEmpty ? "Invalid screenplay prompt payload." : raw)
            }
        }

        return try await performRequest(clientToken: promptClientToken, allowClientTokenRefresh: true)
    }

    func talk(
        fileURL: URL,
        fileDataOverride: Data? = nil,
        systemPrompt: String? = nil,
        stage: Int? = nil,
        depthScore: Double? = nil,
        romanceTension: Double? = nil,
        sessionCount: Int? = nil,
        personaPreset: String? = nil,
        memoryCue: String? = nil,
        idempotencyKey: String? = nil,
        tailSilenceMs: Int? = nil,
        vadThreshold: Float? = nil,
        speechMs: Int? = nil,
        noiseFloorRms: Float? = nil,
        speechRms: Float? = nil,
        userName: String? = nil,
        partialTranscriptHint: String? = nil,
        speculativeReuseKey: String? = nil,
        speculativePromptHash: String? = nil,
        studioMetadata: BackendStudioThreadCommitMetadata? = nil,
        clientTranscriptOverride: String? = nil,
        screenplayGenerationTranscriptOverride: String? = nil,
        onResponseMetadataReady: ((BackendTalkResponseMetadata) -> Void)? = nil,
        onFirstAudioSegmentReady: ((URL) -> Void)? = nil,
        onTextReady: ((String) -> Void)? = nil,
        onDebugEvent: ((BackendTalkDebugEvent) -> Void)? = nil
    ) async throws -> BackendTalkResult {
        do {
            let resolvedBaseURL = try await resolveBaseURL()
            onDebugEvent?(
                BackendTalkDebugEvent(
                    stage: "resolve_base_url_ok",
                    resolvedBaseURL: resolvedBaseURL.absoluteString,
                    requestURL: nil,
                    clientTokenResolved: nil,
                    errorDomain: nil,
                    errorCode: nil,
                    errorDescription: nil
                )
            )
            let userID = resolveUserID()
            let clientToken = try await resolveTalkClientTokenOrFallback(
                for: resolvedBaseURL,
                userID: userID,
                onDebugEvent: onDebugEvent
            )
            let stableIdempotencyKey = normalizedIdempotencyKey(idempotencyKey) ?? "ios-\(UUID().uuidString)"
            return try await performTalk(
                fileURL: fileURL,
                fileDataOverride: fileDataOverride,
                baseURL: resolvedBaseURL,
                userID: userID,
                clientToken: clientToken,
                systemPrompt: systemPrompt,
                stage: stage,
                depthScore: depthScore,
                romanceTension: romanceTension,
                sessionCount: sessionCount,
                personaPreset: personaPreset,
                memoryCue: memoryCue,
                idempotencyKey: stableIdempotencyKey,
                tailSilenceMs: tailSilenceMs,
                vadThreshold: vadThreshold,
                speechMs: speechMs,
                noiseFloorRms: noiseFloorRms,
                speechRms: speechRms,
                userName: userName,
                partialTranscriptHint: partialTranscriptHint,
                speculativeReuseKey: speculativeReuseKey,
                speculativePromptHash: speculativePromptHash,
                studioMetadata: studioMetadata,
                clientTranscriptOverride: clientTranscriptOverride,
                screenplayGenerationTranscriptOverride: screenplayGenerationTranscriptOverride,
                onResponseMetadataReady: onResponseMetadataReady,
                onFirstAudioSegmentReady: onFirstAudioSegmentReady,
                onTextReady: onTextReady,
                onDebugEvent: onDebugEvent,
                allowClientTokenRefresh: true,
                allowAudioValidationRetry: maxAudioValidationRetries > 0,
                forceNoStreamAudio: false
            )
        } catch {
            let nsError = error as NSError
            onDebugEvent?(
                BackendTalkDebugEvent(
                    stage: "talk_dispatch_failed",
                    resolvedBaseURL: nil,
                    requestURL: nil,
                    clientTokenResolved: nil,
                    errorDomain: nsError.domain,
                    errorCode: nsError.code,
                    errorDescription: error.localizedDescription
                )
            )
            throw error
        }
    }

    func talkText(
        transcript: String,
        systemPrompt: String? = nil,
        stage: Int? = nil,
        depthScore: Double? = nil,
        romanceTension: Double? = nil,
        sessionCount: Int? = nil,
        personaPreset: String? = nil,
        memoryCue: String? = nil,
        idempotencyKey: String? = nil,
        userName: String? = nil,
        onResponseMetadataReady: ((BackendTalkResponseMetadata) -> Void)? = nil,
        onFirstAudioSegmentReady: ((URL) -> Void)? = nil,
        onTextReady: ((String) -> Void)? = nil
    ) async throws -> BackendTalkResult {
        let cleanTranscript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTranscript.isEmpty else {
            throw BackendError.stage("stt", "Prompt text is empty.")
        }

        let resolvedBaseURL = baseURL
        persistSharedBackendBaseURL(resolvedBaseURL)
        let userID = resolveUserID()
        let clientToken = try await resolveTalkClientTokenOrFallback(
            for: resolvedBaseURL,
            userID: userID,
            onDebugEvent: nil
        )
        let stableIdempotencyKey = normalizedIdempotencyKey(idempotencyKey) ?? "ios-text-\(UUID().uuidString)"
        let silentUploadURL = try makeSilentTalkUploadFile()
        defer { try? FileManager.default.removeItem(at: silentUploadURL) }

        return try await performTalk(
            fileURL: silentUploadURL,
            fileDataOverride: nil,
            baseURL: resolvedBaseURL,
            userID: userID,
            clientToken: clientToken,
            systemPrompt: systemPrompt,
            stage: stage,
            depthScore: depthScore,
            romanceTension: romanceTension,
            sessionCount: sessionCount,
            personaPreset: personaPreset,
            memoryCue: memoryCue,
            idempotencyKey: stableIdempotencyKey,
            tailSilenceMs: nil,
            vadThreshold: nil,
            speechMs: nil,
            noiseFloorRms: nil,
            speechRms: nil,
            userName: userName,
            partialTranscriptHint: nil,
            speculativeReuseKey: nil,
            speculativePromptHash: nil,
            studioMetadata: nil,
            clientTranscriptOverride: cleanTranscript,
            screenplayGenerationTranscriptOverride: nil,
            onResponseMetadataReady: onResponseMetadataReady,
            onFirstAudioSegmentReady: onFirstAudioSegmentReady,
            onTextReady: onTextReady,
            onDebugEvent: nil,
            allowClientTokenRefresh: true,
            allowAudioValidationRetry: maxAudioValidationRetries > 0,
            forceNoStreamAudio: false
        )
    }

    func prewarmTalkSession() async throws {
        let resolvedBaseURL = baseURL
        persistSharedBackendBaseURL(resolvedBaseURL)
        let userID = resolveUserID()
        _ = try await resolveClientToken(for: resolvedBaseURL, userID: userID)
    }

    func prepareSpeculativeTalk(
        audioSnapshot: Data,
        systemPrompt: String,
        userName: String?,
        partialTranscriptHint: String?,
        speculativeKey: String,
        speculativePromptHash: String
    ) async throws -> BackendSpeculativePrepareReceipt {
        let cleanKey = speculativeKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPromptHash = speculativePromptHash.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanKey.isEmpty, !cleanPromptHash.isEmpty else {
            throw BackendError.stage("speculative_prepare", "Missing speculative key or prompt hash.")
        }

        let resolvedBaseURL = try await resolveBaseURL()
        let userID = resolveUserID()
        let clientToken = try await resolveClientToken(for: resolvedBaseURL, userID: userID)
        let boundary = "Boundary-\(UUID().uuidString)"
        let audioURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("them_speculative_\(UUID().uuidString).wav")
        try audioSnapshot.write(to: audioURL, options: [.atomic])
        defer { try? FileManager.default.removeItem(at: audioURL) }

        var request = URLRequest(url: resolvedBaseURL.appendingPathComponent("talk"))
        request.httpMethod = "POST"
        request.timeoutInterval = requestTimeout
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("off", forHTTPHeaderField: "X-Talk-Stream")
        request.setValue("prepare", forHTTPHeaderField: "X-Speculative-Mode")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        if !userID.isEmpty {
            request.setValue(userID, forHTTPHeaderField: "X-User-Id")
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let uploadMeta = uploadMetadata(for: audioURL, data: audioSnapshot)
        var body = Data()
        if let prompt = normalizedSystemPrompt(systemPrompt) {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"system_prompt\"\r\n\r\n")
            body.appendString(prompt)
            body.appendString("\r\n")
        }
        let cleanUserName = String(userName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanUserName.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"user_name\"\r\n\r\n")
            body.appendString(String(cleanUserName.prefix(48)))
            body.appendString("\r\n")
        }
        let partialHint = String(partialTranscriptHint ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !partialHint.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"partial_transcript_hint\"\r\n\r\n")
            body.appendString(String(partialHint.prefix(320)))
            body.appendString("\r\n")
        }
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"speculative_mode\"\r\n\r\n")
        body.appendString("prepare")
        body.appendString("\r\n")
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"speculative_key\"\r\n\r\n")
        body.appendString(String(cleanKey.prefix(96)))
        body.appendString("\r\n")
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"speculative_prompt_hash\"\r\n\r\n")
        body.appendString(String(cleanPromptHash.prefix(32)))
        body.appendString("\r\n")
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"file\"; filename=\"\(uploadMeta.filename)\"\r\n")
        body.appendString("Content-Type: \(uploadMeta.mimeType)\r\n\r\n")
        body.append(audioSnapshot)
        body.appendString("\r\n")
        body.appendString("--\(boundary)--\r\n")
        request.httpBody = body

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid speculative prepare response.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let stageError = parseStageError(from: data) {
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }

        let payload: BackendSpeculativePreparePayload
        do {
            payload = try JSONDecoder().decode(BackendSpeculativePreparePayload.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid speculative prepare payload." : raw)
        }

        return BackendSpeculativePrepareReceipt(
            speculativeKey: (payload.speculativeKey ?? cleanKey).trimmingCharacters(in: .whitespacesAndNewlines),
            promptHash: (payload.promptHash ?? cleanPromptHash).trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    static func realtimeClientSecretBody(
        systemPrompt: String? = nil,
        userName: String? = nil,
        isScreenplayMode: Bool = false,
        voice: String? = nil,
        model: String? = nil,
        realtimeProvider: String? = nil
    ) -> [String: Any] {
        var body: [String: Any] = [
            "system_prompt": systemPrompt?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            "user_name": userName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            "is_screenplay_mode": isScreenplayMode,
            "voice": voice?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            "model": model?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
        ]
        let provider = realtimeProvider?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !provider.isEmpty {
            body["realtime_provider"] = provider
        }
        return body
    }

    func fetchRealtimeClientSecret(
        systemPrompt: String? = nil,
        userName: String? = nil,
        isScreenplayMode: Bool = false,
        voice: String? = nil,
        model: String? = nil,
        realtimeProvider: String? = nil,
        allowAuthTokenRefresh: Bool = true
    ) async throws -> BackendRealtimeBootstrap {
        let resolvedBaseURL = try await resolveBaseURL()
        let userID = resolveUserID()
        let clientToken = try await resolveClientToken(for: resolvedBaseURL, userID: userID)

        var request = URLRequest(url: resolvedBaseURL.appendingPathComponent("realtime/client_secret"))
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        if !userID.isEmpty {
            request.setValue(userID, forHTTPHeaderField: "X-User-Id")
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let body = Self.realtimeClientSecretBody(
            systemPrompt: systemPrompt,
            userName: userName,
            isScreenplayMode: isScreenplayMode,
            voice: voice,
            model: model,
            realtimeProvider: realtimeProvider
        )
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid realtime session response.")
        }
        guard (200...299).contains(http.statusCode) else {
            let realtimeUnavailable = parseRealtimeUnavailable(from: data, statusCode: http.statusCode)
            if let stageError = parseStageError(from: data) {
                if allowAuthTokenRefresh,
                   isUserAuthStage(stageError.stage),
                   await refreshUserAuthForRetryIfPossible() {
                    return try await fetchRealtimeClientSecret(
                        systemPrompt: systemPrompt,
                        userName: userName,
                        isScreenplayMode: isScreenplayMode,
                        voice: voice,
                        model: model,
                        realtimeProvider: realtimeProvider,
                        allowAuthTokenRefresh: false
                    )
                }
                if let realtimeUnavailable,
                   stageError.stage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "realtime_auth" {
                    throw BackendError.realtimeUnavailable(realtimeUnavailable)
                }
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            if let realtimeUnavailable {
                throw BackendError.realtimeUnavailable(realtimeUnavailable)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }

        let payload: BackendRealtimeBootstrapPayload
        do {
            payload = try JSONDecoder().decode(BackendRealtimeBootstrapPayload.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid realtime bootstrap payload." : raw)
        }

        return BackendRealtimeBootstrap(
            transport: payload.transport,
            realtimeProvider: payload.realtimeProvider,
            fallback: payload.fallback,
            fallbackReason: payload.fallbackReason,
            primarySupplier: payload.primarySupplier,
            assistantName: payload.assistantName ?? "CLEMENTINE",
            model: payload.model,
            voice: payload.voice,
            session: BackendRealtimeSessionDescriptor(
                model: payload.session.model,
                voice: payload.session.voice,
                instructions: payload.session.instructions,
                type: payload.session.type,
                outputModalities: payload.session.outputModalities
            ),
            clientSecret: BackendRealtimeClientSecret(
                value: payload.clientSecret.value,
                expiresAt: payload.clientSecret.expiresAt,
                sessionExpiresAt: payload.clientSecret.sessionExpiresAt
            ),
            issuedAt: payload.issuedAt
        )
    }

    func renderRealtimeStudioText(
        transcript: String,
        systemPrompt: String,
        screenplayTarget: String? = nil,
        studioMetadata: BackendStudioThreadCommitMetadata? = nil
    ) async throws -> String {
        let result = try await renderRealtimeStudioResult(
            transcript: transcript,
            systemPrompt: systemPrompt,
            screenplayTarget: screenplayTarget,
            studioMetadata: studioMetadata
        )
        return result.reply
    }

    private func realtimeStudioRequestBody(
        transcript: String,
        systemPrompt: String,
        screenplayTarget: String?,
        studioMetadata: BackendStudioThreadCommitMetadata?
    ) throws -> Data {
        var body: [String: Any] = [
            "transcript": transcript,
            "system_prompt": systemPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        ]
        let cleanScreenplayTarget = (screenplayTarget ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanScreenplayTarget.isEmpty {
            body["screenplay_target"] = cleanScreenplayTarget
        }
        if let studioMetadata, studioMetadata.isMeaningful {
            body.merge(BackendMemoryAPI.studioTurnPayload(studioMetadata)) { current, _ in current }
        }
        return try JSONSerialization.data(withJSONObject: body, options: [])
    }

    func renderRealtimeStudioResult(
        transcript: String,
        systemPrompt: String,
        screenplayTarget: String? = nil,
        studioMetadata: BackendStudioThreadCommitMetadata? = nil
    ) async throws -> BackendRealtimeStudioRenderResult {
        let cleanTranscript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTranscript.isEmpty else {
            throw BackendError.stage("studio_render", "Studio render transcript was empty.")
        }
        let requiresScreenplayQuality = screenplayTarget?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() == "page"

        let resolvedBaseURL = try await resolveBaseURL()
        let userID = resolveStudioRenderUserID()
        let requestBody = try realtimeStudioRequestBody(
            transcript: cleanTranscript,
            systemPrompt: systemPrompt,
            screenplayTarget: screenplayTarget,
            studioMetadata: studioMetadata
        )

        func performRequest(
            clientToken: String,
            allowClientTokenRefresh: Bool
        ) async throws -> BackendRealtimeStudioRenderResult {
            var request = URLRequest(url: resolvedBaseURL.appendingPathComponent("realtime/studio_render"))
            request.httpMethod = "POST"
            request.timeoutInterval = 20
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
            request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
            if let token = appToken() {
                request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
            }
            attachAuthorizationHeader(to: &request)
            request.httpBody = requestBody

            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw BackendError.http(-1, "Invalid Studio render response.")
            }
            guard (200...299).contains(http.statusCode) else {
                if let errorPayload = try? JSONDecoder().decode(
                    BackendRealtimeStudioRenderErrorPayload.self,
                    from: data
                ), let quality = errorPayload.screenplayQuality {
                    throw BackendError.studioRenderQuality(
                        quality,
                        (errorPayload.error ?? "Studio screenplay output did not pass the live quality gate.")
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                }
                let parsedStageError = parseStageError(from: data)
                if let stageError = parsedStageError {
                    if allowClientTokenRefresh,
                       isUserAuthStage(stageError.stage),
                       await refreshUserAuthForRetryIfPossible() {
                        return try await performRequest(clientToken: clientToken, allowClientTokenRefresh: false)
                    }
                    if allowClientTokenRefresh, stageError.stage.lowercased() == "auth_client" {
                        clearSessionToken()
                        let refreshed = try await refreshClientToken(for: resolvedBaseURL, userID: userID)
                        return try await performRequest(clientToken: refreshed, allowClientTokenRefresh: false)
                    }
                    throw BackendError.stage(stageError.stage, stageError.message)
                }
                if http.statusCode == 401,
                   allowClientTokenRefresh,
                   !isUserAuthStage(parsedStageError?.stage ?? "") {
                    clearSessionToken()
                    let refreshed = try await refreshClientToken(for: resolvedBaseURL, userID: userID)
                    return try await performRequest(clientToken: refreshed, allowClientTokenRefresh: false)
                }
                let raw = String(data: data, encoding: .utf8) ?? ""
                throw BackendError.http(http.statusCode, raw)
            }

            let payload: BackendRealtimeStudioRenderPayload
            do {
                payload = try JSONDecoder().decode(BackendRealtimeStudioRenderPayload.self, from: data)
            } catch {
                let raw = String(data: data, encoding: .utf8) ?? ""
                throw BackendError.http(502, raw.isEmpty ? "Invalid Studio render payload." : raw)
            }

            let reply = (payload.reply ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !reply.isEmpty else {
                throw BackendError.stage("studio_render", "Studio render response was empty.")
            }
            if let quality = payload.screenplayQuality, !quality.ok {
                throw BackendError.studioRenderQuality(
                    quality,
                    "Studio screenplay output did not pass the live quality gate."
                )
            }
            if requiresScreenplayQuality, payload.screenplayQuality == nil {
                throw BackendError.stage(
                    "studio_render",
                    "Studio render response ended without screenplay quality confirmation."
                )
            }
            return BackendRealtimeStudioRenderResult(
                reply: reply,
                memoryApplied: payload.memoryApplied?.hasSignal == true ? payload.memoryApplied : nil,
                screenplayQuality: payload.screenplayQuality
            )
        }

        let clientToken = try await resolveStudioRenderClientToken(for: resolvedBaseURL, userID: userID)
        return try await performRequest(clientToken: clientToken, allowClientTokenRefresh: true)
    }

    func streamRealtimeStudioText(
        transcript: String,
        systemPrompt: String,
        screenplayTarget: String? = nil,
        studioMetadata: BackendStudioThreadCommitMetadata? = nil,
        onPartial: (@Sendable (String) async -> Void)? = nil,
        onTrace: (@Sendable (BackendRealtimeStudioRenderStreamTrace) async -> Void)? = nil
    ) async throws -> String {
        let result = try await streamRealtimeStudioResult(
            transcript: transcript,
            systemPrompt: systemPrompt,
            screenplayTarget: screenplayTarget,
            studioMetadata: studioMetadata,
            onPartial: onPartial,
            onTrace: onTrace
        )
        return result.reply
    }

    func streamRealtimeStudioResult(
        transcript: String,
        systemPrompt: String,
        screenplayTarget: String? = nil,
        studioMetadata: BackendStudioThreadCommitMetadata? = nil,
        onPartial: (@Sendable (String) async -> Void)? = nil,
        onTrace: (@Sendable (BackendRealtimeStudioRenderStreamTrace) async -> Void)? = nil
    ) async throws -> BackendRealtimeStudioRenderResult {
        let cleanTranscript = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTranscript.isEmpty else {
            throw BackendError.stage("studio_render", "Studio render transcript was empty.")
        }
        let requiresAuthoritativeDone = screenplayTarget?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() == "page"

        let resolvedBaseURL = try await resolveBaseURL()
        let userID = resolveStudioRenderUserID()
        let requestBody = try realtimeStudioRequestBody(
            transcript: cleanTranscript,
            systemPrompt: systemPrompt,
            screenplayTarget: screenplayTarget,
            studioMetadata: studioMetadata
        )

        func performRequest(
            clientToken: String,
            allowClientTokenRefresh: Bool
        ) async throws -> BackendRealtimeStudioRenderResult {
            var request = URLRequest(url: resolvedBaseURL.appendingPathComponent("realtime/studio_render_stream"))
            request.httpMethod = "POST"
            request.timeoutInterval = 30
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
            request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
            request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
            if let token = appToken() {
                request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
            }
            attachAuthorizationHeader(to: &request)
            request.httpBody = requestBody

            let (bytes, response) = try await urlSession.bytes(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw BackendError.http(-1, "Invalid Studio render stream response.")
            }
            guard (200...299).contains(http.statusCode) else {
                let data = try await collectAsyncBytes(bytes)
                if let errorPayload = try? JSONDecoder().decode(
                    BackendRealtimeStudioRenderErrorPayload.self,
                    from: data
                ), let quality = errorPayload.screenplayQuality {
                    throw BackendError.studioRenderQuality(
                        quality,
                        (errorPayload.error ?? "Studio screenplay output did not pass the live quality gate.")
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                    )
                }
                let parsedStageError = parseStageError(from: data)
                if let stageError = parsedStageError {
                    if allowClientTokenRefresh,
                       isUserAuthStage(stageError.stage),
                       await refreshUserAuthForRetryIfPossible() {
                        return try await performRequest(clientToken: clientToken, allowClientTokenRefresh: false)
                    }
                    if allowClientTokenRefresh, stageError.stage.lowercased() == "auth_client" {
                        clearSessionToken()
                        let refreshed = try await refreshClientToken(for: resolvedBaseURL, userID: userID)
                        return try await performRequest(clientToken: refreshed, allowClientTokenRefresh: false)
                    }
                    throw BackendError.stage(stageError.stage, stageError.message)
                }
                if http.statusCode == 401,
                   allowClientTokenRefresh,
                   !isUserAuthStage(parsedStageError?.stage ?? "") {
                    clearSessionToken()
                    let refreshed = try await refreshClientToken(for: resolvedBaseURL, userID: userID)
                    return try await performRequest(clientToken: refreshed, allowClientTokenRefresh: false)
                }
                let raw = String(data: data, encoding: .utf8) ?? ""
                throw BackendError.http(http.statusCode, raw)
            }

            var eventName = "message"
            var dataLines: [String] = []
            var accumulated = ""
            var finalReply = ""
            var didReceiveDone = false
            var lastPartialCallbackAt = Date.distantPast
            var lastPartialCallbackCharacterCount = 0
            var latestMemoryApplied: BackendRealtimeStudioMemoryApplied?
            var latestScreenplayQuality: BackendRealtimeStudioScreenplayQuality?

            func validatedResult(
                reply rawReply: String,
                quality eventQuality: BackendRealtimeStudioScreenplayQuality?
            ) throws -> BackendRealtimeStudioRenderResult {
                let reply = rawReply.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !reply.isEmpty else {
                    throw BackendError.stage("studio_render", "Studio render stream response was empty.")
                }
                let quality = eventQuality ?? latestScreenplayQuality
                if let quality, !quality.ok {
                    throw BackendError.studioRenderQuality(
                        quality,
                        "Studio screenplay output did not pass the live quality gate."
                    )
                }
                if requiresAuthoritativeDone, quality == nil {
                    throw BackendError.stage(
                        "studio_render",
                        "Studio render stream ended without screenplay quality confirmation."
                    )
                }
                return BackendRealtimeStudioRenderResult(
                    reply: reply,
                    memoryApplied: latestMemoryApplied,
                    screenplayQuality: quality
                )
            }

            func trace(
                from payload: BackendRealtimeStudioRenderStreamEvent?,
                fallbackKind: String
            ) -> BackendRealtimeStudioRenderStreamTrace? {
                let action = (payload?.action ?? "studio_render_stream")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let kind = (payload?.kind ?? fallbackKind)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let requestID = (payload?.requestID ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let startedAtISO8601 = payload?.startedAtISO8601?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let normalizedStartedAt = startedAtISO8601?.isEmpty == true ? nil : startedAtISO8601
                if let memoryApplied = payload?.memoryApplied,
                   memoryApplied.hasSignal {
                    latestMemoryApplied = memoryApplied
                }
                if let screenplayQuality = payload?.screenplayQuality {
                    latestScreenplayQuality = screenplayQuality
                }
                let hasSignal =
                    !action.isEmpty ||
                    !kind.isEmpty ||
                    !requestID.isEmpty ||
                    normalizedStartedAt != nil ||
                    payload?.firstDeltaMs != nil ||
                    payload?.totalMs != nil ||
                    payload?.deltaChunks != nil ||
                    payload?.memoryApplied?.hasSignal == true ||
                    payload?.screenplayQuality != nil
                guard hasSignal else { return nil }
                return BackendRealtimeStudioRenderStreamTrace(
                    action: action.isEmpty ? "studio_render_stream" : action,
                    kind: kind.isEmpty ? fallbackKind : kind,
                    requestID: requestID,
                    startedAtISO8601: normalizedStartedAt,
                    firstDeltaMs: payload?.firstDeltaMs,
                    totalMs: payload?.totalMs,
                    deltaChunks: payload?.deltaChunks,
                    memoryApplied: payload?.memoryApplied?.hasSignal == true ? payload?.memoryApplied : nil,
                    screenplayQuality: payload?.screenplayQuality
                )
            }

            func dispatchEvent() async throws {
                guard !dataLines.isEmpty else { return }
                let payloadText = dataLines.joined(separator: "\n")
                defer {
                    dataLines.removeAll(keepingCapacity: true)
                    eventName = "message"
                }

                let payloadData = Data(payloadText.utf8)
                let payload = try? JSONDecoder().decode(BackendRealtimeStudioRenderStreamEvent.self, from: payloadData)

                switch eventName {
                case "meta":
                    let eventTrace = trace(from: payload, fallbackKind: "meta")
                    if let onTrace, let eventTrace {
                        await onTrace(eventTrace)
                    }
                case "trace":
                    let eventTrace = trace(from: payload, fallbackKind: "trace")
                    if let onTrace, let eventTrace {
                        await onTrace(eventTrace)
                    }
                case "delta":
                    let delta = payload?.delta ?? ""
                    guard !delta.isEmpty else { return }
                    accumulated = StudioResponseStreamingPolicy.appending(
                        delta: delta,
                        to: accumulated
                    )
                    if let onPartial {
                        let now = Date()
                        let characterDelta = accumulated.count - lastPartialCallbackCharacterCount
                        if lastPartialCallbackCharacterCount == 0 ||
                            characterDelta >= StudioResponseStreamingPolicy.partialCharacterDelta ||
                            now.timeIntervalSince(lastPartialCallbackAt) >= StudioResponseStreamingPolicy.partialMaximumInterval {
                            lastPartialCallbackAt = now
                            lastPartialCallbackCharacterCount = accumulated.count
                            await onPartial(accumulated)
                        }
                    }
                case "done":
                    let eventTrace = trace(from: payload, fallbackKind: "done")
                    if let onTrace, let eventTrace {
                        await onTrace(eventTrace)
                    }
                    let reply = (payload?.reply ?? accumulated).trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !reply.isEmpty else { return }
                    finalReply = reply
                    if let onPartial, reply.count != lastPartialCallbackCharacterCount {
                        lastPartialCallbackAt = Date()
                        lastPartialCallbackCharacterCount = reply.count
                        await onPartial(reply)
                    }
                    didReceiveDone = true
                case "error":
                    let stage = (payload?.stage ?? "studio_render").trimmingCharacters(in: .whitespacesAndNewlines)
                    let message = (payload?.error ?? "Studio render stream failed.")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if let quality = payload?.screenplayQuality {
                        throw BackendError.studioRenderQuality(
                            quality,
                            message.isEmpty ? "Studio screenplay output did not pass the live quality gate." : message
                        )
                    }
                    throw BackendError.stage(stage.isEmpty ? "studio_render" : stage, message.isEmpty ? "Studio render stream failed." : message)
                default:
                    break
                }
            }

            for try await rawLine in bytes.lines {
                let line = rawLine.replacingOccurrences(of: "\r", with: "")
                if line.isEmpty {
                    try await dispatchEvent()
                    if didReceiveDone {
                        let resolvedReply = finalReply.isEmpty ? accumulated.trimmingCharacters(in: .whitespacesAndNewlines) : finalReply
                        return try validatedResult(
                            reply: resolvedReply,
                            quality: latestScreenplayQuality
                        )
                    }
                    continue
                }
                if line.hasPrefix(":") {
                    continue
                }
                if line.hasPrefix("event:") {
                    eventName = line.dropFirst("event:".count).trimmingCharacters(in: .whitespacesAndNewlines)
                    continue
                }
                if line.hasPrefix("data:") {
                    let payloadText = line.dropFirst("data:".count).trimmingCharacters(in: .whitespacesAndNewlines)
                    if eventName == "done" {
                        let payloadData = Data(payloadText.utf8)
                        let payload = try? JSONDecoder().decode(BackendRealtimeStudioRenderStreamEvent.self, from: payloadData)
                        let eventTrace = trace(from: payload, fallbackKind: "done")
                        if let onTrace, let eventTrace {
                            await onTrace(eventTrace)
                        }
                        let reply = (payload?.reply ?? accumulated).trimmingCharacters(in: .whitespacesAndNewlines)
                        if let onPartial, reply.count != lastPartialCallbackCharacterCount {
                            lastPartialCallbackAt = Date()
                            lastPartialCallbackCharacterCount = reply.count
                            await onPartial(reply)
                        }
                        return try validatedResult(
                            reply: reply,
                            quality: payload?.screenplayQuality
                        )
                    }
                    if eventName == "error" {
                        let payloadData = Data(payloadText.utf8)
                        let payload = try? JSONDecoder().decode(BackendRealtimeStudioRenderStreamEvent.self, from: payloadData)
                        let stage = (payload?.stage ?? "studio_render").trimmingCharacters(in: .whitespacesAndNewlines)
                        let message = (payload?.error ?? "Studio render stream failed.")
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        if let quality = payload?.screenplayQuality {
                            throw BackendError.studioRenderQuality(
                                quality,
                                message.isEmpty ? "Studio screenplay output did not pass the live quality gate." : message
                            )
                        }
                        throw BackendError.stage(stage.isEmpty ? "studio_render" : stage, message.isEmpty ? "Studio render stream failed." : message)
                    }
                    dataLines.append(payloadText)
                }
            }
            try await dispatchEvent()

            if requiresAuthoritativeDone, !didReceiveDone {
                throw BackendError.stage(
                    "studio_render",
                    "Studio render stream ended before authoritative quality confirmation."
                )
            }

            let resolvedReply = finalReply.isEmpty ? accumulated.trimmingCharacters(in: .whitespacesAndNewlines) : finalReply
            return try validatedResult(
                reply: resolvedReply,
                quality: latestScreenplayQuality
            )
        }

        let clientToken = try await resolveStudioRenderClientToken(for: resolvedBaseURL, userID: userID)
        return try await performRequest(clientToken: clientToken, allowClientTokenRefresh: true)
    }

    // Legacy compatibility shim for older realtime callers still wired to the
    // pre-refactor Studio streaming surface.
    func streamStudioText(
        transcript: String,
        systemPrompt: String,
        onDelta: @escaping @Sendable (String) -> Void,
        onComplete: @escaping @Sendable (String) -> Void
    ) async throws {
        var lastPartial = ""
        let reply = try await streamRealtimeStudioText(
            transcript: transcript,
            systemPrompt: systemPrompt,
            onPartial: { partial in
                let delta: String
                if partial.hasPrefix(lastPartial) {
                    delta = String(partial.dropFirst(lastPartial.count))
                } else {
                    delta = partial
                }
                lastPartial = partial
                guard !delta.isEmpty else { return }
                await MainActor.run {
                    onDelta(delta)
                }
            }
        )
        await MainActor.run {
            onComplete(reply)
        }
    }

    func summarizeVisualContext(
        imageData: Data,
        mimeType: String = "image/jpeg",
        transcript: String,
        appName: String,
        windowTitle: String,
        isScreenplayMode: Bool,
        allowAuthTokenRefresh: Bool = true
    ) async throws -> BackendVisualContextEnvelope {
        guard !imageData.isEmpty else {
            throw BackendError.stage("visual_context", "Visual context image was empty.")
        }

        let resolvedBaseURL = try await resolveBaseURL()
        let userID = resolveUserID()
        let clientToken = try await resolveClientToken(for: resolvedBaseURL, userID: userID)
        var request = URLRequest(url: resolvedBaseURL.appendingPathComponent("visual/context"))
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        if !userID.isEmpty {
            request.setValue(userID, forHTTPHeaderField: "X-User-Id")
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let cleanMimeType = mimeType.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "image/jpeg"
            : mimeType.trimmingCharacters(in: .whitespacesAndNewlines)
        let dataURL = "data:\(cleanMimeType);base64,\(imageData.base64EncodedString())"
        let body: [String: Any] = [
            "image_data_url": dataURL,
            "transcript": transcript.trimmingCharacters(in: .whitespacesAndNewlines),
            "app_name": appName.trimmingCharacters(in: .whitespacesAndNewlines),
            "window_title": windowTitle.trimmingCharacters(in: .whitespacesAndNewlines),
            "is_screenplay_mode": isScreenplayMode
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid visual context response.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let stageError = parseStageError(from: data) {
                if allowAuthTokenRefresh,
                   isUserAuthStage(stageError.stage),
                   await refreshUserAuthForRetryIfPossible() {
                    return try await summarizeVisualContext(
                        imageData: imageData,
                        mimeType: mimeType,
                        transcript: transcript,
                        appName: appName,
                        windowTitle: windowTitle,
                        isScreenplayMode: isScreenplayMode,
                        allowAuthTokenRefresh: false
                    )
                }
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }

        let payload: BackendVisualContextPayload
        do {
            payload = try JSONDecoder().decode(BackendVisualContextPayload.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid visual context payload." : raw)
        }

        let summary = (payload.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let promptAddendum = (payload.promptAddendum ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !summary.isEmpty, !promptAddendum.isEmpty else {
            throw BackendError.stage("visual_context", "Visual context response was empty.")
        }

        return BackendVisualContextEnvelope(
            summary: summary,
            promptAddendum: promptAddendum,
            appName: (payload.appName ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            windowTitle: (payload.windowTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            source: (payload.source ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            capturedAt: payload.capturedAt ?? 0
        )
    }

    func realtimeBridgeRequest() async throws -> URLRequest {
        let resolvedBaseURL = try await resolveBaseURL()
        let userID = resolveUserID()
        let clientToken = try await resolveClientToken(for: resolvedBaseURL, userID: userID)

        var request = URLRequest(url: resolvedBaseURL.appendingPathComponent("realtime/bridge"))
        request.timeoutInterval = 15
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        if !userID.isEmpty {
            request.setValue(userID, forHTTPHeaderField: "X-User-Id")
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        return request
    }

    private func performTalk(
        fileURL: URL,
        fileDataOverride: Data?,
        baseURL: URL,
        userID: String,
        clientToken: String,
        systemPrompt: String?,
        stage: Int?,
        depthScore: Double?,
        romanceTension: Double?,
        sessionCount: Int?,
        personaPreset: String?,
        memoryCue: String?,
        idempotencyKey: String?,
        tailSilenceMs: Int?,
        vadThreshold: Float?,
        speechMs: Int?,
        noiseFloorRms: Float?,
        speechRms: Float?,
        userName: String?,
        partialTranscriptHint: String?,
        speculativeReuseKey: String?,
        speculativePromptHash: String?,
        studioMetadata: BackendStudioThreadCommitMetadata?,
        clientTranscriptOverride: String?,
        screenplayGenerationTranscriptOverride: String?,
        onResponseMetadataReady: ((BackendTalkResponseMetadata) -> Void)?,
        onFirstAudioSegmentReady: ((URL) -> Void)?,
        onTextReady: ((String) -> Void)? = nil,
        onDebugEvent: ((BackendTalkDebugEvent) -> Void)?,
        allowClientTokenRefresh: Bool,
        allowAudioValidationRetry: Bool,
        forceNoStreamAudio: Bool
    ) async throws -> BackendTalkResult {
        let boundary = "Boundary-\(UUID().uuidString)"
        let url = baseURL.appendingPathComponent("talk")
        onDebugEvent?(
            BackendTalkDebugEvent(
                stage: "request_built",
                resolvedBaseURL: baseURL.absoluteString,
                requestURL: url.absoluteString,
                clientTokenResolved: !clientToken.isEmpty,
                errorDomain: nil,
                errorCode: nil,
                errorDescription: nil
            )
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = requestTimeout
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if preferStreamedTalkAudio && !forceNoStreamAudio {
            request.setValue("audio", forHTTPHeaderField: "X-Talk-Stream")
        } else if forceNoStreamAudio {
            request.setValue("off", forHTTPHeaderField: "X-Talk-Stream")
        }
        if !userID.isEmpty {
            request.setValue(userID, forHTTPHeaderField: "X-User-Id")
        }
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if !clientToken.isEmpty {
            request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        }
        let appToken = appToken()
        if let token = appToken {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)
        if let key = normalizedIdempotencyKey(idempotencyKey) {
            request.setValue(key, forHTTPHeaderField: "X-Idempotency-Key")
        }
        print(
            "POST /talk -> url=\(url.absoluteString) has_app_token=\(appToken != nil) app_token=\(redactedTokenInfo(appToken)) has_client_token=\(!clientToken.isEmpty)"
        )

        let audioData = try fileDataOverride ?? Data(contentsOf: fileURL)
        guard audioData.count <= maxUploadBytes else {
            throw BackendError.stage("upload", "Recording too large. Max is 25MB.")
        }
        let uploadMeta = uploadMetadata(for: fileURL, data: audioData)

        var body = Data()
        if let prompt = normalizedSystemPrompt(systemPrompt) {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"system_prompt\"\r\n\r\n")
            body.appendString(prompt)
            body.appendString("\r\n")
        }
        if let stage {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"stage\"\r\n\r\n")
            body.appendString(String(max(1, min(5, stage))))
            body.appendString("\r\n")
        }
        if let depthScore {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"depth_score\"\r\n\r\n")
            body.appendString(String(format: "%.2f", max(0, min(10, depthScore))))
            body.appendString("\r\n")
        }
        if let romanceTension {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"romance_tension\"\r\n\r\n")
            body.appendString(String(format: "%.2f", max(0, min(10, romanceTension))))
            body.appendString("\r\n")
        }
        if let sessionCount {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"session_count\"\r\n\r\n")
            body.appendString(String(max(0, sessionCount)))
            body.appendString("\r\n")
        }
        if let personaPreset, !personaPreset.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"persona_preset\"\r\n\r\n")
            body.appendString(personaPreset)
            body.appendString("\r\n")
        }
        if let memoryCue = normalizedSystemPrompt(memoryCue) {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"memory_cue\"\r\n\r\n")
            body.appendString(memoryCue)
            body.appendString("\r\n")
        }
        if let tailSilenceMs, tailSilenceMs > 0 {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"tail_silence_ms\"\r\n\r\n")
            body.appendString(String(max(300, min(2200, tailSilenceMs))))
            body.appendString("\r\n")
        }
        if let vadThreshold {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"vad_threshold\"\r\n\r\n")
            body.appendString(String(format: "%.5f", max(0.0015, min(0.0300, vadThreshold))))
            body.appendString("\r\n")
        }
        if let speechMs, speechMs > 0 {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"speech_ms\"\r\n\r\n")
            body.appendString(String(max(1, min(600_000, speechMs))))
            body.appendString("\r\n")
        }
        if let noiseFloorRms {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"noise_floor_rms\"\r\n\r\n")
            body.appendString(String(format: "%.5f", max(0, min(0.2, noiseFloorRms))))
            body.appendString("\r\n")
        }
        if let speechRms {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"speech_rms\"\r\n\r\n")
            body.appendString(String(format: "%.5f", max(0, min(0.2, speechRms))))
            body.appendString("\r\n")
        }
        let cleanUserName = String(userName ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanUserName.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"user_name\"\r\n\r\n")
            body.appendString(String(cleanUserName.prefix(48)))
            body.appendString("\r\n")
        }
        let partialHint = String(partialTranscriptHint ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !partialHint.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"partial_transcript_hint\"\r\n\r\n")
            body.appendString(String(partialHint.prefix(320)))
            body.appendString("\r\n")
        }
        let clientTranscript = String(clientTranscriptOverride ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !clientTranscript.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"client_transcript\"\r\n\r\n")
            body.appendString(String(clientTranscript.prefix(1200)))
            body.appendString("\r\n")
        }
        let screenplayGenerationTranscript = String(screenplayGenerationTranscriptOverride ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !screenplayGenerationTranscript.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"screenplay_generation_transcript\"\r\n\r\n")
            body.appendString(String(screenplayGenerationTranscript.prefix(8000)))
            body.appendString("\r\n")
        }
        let cleanSpeculativeReuseKey = String(speculativeReuseKey ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanSpeculativeReuseKey.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"speculative_reuse_key\"\r\n\r\n")
            body.appendString(String(cleanSpeculativeReuseKey.prefix(96)))
            body.appendString("\r\n")
        }
        let cleanSpeculativePromptHash = String(speculativePromptHash ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanSpeculativePromptHash.isEmpty {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"speculative_prompt_hash\"\r\n\r\n")
            body.appendString(String(cleanSpeculativePromptHash.prefix(32)))
            body.appendString("\r\n")
        }
        if let studioMetadata, studioMetadata.isMeaningful {
            func appendStudioField(_ name: String, _ value: String, limit: Int) {
                let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !clean.isEmpty else { return }
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                body.appendString(String(clean.prefix(limit)))
                body.appendString("\r\n")
            }

            func appendStudioIntField(_ name: String, _ value: Int?) {
                guard let value, value > 0 else { return }
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                body.appendString(String(max(1, min(200_000, value))))
                body.appendString("\r\n")
            }

            func appendStudioListField(_ name: String, _ values: [String]) {
                let cleanValues = values
                    .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    .filter { !$0.isEmpty }
                guard !cleanValues.isEmpty,
                      let data = try? JSONEncoder().encode(Array(cleanValues.prefix(12))),
                      let json = String(data: data, encoding: .utf8) else { return }
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                body.appendString(json)
                body.appendString("\r\n")
            }

            func appendStudioDictionaryField(_ name: String, _ value: [String: String]) {
                guard !value.isEmpty,
                      let data = try? JSONSerialization.data(withJSONObject: value, options: []),
                      let json = String(data: data, encoding: .utf8) else { return }
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                body.appendString(json)
                body.appendString("\r\n")
            }

            func appendStudioDictionariesField(_ name: String, _ values: [[String: Any]]) {
                let cleanValues = Array(values.filter { !$0.isEmpty }.prefix(8))
                guard !cleanValues.isEmpty,
                      JSONSerialization.isValidJSONObject(cleanValues),
                      let data = try? JSONSerialization.data(withJSONObject: cleanValues, options: []),
                      let json = String(data: data, encoding: .utf8) else { return }
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                body.appendString(json)
                body.appendString("\r\n")
            }

            let projectId = studioMetadata.screenplayProjectId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !projectId.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_project_id\"\r\n\r\n")
                body.appendString(String(projectId.prefix(96)))
                body.appendString("\r\n")
            }
            let documentRevisionId = studioMetadata.screenplayDocumentRevisionId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !documentRevisionId.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_document_revision_id\"\r\n\r\n")
                body.appendString(String(documentRevisionId.prefix(96)))
                body.appendString("\r\n")
            }
            let target = studioMetadata.screenplayTarget.trimmingCharacters(in: .whitespacesAndNewlines)
            if !target.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_target\"\r\n\r\n")
                body.appendString(String(target.prefix(24)))
                body.appendString("\r\n")
            }
            let promptSource = studioMetadata.screenplayPromptSource.trimmingCharacters(in: .whitespacesAndNewlines)
            if !promptSource.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_prompt_source\"\r\n\r\n")
                body.appendString(String(promptSource.prefix(24)))
                body.appendString("\r\n")
            }
            let writeID = studioMetadata.screenplayWriteId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !writeID.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_write_id\"\r\n\r\n")
                body.appendString(String(writeID.prefix(72)))
                body.appendString("\r\n")
            }
            if let anchorLine = studioMetadata.screenplayAnchorLine {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_anchor_line\"\r\n\r\n")
                body.appendString(String(max(1, min(200_000, anchorLine))))
                body.appendString("\r\n")
            }
            if let anchorEndLine = studioMetadata.screenplayAnchorEndLine {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_anchor_end_line\"\r\n\r\n")
                body.appendString(String(max(1, min(200_000, anchorEndLine))))
                body.appendString("\r\n")
            }
            let sceneLabel = studioMetadata.screenplayAnchorSceneLabel.trimmingCharacters(in: .whitespacesAndNewlines)
            if !sceneLabel.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_anchor_scene_label\"\r\n\r\n")
                body.appendString(String(sceneLabel.prefix(120)))
                body.appendString("\r\n")
            }
            let draftSceneId = studioMetadata.screenplayAnchorDraftSceneId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !draftSceneId.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_anchor_draft_scene_id\"\r\n\r\n")
                body.appendString(String(draftSceneId.prefix(96)))
                body.appendString("\r\n")
            }
            let outlineSceneId = studioMetadata.screenplayAnchorOutlineSceneId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !outlineSceneId.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_anchor_outline_scene_id\"\r\n\r\n")
                body.appendString(String(outlineSceneId.prefix(96)))
                body.appendString("\r\n")
            }
            if !studioMetadata.screenplayAnchorOutlineBeatIds.isEmpty,
               let beatIdsData = try? JSONEncoder().encode(studioMetadata.screenplayAnchorOutlineBeatIds),
               let beatIdsJson = String(data: beatIdsData, encoding: .utf8) {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_anchor_outline_beat_ids\"\r\n\r\n")
                body.appendString(beatIdsJson)
                body.appendString("\r\n")
            }
            let anchorScriptNodeId = studioMetadata.screenplayAnchorScriptNodeId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !anchorScriptNodeId.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_anchor_script_node_id\"\r\n\r\n")
                body.appendString(String(anchorScriptNodeId.prefix(160)))
                body.appendString("\r\n")
            }
            let noteTitle = studioMetadata.screenplayNoteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            if !noteTitle.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_note_title\"\r\n\r\n")
                body.appendString(String(noteTitle.prefix(120)))
                body.appendString("\r\n")
            }
            let noteBody = studioMetadata.screenplayNoteBody.trimmingCharacters(in: .whitespacesAndNewlines)
            if !noteBody.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_note_body\"\r\n\r\n")
                body.appendString(String(noteBody.prefix(280)))
                body.appendString("\r\n")
            }
            let insertedText = studioMetadata.screenplayInsertedText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !insertedText.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_inserted_text\"\r\n\r\n")
                body.appendString(String(insertedText.prefix(6000)))
                body.appendString("\r\n")
            }
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"screenplay_replacement_applied\"\r\n\r\n")
            body.appendString(studioMetadata.screenplayReplacementApplied ? "true" : "false")
            body.appendString("\r\n")
            let replacedWriteID = studioMetadata.screenplayReplacedWriteId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !replacedWriteID.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_replaced_write_id\"\r\n\r\n")
                body.appendString(String(replacedWriteID.prefix(72)))
                body.appendString("\r\n")
            }
            let revisedBlockText = studioMetadata.screenplayRevisedBlockText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !revisedBlockText.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_revised_block_text\"\r\n\r\n")
                body.appendString(String(revisedBlockText.prefix(6000)))
                body.appendString("\r\n")
            }
            let resolvedAnchorExcerpt = studioMetadata.screenplayResolvedAnchorExcerpt.trimmingCharacters(in: .whitespacesAndNewlines)
            if !resolvedAnchorExcerpt.isEmpty {
                body.appendString("--\(boundary)\r\n")
                body.appendString("Content-Disposition: form-data; name=\"screenplay_resolved_anchor_excerpt\"\r\n\r\n")
                body.appendString(String(resolvedAnchorExcerpt.prefix(280)))
                body.appendString("\r\n")
            }
            appendStudioField("screenplay_draft_excerpt", studioMetadata.screenplayDraftExcerpt, limit: 6000)
            appendStudioField("screenplay_act", studioMetadata.screenplayAct, limit: 120)
            appendStudioField("screenplay_scene_objective", studioMetadata.screenplaySceneObjective, limit: 280)
            appendStudioField("screenplay_scene_summary", studioMetadata.screenplaySceneSummary, limit: 280)
            appendStudioField("screenplay_current_beat", studioMetadata.screenplayCurrentBeat, limit: 220)
            appendStudioField("screenplay_logline", studioMetadata.screenplayLogline, limit: 280)
            appendStudioField("screenplay_theme_argument", studioMetadata.screenplayThemeArgument, limit: 280)
            appendStudioField("screenplay_central_question", studioMetadata.screenplayCentralQuestion, limit: 280)
            appendStudioField("screenplay_protagonist_want", studioMetadata.screenplayProtagonistWant, limit: 240)
            appendStudioField("screenplay_protagonist_need", studioMetadata.screenplayProtagonistNeed, limit: 240)
            appendStudioField("screenplay_antagonistic_force", studioMetadata.screenplayAntagonisticForce, limit: 260)
            appendStudioField("screenplay_ending_image", studioMetadata.screenplayEndingImage, limit: 240)
            appendStudioField("screenplay_feature_sequence", studioMetadata.screenplayFeatureSequence, limit: 220)
            appendStudioField("screenplay_feature_obligation", studioMetadata.screenplayFeatureObligation, limit: 280)
            appendStudioField("screenplay_act_pressure_state", studioMetadata.screenplayActPressureState, limit: 280)
            appendStudioField("screenplay_character_arc_state", studioMetadata.screenplayCharacterArcState, limit: 280)
            appendStudioDictionaryField(
                "screenplay_character_arc_memory",
                studioMetadata.screenplayCharacterArcMemory?.payload ?? [:]
            )
            appendStudioDictionariesField(
                "screenplay_character_voice_memories",
                studioMetadata.screenplayCharacterVoiceMemories.map(\.payload)
            )
            appendStudioField("screenplay_last_scene_outcome", studioMetadata.screenplayLastSceneOutcome, limit: 240)
            appendStudioField("screenplay_next_scene_plan", studioMetadata.screenplayNextScenePlan, limit: 340)
            appendStudioListField("screenplay_next_scene_moves", studioMetadata.screenplayNextSceneMoves)
            appendStudioListField("screenplay_next_three_turns", studioMetadata.screenplayNextThreeTurns)
            appendStudioListField("screenplay_act_three_payoff_path", studioMetadata.screenplayActThreePayoffPath)
            appendStudioListField("screenplay_beat_sequence", studioMetadata.screenplayBeatSequence)
            appendStudioListField("screenplay_character_focus", studioMetadata.screenplayCharacterFocus)
            appendStudioListField("screenplay_unresolved_setups", studioMetadata.screenplayUnresolvedSetups)
            appendStudioListField("screenplay_unresolved_story_threads", studioMetadata.screenplayUnresolvedStoryThreads)
            appendStudioListField("screenplay_character_arc_turns", studioMetadata.screenplayCharacterArcTurns)
            appendStudioListField("screenplay_image_motifs", studioMetadata.screenplayImageMotifs)
            appendStudioListField("screenplay_continuity_notes", studioMetadata.screenplayContinuityNotes)
            appendStudioField("screenplay_emotional_continuity", studioMetadata.screenplayEmotionalContinuity, limit: 280)
            appendStudioIntField("screenplay_page_count", studioMetadata.screenplayPageCount)
            appendStudioIntField("screenplay_target_pages", studioMetadata.screenplayTargetPages)
        }
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"file\"; filename=\"\(uploadMeta.filename)\"\r\n")
        body.appendString("Content-Type: \(uploadMeta.mimeType)\r\n\r\n")
        body.append(audioData)
        body.appendString("\r\n")
        body.appendString("--\(boundary)--\r\n")
        request.httpBody = body

        HerLog.talk.info("TALK request start")
        HerLog.talk.info(
            "TALK upload file=\(uploadMeta.filename, privacy: .public) mime=\(uploadMeta.mimeType, privacy: .public) bytes=\(audioData.count)"
        )
        let startedAt = Date()
        var responseFirstSegmentBytesHint = 0
        var emittedFirstSegment = false
        var firstSegmentBuffer = Data()
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await dataForTalkRequest(
                request,
                onResponse: { [self] http in
                responseFirstSegmentBytesHint = self.parseHeaderInt(
                    http,
                    field: "x-tts-first-bytes",
                    default: 0,
                    min: 0,
                    max: 8_000_000
                )
                let screenplayTarget = self.parseOptionalHeaderString(http, field: "x-screenplay-target")?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased() ?? ""
                let shouldEmitHeaderText = screenplayTarget.isEmpty || screenplayTarget == "page"
                let screenplayOutput = self.parseScreenplayOutput(from: http)
                let screenplayQuality = screenplayOutput?.quality ?? self.parseScreenplayQuality(from: http)
                let renderContract = self.parseRenderContract(
                    from: http,
                    screenplayOutput: screenplayOutput
                )
                let screenplayTrace = self.parseScreenplayTrace(from: http)
                let creativeMemoryTrace = self.parseCreativeMemoryTrace(from: http)
                let responseMetadata = BackendTalkResponseMetadata(
                    audioDurationMs: {
                        let headerDuration = self.parseHeaderInt(
                            http,
                            field: "x-audio-duration-ms",
                            default: 0,
                            min: 0,
                            max: 600_000
                        )
                        return headerDuration > 0 ? headerDuration : nil
                    }(),
                    renderContract: renderContract,
                    timingSource: self.parseOptionalHeaderString(http, field: "x-screenplay-timing-source"),
                    screenplayOutput: screenplayOutput,
                    screenplayQuality: screenplayQuality,
                    screenplayCues: self.parseScreenplayCues(from: http),
                    dialogueTimeline: self.parseDialogueTimeline(from: http),
                    creativeMemoryTrace: creativeMemoryTrace,
                    screenplayTrace: screenplayTrace,
                    reply: self.parseOptionalHeaderString(http, field: "x-reply")
                )
                if let onResponseMetadataReady, http.statusCode == 200 {
                    DispatchQueue.main.async {
                        onResponseMetadataReady(responseMetadata)
                    }
                }
                if let onTextReady,
                   http.statusCode == 200,
                   shouldEmitHeaderText,
                   let reply = self.parseOptionalHeaderString(http, field: "x-reply"),
                   !reply.isEmpty {
                    DispatchQueue.main.async {
                        onTextReady(reply)
                    }
                }
            },
            onChunk: { [self] chunk, response in
                guard !emittedFirstSegment else { return }
                guard let onFirstAudioSegmentReady else { return }
                guard response.statusCode == 200 else { return }
                let segmentHint = responseFirstSegmentBytesHint
                guard segmentHint >= self.minPlayableSegmentBytes else { return }
                guard !chunk.isEmpty else { return }

                let remaining = max(0, segmentHint - firstSegmentBuffer.count)
                if remaining > 0 {
                    firstSegmentBuffer.append(chunk.prefix(remaining))
                }
                guard firstSegmentBuffer.count >= segmentHint else { return }

                let segmentData = Data(firstSegmentBuffer.prefix(segmentHint))
                guard self.looksLikeMP3(segmentData) || self.looksLikeWav(segmentData) else { return }
                let segmentExt = self.looksLikeWav(segmentData) ? "wav" : "mp3"
                do {
                    let segmentURL = FileManager.default.temporaryDirectory
                        .appendingPathComponent("them_backend_first_\(UUID().uuidString).\(segmentExt)")
                    try segmentData.write(to: segmentURL, options: [.atomic])
                    emittedFirstSegment = true
                    DispatchQueue.main.async {
                        onFirstAudioSegmentReady(segmentURL)
                    }
                } catch {
                    print("POST /talk -> failed to persist first stream segment: \(error.localizedDescription)")
                }
                }
            )
        } catch {
            let nsError = error as NSError
            onDebugEvent?(
                BackendTalkDebugEvent(
                    stage: "request_transport_failed",
                    resolvedBaseURL: baseURL.absoluteString,
                    requestURL: url.absoluteString,
                    clientTokenResolved: !clientToken.isEmpty,
                    errorDomain: nsError.domain,
                    errorCode: nsError.code,
                    errorDescription: error.localizedDescription
                )
            )
            if let queued = await enqueueOfflineTalkRequest(request, body: body, reason: error.localizedDescription) {
                throw queued
            }
            throw error
        }
        let http = response as? HTTPURLResponse
        let statusCode = http?.statusCode ?? -1
        let contentType = http?.value(forHTTPHeaderField: "Content-Type") ?? "-"
        let requestID = http?.value(forHTTPHeaderField: "X-Request-Id") ?? "-"
        let latencyMs = Int(Date().timeIntervalSince(startedAt) * 1000)

        HerLog.talk.info("TALK response status=\(statusCode)")
        HerLog.talk.info("TALK bytes=\(data.count)")
        HerLog.talk.info("TALK status=\(statusCode) contentType=\(contentType, privacy: .public)")
        HerLog.talk.info("bytes=\(data.count)")
        print("POST /talk -> id=\(requestID) status=\(statusCode) type=\(contentType) bytes=\(data.count) latency=\(latencyMs)ms")
        func retryAudioValidationIfAllowed(_ reason: String) async throws -> BackendTalkResult? {
            guard allowAudioValidationRetry else { return nil }
            print("POST /talk -> \(reason), retrying once with stream off")
            return try await performTalk(
                fileURL: fileURL,
                fileDataOverride: fileDataOverride,
                baseURL: baseURL,
                userID: userID,
                clientToken: clientToken,
                systemPrompt: systemPrompt,
                stage: stage,
                depthScore: depthScore,
                romanceTension: romanceTension,
                sessionCount: sessionCount,
                personaPreset: personaPreset,
                memoryCue: memoryCue,
                idempotencyKey: idempotencyKey,
                tailSilenceMs: tailSilenceMs,
                vadThreshold: vadThreshold,
                speechMs: speechMs,
                noiseFloorRms: noiseFloorRms,
                speechRms: speechRms,
                userName: userName,
                partialTranscriptHint: partialTranscriptHint,
                speculativeReuseKey: speculativeReuseKey,
                speculativePromptHash: speculativePromptHash,
                studioMetadata: studioMetadata,
                clientTranscriptOverride: clientTranscriptOverride,
                screenplayGenerationTranscriptOverride: screenplayGenerationTranscriptOverride,
                onResponseMetadataReady: onResponseMetadataReady,
                onFirstAudioSegmentReady: onFirstAudioSegmentReady,
                onTextReady: onTextReady,
                onDebugEvent: onDebugEvent,
                allowClientTokenRefresh: allowClientTokenRefresh,
                allowAudioValidationRetry: false,
                forceNoStreamAudio: true
            )
        }

        guard statusCode == 200 else {
            let parsedStageError = parseStageError(from: data)
            if statusCode == 401,
               allowClientTokenRefresh,
               let stageError = parsedStageError,
               isUserAuthStage(stageError.stage),
               await refreshUserAuthForRetryIfPossible() {
                print("POST /talk -> auth_user received, refreshed auth token and retrying once")
                return try await performTalk(
                    fileURL: fileURL,
                    fileDataOverride: fileDataOverride,
                    baseURL: baseURL,
                    userID: userID,
                    clientToken: clientToken,
                    systemPrompt: systemPrompt,
                    stage: stage,
                    depthScore: depthScore,
                    romanceTension: romanceTension,
                    sessionCount: sessionCount,
                    personaPreset: personaPreset,
                    memoryCue: memoryCue,
                    idempotencyKey: idempotencyKey,
                    tailSilenceMs: tailSilenceMs,
                    vadThreshold: vadThreshold,
                    speechMs: speechMs,
                    noiseFloorRms: noiseFloorRms,
                    speechRms: speechRms,
                    userName: userName,
                    partialTranscriptHint: partialTranscriptHint,
                    speculativeReuseKey: speculativeReuseKey,
                    speculativePromptHash: speculativePromptHash,
                    studioMetadata: studioMetadata,
                    clientTranscriptOverride: clientTranscriptOverride,
                    screenplayGenerationTranscriptOverride: screenplayGenerationTranscriptOverride,
                    onResponseMetadataReady: onResponseMetadataReady,
                    onFirstAudioSegmentReady: onFirstAudioSegmentReady,
                    onTextReady: onTextReady,
                    onDebugEvent: onDebugEvent,
                    allowClientTokenRefresh: false,
                    allowAudioValidationRetry: allowAudioValidationRetry,
                    forceNoStreamAudio: forceNoStreamAudio
                )
            }
            if statusCode == 401,
               allowClientTokenRefresh,
               !isUserAuthStage(parsedStageError?.stage ?? "") {
                print("POST /talk -> 401 unauthorized, refreshing session token and retrying once")
                clearSessionToken()
                let refreshed = try await refreshClientToken(for: baseURL, userID: userID)
                return try await performTalk(
                    fileURL: fileURL,
                    fileDataOverride: fileDataOverride,
                    baseURL: baseURL,
                    userID: userID,
                    clientToken: refreshed,
                    systemPrompt: systemPrompt,
                    stage: stage,
                    depthScore: depthScore,
                    romanceTension: romanceTension,
                    sessionCount: sessionCount,
                    personaPreset: personaPreset,
                    memoryCue: memoryCue,
                    idempotencyKey: idempotencyKey,
                    tailSilenceMs: tailSilenceMs,
                    vadThreshold: vadThreshold,
                    speechMs: speechMs,
                    noiseFloorRms: noiseFloorRms,
                    speechRms: speechRms,
                    userName: userName,
                    partialTranscriptHint: partialTranscriptHint,
                    speculativeReuseKey: speculativeReuseKey,
                    speculativePromptHash: speculativePromptHash,
                    studioMetadata: studioMetadata,
                    clientTranscriptOverride: clientTranscriptOverride,
                    screenplayGenerationTranscriptOverride: screenplayGenerationTranscriptOverride,
                    onResponseMetadataReady: onResponseMetadataReady,
                    onFirstAudioSegmentReady: onFirstAudioSegmentReady,
                    onTextReady: onTextReady,
                    onDebugEvent: onDebugEvent,
                    allowClientTokenRefresh: false,
                    allowAudioValidationRetry: allowAudioValidationRetry,
                    forceNoStreamAudio: forceNoStreamAudio
                )
            }
            if statusCode == 204 {
                let turnStatus = http?.value(forHTTPHeaderField: "x-turn-status")?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased() ?? ""
                let continueListening = http?.value(forHTTPHeaderField: "x-continue-listening")?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased() ?? ""
                if turnStatus == "continue_listening" || continueListening == "1" || continueListening == "true" {
                    HerLog.talk.info("TALK continue_listening status=204")
                    throw BackendError.continueListening
                }
            }
            if shouldQueueTalkStatus(statusCode) {
                if let queued = await enqueueOfflineTalkRequest(
                    request,
                    body: body,
                    reason: "HTTP \(statusCode)"
                ) {
                    throw queued
                }
            }

            if let stageError = parsedStageError {
                if allowClientTokenRefresh, stageError.stage.lowercased() == "auth_client" {
                    print("POST /talk -> auth_client received, refreshing session token and retrying once")
                    clearSessionToken()
                    let refreshed = try await refreshClientToken(for: baseURL, userID: userID)
                    return try await performTalk(
                        fileURL: fileURL,
                        fileDataOverride: fileDataOverride,
                        baseURL: baseURL,
                        userID: userID,
                        clientToken: refreshed,
                        systemPrompt: systemPrompt,
                        stage: stage,
                        depthScore: depthScore,
                        romanceTension: romanceTension,
                        sessionCount: sessionCount,
                        personaPreset: personaPreset,
                        memoryCue: memoryCue,
                        idempotencyKey: idempotencyKey,
                        tailSilenceMs: tailSilenceMs,
                        vadThreshold: vadThreshold,
                        speechMs: speechMs,
                        noiseFloorRms: noiseFloorRms,
                        speechRms: speechRms,
                        userName: userName,
                        partialTranscriptHint: partialTranscriptHint,
                        speculativeReuseKey: speculativeReuseKey,
                        speculativePromptHash: speculativePromptHash,
                        studioMetadata: studioMetadata,
                        clientTranscriptOverride: clientTranscriptOverride,
                        screenplayGenerationTranscriptOverride: screenplayGenerationTranscriptOverride,
                        onResponseMetadataReady: onResponseMetadataReady,
                        onFirstAudioSegmentReady: onFirstAudioSegmentReady,
                        onTextReady: onTextReady,
                        onDebugEvent: onDebugEvent,
                        allowClientTokenRefresh: false,
                        allowAudioValidationRetry: allowAudioValidationRetry,
                        forceNoStreamAudio: forceNoStreamAudio
                    )
                }
                throw BackendError.stage(stageError.stage, stageError.message)
            }

            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(statusCode, raw)
        }

        let normalizedType = contentType.lowercased()
        let mimeType = normalizedType
            .split(separator: ";", maxSplits: 1)
            .first
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            ?? normalizedType

        let isMP3 = mimeType == "audio/mpeg"
        let isWAV = mimeType == "audio/wav" || mimeType == "audio/x-wav"

        guard isMP3 || isWAV else {
            if let retried = try await retryAudioValidationIfAllowed("non-audio content-type on 200") {
                return retried
            }
            if let stageError = parseStageError(from: data) {
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            throw BackendError.invalidAudioType(contentType)
        }

        let commitSignal = parseCommitSignal(from: http)
        if let commitSignal,
           clientToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
           !commitSignal.sessionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let bootstrapExpiresIn = parseHeaderInt(
                http,
                field: "x-session-expires-in",
                default: 24 * 60 * 60,
                min: 60,
                max: 7 * 24 * 60 * 60
            )
            let expiry = Date().addingTimeInterval(TimeInterval(bootstrapExpiresIn))
            persistResolvedClientToken(commitSignal.sessionId, expiry: expiry)
        }
        var audioDurationMs = parseHeaderInt(
            http,
            field: "x-audio-duration-ms",
            default: 0,
            min: 0,
            max: 600_000
        )
        var timingSource = parseOptionalHeaderString(http, field: "x-screenplay-timing-source")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if audioDurationMs <= 0 {
            audioDurationMs = parseHeaderInt(
                http,
                field: "x-tts-total-ms",
                default: 0,
                min: 0,
                max: 600_000
            )
        }
        var transcript = http?.value(forHTTPHeaderField: "x-transcript")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var reply = http?.value(forHTTPHeaderField: "x-reply")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        var screenplayOutput = parseScreenplayOutput(from: http)
        var screenplayQuality = screenplayOutput?.quality ?? parseScreenplayQuality(from: http)
        var screenplayCues = parseScreenplayCues(from: http)
        var dialogueTimeline = parseDialogueTimeline(from: http)
        var renderContract = parseRenderContract(
            from: http,
            screenplayOutput: screenplayOutput
        )
        var knowledgeTopics = parseDelimitedHeader(http, field: "x-knowledge-topics", separator: ",")
        var knowledgeCitations = parseDelimitedHeader(http, field: "x-knowledge-citations", separator: "|")
        var knowledgeRawQuery = parseOptionalHeaderString(http, field: "x-knowledge-query-raw")
        var knowledgeRewrittenQuery = parseOptionalHeaderString(http, field: "x-knowledge-query-rewrite")
        var knowledgeContradictionRisk = parseHeaderDouble(
            http,
            field: "x-knowledge-contradiction-risk",
            default: 0,
            min: 0,
            max: 1
        )
        let knowledgeContradictionGuard = parseHeaderBool(
            http,
            field: "x-knowledge-contradiction-guard",
            default: false
        )
        let confidenceClass = (http?.value(forHTTPHeaderField: "x-confidence-class") ?? "UNKNOWN")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        let turnMetaAvailable = parseHeaderBool(http, field: "x-turn-meta-available", default: false)
        let screenplayOutputAvailable = parseHeaderBool(
            http,
            field: "x-screenplay-output-available",
            default: false
        )
        let shouldFetchTurnMeta = turnMetaAvailable && (
            (transcript?.isEmpty ?? true) ||
            (reply?.isEmpty ?? true) ||
            (timingSource?.isEmpty ?? true) && screenplayOutputAvailable ||
            screenplayOutput == nil && screenplayOutputAvailable ||
            screenplayCues.isEmpty && screenplayOutputAvailable ||
            (dialogueTimeline == nil && screenplayOutputAvailable) ||
            (screenplayOutput?.writesToPage == true && !renderContract.previewReplyOnly) ||
            (knowledgeTopics.isEmpty && knowledgeCitations.isEmpty)
        )
        var turnMetaRateLimitNotice: BackendTalkTurnMetaRateLimitNotice?
        if shouldFetchTurnMeta, let commitSignal {
            do {
                let payload = try await fetchTurnMeta(
                    baseURL: baseURL,
                    userID: userID,
                    clientToken: clientToken,
                    turnID: commitSignal.turnId
                )
                if transcript?.isEmpty ?? true {
                    transcript = payload.transcript?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if reply?.isEmpty ?? true {
                    reply = payload.reply?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if audioDurationMs <= 0 {
                    audioDurationMs = max(0, payload.audioDurationMs ?? 0)
                }
                if timingSource?.isEmpty ?? true {
                    timingSource = payload.timingSource?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if screenplayOutput == nil {
                    screenplayOutput = payload.screenplayOutput
                }
                if screenplayQuality == nil {
                    screenplayQuality = screenplayOutput?.quality ?? payload.screenplayOutput?.quality
                }
                if screenplayCues.isEmpty {
                    screenplayCues = payload.screenplayCues ?? []
                }
                if dialogueTimeline == nil {
                    dialogueTimeline = payload.dialogueTimeline
                }
                renderContract = renderContract.merged(with: payload.renderContract?.renderContract)
                if knowledgeTopics.isEmpty {
                    knowledgeTopics = payload.knowledgeTopics ?? []
                }
                if knowledgeCitations.isEmpty {
                    knowledgeCitations = payload.knowledgeCitations ?? []
                }
                if knowledgeRawQuery?.isEmpty ?? true {
                    knowledgeRawQuery = payload.knowledgeQueryRaw?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if knowledgeRewrittenQuery?.isEmpty ?? true {
                    knowledgeRewrittenQuery = payload.knowledgeQueryRewrite?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
                if knowledgeContradictionRisk <= 0 {
                    knowledgeContradictionRisk = min(max(payload.knowledgeContradictionRisk ?? 0, 0), 1)
                }
            } catch let error as BackendTalkTurnMetaRateLimitError {
                turnMetaRateLimitNotice = error.notice
                print("GET /talk/turn/\(commitSignal.turnId) rate limited: \(error.localizedDescription)")
            } catch {
                print("GET /talk/turn/\(commitSignal.turnId) failed: \(error.localizedDescription)")
            }
        }
        if let screenplayOutput, screenplayOutput.writesToPage {
            let authoritativeReply = screenplayOutput.text
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !authoritativeReply.isEmpty {
                reply = authoritativeReply
            }
        }
        let knowledgeTrace = BackendTalkKnowledgeTrace(
            topics: knowledgeTopics,
            citations: knowledgeCitations,
            confidenceClass: confidenceClass.isEmpty ? "UNKNOWN" : confidenceClass,
            contradictionRisk: min(max(knowledgeContradictionRisk, 0), 1),
            contradictionGuard: knowledgeContradictionGuard,
            rawQuery: knowledgeRawQuery,
            rewrittenQuery: knowledgeRewrittenQuery
        )
        let creativeMemoryTrace = parseCreativeMemoryTrace(from: http)
        let screenplayTrace = parseScreenplayTrace(from: http)
        let noteAction = parseNoteCaptureAction(from: http)
        let emailAction = parseEmailComposeAction(from: http)
        let calendarAction = parseCalendarComposeAction(from: http)
        let taskAction = parseTaskAction(from: http)
        let assistantSelfName = http?.value(forHTTPHeaderField: "x-assistant-self-name")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let userName = http?.value(forHTTPHeaderField: "x-user-name")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let turnStatus = (http?.value(forHTTPHeaderField: "x-turn-status") ?? "responded")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let responsePersonaKey = (http?.value(forHTTPHeaderField: "x-persona-key") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if !responsePersonaKey.isEmpty, responsePersonaKey != personaFlowKey {
            print("POST /talk -> persona contract mismatch response=\(responsePersonaKey) expected=\(personaFlowKey)")
        }
        let turnContinueReason = parseOptionalHeaderString(http, field: "x-continue-reason")
        let turnErrorStage = parseOptionalHeaderString(http, field: "x-turn-error-stage")
        let turnErrorMessage = parseOptionalHeaderString(http, field: "x-turn-error-message")
        let speculativeTrace = BackendTalkSpeculativeTrace(
            reused: parseHeaderBool(http, field: "x-speculative-reuse", default: false),
            speculativeKey: parseOptionalHeaderString(http, field: "x-speculative-key"),
            promptHash: parseOptionalHeaderString(http, field: "x-speculative-prompt-hash")
        )
        let uiReflection = BackendTalkUIReflection(
            cycleIndex: parseHeaderInt(
                http,
                field: "x-cycle-index",
                default: BackendTalkUIReflection.default.cycleIndex,
                min: 0,
                max: 10_000
            ),
            orbSaturation: parseHeaderDouble(
                http,
                field: "x-ui-orb-saturation",
                default: BackendTalkUIReflection.default.orbSaturation,
                min: 0.35,
                max: 1.0
            ),
            orbReactivity: parseHeaderDouble(
                http,
                field: "x-ui-orb-reactivity",
                default: BackendTalkUIReflection.default.orbReactivity,
                min: 0.20,
                max: 1.0
            ),
            orbSmoothing: parseHeaderDouble(
                http,
                field: "x-ui-orb-smoothing",
                default: BackendTalkUIReflection.default.orbSmoothing,
                min: 0.10,
                max: 1.0
            ),
            voiceSpeed: parseHeaderDouble(
                http,
                field: "x-ui-voice-speed",
                default: BackendTalkUIReflection.default.voiceSpeed,
                min: 0.25,
                max: 4.0
            ),
            overAttachmentSafeguardActive: parseHeaderBool(
                http,
                field: "x-safeguard-over-attachment",
                default: BackendTalkUIReflection.default.overAttachmentSafeguardActive
            )
        )

        guard !data.isEmpty else {
            if let retried = try await retryAudioValidationIfAllowed("empty audio payload") {
                return retried
            }
            throw BackendError.emptyAudio
        }

        if isMP3, !looksLikeMP3(data) {
            if let retried = try await retryAudioValidationIfAllowed("invalid mp3 signature") {
                return retried
            }
            throw BackendError.invalidAudioType(contentType)
        }
        if isWAV, !looksLikeWav(data) {
            if let retried = try await retryAudioValidationIfAllowed("invalid wav signature") {
                return retried
            }
            throw BackendError.invalidAudioType(contentType)
        }

        let audioExt = isWAV ? "wav" : "mp3"
        let audioURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("them_backend_\(UUID().uuidString).\(audioExt)")
        try data.write(to: audioURL, options: [.atomic])

        let firstSegmentBytes = parseHeaderInt(
            http,
            field: "x-tts-first-bytes",
            default: 0,
            min: 0,
            max: data.count
        )
        let streamedRemainderURL: URL?
        if emittedFirstSegment,
           firstSegmentBytes >= minPlayableSegmentBytes,
           data.count > firstSegmentBytes {
            let remainderData = Data(data.dropFirst(firstSegmentBytes))
            if !remainderData.isEmpty {
                let remainderExt = isWAV ? "wav" : "mp3"
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("them_backend_remainder_\(UUID().uuidString).\(remainderExt)")
                try remainderData.write(to: url, options: [.atomic])
                streamedRemainderURL = url
            } else {
                streamedRemainderURL = nil
            }
        } else {
            streamedRemainderURL = nil
        }

        return BackendTalkResult(
            audioURL: audioURL,
            streamedFirstSegment: emittedFirstSegment,
            streamedRemainderURL: streamedRemainderURL,
            audioDurationMs: audioDurationMs > 0 ? audioDurationMs : nil,
            renderContract: renderContract,
            timingSource: timingSource,
            transcript: transcript,
            reply: reply,
            screenplayOutput: screenplayOutput,
            screenplayQuality: screenplayQuality,
            screenplayCues: screenplayCues,
            dialogueTimeline: dialogueTimeline,
            assistantSelfName: assistantSelfName,
            userName: userName,
            uiReflection: uiReflection,
            knowledgeTrace: knowledgeTrace,
            creativeMemoryTrace: creativeMemoryTrace,
            screenplayTrace: screenplayTrace,
            turnStatus: turnStatus,
            turnContinueReason: turnContinueReason,
            turnErrorStage: turnErrorStage,
            turnErrorMessage: turnErrorMessage,
            noteAction: noteAction,
            emailAction: emailAction,
            calendarAction: calendarAction,
            taskAction: taskAction,
            speculativeTrace: speculativeTrace,
            turnMetaRateLimitNotice: turnMetaRateLimitNotice,
            commit: commitSignal
        )
    }

    private func fetchTurnMeta(
        baseURL: URL,
        userID: String,
        clientToken: String,
        turnID: String
    ) async throws -> BackendTalkTurnMetaPayload {
        let normalizedTurnID = turnID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTurnID.isEmpty else {
            throw BackendError.http(400, "Missing turn id")
        }

        let url = baseURL
            .appendingPathComponent("talk")
            .appendingPathComponent("turn")
            .appendingPathComponent(normalizedTurnID)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = min(15, requestTimeout)
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if !userID.isEmpty {
            request.setValue(userID, forHTTPHeaderField: "X-User-Id")
        }
        request.setValue(clientToken, forHTTPHeaderField: "X-Client-Token")
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid turn metadata response")
        }
        if let notice = BackendTalkTurnMetaRateLimitNotice(
            turnId: normalizedTurnID,
            statusCode: http.statusCode,
            data: data,
            retryAfterHeader: http.value(forHTTPHeaderField: "Retry-After")
        ) {
            throw BackendTalkTurnMetaRateLimitError(notice: notice)
        }
        guard http.statusCode == 200 else {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }

        do {
            return try JSONDecoder().decode(BackendTalkTurnMetaPayload.self, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid turn metadata payload" : raw)
        }
    }

    private func resolveClientToken(for baseURL: URL, userID: String) async throws -> String {
        let now = Date()
        let formatter = ISO8601DateFormatter()
        let sharedToken = readSharedClientToken()
        let sharedExpiry: Date? = {
            guard
                let raw = readSharedClientTokenExpiry(),
                let parsed = formatter.date(from: raw)
            else { return nil }
            return parsed
        }()

        if
            let token = cachedClientToken,
            let expiry = cachedClientTokenExpiry,
            expiry.timeIntervalSince(now) > sessionRefreshSkew
        {
            writeSharedClientToken(token, expiry: expiry)
            return token
        }

        if
            BackendClientCredentialStorePolicy.currentShouldUseKeychainForClientTokens,
            let token = readKeychainString(account: keychainTokenAccount),
            let expiryRaw = readKeychainString(account: keychainExpiryAccount),
            let expiry = formatter.date(from: expiryRaw),
            expiry.timeIntervalSince(now) > sessionRefreshSkew
        {
            cachedClientToken = token
            cachedClientTokenExpiry = expiry
            writeSharedClientToken(token, expiry: expiry)
            return token
        }

        if let sharedToken {
            let expiry = sharedExpiry ?? now.addingTimeInterval(5 * 60)
            if expiry.timeIntervalSince(now) > sessionRefreshSkew {
                cachedClientToken = sharedToken
                cachedClientTokenExpiry = expiry
                if BackendClientCredentialStorePolicy.currentShouldUseKeychainForClientTokens {
                    writeKeychainString(sharedToken, account: keychainTokenAccount)
                    writeKeychainString(formatter.string(from: expiry), account: keychainExpiryAccount)
                }
                writeSharedClientToken(sharedToken, expiry: expiry)
                return sharedToken
            }
        }

        return try await refreshClientToken(for: baseURL, userID: userID)
    }

    private func resolveStudioRenderClientToken(for baseURL: URL, userID: String) async throws -> String {
        let now = Date()
        let formatter = ISO8601DateFormatter()
        if
            let token = cachedClientToken,
            let expiry = cachedClientTokenExpiry,
            expiry.timeIntervalSince(now) > sessionRefreshSkew
        {
            writeSharedClientToken(token, expiry: expiry)
            return token
        }

        if
            let sharedToken = readSharedClientToken(),
            let expiryRaw = readSharedClientTokenExpiry(),
            let expiry = formatter.date(from: expiryRaw),
            expiry.timeIntervalSince(now) > sessionRefreshSkew
        {
            cachedClientToken = sharedToken
            cachedClientTokenExpiry = expiry
            writeSharedClientToken(sharedToken, expiry: expiry)
            return sharedToken
        }

        return try await refreshClientToken(for: baseURL, userID: userID)
    }

    private func resolveStudioRenderUserID() -> String {
        if let cached = cachedUserID, !cached.isEmpty {
            writeSharedUserID(cached)
            return cached
        }
        let stored = normalizeStoredUserID(readSharedUserID())
        if !stored.isEmpty {
            cachedUserID = stored
            writeSharedUserID(stored)
            return stored
        }
        let generated = generateStableUserID()
        cachedUserID = generated
        writeSharedUserID(generated)
        return generated
    }

    private func refreshClientToken(
        for baseURL: URL,
        userID: String,
        allowAuthTokenRefresh: Bool = true
    ) async throws -> String {
        var request = URLRequest(url: baseURL.appendingPathComponent("session"))
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if !userID.isEmpty {
            request.setValue(userID, forHTTPHeaderField: "X-User-Id")
        }
        let appToken = appToken()
        print("APP_TOKEN info:", redactedTokenInfo(appToken))
        if let token = appToken {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        attachAuthorizationHeader(to: &request)
        request.httpBody = Data("{}".utf8)

        print("POST /session -> url=\(request.url?.absoluteString ?? "-") has_app_token=\(appToken != nil)")
        let (data, response) = try await urlSession.data(for: request)
        let http = response as? HTTPURLResponse
        let status = http?.statusCode ?? -1
        let requestID = http?.value(forHTTPHeaderField: "X-Request-Id") ?? "-"
        let responsePersonaKey = (http?.value(forHTTPHeaderField: "x-persona-key") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        if !responsePersonaKey.isEmpty, responsePersonaKey != personaFlowKey {
            print("POST /session -> persona contract mismatch response=\(responsePersonaKey) expected=\(personaFlowKey)")
        }
        print("POST /session -> id=\(requestID) status=\(status) bytes=\(data.count)")

        guard (200...299).contains(status) else {
            if let stageError = parseStageError(from: data) {
                if allowAuthTokenRefresh,
                   isUserAuthStage(stageError.stage),
                   await refreshUserAuthForRetryIfPossible() {
                    return try await refreshClientToken(
                        for: baseURL,
                        userID: userID,
                        allowAuthTokenRefresh: false
                    )
                }
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(status, raw)
        }

        guard
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let token = obj["client_token"] as? String,
            !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            throw BackendError.stage("session", "Invalid session response payload.")
        }

        if let rawUserID = obj["user_id"] as? String {
            let normalized = normalizeStoredUserID(rawUserID)
            if !normalized.isEmpty {
                writeUserID(normalized)
            }
        }

        let expiresIn: TimeInterval
        if let number = obj["expires_in"] as? NSNumber {
            expiresIn = max(60, number.doubleValue)
        } else {
            expiresIn = 24 * 60 * 60
        }

        let expiry = Date().addingTimeInterval(expiresIn)
        persistResolvedClientToken(token, expiry: expiry)

        return token
    }

    private func clearSessionToken() {
        cachedClientToken = nil
        cachedClientTokenExpiry = nil
        cachedHealthyURL = nil      // force re-check on next turn after auth failure
        cachedHealthyAt = .distantPast
        if BackendClientCredentialStorePolicy.currentShouldUseKeychainForClientTokens {
            deleteKeychainString(account: keychainTokenAccount)
            deleteKeychainString(account: keychainExpiryAccount)
        }
        clearSharedClientToken()
    }

    private func persistResolvedClientToken(_ token: String, expiry: Date) {
        cachedClientToken = token
        cachedClientTokenExpiry = expiry

        let expiryRaw = ISO8601DateFormatter().string(from: expiry)
        if BackendClientCredentialStorePolicy.currentShouldUseKeychainForClientTokens {
            writeKeychainString(token, account: keychainTokenAccount)
            writeKeychainString(expiryRaw, account: keychainExpiryAccount)
        }
        writeSharedClientToken(token, expiry: expiry)
    }

    private func performCraftRequest<T: Decodable>(
        method: String = "GET",
        pathComponents: [String],
        queryItems: [URLQueryItem] = [],
        responseType: T.Type
    ) async throws -> T {
        try await performCraftRequestData(
            method: method,
            pathComponents: pathComponents,
            queryItems: queryItems,
            bodyData: nil,
            responseType: responseType
        )
    }

    private func performCraftRequest<T: Decodable, Body: Encodable>(
        method: String,
        pathComponents: [String],
        queryItems: [URLQueryItem] = [],
        body: Body,
        responseType: T.Type
    ) async throws -> T {
        let encoder = JSONEncoder()
        let bodyData = try encoder.encode(body)
        return try await performCraftRequestData(
            method: method,
            pathComponents: pathComponents,
            queryItems: queryItems,
            bodyData: bodyData,
            responseType: responseType
        )
    }

    private func performCraftRequestData<T: Decodable>(
        method: String,
        pathComponents: [String],
        queryItems: [URLQueryItem] = [],
        bodyData: Data?,
        responseType: T.Type
    ) async throws -> T {
        var request = makeCraftRequest(
            method: method,
            pathComponents: pathComponents,
            queryItems: queryItems,
            hasJSONBody: bodyData != nil
        )
        request.httpBody = bodyData

        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BackendError.http(-1, "Invalid craft response.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let craftError = parseCraftError(from: data) {
                throw BackendError.stage("craft", craftError.message)
            }
            if let stageError = parseStageError(from: data) {
                throw BackendError.stage(stageError.stage, stageError.message)
            }
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(http.statusCode, raw)
        }

        do {
            return try JSONDecoder().decode(responseType, from: data)
        } catch {
            let raw = String(data: data, encoding: .utf8) ?? ""
            throw BackendError.http(502, raw.isEmpty ? "Invalid craft payload." : raw)
        }
    }

    private func makeCraftRequest(
        method: String,
        pathComponents: [String],
        queryItems: [URLQueryItem] = [],
        hasJSONBody: Bool
    ) -> URLRequest {
        persistSharedBackendBaseURL(baseURL)
        var url = baseURL
        for component in pathComponents {
            url.appendPathComponent(component)
        }
        if !queryItems.isEmpty {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            components?.queryItems = queryItems.filter { item in
                guard let value = item.value else { return false }
                return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            }
            if let componentURL = components?.url {
                url = componentURL
            }
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = requestTimeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("\(Self.craftSchemaVersion)", forHTTPHeaderField: "X-Craft-Schema-Version")
        request.setValue(personaFlowKey, forHTTPHeaderField: "X-Persona-Key")
        if hasJSONBody {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if shouldAttachUserIDHeader {
            let userID = resolveUserID()
            if !userID.isEmpty {
                request.setValue(userID, forHTTPHeaderField: "X-User-Id")
            }
        }
        if let token = appToken() {
            request.setValue(token, forHTTPHeaderField: "X-APP-TOKEN")
        }
        return request
    }

    private func parseCraftError(from data: Data) -> (code: String, message: String)? {
        guard
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let code = obj["error"] as? String
        else { return nil }
        let message = (obj["message"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (code, (message?.isEmpty == false ? message : code) ?? code)
    }

    private func requiredCraftPathValue(_ raw: String, field: String) throws -> String {
        let value = try requiredCraftBodyValue(raw, field: field)
        if value.contains("/") {
            throw BackendError.stage("craft", "\(field) cannot contain a slash.")
        }
        return value
    }

    private func optionalCraftPathValue(_ raw: String?, field: String) throws -> String? {
        guard let value = try optionalCraftBodyValue(raw, field: field) else { return nil }
        if value.contains("/") {
            throw BackendError.stage("craft", "\(field) cannot contain a slash.")
        }
        return value
    }

    private func requiredCraftBodyValue(_ raw: String, field: String) throws -> String {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else {
            throw BackendError.stage("craft", "\(field) is required.")
        }
        return value
    }

    private func optionalCraftBodyValue(_ raw: String?, field: String) throws -> String? {
        guard let raw else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        return value
    }

    private func parseStageError(from data: Data) -> (stage: String, message: String)? {
        guard
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let stage = obj["stage"] as? String
        else { return nil }

        if let message = obj["error"] as? String {
            return (stage, message)
        }

        if let errorObj = obj["error"] as? [String: Any] {
            if let message = errorObj["message"] as? String {
                return (stage, message)
            }
            if let data = try? JSONSerialization.data(withJSONObject: errorObj, options: []),
               let raw = String(data: data, encoding: .utf8) {
                return (stage, raw)
            }
        }

        return (stage, "Unknown error")
    }

    private func parseRealtimeUnavailable(from data: Data, statusCode: Int) -> BackendRealtimeUnavailable? {
        guard let payload = try? JSONDecoder().decode(BackendRealtimeUnavailablePayload.self, from: data) else {
            return nil
        }
        let stage = (payload.stage ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let code = (payload.code ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let provider = (payload.realtimeProvider ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let degraded = payload.degraded == true
        let hasRealtimeSignal = stage.lowercased() == "realtime_auth" ||
            degraded ||
            !code.isEmpty ||
            !provider.isEmpty
        guard hasRealtimeSignal else { return nil }
        let message = (payload.error ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return BackendRealtimeUnavailable(
            statusCode: statusCode,
            stage: stage.isEmpty ? "realtime_auth" : stage,
            code: code.isEmpty ? "realtime_unavailable" : code,
            realtimeProvider: provider.isEmpty ? nil : provider,
            fallback: payload.fallback,
            degraded: degraded,
            message: message
        )
    }

    private func dataForTalkRequest(
        _ request: URLRequest,
        onResponse: ((HTTPURLResponse) -> Void)? = nil,
        onChunk: ((Data, HTTPURLResponse) -> Void)? = nil
    ) async throws -> (Data, URLResponse) {
        var attempt = 0
        while true {
            do {
                let result: (Data, URLResponse)
                if onResponse != nil || onChunk != nil {
                    result = try await dataForTalkRequestStreaming(
                        request,
                        onResponse: onResponse,
                        onChunk: onChunk
                    )
                } else {
                    result = try await URLSession.shared.data(for: request)
                }
                if let http = result.1 as? HTTPURLResponse,
                   retryableHTTPStatus.contains(http.statusCode),
                   attempt + 1 < maxTalkAttempts {
                    attempt += 1
                    let delayNs = UInt64(300 * attempt) * 1_000_000
                    print("POST /talk -> transient status \(http.statusCode), retry \(attempt + 1)/\(maxTalkAttempts)")
                    try await Task.sleep(nanoseconds: delayNs)
                    continue
                }
                return result
            } catch {
                if (onResponse != nil || onChunk != nil),
                   shouldFallbackToPlainTalkTransport(for: error) {
                    print("POST /talk -> streaming transport fell back to shared data: \(error.localizedDescription)")
                    return try await dataForTalkRequestViaSharedData(
                        request,
                        onResponse: onResponse,
                        onChunk: onChunk
                    )
                }
                if shouldRetryTalk(for: error), attempt + 1 < maxTalkAttempts {
                    attempt += 1
                    let delayNs = UInt64(300 * attempt) * 1_000_000
                    print("POST /talk -> transient network error retry \(attempt + 1)/\(maxTalkAttempts): \(error.localizedDescription)")
                    try await Task.sleep(nanoseconds: delayNs)
                    continue
                }
                throw error
            }
        }
    }

    private final class TalkStreamingDelegate: NSObject, URLSessionDataDelegate {
        private let onResponse: ((HTTPURLResponse) -> Void)?
        private let onChunk: ((Data, HTTPURLResponse) -> Void)?
        private var continuation: CheckedContinuation<(Data, URLResponse), Error>?
        private var response: URLResponse?
        private var accumulatedData = Data()
        private var finished = false

        init(
            onResponse: ((HTTPURLResponse) -> Void)?,
            onChunk: ((Data, HTTPURLResponse) -> Void)?,
            streamChunkFlushBytes: Int
        ) {
            self.onResponse = onResponse
            self.onChunk = onChunk
        }

        func attach(_ continuation: CheckedContinuation<(Data, URLResponse), Error>) {
            self.continuation = continuation
        }

        func urlSession(
            _ session: URLSession,
            dataTask: URLSessionDataTask,
            didReceive response: URLResponse,
            completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
        ) {
            self.response = response
            if let http = response as? HTTPURLResponse {
                onResponse?(http)
            }
            completionHandler(.allow)
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
            accumulatedData.append(data)
            guard let http = response as? HTTPURLResponse else { return }
            onChunk?(data, http)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            guard !finished else { return }
            finished = true
            defer { continuation = nil }
            if let error {
                continuation?.resume(throwing: error)
                return
            }
            guard let response else {
                continuation?.resume(throwing: BackendError.http(-1, "Missing talk response."))
                return
            }
            continuation?.resume(returning: (accumulatedData, response))
        }
    }

    private func dataForTalkRequestStreaming(
        _ request: URLRequest,
        onResponse: ((HTTPURLResponse) -> Void)? = nil,
        onChunk: ((Data, HTTPURLResponse) -> Void)? = nil
    ) async throws -> (Data, URLResponse) {
        do {
            return try await dataForTalkRequestStreamingViaDelegate(
                request,
                onResponse: onResponse,
                onChunk: onChunk
            )
        } catch {
            let nsError = error as NSError
            if nsError.domain == NSPOSIXErrorDomain && nsError.code == 1 {
                print("POST /talk -> delegate streaming transport fell back to shared async bytes: \(error.localizedDescription)")
                return try await dataForTalkRequestStreamingViaAsyncBytes(
                    request,
                    onResponse: onResponse,
                    onChunk: onChunk
                )
            }
            throw error
        }
    }

    private func dataForTalkRequestStreamingViaDelegate(
        _ request: URLRequest,
        onResponse: ((HTTPURLResponse) -> Void)? = nil,
        onChunk: ((Data, HTTPURLResponse) -> Void)? = nil
    ) async throws -> (Data, URLResponse) {
        let delegate = TalkStreamingDelegate(
            onResponse: onResponse,
            onChunk: onChunk,
            streamChunkFlushBytes: streamChunkFlushBytes
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.waitsForConnectivity = false
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = requestTimeout
        configuration.timeoutIntervalForResource = requestTimeout
        let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
        defer {
            session.finishTasksAndInvalidate()
        }
        return try await withCheckedThrowingContinuation { continuation in
            delegate.attach(continuation)
            session.dataTask(with: request).resume()
        }
    }

    private func dataForTalkRequestViaSharedData(
        _ request: URLRequest,
        onResponse: ((HTTPURLResponse) -> Void)? = nil,
        onChunk: ((Data, HTTPURLResponse) -> Void)? = nil
    ) async throws -> (Data, URLResponse) {
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse {
            onResponse?(http)
            if !data.isEmpty {
                onChunk?(data, http)
            }
        }
        return (data, response)
    }

    private func dataForTalkRequestStreamingViaAsyncBytes(
        _ request: URLRequest,
        onResponse: ((HTTPURLResponse) -> Void)? = nil,
        onChunk: ((Data, HTTPURLResponse) -> Void)? = nil
    ) async throws -> (Data, URLResponse) {
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        if let http = response as? HTTPURLResponse {
            onResponse?(http)
        }
        guard let http = response as? HTTPURLResponse else {
            let data = try await collectAsyncBytes(bytes)
            return (data, response)
        }

        let chunkSize = max(512, min(1_024, streamChunkFlushBytes))
        var accumulated = Data()
        for try await chunk in bytes.allChunks(ofSize: chunkSize) {
            accumulated.append(chunk)
            onChunk?(chunk, http)
        }
        return (accumulated, response)
    }

    private func resolveTalkClientTokenOrFallback(
        for baseURL: URL,
        userID: String,
        onDebugEvent: ((BackendTalkDebugEvent) -> Void)?
    ) async throws -> String {
        do {
            let clientToken = try await resolveClientToken(for: baseURL, userID: userID)
            onDebugEvent?(
                BackendTalkDebugEvent(
                    stage: "resolve_client_token_ok",
                    resolvedBaseURL: baseURL.absoluteString,
                    requestURL: nil,
                    clientTokenResolved: !clientToken.isEmpty,
                    errorDomain: nil,
                    errorCode: nil,
                    errorDescription: nil
                )
            )
            return clientToken
        } catch {
            let nsError = error as NSError
            onDebugEvent?(
                BackendTalkDebugEvent(
                    stage: "resolve_client_token_bootstrap_fallback",
                    resolvedBaseURL: baseURL.absoluteString,
                    requestURL: nil,
                    clientTokenResolved: false,
                    errorDomain: nsError.domain,
                    errorCode: nsError.code,
                    errorDescription: error.localizedDescription
                )
            )
            return ""
        }
    }

    private func shouldRetryTalk(for error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        return retryableURLErrors.contains(urlError.code)
    }

    private func shouldQueueTalkStatus(_ statusCode: Int) -> Bool {
        retryableHTTPStatus.contains(statusCode) || statusCode == -1
    }

    private func enqueueOfflineTalkRequest(
        _ request: URLRequest,
        body: Data,
        reason: String
    ) async -> BackendTalkQueuedError? {
        do {
            let result = try await OfflineTalkOutbox.shared.enqueue(
                request: request,
                body: body,
                reason: reason
            )
            print("POST /talk -> queued offline outbox entry \(result.entry.id)")
            return BackendTalkQueuedError(
                entryID: result.entry.id,
                snapshot: result.snapshot,
                reason: reason
            )
        } catch {
            print("POST /talk -> offline outbox enqueue failed: \(error.localizedDescription)")
            return nil
        }
    }

    private func shouldFallbackToPlainTalkTransport(for error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSPOSIXErrorDomain && nsError.code == 1
    }

    private func normalizedIdempotencyKey(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let filtered = trimmed.filter { char in
            char.isLetter || char.isNumber || char == "-" || char == "_" || char == "."
        }
        guard !filtered.isEmpty else { return nil }
        return String(filtered.prefix(96))
    }

    private func resolveBaseURL() async throws -> URL {
        // Return cached healthy URL within TTL — avoids a /health round-trip before every /talk.
        let now = Date()
        if let cached = cachedHealthyURL,
           now.timeIntervalSince(cachedHealthyAt) < healthCacheTTL {
            return cached
        }

        if await isHealthy(baseURL) {
            cachedHealthyURL = baseURL
            cachedHealthyAt = now
            persistSharedBackendBaseURL(baseURL)
            return baseURL
        }
        if await isHealthy(fallbackURL) {
            baseURL = fallbackURL
            cachedHealthyURL = fallbackURL
            cachedHealthyAt = now
            persistSharedBackendBaseURL(fallbackURL)
            return fallbackURL
        }
        // Don't block /talk solely on preflight health checks.
        // Some local setups can return transient non-2xx/304 on /health while /talk still works.
        // Cache nothing on failure so the next turn retries.
        persistSharedBackendBaseURL(baseURL)
        return baseURL
    }

    private func isHealthy(_ url: URL) async -> Bool {
        let healthURL = url.appendingPathComponent("health")
        do {
            var request = URLRequest(url: healthURL)
            request.httpMethod = "GET"
            request.timeoutInterval = 5
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            request.setValue("no-cache", forHTTPHeaderField: "Pragma")

            let (data, response) = try await urlSession.data(for: request)
            guard let http = response as? HTTPURLResponse else { return false }
            return BackendAPIResponseValidator.isHealthyResponse(
                requestURL: healthURL,
                response: http,
                data: data
            )
        } catch {
            return false
        }
    }

    private func appToken() -> String? {
        let defaultsRaw = (UserDefaults.standard.string(forKey: "app_token") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let plistRaw = (Bundle.main.object(forInfoDictionaryKey: "APP_TOKEN") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let envRaw = (ProcessInfo.processInfo.environment["APP_TOKEN"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        let defaults = isUsableTokenValue(defaultsRaw) ? defaultsRaw : nil
        let plist = isUsableTokenValue(plistRaw) ? plistRaw : nil
        let env = isUsableTokenValue(envRaw) ? envRaw : nil

        if let plist, let env, plist != env {
            print("APP_TOKEN mismatch env/plist -> using plist value")
        }

        if let defaults { return defaults }
        if let plist { return plist }
        if let env { return env }
        if let fallback = devFallbackAppToken { return fallback }
        let keychainRaw = (BackendAuthClient.sharedAppToken() ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let keychain = isUsableTokenValue(keychainRaw) ? keychainRaw : nil
        if let keychain { return keychain }
        return devFallbackAppToken
    }

    private func isUsableTokenValue(_ value: String) -> Bool {
        guard !value.isEmpty else { return false }
        // Protect against unresolved placeholders like "$(APP_TOKEN)".
        if value.hasPrefix("$("), value.hasSuffix(")") { return false }
        return true
    }

    private func attachAuthorizationHeader(to request: inout URLRequest) {
        guard let value = BackendAuthClient.authorizationHeaderValue(), !value.isEmpty else { return }
        request.setValue(value, forHTTPHeaderField: "Authorization")
    }

    private func isUserAuthStage(_ stage: String) -> Bool {
        stage.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "auth_user"
    }

    private func refreshUserAuthForRetryIfPossible() async -> Bool {
        let current = BackendAuthClient.currentAuthSessionState()
        guard current.refreshTokenPresent else { return false }
        do {
            let refreshed = try await BackendAuthClient.refreshAuthSession(force: true)
            return refreshed.isAuthenticated
        } catch {
            return false
        }
    }

    private func redactedTokenInfo(_ token: String?) -> String {
        guard let token, !token.isEmpty else { return "nil" }
        let prefix = token.prefix(3)
        let suffix = token.suffix(2)
        return "\(prefix)...\(suffix) len=\(token.count)"
    }
    private static func resolveURL(fromEnv envName: String, infoPlistKey: String, fallback: URL) -> URL {
        if let uiTestURL = BackendDefaultBaseURLPolicy.currentUITestOverrideBaseURL {
            return uiTestURL
        }
        let envValue = (ProcessInfo.processInfo.environment[envName] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if isUsableConfigValue(envValue), let url = URL(string: envValue), isUsableBackendURL(url) {
            return canonicalizeLoopbackURL(url)
        }

        if
            let plistValue = Bundle.main.object(forInfoDictionaryKey: infoPlistKey) as? String,
            isUsableConfigValue(plistValue),
            let url = URL(string: plistValue),
            isUsableBackendURL(url)
        {
            return canonicalizeLoopbackURL(url)
        }

        let defaultsValue = (UserDefaults.standard.string(forKey: sharedBackendBaseURLDefaultsKeyStatic) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if isUsableConfigValue(defaultsValue),
           let url = URL(string: defaultsValue),
           isUsableBackendURL(url) {
            let resolvedURL = canonicalizeLoopbackURL(url)
            if BackendDefaultBaseURLPolicy.currentShouldUseStoredBaseURL(resolvedURL) {
                return resolvedURL
            }
            UserDefaults.standard.removeObject(forKey: sharedBackendBaseURLDefaultsKeyStatic)
            UserDefaults.standard.synchronize()
        }

        return canonicalizeLoopbackURL(fallback)
    }

    private static func isUsableConfigValue(_ raw: String) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return false }
        if value.hasPrefix("$("), value.hasSuffix(")") {
            return false
        }
        return true
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

    private static func isLoopbackHost(_ host: String) -> Bool {
        let normalized = host.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized == "localhost"
            || normalized == "127.0.0.1"
            || normalized == "::1"
            || normalized == "[::1]"
    }

    private func looksLikeMP3(_ data: Data) -> Bool {
        if data.starts(with: [0x49, 0x44, 0x33]) { // ID3
            return true
        }
        guard data.count >= 2 else { return false }
        return data[0] == 0xFF && (data[1] & 0xE0) == 0xE0
    }

    private func looksLikeWav(_ data: Data) -> Bool {
        guard data.count >= 12 else { return false }
        let riff = data.prefix(4)
        let wave = data.subdata(in: 8..<12)
        return riff == Data([0x52, 0x49, 0x46, 0x46]) && wave == Data([0x57, 0x41, 0x56, 0x45])
    }

    private func looksLikeM4A(_ data: Data) -> Bool {
        // MP4 family starts with size + "ftyp"
        guard data.count >= 12 else { return false }
        return data[4] == 0x66 && data[5] == 0x74 && data[6] == 0x79 && data[7] == 0x70
    }

    private func makeSilentTalkUploadFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("them_text_turn_\(UUID().uuidString).wav")
        try makeSilentWavData(durationMs: 320).write(to: url, options: [.atomic])
        return url
    }

    private func makeSilentWavData(durationMs: Int, sampleRate: Int = 16_000) -> Data {
        let safeDurationMs = max(120, min(2_000, durationMs))
        let channels: UInt16 = 1
        let bitsPerSample: UInt16 = 16
        let bytesPerSample = Int(bitsPerSample / 8)
        let frameCount = max(1, (sampleRate * safeDurationMs) / 1_000)
        let dataSize = frameCount * Int(channels) * bytesPerSample
        let byteRate = UInt32(sampleRate * Int(channels) * bytesPerSample)
        let blockAlign = UInt16(Int(channels) * bytesPerSample)
        let riffChunkSize = UInt32(36 + dataSize)

        var data = Data()
        data.appendString("RIFF")
        data.append(littleEndianBytes(riffChunkSize))
        data.appendString("WAVE")
        data.appendString("fmt ")
        data.append(littleEndianBytes(UInt32(16)))
        data.append(littleEndianBytes(UInt16(1)))
        data.append(littleEndianBytes(channels))
        data.append(littleEndianBytes(UInt32(sampleRate)))
        data.append(littleEndianBytes(byteRate))
        data.append(littleEndianBytes(blockAlign))
        data.append(littleEndianBytes(bitsPerSample))
        data.appendString("data")
        data.append(littleEndianBytes(UInt32(dataSize)))
        data.append(Data(repeating: 0, count: dataSize))
        return data
    }

    private func littleEndianBytes(_ value: UInt16) -> Data {
        var littleEndian = value.littleEndian
        return Data(bytes: &littleEndian, count: MemoryLayout<UInt16>.size)
    }

    private func littleEndianBytes(_ value: UInt32) -> Data {
        var littleEndian = value.littleEndian
        return Data(bytes: &littleEndian, count: MemoryLayout<UInt32>.size)
    }

    private func uploadMetadata(for fileURL: URL, data: Data) -> (filename: String, mimeType: String) {
        let ext = fileURL.pathExtension.lowercased()
        let byExt: [String: String] = [
            "wav": "audio/wav",
            "m4a": "audio/m4a",
            "mp3": "audio/mpeg",
            "aac": "audio/aac",
            "ogg": "audio/ogg",
            "flac": "audio/flac",
            "webm": "audio/webm",
            "aif": "audio/aiff",
            "aiff": "audio/aiff",
        ]

        if let mime = byExt[ext], !ext.isEmpty {
            return ("recording.\(ext)", mime)
        }
        if looksLikeWav(data) {
            return ("recording.wav", "audio/wav")
        }
        if looksLikeMP3(data) {
            return ("recording.mp3", "audio/mpeg")
        }
        if looksLikeM4A(data) {
            return ("recording.m4a", "audio/m4a")
        }
        return ("recording.m4a", "audio/m4a")
    }

    private func normalizedSystemPrompt(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let maxChars = 12_000
        if trimmed.count <= maxChars { return trimmed }
        return String(trimmed.prefix(maxChars))
    }

    private func parseHeaderDouble(
        _ response: HTTPURLResponse?,
        field: String,
        default fallback: Double,
        min: Double,
        max: Double
    ) -> Double {
        guard let raw = response?.value(forHTTPHeaderField: field) else {
            return fallback
        }
        guard let value = Double(raw.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return fallback
        }
        return Swift.max(min, Swift.min(max, value))
    }

    private func parseHeaderInt(
        _ response: HTTPURLResponse?,
        field: String,
        default fallback: Int,
        min: Int,
        max: Int
    ) -> Int {
        guard let raw = response?.value(forHTTPHeaderField: field) else {
            return fallback
        }
        guard let value = Int(raw.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return fallback
        }
        return Swift.max(min, Swift.min(max, value))
    }

    private func parseHeaderBool(
        _ response: HTTPURLResponse?,
        field: String,
        default fallback: Bool
    ) -> Bool {
        guard let raw = response?.value(forHTTPHeaderField: field)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        else {
            return fallback
        }
        if raw == "1" || raw == "true" || raw == "yes" { return true }
        if raw == "0" || raw == "false" || raw == "no" { return false }
        return fallback
    }

    private func parseOptionalHeaderString(
        _ response: HTTPURLResponse?,
        field: String
    ) -> String? {
        guard
            let raw = response?.value(forHTTPHeaderField: field)?
                .removingPercentEncoding?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !raw.isEmpty
        else {
            return nil
        }
        return raw
    }

    private func parseRenderContract(
        from response: HTTPURLResponse?,
        screenplayOutput: BackendTalkScreenplayOutput?
    ) -> BackendTalkRenderContract {
        let replyRoleRaw = parseOptionalHeaderString(response, field: "x-reply-role")?
            .lowercased() ?? ""
        let replyRole = BackendTalkRenderContract.ReplyRole(rawValue: replyRoleRaw) ?? .final
        let authoritativePageTextAvailable = parseHeaderBool(
            response,
            field: "x-screenplay-authoritative",
            default: screenplayOutput?.writesToPage == true
        )
        let syncReady = parseHeaderBool(
            response,
            field: "x-screenplay-sync-ready",
            default: authoritativePageTextAvailable
        )
        return BackendTalkRenderContract(
            replyRole: replyRole,
            authoritativePageTextAvailable: authoritativePageTextAvailable,
            syncReady: syncReady
        )
    }

    private func parseScreenplayTrace(from response: HTTPURLResponse?) -> BackendTalkScreenplayTrace {
        let screenplayModeEnabled = parseHeaderBool(
            response,
            field: "x-screenplay-mode",
            default: false
        )
        let screenplayPhase = parseOptionalHeaderString(response, field: "x-screenplay-phase") ?? ""
        let screenplayPackRaw = parseOptionalHeaderString(response, field: "x-screenplay-pack") ?? ""
        let screenplayPack = screenplayPackRaw.lowercased() == "none" ? "" : screenplayPackRaw
        let screenplayPackLock = parseHeaderBool(
            response,
            field: "x-screenplay-pack-lock",
            default: false
        )
        let repairMs = parseHeaderInt(
            response,
            field: "x-screenplay-repair-ms",
            default: 0,
            min: 0,
            max: 600_000
        )
        return BackendTalkScreenplayTrace(
            modeEnabled: screenplayModeEnabled,
            phase: screenplayPhase,
            pack: screenplayPack,
            packLock: screenplayPackLock,
            projectId: parseOptionalHeaderString(response, field: "x-screenplay-project-id"),
            versionId: parseOptionalHeaderString(response, field: "x-screenplay-version-id"),
            repairAttempted: parseHeaderBool(response, field: "x-screenplay-repair-attempted", default: false),
            repairOutcome: parseOptionalHeaderString(response, field: "x-screenplay-repair-outcome") ?? "none",
            repairMs: repairMs > 0 ? repairMs : nil,
            repairReason: parseOptionalHeaderString(response, field: "x-screenplay-repair-reason")
        )
    }

    private func parseCreativeMemoryTrace(from response: HTTPURLResponse?) -> BackendTalkCreativeMemoryTrace {
        let canonClarification = parseCanonClarification(from: response)
        if let raw = parseOptionalHeaderString(response, field: "x-creative-memory-trace"),
           let data = raw.data(using: .utf8),
           let decoded = try? JSONDecoder().decode(BackendTalkCreativeMemoryTrace.self, from: data) {
            return decoded.attachingCanonClarification(canonClarification)
        }
        let characterCount = parseHeaderInt(
            response,
            field: "x-creative-memory-character-count",
            default: 0,
            min: 0,
            max: 64
        )
        let episodicCount = parseHeaderInt(
            response,
            field: "x-creative-memory-episodic-count",
            default: 0,
            min: 0,
            max: 64
        )
        let correctionCount = parseHeaderInt(
            response,
            field: "x-creative-memory-correction-count",
            default: 0,
            min: 0,
            max: 64
        )
        return BackendTalkCreativeMemoryTrace(
            applied: parseHeaderBool(response, field: "x-creative-memory-applied", default: false),
            characterCount: characterCount,
            episodicCount: episodicCount,
            correctionCount: correctionCount,
            canonClarification: canonClarification
        )
    }

    private func parseCanonClarification(from response: HTTPURLResponse?) -> BackendCanonCorrectionAmbiguity? {
        guard let raw = parseOptionalHeaderString(response, field: "x-canon-clarification"),
              let data = raw.data(using: .utf8) else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try? decoder.decode(BackendCanonCorrectionAmbiguity.self, from: data)
    }

    private func parseScreenplayCues(from response: HTTPURLResponse?) -> [BackendTalkScreenplayCue] {
        guard
            let raw = response?.value(forHTTPHeaderField: "x-screenplay-cues")?
                .removingPercentEncoding?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !raw.isEmpty,
            let data = raw.data(using: .utf8)
        else {
            return []
        }
        return (try? JSONDecoder().decode([BackendTalkScreenplayCue].self, from: data)) ?? []
    }

    private func parseScreenplayOutput(from response: HTTPURLResponse?) -> BackendTalkScreenplayOutput? {
        guard
            let raw = response?.value(forHTTPHeaderField: "x-screenplay-output")?
                .removingPercentEncoding?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !raw.isEmpty,
            let data = raw.data(using: .utf8)
        else {
            return nil
        }
        return try? JSONDecoder().decode(BackendTalkScreenplayOutput.self, from: data)
    }

    private func parseScreenplayQuality(from response: HTTPURLResponse?) -> BackendTalkScreenplayQuality? {
        guard let response else { return nil }
        let rawReason = parseOptionalHeaderString(response, field: "x-screenplay-quality-reason")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawConfidence = parseOptionalHeaderString(response, field: "x-screenplay-quality-confidence")?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawFeatureAct = parseOptionalHeaderString(response, field: "x-screenplay-quality-feature-act")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let repairDirectives = parseDelimitedHeader(
            response,
            field: "x-screenplay-repair-directives",
            separator: "|"
        )
        let hasQualityHeaders =
            response.value(forHTTPHeaderField: "x-screenplay-quality-ok") != nil ||
            !rawReason.isEmpty ||
            !rawConfidence.isEmpty ||
            !(rawFeatureAct ?? "").isEmpty ||
            !repairDirectives.isEmpty
        guard hasQualityHeaders else { return nil }
        return BackendTalkScreenplayQuality(
            ok: parseHeaderBool(response, field: "x-screenplay-quality-ok", default: false),
            reason: rawReason,
            source: "header",
            confidence: rawConfidence,
            featureAct: rawFeatureAct,
            matchedTokens: [],
            counts: [:],
            repairDirectives: repairDirectives
        )
    }

    private func parseDialogueTimeline(from response: HTTPURLResponse?) -> BackendTalkDialogueTimelineRevision? {
        guard
            let raw = response?.value(forHTTPHeaderField: "x-dialogue-timeline")?
                .removingPercentEncoding?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !raw.isEmpty,
            let data = raw.data(using: .utf8)
        else {
            return nil
        }
        return try? JSONDecoder().decode(BackendTalkDialogueTimelineRevision.self, from: data)
    }

    private func parseDelimitedHeader(
        _ response: HTTPURLResponse?,
        field: String,
        separator: Character
    ) -> [String] {
        guard
            let decoded = response?.value(forHTTPHeaderField: field)?
                .removingPercentEncoding?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !decoded.isEmpty
        else {
            return []
        }
        return decoded
            .split(separator: separator)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private func parseCommitSignal(from response: HTTPURLResponse?) -> BackendTurnCommitSignal? {
        guard let response else { return nil }
        let turnId = (response.value(forHTTPHeaderField: "x-turn-id") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if turnId.isEmpty { return nil }
        let requestId = (response.value(forHTTPHeaderField: "x-request-id") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let sessionId = (response.value(forHTTPHeaderField: "x-session-id") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let stateVersion = (response.value(forHTTPHeaderField: "x-state-version") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let lastUpdatedAt = Double(
            (response.value(forHTTPHeaderField: "x-last-updated-at") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        ) ?? 0
        let historyUpdatedAt = Double(
            (response.value(forHTTPHeaderField: "x-history-updated-at") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        ) ?? 0
        let memoryUpdatedAt = Double(
            (response.value(forHTTPHeaderField: "x-memory-updated-at") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        ) ?? 0
        return BackendTurnCommitSignal(
            sessionId: sessionId,
            turnId: turnId,
            requestId: requestId.isEmpty ? nil : requestId,
            stateVersion: stateVersion,
            lastUpdatedAt: lastUpdatedAt,
            historyUpdatedAt: historyUpdatedAt,
            memoryUpdatedAt: memoryUpdatedAt
        )
    }

    private func parseEmailComposeAction(from response: HTTPURLResponse?) -> BackendEmailComposeAction? {
        guard let response else { return nil }

        let status = (response.value(forHTTPHeaderField: "x-email-status") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let action = (response.value(forHTTPHeaderField: "x-email-action") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let target = (response.value(forHTTPHeaderField: "x-email-target") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let composed = parseHeaderBool(response, field: "x-email-composed", default: false)
            || status == "composed"
            || action == "compose"

        guard composed || !status.isEmpty || !action.isEmpty else { return nil }

        let to = response.value(forHTTPHeaderField: "x-email-to")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let subject = response.value(forHTTPHeaderField: "x-email-subject")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let composeURL: URL? = {
            guard
                let raw = response.value(forHTTPHeaderField: "x-email-compose-url")?
                    .removingPercentEncoding?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                !raw.isEmpty
            else {
                return nil
            }
            return URL(string: raw)
        }()

        return BackendEmailComposeAction(
            action: action,
            status: status,
            target: target,
            to: to,
            subject: subject,
            composeURL: composeURL,
            composed: composed
        )
    }

    private func parseNoteCaptureAction(from response: HTTPURLResponse?) -> BackendNoteCaptureAction? {
        guard let response else { return nil }
        let captured = parseHeaderBool(response, field: "x-note-captured", default: false)
        let status = (response.value(forHTTPHeaderField: "x-note-status") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let target = (response.value(forHTTPHeaderField: "x-note-target") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let title = response.value(forHTTPHeaderField: "x-note-title")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let noteText = response.value(forHTTPHeaderField: "x-note-text")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let createdAtRaw = (response.value(forHTTPHeaderField: "x-note-created-at") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let createdAt = Double(createdAtRaw)
        let path = response.value(forHTTPHeaderField: "x-note-path")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let fallbackFrom = response.value(forHTTPHeaderField: "x-note-fallback-from")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let error = response.value(forHTTPHeaderField: "x-note-error")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard captured || !status.isEmpty || !target.isEmpty else { return nil }
        return BackendNoteCaptureAction(
            captured: captured,
            status: status,
            target: target,
            title: title,
            noteText: noteText,
            createdAt: createdAt,
            path: path,
            fallbackFrom: fallbackFrom,
            error: error
        )
    }

    private func parseCalendarComposeAction(from response: HTTPURLResponse?) -> BackendCalendarComposeAction? {
        guard let response else { return nil }

        let status = (response.value(forHTTPHeaderField: "x-calendar-status") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let action = (response.value(forHTTPHeaderField: "x-calendar-action") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let target = (response.value(forHTTPHeaderField: "x-calendar-target") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let composed = parseHeaderBool(response, field: "x-calendar-composed", default: false)
            || status == "composed"
            || action == "compose"

        guard composed || !status.isEmpty || !action.isEmpty else { return nil }

        let title = response.value(forHTTPHeaderField: "x-calendar-title")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let startAt = Double(
            (response.value(forHTTPHeaderField: "x-calendar-start-at") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let endAt = Double(
            (response.value(forHTTPHeaderField: "x-calendar-end-at") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let composeURL: URL? = {
            guard
                let raw = response.value(forHTTPHeaderField: "x-calendar-compose-url")?
                    .removingPercentEncoding?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                !raw.isEmpty
            else {
                return nil
            }
            return URL(string: raw)
        }()

        return BackendCalendarComposeAction(
            action: action,
            status: status,
            target: target,
            title: title,
            startAt: startAt,
            endAt: endAt,
            composeURL: composeURL,
            composed: composed
        )
    }

    private func parseTaskAction(from response: HTTPURLResponse?) -> BackendTaskAction? {
        guard let response else { return nil }

        let status = (response.value(forHTTPHeaderField: "x-task-status") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let action = (response.value(forHTTPHeaderField: "x-task-action") ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard !status.isEmpty || !action.isEmpty else { return nil }
        if status == "none", action == "none" { return nil }

        let taskID = response.value(forHTTPHeaderField: "x-task-id")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let title = response.value(forHTTPHeaderField: "x-task-title")?
            .removingPercentEncoding?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let priority = response.value(forHTTPHeaderField: "x-task-priority")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let dueAt = Double(
            (response.value(forHTTPHeaderField: "x-task-due-at") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let completedAt = Double(
            (response.value(forHTTPHeaderField: "x-task-completed-at") ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        )

        return BackendTaskAction(
            action: action,
            status: status,
            taskID: taskID,
            title: title,
            priority: priority,
            dueAt: dueAt,
            completedAt: completedAt
        )
    }

    @discardableResult
    private func writeKeychainString(_ value: String, account: String) -> Bool {
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

    private func readKeychainString(account: String) -> String? {
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

    private func deleteKeychainString(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func resolveUserID() -> String {
        if let cached = cachedUserID, !cached.isEmpty {
            writeSharedUserID(cached)
            return cached
        }
        let stored = normalizeStoredUserID(readSharedUserID())
        if !stored.isEmpty {
            cachedUserID = stored
            writeSharedUserID(stored)
            return stored
        }
        let generated = generateStableUserID()
        cachedUserID = generated
        writeSharedUserID(generated)
        return generated
    }

    private func writeUserID(_ userID: String) {
        let normalized = normalizeStoredUserID(userID)
        guard !normalized.isEmpty else { return }
        cachedUserID = normalized
        writeSharedUserID(normalized)
    }

    private func generateStableUserID() -> String {
        let compact = UUID().uuidString
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
        return "usr_\(compact)"
    }

    private func normalizeStoredUserID(_ raw: String?) -> String {
        let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        guard trimmed.count >= 8 && trimmed.count <= 128 else { return "" }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-")
        if trimmed.rangeOfCharacter(from: allowed.inverted) != nil { return "" }
        return trimmed
    }

    private func readSharedClientToken() -> String? {
        BackendAuthClient.sharedClientToken()
    }

    private func readSharedClientTokenExpiry() -> String? {
        BackendAuthClient.sharedClientTokenExpiry()
    }

    private func readSharedUserID() -> String? {
        BackendAuthClient.sharedUserID()
    }

    private func writeSharedClientToken(_ token: String, expiry: Date?) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            clearSharedClientToken()
            return
        }
        let raw = expiry.map { ISO8601DateFormatter().string(from: $0) }
        BackendAuthClient.persistSharedClientToken(trimmed, expiryRaw: raw, baseURLRaw: baseURL.absoluteString)
    }

    private func clearSharedClientToken() {
        BackendAuthClient.clearSharedClientToken()
    }

    private func writeSharedUserID(_ userID: String) {
        let trimmed = userID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        BackendAuthClient.persistSharedUserID(trimmed)
    }

    private func persistSharedBackendBaseURL(_ url: URL) {
        guard shouldPersistBackendBaseURL else { return }
        UserDefaults.standard.set(url.absoluteString, forKey: sharedBackendBaseURLDefaultsKey)
        UserDefaults.standard.synchronize()
    }
}

private extension Data {
    mutating func appendString(_ s: String) {
        if let d = s.data(using: .utf8) { append(d) }
    }
}

// Reads URLSession.AsyncBytes in fixed-size chunks instead of byte-by-byte,
// dramatically reducing the number of async hops and Data reallocations.
private extension URLSession.AsyncBytes {
    func allChunks(ofSize chunkSize: Int) -> AsyncThrowingStream<Data, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                var buffer = Data(capacity: chunkSize)
                do {
                    for try await byte in self {
                        buffer.append(byte)
                        if buffer.count >= chunkSize {
                            continuation.yield(buffer)
                            buffer = Data(capacity: chunkSize)
                        }
                    }
                    if !buffer.isEmpty {
                        continuation.yield(buffer)
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

private func collectAsyncBytes(_ bytes: URLSession.AsyncBytes) async throws -> Data {
    var data = Data()
    for try await chunk in bytes.allChunks(ofSize: 2048) {
        data.append(chunk)
    }
    return data
}
