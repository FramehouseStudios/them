// Persistence policy for character-voice memory; moved verbatim out of ScreenplayLiveDraftBridge.swift (D009 compensation for #450).
import Foundation
import SwiftUI
import Combine
import ScreenplayStudio

nonisolated struct ScreenplayCharacterVoiceMemoryRequestScope: Codable, Equatable, Sendable {
    let userID: String
    let sessionIntentGeneration: Int
    let projectID: String
    let backendURL: URL

    init(owner: ScreenplayStudioAuthContext, projectID: String, backendURL: URL) {
        userID = owner.userID.trimmingCharacters(in: .whitespacesAndNewlines)
        sessionIntentGeneration = owner.sessionIntentGeneration
        self.projectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        self.backendURL = backendURL
    }

    var owner: ScreenplayStudioAuthContext { .init(userID: userID, sessionIntentGeneration: sessionIntentGeneration) }
    var permitsPage: Bool { !userID.isEmpty && !projectID.isEmpty && OfflineTalkRecoveryScope.sameBackend(backendURL, backendURL) }
    func matches(owner: ScreenplayStudioAuthContext, projectID: String, backendURL: URL) -> Bool {
        ScreenplayStudioAuthContextPolicy.matches(expected: self.owner, current: owner)
            && self.projectID == projectID.trimmingCharacters(in: .whitespacesAndNewlines)
            && OfflineTalkRecoveryScope.sameBackend(self.backendURL, backendURL)
    }
}

struct ScreenplayCharacterVoiceMemoryCacheSnapshot: Codable, Equatable {
    let userID: String
    let memories: [BackendScreenplayCharacterVoiceMemory]
    let updatedAt: Date
    let scope: ScreenplayCharacterVoiceMemoryRequestScope?

    init(userID: String, memories: [BackendScreenplayCharacterVoiceMemory], updatedAt: Date,
         scope: ScreenplayCharacterVoiceMemoryRequestScope? = nil) {
        self.userID = userID; self.memories = memories; self.updatedAt = updatedAt; self.scope = scope
    }
    var isMeaningful: Bool {
        !userID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && memories.contains(where: \.isMeaningful)
    }
}

struct ScreenplayCharacterVoiceMemoryPersistencePolicy {
    static let restoredMaxAge: TimeInterval = 30 * 24 * 60 * 60

    static func payloadForStorage(
        userID: String,
        memories: [BackendScreenplayCharacterVoiceMemory],
        scope: ScreenplayCharacterVoiceMemoryRequestScope? = nil,
        updatedAt: Date = Date()
    ) -> String? {
        let cleanUserID = userID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMemories = Array(memories.filter(\.isMeaningful).prefix(24))
        guard !cleanUserID.isEmpty, !cleanMemories.isEmpty,
              scope == nil || (scope?.userID == cleanUserID && scope?.permitsPage == true) else { return nil }
        let snapshot = ScreenplayCharacterVoiceMemoryCacheSnapshot(
            userID: cleanUserID,
            memories: cleanMemories,
            updatedAt: updatedAt,
            scope: scope
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(snapshot) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func restoredSnapshot(
        from stored: String?,
        currentUserID: String,
        now: Date = Date()
    ) -> ScreenplayCharacterVoiceMemoryCacheSnapshot? {
        let cleanCurrentUserID = currentUserID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanCurrentUserID.isEmpty,
              let stored,
              let data = stored.data(using: .utf8) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let snapshot = try? decoder.decode(ScreenplayCharacterVoiceMemoryCacheSnapshot.self, from: data),
              snapshot.isMeaningful,
              snapshot.userID == cleanCurrentUserID,
              isFreshForRestore(snapshot, now: now) else { return nil }
        return snapshot
    }

    static func isFreshForRestore(
        _ snapshot: ScreenplayCharacterVoiceMemoryCacheSnapshot,
        now: Date = Date()
    ) -> Bool {
        let age = now.timeIntervalSince(snapshot.updatedAt)
        return age >= 0 && age < restoredMaxAge
    }

    static func normalizedCharacterKey(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s*\([^)]*\)\s*$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).lowercased()
    }

    static func projectRecords(_ records: [BackendCharacterTraitRecord], scope: ScreenplayCharacterVoiceMemoryRequestScope) -> [BackendCharacterTraitRecord] {
        guard scope.permitsPage else { return [] }
        return records.filter { ($0.projectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines) == scope.projectID }
    }

    static func pageMemories(_ memories: [BackendScreenplayCharacterVoiceMemory], scope: ScreenplayCharacterVoiceMemoryRequestScope?,
        owner: ScreenplayStudioAuthContext, projectID: String, backendURL: URL, matching names: [String], limit: Int = 8) -> [BackendScreenplayCharacterVoiceMemory] {
        guard let scope, scope.permitsPage, scope.matches(owner: owner, projectID: projectID, backendURL: backendURL) else { return [] }
        return select(memories, matching: names, limit: limit)
    }

    static func select(_ memories: [BackendScreenplayCharacterVoiceMemory], matching names: [String], limit: Int) -> [BackendScreenplayCharacterVoiceMemory] {
        let safeLimit = max(1, min(8, limit)), meaningful = memories.filter(\.isMeaningful)
        var byCharacter: [String: BackendScreenplayCharacterVoiceMemory] = [:]
        for memory in meaningful {
            let key = normalizedCharacterKey(memory.character)
            if !key.isEmpty, byCharacter[key] == nil { byCharacter[key] = memory }
        }
        var selected: [BackendScreenplayCharacterVoiceMemory] = [], seen = Set<String>()
        for name in names {
            let key = normalizedCharacterKey(name)
            guard !key.isEmpty, seen.insert(key).inserted, let memory = byCharacter[key] else { continue }
            selected.append(memory)
            if selected.count >= safeLimit { return selected }
        }
        return names.isEmpty ? Array(meaningful.prefix(safeLimit)) : selected
    }
}
