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
}
