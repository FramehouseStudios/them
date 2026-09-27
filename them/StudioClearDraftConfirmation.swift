import SwiftUI

/// "Clear Draft" in Studio Settings emptied the page and deleted its local
/// recovery copy on a single tap (seen live 2026-09-27). It now asks first,
/// in the same confirmation-dialog pattern as Notes and the Companion panel.
enum StudioClearDraftConfirmationCopy {
    static let title = "Clear this page?"
    static let message = "Everything on the page and its local recovery copy are removed. Versions you already saved stay in Saved. This cannot be undone."
    static let confirmLabel = "Clear Page"
}

private struct StudioClearDraftConfirmation: ViewModifier {
    @Binding var isPresented: Bool
    let onConfirm: () -> Void

    func body(content: Content) -> some View {
        content.confirmationDialog(
            StudioClearDraftConfirmationCopy.title,
            isPresented: $isPresented,
            titleVisibility: .visible
        ) {
            Button(StudioClearDraftConfirmationCopy.confirmLabel, role: .destructive) {
                onConfirm()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(StudioClearDraftConfirmationCopy.message)
        }
    }
}

extension View {
    func studioClearDraftConfirmation(isPresented: Binding<Bool>, onConfirm: @escaping () -> Void) -> some View {
        modifier(StudioClearDraftConfirmation(isPresented: isPresented, onConfirm: onConfirm))
    }
}
