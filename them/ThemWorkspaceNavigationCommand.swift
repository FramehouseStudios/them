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
