import Foundation

nonisolated struct BackendScreenplayVersionMutationResponse: Decodable {
    let stage: String?
    let status: String?
    let createdProject: Bool?
    let projectId: String?
    let clientRequestId: String?
    let draftHashVersion: String?
    let draftHash: String?
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
    let replayed: Bool?
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
