import Foundation

// The epoch and bearer may rotate during a same-account refresh. Ownership uses
// the existing user + explicit authentication-intent policy instead.
nonisolated struct BackendAuthRequestIdentity: Equatable, Sendable {
    let sessionEpoch: Int
    let userID: String
    let clientToken: String
    let accessToken: String
    let sessionIntentGeneration: Int

    init(
        sessionEpoch: Int,
        userID: String,
        clientToken: String,
        accessToken: String,
        sessionIntentGeneration: Int = 0
    ) {
        self.sessionEpoch = sessionEpoch
        self.userID = userID
        self.clientToken = clientToken
        self.accessToken = accessToken
        self.sessionIntentGeneration = sessionIntentGeneration
    }

    // Match the existing authenticated-session lease's durable-user authority.
    // Signed-out/legacy callers retain the existing secure-store fallback.
    static func preferredUserID(authenticatedUserID: String, fallback: () -> String) -> String {
        authenticatedUserID.isEmpty ? fallback() : authenticatedUserID
    }

    var ownerContext: ScreenplayStudioAuthContext {
        ScreenplayStudioAuthContext(userID: userID, sessionIntentGeneration: sessionIntentGeneration)
    }

    func requiringOwner(_ expected: ScreenplayStudioAuthContext) throws -> Self {
        guard ScreenplayStudioAuthContextPolicy.matches(expected: expected, current: ownerContext) else {
            throw BackendMemoryAPIError.server(status: 409, message: "request_owner_superseded")
        }
        return self
    }

    func deliveryGuard(
        using provider: @escaping @Sendable (Bool) -> BackendAuthRequestIdentity
    ) -> @Sendable () -> Bool {
        let expected = ownerContext
        return { ScreenplayStudioAuthContextPolicy.matches(expected: expected, current: provider(false).ownerContext) }
    }
}

nonisolated extension BackendAuthClient {
    static func requestOwnerIsCurrent(_ expected: ScreenplayStudioAuthContext) -> Bool {
        ScreenplayStudioAuthContextPolicy.matches(expected: expected, current: currentRequestOwner())
    }
}

nonisolated extension URLRequest {
    mutating func applyProjectOwnerHeaders(
        includeUserIdentity: Bool,
        includeAuthToken: Bool,
        clientTokenOverride: String?
    ) {
        if !includeUserIdentity {
            setValue(nil, forHTTPHeaderField: "X-User-Id")
        }
        if !includeAuthToken {
            setValue(nil, forHTTPHeaderField: "Authorization")
        }
        let cleanClientToken = (clientTokenOverride ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanClientToken.isEmpty {
            setValue(cleanClientToken, forHTTPHeaderField: "X-Client-Token")
        }
    }
}
