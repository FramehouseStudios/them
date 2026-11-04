import SwiftUI

/// Actions for a recovery decision, arranged to remain readable on phone widths.
struct ScreenplayRecoveryActionButtons: View {
    let recoveryAlreadyOnPage: Bool
    let canReviewNext: Bool
    let onRecover: () -> Void
    let onDiscard: () -> Void
    let onNext: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                NumberedChoiceActionButton(
                    number: "1", title: recoveryAlreadyOnPage ? "Keep Current" : "Recover Local",
                    prominence: .prominent, tint: .herText, action: onRecover
                ).accessibilityIdentifier("studio.draft-recovery.primary-action")
                NumberedChoiceActionButton(
                    number: "2", title: "Discard Copy", tint: .herText, action: onDiscard
                ).accessibilityIdentifier("studio.draft-recovery.secondary-action")
            }
            if canReviewNext {
                Button("Review next copy", action: onNext)
                    .tint(.herText)
                    .accessibilityIdentifier("studio.draft-recovery.next-copy")
                    .accessibilityHint("Show another saved recovery copy without deleting this one.")
            }
        }
    }
}
