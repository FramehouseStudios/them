// Persistence policy for character-voice memory; moved verbatim out of ScreenplayLiveDraftBridge.swift (D009 compensation for #450).
import Foundation
import SwiftUI
import Combine
import ScreenplayStudio

struct ScreenplayCharacterVoiceMemoryPersistencePolicy {
    static let restoredMaxAge: TimeInterval = 30 * 24 * 60 * 60

    static func payloadForStorage(
        userID: String,
        memories: [BackendScreenplayCharacterVoiceMemory],
        updatedAt: Date = Date()
    ) -> String? {
        let cleanUserID = userID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanMemories = Array(memories.filter(\.isMeaningful).prefix(24))
        guard !cleanUserID.isEmpty, !cleanMemories.isEmpty else { return nil }
        let snapshot = ScreenplayCharacterVoiceMemoryCacheSnapshot(
            userID: cleanUserID,
            memories: cleanMemories,
            updatedAt: updatedAt
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
}
