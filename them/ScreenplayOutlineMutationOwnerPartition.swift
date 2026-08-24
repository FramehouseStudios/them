import CryptoKit
import Foundation

nonisolated enum ScreenplayOutlineMutationOwnerPartition {
    static func user(_ userId: String?) -> String {
        let cleanUserId = (userId ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return "user:\(cleanUserId.isEmpty ? "anonymous" : cleanUserId)"
    }

    static func client(token: String?, fallbackProjectId: String) -> String {
        let cleanToken = (token ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanProjectId = fallbackProjectId
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let seed = cleanToken.isEmpty
            ? "unresolved-client-owner:\(cleanProjectId)"
            : cleanToken
        return "client:\(sha256Hex(seed))"
    }

    static func currentUser() -> String {
        user(
            BackendAuthClient.currentAuthSessionState().user?.userId
                ?? BackendAuthClient.sharedUserID()
        )
    }

    static func currentRecoveryScope() -> Set<String> {
        var partitions: Set<String> = [currentUser()]
        let currentClientToken = (BackendAuthClient.sharedClientToken() ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !currentClientToken.isEmpty {
            partitions.insert(client(token: currentClientToken, fallbackProjectId: ""))
        }
        return partitions
    }

    private static func sha256Hex(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }
}
