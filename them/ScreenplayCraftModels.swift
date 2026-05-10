import Foundation

nonisolated struct ScreenplayCraftFramework: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let summary: String?
    let version: String?
    let requiredMajorTurnIds: [String]
    let beats: [ScreenplayCraftBeatDefinition]
}

nonisolated struct ScreenplayCraftFrameworkReference: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let version: String?
}

nonisolated struct ScreenplayCraftBeatDefinition: Codable, Hashable, Identifiable {
    let id: String
    let label: String
    let summary: String?
    let expectedPageRange: ScreenplayCraftPageRange?
    let required: Bool
    let majorTurnId: String?
}

nonisolated struct ScreenplayCraftReport: Codable, Hashable, Identifiable {
    let id: String
    let schemaVersion: Int
    let projectId: String
    let versionId: String?
    let screenplayTitle: String?
    let generatedAt: String?
    let generatedBy: String?
    let framework: ScreenplayCraftFrameworkReference
    let pageCount: Int?
    let summary: String?
    let coverage: ScreenplayCraftCoverage
    let beatSheet: ScreenplayBeatSheet
    let majorTurns: [ScreenplayCraftMajorTurn]
    let drift: ScreenplayCraftDriftReport
    let overrides: [ScreenplayCraftTurnOverride]
    let snapshot: ScreenplayCraftSnapshotReference?

    var missingRequiredMajorTurns: [ScreenplayCraftMajorTurn] {
        majorTurns.filter { $0.required && !$0.isSatisfied }
    }

    var hasReleaseBlockingMajorTurnGaps: Bool {
        !missingRequiredMajorTurns.isEmpty
    }
}

nonisolated struct ScreenplayCraftCoverage: Codable, Hashable {
    let requiredMajorTurnCount: Int
    let detectedMajorTurnCount: Int
    let overriddenMajorTurnCount: Int
    let missingMajorTurnCount: Int
    let complete: Bool
    let confidence: Double?
}

nonisolated struct ScreenplayBeatSheet: Codable, Hashable, Identifiable {
    let id: String
    let frameworkId: String
    let title: String
    let beats: [ScreenplayCraftBeat]
}

nonisolated struct ScreenplayCraftBeat: Codable, Hashable, Identifiable {
    let id: String
    let frameworkBeatId: String?
    let label: String
    let summary: String?
    let expectedPageRange: ScreenplayCraftPageRange?
    let actualPageRange: ScreenplayCraftPageRange?
    let sceneId: String?
    let sceneTitle: String?
    let status: String
    let confidence: Double?
    let classificationSource: String?
    let evidence: [ScreenplayCraftEvidence]
    let majorTurnId: String?
}

nonisolated struct ScreenplayCraftMajorTurn: Codable, Hashable, Identifiable {
    let id: String
    let turnId: String
    let label: String
    let required: Bool
    let expectedPage: Int?
    let expectedPageRange: ScreenplayCraftPageRange?
    let actualPage: Int?
    let actualPageRange: ScreenplayCraftPageRange?
    let sceneId: String?
    let sceneTitle: String?
    let status: String
    let detected: Bool
    let driftPages: Int?
    let confidence: Double?
    let evidence: [ScreenplayCraftEvidence]
    let overrideRecord: ScreenplayCraftTurnOverride?

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

    var isSatisfied: Bool {
        if detected { return true }
        let normalizedStatus = status.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalizedStatus == "present"
            || normalizedStatus == "accepted"
            || normalizedStatus == "overridden"
            || normalizedStatus == "manually_present"
    }
}

nonisolated struct ScreenplayCraftDriftReport: Codable, Hashable {
    let status: String
    let summary: String?
    let timeline: [ScreenplayCraftTurnDrift]
}

nonisolated struct ScreenplayCraftTurnDrift: Codable, Hashable, Identifiable {
    let id: String
    let turnId: String
    let label: String
    let expectedPage: Int?
    let actualPage: Int?
    let driftPages: Int?
    let status: String
}

nonisolated struct ScreenplayCraftTurnOverride: Codable, Hashable, Identifiable {
    let id: String
    let turnId: String
    let action: String
    let reason: String?
    let sceneId: String?
    let page: Int?
    let userId: String?
    let createdAt: String?
    let expiresAt: String?
}

nonisolated struct ScreenplayCraftEvidence: Codable, Hashable, Identifiable {
    let id: String
    let sceneId: String?
    let sceneTitle: String?
    let page: Int?
    let lineStart: Int?
    let lineEnd: Int?
    let excerpt: String
    let confidence: Double?
}

nonisolated struct ScreenplayCraftPageRange: Codable, Hashable {
    let start: Int
    let end: Int
}

nonisolated struct ScreenplayCraftSnapshotReference: Codable, Hashable, Identifiable {
    let id: String
    let projectId: String
    let versionId: String
    let reportId: String
    let frameworkId: String
    let createdAt: String?
}
