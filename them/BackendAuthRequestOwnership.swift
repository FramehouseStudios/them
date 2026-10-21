import Foundation

// Canonical captured auth ownership, extracted from BackendMemoryAPI. Login
// intent and token/session epoch are different: a refresh may change the latter
// without giving an old operation permission to follow a new login.
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
    let sessionIntentGeneration: Int

    init(sessionEpoch: Int, userID: String, clientToken: String, accessToken: String,
         sessionIntentGeneration: Int = 0) {
        self.sessionEpoch = sessionEpoch
        self.userID = userID
        self.clientToken = clientToken
        self.accessToken = accessToken
        self.sessionIntentGeneration = sessionIntentGeneration
    }

    var ownerContext: ScreenplayStudioAuthContext {
        .init(userID: userID, sessionIntentGeneration: sessionIntentGeneration)
    }

    func requireCurrentOwner(_ current: Self) throws {
        try Task.checkCancellation()
        guard !userID.isEmpty,
              ScreenplayStudioAuthContextPolicy.matches(expected: ownerContext, current: current.ownerContext) else {
            throw BackendMemoryAPIError.server(status: 409, message: "auth_request_superseded")
        }
    }
}
