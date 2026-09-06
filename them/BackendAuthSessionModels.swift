import Foundation

nonisolated struct BackendAuthSessionsResponse: Decodable {
    let ok: Bool
    let sessions: [BackendAuthManagedSession]
}

nonisolated struct BackendAuthSessionRevokeResponse: Decodable {
    let ok: Bool
    let revoked: Bool?
    let session: BackendAuthManagedSession?
    let familyId: String?
    let userId: String?
}

nonisolated struct BackendAuthSessionState: Equatable, Sendable {
    let user: BackendAuthUser?
    let accessTokenPresent: Bool
    let refreshTokenPresent: Bool
    let accessExpiresAt: TimeInterval
    let refreshExpiresAt: TimeInterval
    let currentSessionId: String
    let currentFamilyId: String
    let tokenType: String
    let pendingEmailVerification: Bool
    let verificationRequired: Bool

    var isAuthenticated: Bool {
        user != nil && accessTokenPresent
    }

    var email: String {
        user?.email ?? ""
    }

    var emailVerified: Bool {
        user?.emailVerified ?? false
    }

    var accessExpired: Bool {
        accessExpiresAt > 0 && accessExpiresAt <= Date().timeIntervalSince1970
    }

    static let signedOut = BackendAuthSessionState(
        user: nil,
        accessTokenPresent: false,
        refreshTokenPresent: false,
        accessExpiresAt: 0,
        refreshExpiresAt: 0,
        currentSessionId: "",
        currentFamilyId: "",
        tokenType: "Bearer",
        pendingEmailVerification: false,
        verificationRequired: false
    )
}

actor BackendAuthRefreshCoordinator {
    struct Key: Hashable, Sendable {
        let sessionGeneration: Int
        let userID: String
        let refreshTokenDigest: String

        init(lease: BackendAuthSessionLease) {
            sessionGeneration = lease.sessionGeneration
            userID = lease.userID
            refreshTokenDigest = BackendAppleSignInNonce.sha256Base64URL(lease.refreshToken)
        }
    }

    private struct ActiveRefresh {
        let id: UUID
        let task: Task<BackendAuthSessionState, Error>
    }

    private var activeRefreshes: [Key: ActiveRefresh] = [:]

    func run(
        key: Key,
        _ operation: @escaping @Sendable () async throws -> BackendAuthSessionState
    ) async throws -> BackendAuthSessionState {
        let active: ActiveRefresh
        if let existing = activeRefreshes[key] {
            active = existing
        } else {
            let created = ActiveRefresh(id: UUID(), task: Task { try await operation() })
            activeRefreshes[key] = created
            active = created
        }
        defer {
            if activeRefreshes[key]?.id == active.id {
                activeRefreshes.removeValue(forKey: key)
            }
        }
        return try await active.task.value
    }
}

nonisolated struct BackendPasswordResetResult: Equatable {
    let sessionState: BackendAuthSessionState
    let canonicalEmail: String
    let rememberedLoginResult: BackendRememberedLoginMutationResult
}

nonisolated struct BackendAuthOperationIntent: Equatable, Sendable {
    let sessionGeneration: Int
    let rememberedLoginGeneration: Int
}

nonisolated struct BackendAuthSessionLease: Equatable, Sendable {
    let sessionGeneration: Int
    let userID: String
    let accessToken: String
    let refreshToken: String
}

nonisolated struct BackendAuthRequestIdentity: Equatable, Sendable {
    let sessionEpoch: Int
    let userID: String
    let clientToken: String
    let accessToken: String
}

nonisolated struct BackendRequestAuthentication: Equatable, Sendable {
    let userID: String
    let clientToken: String
    let accessToken: String
    let appToken: String
    let accessTokenExpired: Bool
    let clientTokenExpired: Bool

    init(
        userID: String,
        clientToken: String,
        accessToken: String,
        appToken: String,
        accessTokenExpired: Bool = false,
        clientTokenExpired: Bool = false
    ) {
        self.userID = userID
        self.clientToken = clientToken
        self.accessToken = accessToken
        self.appToken = appToken
        self.accessTokenExpired = accessTokenExpired
        self.clientTokenExpired = clientTokenExpired
    }

    var hasKnownExpiredCredential: Bool {
        accessTokenExpired || clientTokenExpired
    }
}
