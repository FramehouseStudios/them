import Foundation

public nonisolated struct ScreenplayCraftFramework: Codable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let summary: String?
    public let version: String?
    public let requiredMajorTurnIds: [String]
    public let beats: [ScreenplayCraftBeatDefinition]
}

public nonisolated struct ScreenplayCraftFrameworkReference: Codable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let version: String?
}

public nonisolated struct ScreenplayCraftBeatDefinition: Codable, Hashable, Identifiable {
    public let id: String
    public let label: String
    public let summary: String?
    public let expectedPageRange: ScreenplayCraftPageRange?
    public let required: Bool
    public let majorTurnId: String?
}

public nonisolated struct ScreenplayCraftReport: Codable, Hashable, Identifiable {
    public let id: String
    public let schemaVersion: Int
    public let projectId: String
    public let versionId: String?
    public let screenplayTitle: String?
    public let generatedAt: String?
    public let generatedBy: String?
    public let framework: ScreenplayCraftFrameworkReference
    public let pageCount: Int?
    public let summary: String?
    public let coverage: ScreenplayCraftCoverage
    public let beatSheet: ScreenplayBeatSheet
    public let majorTurns: [ScreenplayCraftMajorTurn]
    public let drift: ScreenplayCraftDriftReport
    public let overrides: [ScreenplayCraftTurnOverride]
    public let snapshot: ScreenplayCraftSnapshotReference?

    public var missingRequiredMajorTurns: [ScreenplayCraftMajorTurn] {
        majorTurns.filter { $0.required && !$0.isSatisfied }
    }

    public var hasReleaseBlockingMajorTurnGaps: Bool {
        !missingRequiredMajorTurns.isEmpty
    }
}

public nonisolated struct ScreenplayCraftCoverage: Codable, Hashable {
    public let requiredMajorTurnCount: Int
    public let detectedMajorTurnCount: Int
    public let overriddenMajorTurnCount: Int
    public let missingMajorTurnCount: Int
    public let complete: Bool
    public let confidence: Double?
}

public nonisolated struct ScreenplayBeatSheet: Codable, Hashable, Identifiable {
    public let id: String
    public let frameworkId: String
    public let title: String
    public let beats: [ScreenplayCraftBeat]
}

public nonisolated struct ScreenplayCraftBeat: Codable, Hashable, Identifiable {
    public let id: String
    public let frameworkBeatId: String?
    public let label: String
    public let summary: String?
    public let expectedPageRange: ScreenplayCraftPageRange?
    public let actualPageRange: ScreenplayCraftPageRange?
    public let sceneId: String?
    public let sceneTitle: String?
    public let status: String
    public let confidence: Double?
    public let classificationSource: String?
    public let evidence: [ScreenplayCraftEvidence]
    public let majorTurnId: String?
}

public nonisolated struct ScreenplayCraftMajorTurn: Codable, Hashable, Identifiable {
    public let id: String
    public let turnId: String
    public let label: String
    public let required: Bool
    public let expectedPage: Int?
    public let expectedPageRange: ScreenplayCraftPageRange?
    public let actualPage: Int?
    public let actualPageRange: ScreenplayCraftPageRange?
    public let sceneId: String?
    public let sceneTitle: String?
    public let status: String
    public let detected: Bool
    public let driftPages: Int?
    public let confidence: Double?
    public let evidence: [ScreenplayCraftEvidence]
    public let overrideRecord: ScreenplayCraftTurnOverride?

    enum CodingKeys: String, CodingKey {
        case id
        case turnId
        case label
        case required
        case expectedPage
        case expectedPageRange
        case actualPage
        case actualPageRange
        case sceneId
        case sceneTitle
        case status
        case detected
        case driftPages
        case confidence
        case evidence
        case overrideRecord = "override"
    }

    public var isSatisfied: Bool {
        if detected { return true }
        let normalizedStatus = status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalizedStatus == "present"
            || normalizedStatus == "accepted"
            || normalizedStatus == "overridden"
            || normalizedStatus == "manually_present"
    }
}

public nonisolated struct ScreenplayCraftDriftReport: Codable, Hashable {
    public let status: String
    public let summary: String?
    public let timeline: [ScreenplayCraftTurnDrift]
}

public nonisolated struct ScreenplayCraftTurnDrift: Codable, Hashable, Identifiable {
    public let id: String
    public let turnId: String
    public let label: String
    public let expectedPage: Int?
    public let actualPage: Int?
    public let driftPages: Int?
    public let status: String

    public init(
        id: String,
        turnId: String,
        label: String,
        expectedPage: Int?,
        actualPage: Int?,
        driftPages: Int?,
        status: String
    ) {
        self.id = id
        self.turnId = turnId
        self.label = label
        self.expectedPage = expectedPage
        self.actualPage = actualPage
        self.driftPages = driftPages
        self.status = status
    }
}

public nonisolated struct ScreenplayCraftTurnOverride: Codable, Hashable, Identifiable {
    public let id: String
    public let turnId: String
    public let action: String
    public let reason: String?
    public let sceneId: String?
    public let page: Int?
    public let userId: String?
    public let createdAt: String?
    public let expiresAt: String?
}

public nonisolated struct ScreenplayCraftEvidence: Codable, Hashable, Identifiable {
    public let id: String
    public let sceneId: String?
    public let sceneTitle: String?
    public let page: Int?
    public let lineStart: Int?
    public let lineEnd: Int?
    public let excerpt: String
    public let confidence: Double?
}

public nonisolated struct ScreenplayCraftPageRange: Codable, Hashable {
    public let start: Int
    public let end: Int
}

public nonisolated struct ScreenplayCraftSnapshotReference: Codable, Hashable, Identifiable {
    public let id: String
    public let projectId: String
    public let versionId: String
    public let reportId: String
    public let frameworkId: String
    public let createdAt: String?
}
