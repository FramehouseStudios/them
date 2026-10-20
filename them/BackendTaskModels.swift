import Foundation

// Verbatim move from BackendMemoryAPI.swift (D009 god-file compensation).
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
