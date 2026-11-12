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

    func testMagicMomentWaitsForAuthenticationBeforeStartingWork() {
        XCTAssertEqual(
            ThemMagicMomentOnboardingPolicy.startDecision(
                workspaceAccessDecision: .requireAccount
            ),
            .presentAccount
        )
        XCTAssertEqual(
            ThemMagicMomentOnboardingPolicy.startDecision(
                workspaceAccessDecision: .refreshPersistedSession
            ),
            .restorePersistedSession
        )
        XCTAssertEqual(
            ThemMagicMomentOnboardingPolicy.startDecision(
                workspaceAccessDecision: .openWorkspace
            ),
            .proceed
        )
    }

    func testMagicMomentConsumesCapturedPageIntentExactlyOnce() {
        let expected = ThemMagicMomentOnboardingPolicy.PendingIntent.page(
            name: " Ava ",
            sceneSeed: "A woman finds a blue key under a motel door."
        )
        var pendingIntent: ThemMagicMomentOnboardingPolicy.PendingIntent? = expected

        XCTAssertEqual(
            ThemMagicMomentOnboardingPolicy.takePendingIntent(&pendingIntent),
            expected,
            "Authentication resume must preserve the exact name and scene captured before sign-in."
        )
        XCTAssertNil(pendingIntent)
        XCTAssertNil(
            ThemMagicMomentOnboardingPolicy.takePendingIntent(&pendingIntent),
            "A late or duplicate authentication callback must not replay the page intent."
        )
    }

    func testMagicMomentConsumesCapturedVoiceIntentExactlyOnce() {
        let expected = ThemMagicMomentOnboardingPolicy.PendingIntent.voice(name: "Ava")
        var pendingIntent: ThemMagicMomentOnboardingPolicy.PendingIntent? = expected

        XCTAssertEqual(ThemMagicMomentOnboardingPolicy.takePendingIntent(&pendingIntent), expected)
        XCTAssertNil(ThemMagicMomentOnboardingPolicy.takePendingIntent(&pendingIntent))
    }

    func testMagicMomentAccountDismissalCancelsPendingIntent() {
        var pendingIntent: ThemMagicMomentOnboardingPolicy.PendingIntent? = .page(
            name: "Ava",
            sceneSeed: "Keep this draft visible."
        )

        ThemMagicMomentOnboardingPolicy.cancelPendingIntent(&pendingIntent)

        XCTAssertNil(pendingIntent)
        XCTAssertNil(
            ThemMagicMomentOnboardingPolicy.takePendingIntent(&pendingIntent),
            "A late authentication completion must not resume after account dismissal."
        )
    }

    func testMagicMomentSuccessfulRestoreReconcilesAccountBeforeResume() {
        var events: [String] = []

        ThemMagicMomentOnboardingPolicy.reconcileThenResume(
            reconcileAccountSession: { events.append("reconcile") },
            resumePendingIntent: { events.append("resume") }
        )

        XCTAssertEqual(events, ["reconcile", "resume"])
    }

    func testMagicMomentDismissalWinsRaceWithLateAuthenticationCallback() {
        var pendingIntent: ThemMagicMomentOnboardingPolicy.PendingIntent? = .voice(name: "Ava")
        var starts = 0

        ThemMagicMomentOnboardingPolicy.cancelPendingIntent(&pendingIntent)
        if ThemMagicMomentOnboardingPolicy.takePendingIntent(&pendingIntent) != nil {
            starts += 1
        }

        XCTAssertEqual(starts, 0)
        XCTAssertNil(pendingIntent)
    }

    func testMagicMomentLateAccountCallbackCannotConsumeOrDismissReplacementAction() {
        typealias Policy = ThemMagicMomentOnboardingPolicy
        let first = Policy.PendingAction(intent: .page(name: "Ava", sceneSeed: "First scene"))
        let replacement = Policy.PendingAction(intent: .voice(name: " Bea "))
        var current: Policy.PendingAction? = first
        XCTAssertTrue(Policy.cancelPendingAction(&current, actionID: first.id))
        current = replacement
        var events: [String] = []

        Policy.reconcileThenResume(actionID: first.id, currentAction: { current },
            reconcileAccountSession: { events.append("reconcile") },
            resumePendingIntent: { events.append("resume") })

        XCTAssertEqual(events, ["reconcile"], "A committed account change must reconcile even after its action was canceled.")
        XCTAssertEqual(current?.id, replacement.id)
        XCTAssertFalse(Policy.cancelPendingAction(&current, actionID: first.id),
            "A delayed Done, binding update or dismissal from the old presenter must not cancel the replacement.")
        XCTAssertEqual(Policy.takePendingAction(&current, actionID: replacement.id), replacement.intent)
    }

    func testMagicMomentIdenticalPayloadGetsFreshOwnerAndMatchingCallbackConsumesOnce() {
        typealias Policy = ThemMagicMomentOnboardingPolicy
        let payloads: [Policy.PendingIntent] = [
            .page(name: " Ava ", sceneSeed: "  A blue key.\n🎬  "), .voice(name: " Ava "),
        ]
        for payload in payloads {
            let first = Policy.PendingAction(intent: payload)
            var current: Policy.PendingAction? = first
            XCTAssertTrue(Policy.cancelPendingAction(&current, actionID: first.id))
            let replacement = Policy.PendingAction(intent: payload)
            current = replacement
            XCTAssertNotEqual(first.id, replacement.id)
            var started: [Policy.PendingIntent] = []
            var reconciliations = 0
            let callback = { (actionID: UUID) in
                Policy.reconcileThenResume(actionID: actionID, currentAction: { current },
                    reconcileAccountSession: { reconciliations += 1 }, resumePendingIntent: {
                        if let intent = Policy.takePendingAction(&current, actionID: actionID) { started.append(intent) }
                    })
            }

            callback(first.id)
            XCTAssertTrue(started.isEmpty)
            XCTAssertEqual(current?.id, replacement.id)
            XCTAssertFalse(Policy.cancelPendingAction(&current, actionID: first.id))
            callback(replacement.id)
            callback(replacement.id)

            XCTAssertEqual(reconciliations, 3)
            XCTAssertEqual(started, [payload], "Only the new action's own completion may consume its exact captured fields.")
            XCTAssertNil(current)
            XCTAssertFalse(Policy.ownsPendingAction(current, actionID: replacement.id))
            XCTAssertFalse(Policy.cancelPendingAction(&current, actionID: replacement.id))
        }
    }

    func testMagicMomentLateRestoreSuccessAndFailureCannotAffectReplacement() {
        typealias Policy = ThemMagicMomentOnboardingPolicy
        for authenticated in [false, true] {
            let first = Policy.PendingAction(intent: .page(name: "Ava", sceneSeed: "Same scene"))
            var current: Policy.PendingAction? = first
            XCTAssertTrue(Policy.cancelPendingAction(&current, actionID: first.id))
            let replacement = Policy.PendingAction(intent: .page(name: "Ava", sceneSeed: "Same scene"))
            current = replacement
            var events: [String] = []

            Policy.completeSessionRestore(actionID: first.id, currentAction: { current },
                isAuthenticated: authenticated,
                reconcileAccountSession: { events.append("reconcile") },
                resumePendingIntent: { events.append("resume") },
                presentAccount: { events.append("failure UI") })

            XCTAssertEqual(events, authenticated ? ["reconcile"] : [],
                "A stale restore may reconcile committed auth, but cannot resume or present failure UI for a new action.")
            XCTAssertEqual(current?.id, replacement.id)
            XCTAssertEqual(Policy.takePendingAction(&current, actionID: replacement.id), replacement.intent)
        }
    }

    func testMagicMomentCurrentRestoreFailureKeepsActionForLaterAuthenticatedResume() {
        typealias Policy = ThemMagicMomentOnboardingPolicy
        let action = Policy.PendingAction(intent: .page(name: " Ava ", sceneSeed: "  Keep these exact words.\n"))
        var current: Policy.PendingAction? = action
        var events: [String] = []
        var started: [Policy.PendingIntent] = []
        let complete = { (authenticated: Bool) in
            Policy.completeSessionRestore(actionID: action.id, currentAction: { current },
                isAuthenticated: authenticated,
                reconcileAccountSession: { events.append("reconcile") }, resumePendingIntent: {
                    events.append("resume")
                    if let intent = Policy.takePendingAction(&current, actionID: action.id) { started.append(intent) }
                }, presentAccount: { events.append("account") })
        }

        complete(false)
        XCTAssertEqual(events, ["account"])
        XCTAssertEqual(current?.id, action.id)
        complete(true)
        complete(true)
        complete(false)

        XCTAssertEqual(events, ["account", "reconcile", "resume", "reconcile"])
        XCTAssertEqual(started, [action.intent].compactMap { $0 })
        XCTAssertNil(current)
    }

    func testMagicMomentRechecksActionOwnerAfterAccountReconciliation() {
        typealias Policy = ThemMagicMomentOnboardingPolicy
        let first = Policy.PendingAction(intent: .voice(name: "Ava"))
        let replacement = Policy.PendingAction(intent: .voice(name: "Bea"))
        var current: Policy.PendingAction? = first
        var events: [String] = []

        Policy.reconcileThenResume(actionID: first.id, currentAction: { current },
            reconcileAccountSession: {
                events.append("reconcile")
                XCTAssertTrue(Policy.cancelPendingAction(&current, actionID: first.id))
                current = replacement
            }, resumePendingIntent: { events.append("resume") })

        XCTAssertEqual(events, ["reconcile"])
        XCTAssertEqual(Policy.takePendingAction(&current, actionID: replacement.id), replacement.intent)
    }
}
