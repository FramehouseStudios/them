import Foundation

#if DEBUG
nonisolated final class BackendAuthResumeFixtureActivationStore: @unchecked Sendable {
    private let lock = NSLock()
    private var activated = false

    var isActivated: Bool {
        lock.lock()
        defer { lock.unlock() }
        return activated
    }

    func activate() {
        lock.lock()
        activated = true
        lock.unlock()
    }

    func deactivate() {
        lock.lock()
        activated = false
        lock.unlock()
    }
}
#endif

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
        guard IOThemRuntime.isStudioAutomationArguments(arguments),
              environmentFlagIsEnabled(environment["THEM_UITEST_AUTH_SIGNED_IN"]),
              environmentFlagIsEnabled(environment["THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED"]) else {
            return nil
        }
        let accessToken = normalizedEnvironmentValue(environment["THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN"])
        let userID = normalizedEnvironmentValue(environment["THEM_UITEST_USER_ID"])
        let clientToken = normalizedEnvironmentValue(environment["THEM_UITEST_CLIENT_TOKEN"])
        guard !accessToken.isEmpty, !userID.isEmpty, !clientToken.isEmpty else { return nil }
        return AutomationSessionOverride(userID: userID, clientToken: clientToken, accessToken: accessToken)
    }

    static func uiTestAuthenticationResumeFixtureOverride(
        arguments: [String],
        isActivated: Bool
    ) -> AutomationSessionOverride? {
        guard isActivated,
              IOThemRuntime.allowsUITestAuthenticationResumeFixture(arguments: arguments) else {
            return nil
        }
        return AutomationSessionOverride(
            userID: "ui-auth-resume-user",
            clientToken: "ui-auth-resume-client-token",
            accessToken: "ui-auth-resume-access-token"
        )
    }

    static func resolvedAutomationSessionOverride(
        arguments: [String],
        environment: [String: String],
        isResumeFixtureActivated: Bool
    ) -> AutomationSessionOverride? {
        automationSessionOverride(arguments: arguments, environment: environment)
            ?? uiTestAuthenticationResumeFixtureOverride(
                arguments: arguments,
                isActivated: isResumeFixtureActivated
            )
    }

    static func shouldPersistSessionBootstrapIdentity(
        arguments: [String],
        environment: [String: String],
        isResumeFixtureActivated: Bool = false
    ) -> Bool {
        resolvedAutomationSessionOverride(
            arguments: arguments,
            environment: environment,
            isResumeFixtureActivated: isResumeFixtureActivated
        ) == nil
    }

    static func commitSessionBootstrapIdentity(
        automationOverride: AutomationSessionOverride?,
        responseUserID: String?,
        persistIdentity: () -> Bool
    ) -> Bool {
        guard let automationOverride else { return persistIdentity() }
        let normalizedUserID = normalizedEnvironmentValue(responseUserID)
        guard normalizedUserID.isEmpty || normalizedUserID == automationOverride.userID else {
            return false
        }
        return true
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
        return BackendAuthUser(
            userId: cleanUserID,
            email: email.trimmingCharacters(in: .whitespacesAndNewlines),
            authProvider: "debug",
            emailVerified: true,
            emailVerifiedAt: nil,
            createdAt: nil,
            updatedAt: nil
        )
    }

    private static func normalizedEnvironmentValue(_ raw: String?) -> String {
        (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func environmentFlagIsEnabled(_ raw: String?) -> Bool {
        ["1", "true", "yes", "on"].contains(normalizedEnvironmentValue(raw).lowercased())
    }
}
