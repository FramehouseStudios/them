import Foundation
import CryptoKit

/// Versioned body record in the existing outbox's blobs directory. Metadata
/// and bytes are committed by one atomic file write; queue.jsonl is its index.
/// Old raw .multipart bodies remain readable and are never guessed into owners.
nonisolated struct OfflineTalkStoredBody: Codable {
    enum State: String, Codable { case ready, settled }
    let version: Int
    let entry: OfflineTalkOutboxEntry
    let body: Data
    let sha256: Data
    var state: State

    init(entry: OfflineTalkOutboxEntry, body: Data) {
        version = 1; self.entry = entry; self.body = body
        sha256 = Data(SHA256.hash(data: body)); state = .ready
    }

    func validatedBody(matching row: OfflineTalkOutboxEntry? = nil) throws -> Data {
        guard version == 1, body.count == entry.bodyByteCount,
              sha256 == Data(SHA256.hash(data: body)),
              row.map({ matches($0) }) ?? true else {
            throw BackendError.stage("offline_outbox", "Queued body identity could not be verified. All recovery files were kept.")
        }
        return body
    }

    private func matches(_ row: OfflineTalkOutboxEntry) -> Bool {
        entry.id == row.id && entry.createdAt == row.createdAt && entry.endpoint == row.endpoint
            && entry.method == row.method && entry.urlString == row.urlString && entry.headers == row.headers
            && entry.bodyRef == row.bodyRef && entry.bodyByteCount == row.bodyByteCount
            && entry.idempotencyKey == row.idempotencyKey && entry.timeoutInterval == row.timeoutInterval
    }

    func encoded() throws -> Data {
        let encoder = PropertyListEncoder(); encoder.outputFormat = .binary
        return try encoder.encode(self)
    }
}

nonisolated struct OfflineTalkRecoveryScope: Equatable, Sendable {
    let owner: ScreenplayStudioAuthContext
    let backendURL: URL

    init(identity: BackendAuthRequestIdentity, backendURL: URL) {
        owner = identity.ownerContext
        self.backendURL = backendURL
    }

    static func current() -> Self {
        .init(identity: BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false),
              backendURL: BackendAuthClient.resolvedBackendBaseURL())
    }

    func matches(identity: BackendAuthRequestIdentity, backendURL: URL) -> Bool {
        ScreenplayStudioAuthContextPolicy.matches(expected: owner, current: identity.ownerContext)
            && Self.sameBackend(self.backendURL, backendURL)
    }

    var isCurrent: Bool {
        matches(identity: BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false),
                backendURL: BackendAuthClient.resolvedBackendBaseURL())
    }

    static func sameBackend(_ lhs: URL, _ rhs: URL) -> Bool {
        guard ["http", "https"].contains(lhs.scheme?.lowercased() ?? ""),
              lhs.user == nil, lhs.password == nil, rhs.user == nil, rhs.password == nil else { return false }
        return BackendAPIResponseValidator.hasMatchingOrigin(requestURL: lhs, responseURL: rhs)
    }

    var notificationFields: [String: Any] {
        ["outboxOwner": owner.userID, "outboxIntent": owner.sessionIntentGeneration,
         "outboxBackend": backendURL.absoluteString]
    }

    init?(notification: Notification) {
        guard let fields = notification.userInfo,
              let user = fields["outboxOwner"] as? String,
              let generation = fields["outboxIntent"] as? Int,
              let rawURL = fields["outboxBackend"] as? String,
              let url = URL(string: rawURL) else { return nil }
        owner = .init(userID: user, sessionIntentGeneration: generation)
        backendURL = url
    }
}

nonisolated struct OfflineTalkRecoveryState {
    let scope: OfflineTalkRecoveryScope?
    let snapshot: OfflineTalkOutboxSnapshot
    let entries: [OfflineTalkOutboxEntry]
    let hasUnassignedEntries: Bool
    static let empty = Self(scope: nil, snapshot: .empty, entries: [], hasUnassignedEntries: false)
}

nonisolated struct OfflineTalkRecoveryArtifact {
    let filename: String
    let data: Data
}

nonisolated struct OfflineTalkPayloadConflictError: LocalizedError {
    let entryID: String
    var errorDescription: String? {
        "A different payload reused this request ID. Both copies were kept. The new copy was not sent; export it from Data Controls before deleting anything."
    }
}

nonisolated struct OfflineTalkPreviousOwnerError: LocalizedError {
    var errorDescription: String? {
        "Your turn was kept with the account and backend that started it. Return to that account and backend to continue."
    }
}
