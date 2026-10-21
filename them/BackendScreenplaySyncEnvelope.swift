import Foundation

// The existing screenplay responses share one sync contract. Decode their
// payload once, then apply metadata only while the initiating login still owns it.
nonisolated protocol BackendScreenplaySyncEnvelope: Decodable {
    var sessionId: String? { get }
    var stateVersion: String? { get }
    var lastUpdatedAt: TimeInterval? { get }
    var historyUpdatedAt: TimeInterval? { get }
    var memoryUpdatedAt: TimeInterval? { get }
    var lastTurnId: String? { get }
    var schemaVersion: Int? { get }
    var backendBuild: String? { get }
    var backendBootId: String? { get }
}

nonisolated extension BackendScreenplayProjectsResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayProjectResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayCompanionStateResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayOutlineResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayProjectMutationResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayOutlineMutationResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplaySceneMutationResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayBeatMutationResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayCollaboratorsResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayCommentsResponse: BackendScreenplaySyncEnvelope {}
nonisolated extension BackendScreenplayVersionMutationResponse: BackendScreenplaySyncEnvelope {}
