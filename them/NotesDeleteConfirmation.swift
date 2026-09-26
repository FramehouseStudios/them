import Foundation

/// The Notes panel's Delete and Clear All controls removed notes on a single
/// tap with no confirmation and no undo (seen live 2026-09-26). Each now asks
/// first, in the same confirmation-dialog pattern as the Companion panel.
nonisolated enum NotesDeleteConfirmation: Identifiable, Equatable {
    case note(id: String, title: String)
    case all(count: Int)

    var id: String {
        switch self {
        case .note(let id, _): return "note:\(id)"
        case .all: return "all"
        }
    }

    var title: String {
        switch self {
        case .note(_, let noteTitle):
            let clean = noteTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            return clean.isEmpty ? "Delete this note?" : "Delete \u{201C}\(clean)\u{201D}?"
        case .all(let count):
            return count == 1 ? "Delete your only note?" : "Delete all \(count) notes?"
        }
    }

    var message: String {
        switch self {
        case .note:
            return "The note is removed from this device. Your screenplay pages and projects are not touched. This cannot be undone."
        case .all:
            return "Every in-app note is removed from this device. Your screenplay pages and projects are not touched. This cannot be undone."
        }
    }

    var confirmLabel: String {
        switch self {
        case .note: return "Delete Note"
        case .all: return "Delete All Notes"
        }
    }
}
