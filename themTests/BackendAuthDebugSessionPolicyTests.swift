import XCTest
@testable import them

final class BackendAuthDebugSessionPolicyTests: XCTestCase {
    private let completeAutomationEnvironment = [
        "THEM_UITEST_AUTH_SIGNED_IN": "1",
        "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED": "true",
        "THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN": " access-token ",
        "THEM_UITEST_USER_ID": " user-1 ",
        "THEM_UITEST_CLIENT_TOKEN": " client-token ",
    ]

    func testResumeFixtureActivationIsSynchronizedAndProcessLocal() {
        let currentProcess = BackendAuthResumeFixtureActivationStore()

        XCTAssertFalse(currentProcess.isActivated)
        DispatchQueue.concurrentPerform(iterations: 100) { _ in
            currentProcess.activate()
            _ = currentProcess.isActivated
        }
        XCTAssertTrue(currentProcess.isActivated)

        let relaunchedProcess = BackendAuthResumeFixtureActivationStore()
        XCTAssertFalse(
            relaunchedProcess.isActivated,
            "A new app process must fail closed instead of inheriting a prior fixture activation"
        )

        currentProcess.deactivate()
        XCTAssertFalse(currentProcess.isActivated)
    }

    func testAutomationSessionOverrideRequiresExactDebugLaunchMarker() {
        XCTAssertNil(BackendAuthDebugSessionPolicy.automationSessionOverride(
            arguments: ["them"],
            environment: completeAutomationEnvironment
        ))
        XCTAssertNil(BackendAuthDebugSessionPolicy.automationSessionOverride(
            arguments: ["them", "--studio-eval-disabled"],
            environment: completeAutomationEnvironment
        ))
        XCTAssertNotNil(BackendAuthDebugSessionPolicy.automationSessionOverride(
            arguments: ["them", "--studio-eval"],
            environment: completeAutomationEnvironment
        ))
        XCTAssertNotNil(BackendAuthDebugSessionPolicy.automationSessionOverride(
            arguments: ["them", "--ui-testing"],
            environment: completeAutomationEnvironment
        ))
    }

    func testAutomationSessionOverrideFailsClosedForIncompleteAuthentication() {
        for key in completeAutomationEnvironment.keys {
            var incomplete = completeAutomationEnvironment
            incomplete[key] = ""
            XCTAssertNil(
                BackendAuthDebugSessionPolicy.automationSessionOverride(
                    arguments: ["them", "--studio-eval"],
                    environment: incomplete
                ),
                "Expected missing \(key) to disable the automation auth override"
            )
        }
    }

    func testAutomationSessionOverrideBuildsAuthenticatedProcessLocalIdentity() throws {
        let override = try XCTUnwrap(BackendAuthDebugSessionPolicy.automationSessionOverride(
            arguments: ["them", "--studio-eval"],
            environment: completeAutomationEnvironment
        ))

        XCTAssertEqual(override.userID, "user-1")
        XCTAssertEqual(override.clientToken, "client-token")
        XCTAssertEqual(override.accessToken, "access-token")
        XCTAssertEqual(override.sessionState.user?.userId, "user-1")
        XCTAssertTrue(override.sessionState.isAuthenticated)
        XCTAssertFalse(override.sessionState.accessExpired)
        XCTAssertFalse(override.sessionState.refreshTokenPresent)
    }

    func testUITestResumeFixtureIsProcessLocalAndFailsClosed() throws {
        let completeArguments = [
            "them",
            "--ui-testing",
            "--ui-enforce-production-auth",
            "--ui-auth-resume-fixture",
        ]
        XCTAssertNil(
            BackendAuthDebugSessionPolicy.uiTestAuthenticationResumeFixtureOverride(
                arguments: completeArguments,
                isActivated: false
            )
        )
        let override = try XCTUnwrap(
            BackendAuthDebugSessionPolicy.uiTestAuthenticationResumeFixtureOverride(
                arguments: completeArguments,
                isActivated: true
            )
        )
        XCTAssertTrue(override.sessionState.isAuthenticated)
        XCTAssertNil(
            BackendAuthDebugSessionPolicy.uiTestAuthenticationResumeFixtureOverride(
                arguments: ["them", "--ui-auth-resume-fixture"],
                isActivated: true
            )
        )
    }

    func testAutomationSessionBootstrapIdentityRemainsProcessLocal() {
        XCTAssertFalse(BackendAuthDebugSessionPolicy.shouldPersistSessionBootstrapIdentity(
            arguments: ["them", "--studio-eval"],
            environment: completeAutomationEnvironment
        ))
        XCTAssertFalse(BackendAuthDebugSessionPolicy.shouldPersistSessionBootstrapIdentity(
            arguments: ["them", "--ui-testing"],
            environment: completeAutomationEnvironment
        ))
        XCTAssertTrue(BackendAuthDebugSessionPolicy.shouldPersistSessionBootstrapIdentity(
            arguments: ["them"],
            environment: completeAutomationEnvironment
        ))
        XCTAssertTrue(BackendAuthDebugSessionPolicy.shouldPersistSessionBootstrapIdentity(
            arguments: ["them", "--studio-eval"],
            environment: [:]
        ))
        XCTAssertFalse(BackendAuthDebugSessionPolicy.shouldPersistSessionBootstrapIdentity(
            arguments: [
                "them",
                "--ui-testing",
                "--ui-enforce-production-auth",
                "--ui-auth-resume-fixture",
            ],
            environment: [:],
            isResumeFixtureActivated: true
        ))
    }

    func testUITestResumeFixtureBootstrapNeverPersistsIdentity() throws {
        let override = try XCTUnwrap(
            BackendAuthDebugSessionPolicy.resolvedAutomationSessionOverride(
                arguments: [
                    "them",
                    "--ui-testing",
                    "--ui-enforce-production-auth",
                    "--ui-auth-resume-fixture",
                ],
                environment: [:],
                isResumeFixtureActivated: true
            )
        )
        var persistenceCalls = 0
        let accepted = BackendAuthDebugSessionPolicy.commitSessionBootstrapIdentity(
            automationOverride: override,
            responseUserID: override.userID
        ) {
            persistenceCalls += 1
            return true
        }

        XCTAssertTrue(accepted)
        XCTAssertEqual(persistenceCalls, 0)
        XCTAssertFalse(BackendAuthDebugSessionPolicy.commitSessionBootstrapIdentity(
            automationOverride: override,
            responseUserID: "different-user"
        ) {
            persistenceCalls += 1
            return true
        })
        XCTAssertEqual(persistenceCalls, 0)
    }

    func testSyntheticDebugUserRequiresSignedInTokenAndUserID() {
        XCTAssertNil(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: false,
            accessToken: "access-token",
            userID: "user-1",
            email: "writer@example.com"
        ))
        XCTAssertNil(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: true,
            accessToken: "",
            userID: "user-1",
            email: "writer@example.com"
        ))
        XCTAssertNil(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: true,
            accessToken: "access-token",
            userID: "",
            email: "writer@example.com"
        ))
    }

    func testSyntheticDebugUserPreservesAuthenticatedIdentity() throws {
        let user = try XCTUnwrap(BackendAuthDebugSessionPolicy.syntheticUser(
            signedIn: true,
            accessToken: "access-token",
            userID: "user-1",
            email: "writer@example.com"
        ))

        XCTAssertEqual(user.userId, "user-1")
        XCTAssertEqual(user.email, "writer@example.com")
        XCTAssertEqual(user.authProvider, "debug")
        XCTAssertTrue(user.emailVerified)
    }
}
