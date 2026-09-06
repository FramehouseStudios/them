// D009 I4: moved verbatim out of ScreenplayLiveDraftBridge.swift (no behaviour change).
import Foundation

struct ScreenplayFeatureWorkflowContextPersistencePolicy {
    static let liveRequestMaxAge: TimeInterval = 180
    static let restoredProjectMaxAge: TimeInterval = 14 * 24 * 60 * 60

    static func payloadForStorage(_ context: ScreenplayFeatureWorkflowSessionContext?) -> String? {
        guard let context, !context.isEmpty else { return nil }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(context) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func restoredContext(
        from stored: String?,
        now: Date = Date()
    ) -> ScreenplayFeatureWorkflowSessionContext? {
        guard let stored,
              let data = stored.data(using: .utf8) else {
            return nil
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let context = try? decoder.decode(ScreenplayFeatureWorkflowSessionContext.self, from: data),
              !context.isEmpty,
              isFreshForProjectFallback(context, now: now) else {
            return nil
        }
        return context
    }

    static func isFreshForLiveRequest(
        _ context: ScreenplayFeatureWorkflowSessionContext,
        now: Date = Date()
    ) -> Bool {
        now.timeIntervalSince(context.createdAt) >= 0 &&
            now.timeIntervalSince(context.createdAt) < liveRequestMaxAge
    }

    static func isFreshForProjectFallback(
        _ context: ScreenplayFeatureWorkflowSessionContext,
        now: Date = Date()
    ) -> Bool {
        now.timeIntervalSince(context.createdAt) >= 0 &&
            now.timeIntervalSince(context.createdAt) < restoredProjectMaxAge
    }

    static func projectScopedContext(
        _ context: ScreenplayFeatureWorkflowSessionContext,
        matchesProjectID projectID: String
    ) -> Bool {
        let contextProjectID = normalizedIdentifier(context.projectID)
        let activeProjectID = normalizedIdentifier(projectID)
        return !contextProjectID.isEmpty &&
            !activeProjectID.isEmpty &&
            contextProjectID == activeProjectID
    }

    static func shouldRefreshProjectRestoreContext(
        current: ScreenplayFeatureWorkflowSessionContext?,
        projectID: String,
        versionID: String,
        now: Date = Date()
    ) -> Bool {
        let activeProjectID = normalizedIdentifier(projectID)
        guard !activeProjectID.isEmpty else { return false }
        guard let current, !current.isEmpty else { return true }
        guard isFreshForProjectFallback(current, now: now),
              projectScopedContext(current, matchesProjectID: activeProjectID) else {
            return true
        }
        if isFreshForLiveRequest(current, now: now) {
            return false
        }
        let activeVersionID = normalizedIdentifier(versionID)
        let currentVersionID = normalizedIdentifier(current.versionID)
        if !activeVersionID.isEmpty,
           !currentVersionID.isEmpty,
           activeVersionID != currentVersionID {
            return true
        }
        return false
    }

    private static func normalizedIdentifier(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
