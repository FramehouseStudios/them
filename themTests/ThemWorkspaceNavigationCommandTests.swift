import XCTest
@testable import them

final class ThemWorkspaceNavigationCommandTests: XCTestCase {
    func testWorkspaceNavigationCommandsUseStableNotificationNames() {
        XCTAssertEqual(
            ThemWorkspaceNavigationCommand.openStudio.notificationName.rawValue,
            "io.them.them.workspace.openStudioRequested"
        )
        XCTAssertEqual(
            ThemWorkspaceNavigationCommand.closeStudio.notificationName.rawValue,
            "io.them.them.workspace.closeStudioRequested"
        )
        XCTAssertEqual(
            ThemWorkspaceNavigationCommand.toggleStudio.notificationName.rawValue,
            "io.them.them.workspace.toggleStudioRequested"
        )
    }

    func testWorkspaceNavigationCommandPostsExpectedNotification() {
        let center = NotificationCenter()
        let expected = expectation(description: "open Studio notification posted")
        let token = center.addObserver(
            forName: .themOpenStudioRequested,
            object: nil,
            queue: nil
        ) { _ in
            expected.fulfill()
        }
        defer { center.removeObserver(token) }

        ThemWorkspaceNavigationCommand.openStudio.post(center: center)

        wait(for: [expected], timeout: 1)
    }

    func testWorkspaceSurfaceRestoreDefaultsMacToStudioAfterOnboarding() {
        XCTAssertEqual(
            ThemWorkspaceSurfaceRestorePolicy.launchSurfaceRawValue(
                persistedSurfaceRawValue: "",
                hasCompletedOnboarding: true,
                isMacOS: true
            ),
            ThemWorkspaceSurfaceRestorePolicy.studioRawValue
        )
    }

    func testWorkspaceSurfaceRestoreKeepsIPhoneHomeFirstWhenUnpinned() {
        XCTAssertEqual(
            ThemWorkspaceSurfaceRestorePolicy.launchSurfaceRawValue(
                persistedSurfaceRawValue: "",
                hasCompletedOnboarding: true,
                isMacOS: false
            ),
            ThemWorkspaceSurfaceRestorePolicy.homeRawValue
        )
    }

    func testWorkspaceSurfaceRestoreHonorsExplicitUserSurface() {
        XCTAssertEqual(
            ThemWorkspaceSurfaceRestorePolicy.launchSurfaceRawValue(
                persistedSurfaceRawValue: " home ",
                hasCompletedOnboarding: true,
                isMacOS: true
            ),
            ThemWorkspaceSurfaceRestorePolicy.homeRawValue
        )
        XCTAssertEqual(
            ThemWorkspaceSurfaceRestorePolicy.launchSurfaceRawValue(
                persistedSurfaceRawValue: " studio ",
                hasCompletedOnboarding: true,
                isMacOS: false
            ),
            ThemWorkspaceSurfaceRestorePolicy.studioRawValue
        )
    }

    func testWorkspaceSurfaceRestoreKeepsOnboardingOnHome() {
        XCTAssertEqual(
            ThemWorkspaceSurfaceRestorePolicy.launchSurfaceRawValue(
                persistedSurfaceRawValue: "studio",
                hasCompletedOnboarding: false,
                isMacOS: true
            ),
            ThemWorkspaceSurfaceRestorePolicy.homeRawValue
        )
    }

    func testExplicitUITestSurfaceTakesPriorityOverPersistedMacSurface() {
        for argument in ["--ui-open-memories", "--ui-open-data-controls", "--ui-open-studio"] {
            XCTAssertFalse(
                ThemWorkspaceSurfaceRestorePolicy.shouldRestorePersistedSurface(
                    isRunningUITests: true,
                    arguments: ["them", "--ui-testing", argument]
                ),
                "Expected \(argument) to bypass persisted surface restoration."
            )
        }
        XCTAssertTrue(
            ThemWorkspaceSurfaceRestorePolicy.shouldRestorePersistedSurface(
                isRunningUITests: false,
                arguments: ["them", "--ui-open-memories"]
            )
        )
        XCTAssertTrue(
            ThemWorkspaceSurfaceRestorePolicy.shouldRestorePersistedSurface(
                isRunningUITests: true,
                arguments: ["them", "--ui-testing"]
            )
        )
    }

    func testWorkspaceAuthenticationRequiresLiveAccountBeforeStudio() {
        XCTAssertTrue(
            ThemWorkspaceAuthenticationPolicy.requiresAccount(
                isAuthenticated: false,
                accessTokenExpired: false,
                isRunningUITests: false
            )
        )
        XCTAssertTrue(
            ThemWorkspaceAuthenticationPolicy.requiresAccount(
                isAuthenticated: true,
                accessTokenExpired: true,
                isRunningUITests: false
            )
        )
        XCTAssertFalse(
            ThemWorkspaceAuthenticationPolicy.requiresAccount(
                isAuthenticated: true,
                accessTokenExpired: false,
                isRunningUITests: false
            )
        )
    }

    func testWorkspaceAuthenticationKeepsDeterministicUITestStudioPath() {
        XCTAssertFalse(
            ThemWorkspaceAuthenticationPolicy.requiresAccount(
                isAuthenticated: false,
                accessTokenExpired: false,
                isRunningUITests: true
            )
        )
    }

    func testWorkspaceAuthenticationRefreshesPersistedSessionBeforeRequiringAccount() {
        let expiredAccessDecision = ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: true,
            accessTokenExpired: true,
            refreshTokenPresent: true,
            isRunningUITests: false
        )
        guard case .refreshPersistedSession = expiredAccessDecision else {
            return XCTFail("Expected an expired access token to restore through the refresh token.")
        }

        let missingAccessDecision = ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: false,
            accessTokenExpired: false,
            refreshTokenPresent: true,
            isRunningUITests: false
        )
        guard case .refreshPersistedSession = missingAccessDecision else {
            return XCTFail("Expected a missing access token to restore through the refresh token.")
        }
    }

    func testWorkspaceAuthenticationRequiresAccountWhenNoSessionCanBeRestored() {
        let missingSessionDecision = ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: false,
            accessTokenExpired: false,
            refreshTokenPresent: false,
            isRunningUITests: false
        )
        guard case .requireAccount = missingSessionDecision else {
            return XCTFail("Expected a missing saved session to require an account.")
        }

        let liveSessionDecision = ThemWorkspaceAuthenticationPolicy.accessDecision(
            isAuthenticated: true,
            accessTokenExpired: false,
            refreshTokenPresent: true,
            isRunningUITests: false
        )
        guard case .openWorkspace = liveSessionDecision else {
            return XCTFail("Expected a live access token to open Studio immediately.")
        }
    }
}
