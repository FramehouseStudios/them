import SwiftUI

nonisolated extension Notification.Name {
    static let themOpenStudioRequested = Notification.Name("io.them.them.workspace.openStudioRequested")
    static let themCloseStudioRequested = Notification.Name("io.them.them.workspace.closeStudioRequested")
    static let themToggleStudioRequested = Notification.Name("io.them.them.workspace.toggleStudioRequested")
}

enum ThemWorkspaceNavigationCommand: String, CaseIterable {
    case openStudio
    case closeStudio
    case toggleStudio

    var notificationName: Notification.Name {
        switch self {
        case .openStudio:
            return .themOpenStudioRequested
        case .closeStudio:
            return .themCloseStudioRequested
        case .toggleStudio:
            return .themToggleStudioRequested
        }
    }

    func post(center: NotificationCenter = .default) {
        center.post(name: notificationName, object: nil)
    }
}

enum ThemWorkspaceSurfaceRestorePolicy {
    static let storageKey = "them.workspace.primarySurface.v1"
    static let homeRawValue = "home"
    static let studioRawValue = "studio"
    private static let explicitUITestSurfaceArguments: Set<String> = [
        "--ui-open-memories",
        "--ui-open-data-controls",
        "--ui-open-studio",
    ]

    static func normalizedSurfaceRawValue(_ value: String) -> String? {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch normalized {
        case homeRawValue:
            return homeRawValue
        case studioRawValue:
            return studioRawValue
        default:
            return nil
        }
    }

    static func launchSurfaceRawValue(
        persistedSurfaceRawValue: String,
        hasCompletedOnboarding: Bool,
        isMacOS: Bool
    ) -> String {
        guard hasCompletedOnboarding else { return homeRawValue }
        if let normalized = normalizedSurfaceRawValue(persistedSurfaceRawValue) {
            return normalized
        }
        return isMacOS ? studioRawValue : homeRawValue
    }

    static func shouldRestorePersistedSurface(
        isRunningUITests: Bool,
        arguments: [String]
    ) -> Bool {
        guard isRunningUITests else { return true }
        return explicitUITestSurfaceArguments.isDisjoint(with: arguments)
    }
}

enum ThemWorkspaceAuthenticationPolicy {
    enum AccessDecision {
        case openWorkspace
        case refreshPersistedSession
        case requireAccount
    }

    static func accessDecision(
        isAuthenticated: Bool,
        accessTokenExpired: Bool,
        refreshTokenPresent: Bool,
        isRunningUITests: Bool
    ) -> AccessDecision {
        guard !isRunningUITests else { return .openWorkspace }
        if isAuthenticated, !accessTokenExpired {
            return .openWorkspace
        }
        if refreshTokenPresent {
            return .refreshPersistedSession
        }
        return .requireAccount
    }

    static func requiresAccount(
        isAuthenticated: Bool,
        accessTokenExpired: Bool,
        isRunningUITests: Bool
    ) -> Bool {
        guard !isRunningUITests else { return false }
        return !isAuthenticated || accessTokenExpired
    }
}

#if os(macOS)
struct ThemWorkspaceCommands: Commands {
    var body: some Commands {
        CommandMenu("Workspace") {
            Button("Home") {
                ThemWorkspaceNavigationCommand.closeStudio.post()
            }
            .keyboardShortcut("1", modifiers: [.command, .control])

            Button("Studio") {
                ThemWorkspaceNavigationCommand.openStudio.post()
            }
            .keyboardShortcut("2", modifiers: [.command, .control])

            Divider()

            Button("Toggle Studio") {
                ThemWorkspaceNavigationCommand.toggleStudio.post()
            }
        }
    }
}
#endif
