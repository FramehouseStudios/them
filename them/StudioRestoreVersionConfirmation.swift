import SwiftUI

/// Restore in the Saved tab and in Draft › Snapshots replaced the page with
/// an older version on a single tap (seen live 2026-09-27, a mistap on a
/// seven-row list). It is recoverable, because the page being replaced stays
/// in Saved, but it now asks first and says so.
enum StudioRestoreVersionConfirmationCopy {
    static let title = "Restore this version?"
    static let confirmLabel = "Restore"

    static func message(savedAt: Date?) -> String {
        let when = savedAt.map { "the version saved \(StudioVersionTimeLabel.text(for: $0))" } ?? "this version"
        return "The page switches to \(when). What's on the page now stays in Saved, so you can switch back."
    }
}

private struct StudioRestoreVersionConfirmation: ViewModifier {
    @Binding var pendingVersion: BackendScreenplayVersion?
    let savedAt: (BackendScreenplayVersion) -> Date?
    let onConfirm: (BackendScreenplayVersion) -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog(
            StudioRestoreVersionConfirmationCopy.title,
            isPresented: Binding(
                get: { pendingVersion != nil },
                set: { if !$0 { pendingVersion = nil } }
            ),
            titleVisibility: .visible,
            presenting: pendingVersion
        ) { version in
            Button(StudioRestoreVersionConfirmationCopy.confirmLabel) {
                onConfirm(version)
                pendingVersion = nil
            }
            Button("Cancel", role: .cancel) { pendingVersion = nil }
        } message: { version in
            Text(StudioRestoreVersionConfirmationCopy.message(savedAt: savedAt(version)))
        }
    }
}

extension View {
    func studioRestoreVersionConfirmation(
        pendingVersion: Binding<BackendScreenplayVersion?>,
        savedAt: @escaping (BackendScreenplayVersion) -> Date?,
        onConfirm: @escaping (BackendScreenplayVersion) -> Void
    ) -> some View {
        modifier(StudioRestoreVersionConfirmation(pendingVersion: pendingVersion, savedAt: savedAt, onConfirm: onConfirm))
    }
}
