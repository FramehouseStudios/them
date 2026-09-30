import SwiftUI
import ScreenplayStudio

/// The read-back offer, on the page. Clementine asks out loud after a page
/// write, but the Studio showed nothing: the notice went to the Home banner
/// behind it. The answers are tappable and go through the same typed path as
/// writing "the page" (PageWriteReadBackOffer routes them).
struct StudioReadBackOfferBar: View {
    @ObservedObject var bridge: ScreenplayLiveDraftBridge
    let answer: (String) -> Void

    static let answers: [(title: String, text: String)] = [
        ("What I wrote", "What you just wrote"),
        ("The page", "The page"),
        ("Whole script", "The whole script"),
        ("Not now", "No thanks"),
    ]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 15)) { context in
            if let offeredAt = bridge.readBackOfferedAt,
               context.date.timeIntervalSince(offeredAt) < PageWriteReadBackOffer.lifetime {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Read it back?", systemImage: "speaker.wave.2")
                        .font(IOThemTypography.UI.calloutStrong)
                        .foregroundStyle(Color.herText.opacity(0.86))
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Self.answers, id: \.title) { option in
                                Button(option.title) { answer(option.text) }
                                    .font(IOThemTypography.UI.calloutMedium)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 7)
                                    .foregroundStyle(Color.herText)
                                    .background(Capsule().fill(Color.herShellPanelSoft.opacity(0.9)))
                                    .overlay(Capsule().stroke(Color.herShellStroke.opacity(0.35), lineWidth: 1))
                                    .accessibilityHint("Clementine reads it aloud when Speak Replies is on.")
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Read-back offer")
            }
        }
    }
}
