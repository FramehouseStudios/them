import Foundation

nonisolated enum ScreenplayCraftJSONValue: Codable, Hashable {
    case object([String: ScreenplayCraftJSONValue])
    case array([ScreenplayCraftJSONValue])
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    init(from decoder: Decoder) throws {
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

    func encode(to encoder: Encoder) throws {
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

    var objectValue: [String: ScreenplayCraftJSONValue]? {
        guard case let .object(value) = self else { return nil }
        return value
    }

    var stringValue: String? {
        guard case let .string(value) = self else { return nil }
        return value
    }
}

nonisolated struct ScreenplayCraftSchemaDocument: Codable, Hashable {
    let root: ScreenplayCraftJSONValue

    init(root: ScreenplayCraftJSONValue) {
        self.root = root
    }

    init(from decoder: Decoder) throws {
        root = try ScreenplayCraftJSONValue(from: decoder)
    }

    func encode(to encoder: Encoder) throws {
        try root.encode(to: encoder)
    }

    subscript(key: String) -> ScreenplayCraftJSONValue? {
        root.objectValue?[key]
    }
}

nonisolated struct ScreenplayCraftFrameworkListResponse: Codable, Hashable {
    let schemaVersion: Int
    let frameworks: [ScreenplayCraftFrameworkReference]
}

nonisolated struct ScreenplayCraftAnalysisScene: Codable, Hashable, Identifiable {
    let id: String
    let title: String?
    let pageStart: Int?
    let pageEnd: Int?
    let text: String?
}

nonisolated struct ScreenplayCraftAnalysisScreenplay: Codable, Hashable {
    let title: String?
    let pageCount: Int?
    let text: String?
    let scenes: [ScreenplayCraftAnalysisScene]
}

nonisolated struct ScreenplayCraftAnalysisRequest: Codable, Hashable {
    let projectId: String
    let versionId: String?
    let frameworkId: String?
    let screenplay: ScreenplayCraftAnalysisScreenplay
}

nonisolated struct ScreenplayCraftTurnOverrideMutation: Codable, Hashable {
    let turnId: String
    let action: String
    let reason: String?
    let sceneId: String?
    let page: Int?
    let userId: String?
    let expiresAt: String?
}

nonisolated struct ScreenplayCraftDeleteOverrideResponse: Codable, Hashable {
    let ok: Bool
}
