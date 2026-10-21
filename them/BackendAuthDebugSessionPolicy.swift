import Foundation

nonisolated enum BackendAuthDebugSessionPolicy {
    struct AutomationSessionOverride: Equatable, Sendable {
        let userID: String
        let clientToken: String
        let accessToken: String

        var user: BackendAuthUser {
            BackendAuthUser(
                userId: userID,
                email: "",
                authProvider: "debug",
                emailVerified: true,
                emailVerifiedAt: nil,
                createdAt: nil,
                updatedAt: nil
            )
        }

        var sessionState: BackendAuthSessionState {
            BackendAuthSessionState(
                user: user,
                accessTokenPresent: true,
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
    }

    static func automationSessionOverride(
        arguments: [String],
        environment: [String: String]
    ) -> AutomationSessionOverride? {
        guard !usesStoredCredentials(arguments: arguments, environment: environment),
              IOThemRuntime.isStudioAutomationArguments(arguments),
              environmentFlagIsEnabled(environment["THEM_UITEST_AUTH_SIGNED_IN"]),
              environmentFlagIsEnabled(environment["THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED"]) else {
            return nil
        }
        let accessToken = normalizedEnvironmentValue(
            environment["THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN"]
        )
        let userID = normalizedEnvironmentValue(environment["THEM_UITEST_USER_ID"])
        let clientToken = normalizedEnvironmentValue(environment["THEM_UITEST_CLIENT_TOKEN"])
        guard !accessToken.isEmpty, !userID.isEmpty, !clientToken.isEmpty else { return nil }
        return AutomationSessionOverride(
            userID: userID,
            clientToken: clientToken,
            accessToken: accessToken
        )
    }

    static func shouldPersistSessionBootstrapIdentity(
        arguments: [String],
        environment: [String: String]
    ) -> Bool {
        automationSessionOverride(arguments: arguments, environment: environment) == nil
    }

    static func syntheticUser(
        signedIn: Bool,
        accessToken: String,
        userID: String,
        email: String
    ) -> BackendAuthUser? {
        let cleanToken = accessToken.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanUserID = userID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard signedIn, !cleanToken.isEmpty, !cleanUserID.isEmpty else { return nil }
        let cleanEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return BackendAuthUser(
            userId: cleanUserID,
            email: cleanEmail,
            authProvider: "debug",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }

    /// Explicit local UI journey only; ordinary automation keeps its immutable override.
    static func usesStoredCredentials(arguments: [String], environment: [String: String]) -> Bool {
        guard arguments.contains("--ui-testing"),
              environmentFlagIsEnabled(environment["THEM_UITEST_USE_STORED_AUTH_SESSION"]),
              let raw = environment["THEM_UITEST_BACKEND_BASE_URL"], let url = URL(string: raw),
              url.scheme == "http", url.user == nil, url.password == nil else { return false }
        return ["127.0.0.1", "localhost", "::1", "[::1]"].contains(url.host ?? "")
    }

    private static func normalizedEnvironmentValue(_ raw: String?) -> String {
        (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func environmentFlagIsEnabled(_ raw: String?) -> Bool {
        ["1", "true", "yes", "on"].contains(normalizedEnvironmentValue(raw).lowercased())
    }
}

#if DEBUG
/// Expire exactly the outgoing request, never shared credentials or other work.
nonisolated struct ScreenplaySaveAuthFaultInjection {
    private var didInject = false
    mutating func apply(to request: inout URLRequest, arguments: [String] = ProcessInfo.processInfo.arguments) {
        guard !didInject, arguments.contains("--ui-testing"),
              arguments.contains("--ui-screenplay-save-expire-auth-once"),
              request.httpMethod == "POST", request.url?.path.hasPrefix("/screenplay/projects/") == true,
              request.url?.path.hasSuffix("/version") == true,
              request.url?.scheme == "http", request.url?.host == "127.0.0.1",
              request.value(forHTTPHeaderField: "Authorization") != nil else { return }
        didInject = true
        request.setValue("Bearer expired-screenplay-save-access-token", forHTTPHeaderField: "Authorization")
    }
}
#endif
