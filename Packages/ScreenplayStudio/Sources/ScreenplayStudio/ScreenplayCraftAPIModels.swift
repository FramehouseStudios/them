import Foundation

public nonisolated enum ScreenplayCraftJSONValue: Codable, Hashable {
    case object([String: ScreenplayCraftJSONValue])
    case array([ScreenplayCraftJSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([ScreenplayCraftJSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: ScreenplayCraftJSONValue].self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case let .object(value):
            try container.encode(value)
        case let .array(value):
            try container.encode(value)
        case let .string(value):
            try container.encode(value)
        case let .number(value):
            try container.encode(value)
        case let .bool(value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }

    public var objectValue: [String: ScreenplayCraftJSONValue]? {
        guard case let .object(value) = self else { return nil }
        return value
    }

    public var stringValue: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }
}

public nonisolated struct ScreenplayCraftSchemaDocument: Codable, Hashable {
    public let root: ScreenplayCraftJSONValue

    public init(root: ScreenplayCraftJSONValue) {
        self.root = root
    }

    public init(from decoder: Decoder) throws {
        root = try ScreenplayCraftJSONValue(from: decoder)
    }

    public func encode(to encoder: Encoder) throws {
        try root.encode(to: encoder)
    }

    public subscript(key: String) -> ScreenplayCraftJSONValue? {
        root.objectValue?[key]
    }
}

public nonisolated struct ScreenplayCraftFrameworkListResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let frameworks: [ScreenplayCraftFrameworkReference]
}

public nonisolated struct ScreenplayCraftAnalysisScene: Codable, Hashable, Identifiable {
    public let id: String
    public let title: String?
    public let pageStart: Int?
    public let pageEnd: Int?
    public let text: String?

    public init(
        id: String,
        title: String?,
        pageStart: Int?,
        pageEnd: Int?,
        text: String?
    ) {
        self.id = id
        self.title = title
        self.pageStart = pageStart
        self.pageEnd = pageEnd
        self.text = text
    }
}

public nonisolated struct ScreenplayCraftAnalysisScreenplay: Codable, Hashable {
    public let title: String?
    public let pageCount: Int?
    public let text: String?
    public let scenes: [ScreenplayCraftAnalysisScene]

    public init(
        title: String?,
        pageCount: Int?,
        text: String?,
        scenes: [ScreenplayCraftAnalysisScene]
    ) {
        self.title = title
        self.pageCount = pageCount
        self.text = text
        self.scenes = scenes
    }
}

public nonisolated struct ScreenplayCraftAnalysisRequest: Codable, Hashable {
    public let projectId: String
    public let versionId: String?
    public let frameworkId: String?
    public let screenplay: ScreenplayCraftAnalysisScreenplay

    public init(
        projectId: String,
        versionId: String?,
        frameworkId: String?,
        screenplay: ScreenplayCraftAnalysisScreenplay
    ) {
        self.projectId = projectId
        self.versionId = versionId
        self.frameworkId = frameworkId
        self.screenplay = screenplay
    }
}

public nonisolated struct ScreenplayCraftTurnOverrideMutation: Codable, Hashable {
    public let turnId: String
    public let action: String
    public let reason: String?
    public let sceneId: String?
    public let page: Int?
    public let userId: String?
    public let expiresAt: String?

    public init(
        turnId: String,
        action: String,
        reason: String?,
        sceneId: String?,
        page: Int?,
        userId: String?,
        expiresAt: String?
    ) {
        self.turnId = turnId
        self.action = action
        self.reason = reason
        self.sceneId = sceneId
        self.page = page
        self.userId = userId
        self.expiresAt = expiresAt
    }
}

public nonisolated struct ScreenplayCraftDeleteOverrideResponse: Codable, Hashable {
    public let ok: Bool
}

public nonisolated struct ScreenplayCraftLoglineDistillRequest: Codable, Hashable {
    public let text: String
    public let projectId: String
    public let versionId: String?
    public let frameworkId: String?

    public init(text: String, projectId: String, versionId: String?, frameworkId: String?) {
        self.text = text
        self.projectId = projectId
        self.versionId = versionId
        self.frameworkId = frameworkId
    }
}

public nonisolated struct ScreenplayCraftLoglineDistillResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let logline: String
    public let source: String
    public let distilledAt: String
    public let stored: Bool

    public init(schemaVersion: Int, logline: String, source: String, distilledAt: String, stored: Bool) {
        self.schemaVersion = schemaVersion
        self.logline = logline
        self.source = source
        self.distilledAt = distilledAt
        self.stored = stored
    }
}

public nonisolated struct ScreenplayCraftLoglineDriftResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let score: Double
    public let current: String
    public let earliest: String
    public let historyCount: Int
    public let summary: String

    public init(schemaVersion: Int, score: Double, current: String, earliest: String, historyCount: Int, summary: String) {
        self.schemaVersion = schemaVersion
        self.score = score
        self.current = current
        self.earliest = earliest
        self.historyCount = historyCount
        self.summary = summary
    }
}

public nonisolated struct ScreenplayCraftLoglineHistoryResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let projectId: String
    public let entries: [ScreenplayCraftLoglineEntry]

    public init(schemaVersion: Int, projectId: String, entries: [ScreenplayCraftLoglineEntry]) {
        self.schemaVersion = schemaVersion
        self.projectId = projectId
        self.entries = entries
    }
}

public nonisolated struct ScreenplayCraftLoglineEntry: Codable, Hashable, Identifiable {
    public let schemaVersion: Int
    public let projectId: String
    public let versionId: String?
    public let logline: String
    public let frameworkId: String?
    public let source: String
    public let distilledAt: String
    public let distilledAtMs: Int?

    public init(
        schemaVersion: Int,
        projectId: String,
        versionId: String?,
        logline: String,
        frameworkId: String?,
        source: String,
        distilledAt: String,
        distilledAtMs: Int?
    ) {
        self.schemaVersion = schemaVersion
        self.projectId = projectId
        self.versionId = versionId
        self.logline = logline
        self.frameworkId = frameworkId
        self.source = source
        self.distilledAt = distilledAt
        self.distilledAtMs = distilledAtMs
    }

    public var id: String {
        [projectId, versionId ?? "draft", distilledAt, logline].joined(separator: ":")
    }
}


public nonisolated struct ScreenplayCraftTwistSuggestRequest: Codable, Hashable {
    public let frameworkId: String
    public let currentBeatId: String
    public let sceneSummary: String?
    public let count: Int?

    public init(frameworkId: String, currentBeatId: String, sceneSummary: String?, count: Int?) {
        self.frameworkId = frameworkId
        self.currentBeatId = currentBeatId
        self.sceneSummary = sceneSummary
        self.count = count
    }
}

public nonisolated struct ScreenplayCraftTwistSuggestResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let frameworkId: String
    public let currentBeatId: String
    public let source: String
    public let twists: [ScreenplayCraftTwistSuggestion]

    public init(
        schemaVersion: Int,
        frameworkId: String,
        currentBeatId: String,
        source: String,
        twists: [ScreenplayCraftTwistSuggestion]
    ) {
        self.schemaVersion = schemaVersion
        self.frameworkId = frameworkId
        self.currentBeatId = currentBeatId
        self.source = source
        self.twists = twists
    }
}

public nonisolated struct ScreenplayCraftTwistSuggestion: Codable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let hook: String
    public let severity: String
    public let rationale: String

    public init(id: String, label: String, hook: String, severity: String, rationale: String) {
        self.id = id
        self.label = label
        self.hook = hook
        self.severity = severity
        self.rationale = rationale
    }
}

public nonisolated struct ScreenplayCraftAcceptedTwistRequest: Codable, Hashable {
    public let projectId: String
    public let versionId: String?
    public let frameworkId: String?
    public let beatId: String?
    public let twist: ScreenplayCraftTwistSuggestion
    public let sceneId: String?
    public let note: String?

    public init(
        projectId: String,
        versionId: String?,
        frameworkId: String?,
        beatId: String?,
        twist: ScreenplayCraftTwistSuggestion,
        sceneId: String?,
        note: String?
    ) {
        self.projectId = projectId
        self.versionId = versionId
        self.frameworkId = frameworkId
        self.beatId = beatId
        self.twist = twist
        self.sceneId = sceneId
        self.note = note
    }
}

public nonisolated struct ScreenplayCraftAcceptedTwistEntry: Codable, Hashable, Identifiable {
    public let schemaVersion: Int
    public let projectId: String
    public let versionId: String?
    public let frameworkId: String?
    public let beatId: String?
    public let twist: ScreenplayCraftTwistSuggestion
    public let acceptedAt: String?
    public let acceptedAtMs: Int?
    public let lastUpdatedAt: String?
    public let lastUpdatedAtMs: Int?
    public let userId: String?
    public let sceneId: String?
    public let note: String?

    public init(
        schemaVersion: Int,
        projectId: String,
        versionId: String?,
        frameworkId: String?,
        beatId: String?,
        twist: ScreenplayCraftTwistSuggestion,
        acceptedAt: String?,
        acceptedAtMs: Int?,
        lastUpdatedAt: String?,
        lastUpdatedAtMs: Int?,
        userId: String?,
        sceneId: String?,
        note: String?
    ) {
        self.schemaVersion = schemaVersion
        self.projectId = projectId
        self.versionId = versionId
        self.frameworkId = frameworkId
        self.beatId = beatId
        self.twist = twist
        self.acceptedAt = acceptedAt
        self.acceptedAtMs = acceptedAtMs
        self.lastUpdatedAt = lastUpdatedAt
        self.lastUpdatedAtMs = lastUpdatedAtMs
        self.userId = userId
        self.sceneId = sceneId
        self.note = note
    }

    public var id: String {
        [projectId, versionId ?? "draft", twist.id].joined(separator: ":")
    }
}

public nonisolated struct ScreenplayCraftAcceptedTwistResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let ok: Bool
    public let action: String
    public let entry: ScreenplayCraftAcceptedTwistEntry

    public init(schemaVersion: Int, ok: Bool, action: String, entry: ScreenplayCraftAcceptedTwistEntry) {
        self.schemaVersion = schemaVersion
        self.ok = ok
        self.action = action
        self.entry = entry
    }
}

public nonisolated struct ScreenplayCraftAcceptedTwistListResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let projectId: String
    public let entries: [ScreenplayCraftAcceptedTwistEntry]

    public init(schemaVersion: Int, projectId: String, entries: [ScreenplayCraftAcceptedTwistEntry]) {
        self.schemaVersion = schemaVersion
        self.projectId = projectId
        self.entries = entries
    }
}

public nonisolated struct ScreenplayCraftAcceptedTwistDeleteResponse: Codable, Hashable {
    public let schemaVersion: Int
    public let ok: Bool
    public let action: String

    public init(schemaVersion: Int, ok: Bool, action: String) {
        self.schemaVersion = schemaVersion
        self.ok = ok
        self.action = action
    }
}

public nonisolated struct ScreenplayFormatLintRequest: Codable, Hashable {
    public let text: String
    public let frameworkId: String?

    public init(text: String, frameworkId: String?) {
        self.text = text
        self.frameworkId = frameworkId
    }
}

public nonisolated struct ScreenplayFormatLintReport: Codable, Hashable {
    public let schemaVersion: Int
    public let ruleSetVersion: String
    public let frameworkId: String?
    public let totalSuggestions: Int
    public let bySeverity: [String: Int]
    public let suggestions: [ScreenplayFormatLintSuggestion]

    public init(
        schemaVersion: Int,
        ruleSetVersion: String,
        frameworkId: String?,
        totalSuggestions: Int,
        bySeverity: [String: Int],
        suggestions: [ScreenplayFormatLintSuggestion]
    ) {
        self.schemaVersion = schemaVersion
        self.ruleSetVersion = ruleSetVersion
        self.frameworkId = frameworkId
        self.totalSuggestions = totalSuggestions
        self.bySeverity = bySeverity
        self.suggestions = suggestions
    }
}

public nonisolated struct ScreenplayFormatLintSuggestion: Codable, Hashable, Identifiable {
    public let rule: String
    public let severity: String
    public let line: Int
    public let range: [Int]?
    public let excerpt: String?
    public let message: String
    public let suggestion: String?

    public init(
        rule: String,
        severity: String,
        line: Int,
        range: [Int]?,
        excerpt: String?,
        message: String,
        suggestion: String?
    ) {
        self.rule = rule
        self.severity = severity
        self.line = line
        self.range = range
        self.excerpt = excerpt
        self.message = message
        self.suggestion = suggestion
    }

    public var id: String {
        [
            rule,
            severity,
            String(line),
            range?.map(String.init).joined(separator: "-") ?? "range",
            message
        ].joined(separator: ":")
    }
}

public nonisolated struct ScreenplayCraftCoverageSimulationRequest: Codable, Hashable {
    public let text: String
    public let pageCount: Int?
    public let frameworkId: String?

    public init(text: String, pageCount: Int?, frameworkId: String?) {
        self.text = text
        self.pageCount = pageCount
        self.frameworkId = frameworkId
    }
}

public nonisolated struct ScreenplayCraftCoverageSimulationReport: Codable, Hashable {
    public let schemaVersion: Int
    public let overview: ScreenplayCraftCoverageOverview
    public let pacing: ScreenplayCraftCoveragePacing
    public let characters: [ScreenplayCraftCoverageCharacter]
    public let warnings: [ScreenplayCraftCoverageWarning]
    public let frameworkId: String?
    public let summary: String

    public init(
        schemaVersion: Int,
        overview: ScreenplayCraftCoverageOverview,
        pacing: ScreenplayCraftCoveragePacing,
        characters: [ScreenplayCraftCoverageCharacter],
        warnings: [ScreenplayCraftCoverageWarning],
        frameworkId: String?,
        summary: String
    ) {
        self.schemaVersion = schemaVersion
        self.overview = overview
        self.pacing = pacing
        self.characters = characters
        self.warnings = warnings
        self.frameworkId = frameworkId
        self.summary = summary
    }
}

public nonisolated struct ScreenplayCraftCoverageOverview: Codable, Hashable {
    public let pageCount: Int
    public let sceneCount: Int
    public let dialogueRatio: Double
    public let avgSceneLengthLines: Double

    public init(pageCount: Int, sceneCount: Int, dialogueRatio: Double, avgSceneLengthLines: Double) {
        self.pageCount = pageCount
        self.sceneCount = sceneCount
        self.dialogueRatio = dialogueRatio
        self.avgSceneLengthLines = avgSceneLengthLines
    }
}

public nonisolated struct ScreenplayCraftCoveragePacing: Codable, Hashable {
    public let intensity: String
    public let peakScenes: [ScreenplayCraftCoverageSceneSignal]
    public let longScenes: [ScreenplayCraftCoverageSceneSignal]
    public let shortScenes: [ScreenplayCraftCoverageSceneSignal]

    public init(
        intensity: String,
        peakScenes: [ScreenplayCraftCoverageSceneSignal],
        longScenes: [ScreenplayCraftCoverageSceneSignal],
        shortScenes: [ScreenplayCraftCoverageSceneSignal]
    ) {
        self.intensity = intensity
        self.peakScenes = peakScenes
        self.longScenes = longScenes
        self.shortScenes = shortScenes
    }
}

public nonisolated struct ScreenplayCraftCoverageSceneSignal: Codable, Hashable, Identifiable {
    public let idx: Int
    public let heading: String
    public let lineCount: Int

    public init(idx: Int, heading: String, lineCount: Int) {
        self.idx = idx
        self.heading = heading
        self.lineCount = lineCount
    }

    public var id: String {
        "\(idx):\(heading)"
    }
}

public nonisolated struct ScreenplayCraftCoverageCharacter: Codable, Hashable, Identifiable {
    public let name: String
    public let lineCount: Int
    public let sceneCount: Int
    public let share: Double

    public init(name: String, lineCount: Int, sceneCount: Int, share: Double) {
        self.name = name
        self.lineCount = lineCount
        self.sceneCount = sceneCount
        self.share = share
    }

    public var id: String { name }
}

public nonisolated struct ScreenplayCraftCoverageWarning: Codable, Hashable, Identifiable {
    public let severity: String
    public let code: String
    public let message: String

    public init(severity: String, code: String, message: String) {
        self.severity = severity
        self.code = code
        self.message = message
    }

    public var id: String {
        "\(code):\(message)"
    }
}
