import Foundation

/// The two destructive controls on the Companion panel cleared on a single
/// tap with no confirmation and no undo (seen live 2026-09-24). Each now asks
/// first, in the app's existing confirmation-dialog pattern.
nonisolated enum CompanionClearConfirmation: String, CaseIterable, Identifiable {
    case memory
    case thread

    var id: String { rawValue }

    var title: String {
        switch self {
        case .memory: return "Clear companion memory?"
        case .thread: return "Clear the recent companion thread?"
        }
    }

    var message: String {
        switch self {
        case .memory: return "What Clementine remembers from companion conversations is removed. Your screenplay pages and projects are not touched. This cannot be undone."
        case .thread: return "The recent companion thread shown here is cleared. Memory and your pages are not touched. This cannot be undone."
        }
    }

    var confirmLabel: String {
        switch self {
        case .memory: return "Clear Memory"
        case .thread: return "Clear Thread"
        }
    }
}
