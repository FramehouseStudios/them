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
