import Foundation

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
