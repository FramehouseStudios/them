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
    public let genre: String?
    public let craftArea: String?
    public let format: String?

    public init(
        title: String?,
        pageCount: Int?,
        text: String?,
        scenes: [ScreenplayCraftAnalysisScene],
        genre: String? = nil,
        craftArea: String? = nil,
        format: String? = nil
    ) {
        self.title = title
        self.pageCount = pageCount
        self.text = text
        self.scenes = scenes
        self.genre = genre
        self.craftArea = craftArea
        self.format = format
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
