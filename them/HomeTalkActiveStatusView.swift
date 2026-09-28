import SwiftUI
import ScreenplayStudio

/// Stands in for the home Talk prompt while a conversation runs.
///
/// The prompt hides while THEM is listening, thinking, or speaking
/// (`HomeTalkPromptPolicy`), and nothing took its place: the writer saw only
/// the orb, with no sign the mic was open and no way to end the turn. This
/// says what is happening and offers Stop.
struct HomeTalkActiveStatusView: View {
    let status: String
    let onStop: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text(status)
                .font(IOThemTypography.UI.compactTitle)
                .foregroundColor(.herText.opacity(0.86))
                .accessibilityIdentifier("home.talk.status")
            Button(action: onStop) {
                Label("Stop", systemImage: "stop.fill")
                    .font(IOThemTypography.UI.body)
                    .foregroundColor(.herText.opacity(0.92))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(Color.white.opacity(0.20)))
                    .overlay(Capsule().stroke(Color.white.opacity(0.22), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home.talk.stop")
            .accessibilityHint("Ends the conversation and turns the microphone off.")
        }
        .transition(.opacity)
    }
}
