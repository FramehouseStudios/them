import SwiftUI
import ScreenplayStudio

/// "Where we left off" as a notification strip under the home chip row.
///
/// It used to be a full card in the middle of home, stacked between the orb
/// and Talk, where it crowded the orb and pushed Talk down. Collapsed it is
/// one line with Continue; tapping it opens the full recap, Review Memory and
/// Hide, the way a notification expands.
struct HomeLeftOffBanner: View {
    let title: String
    let summary: String
    let onContinue: () -> Void
    let onReviewMemory: () -> Void
    let onHide: () -> Void

    @State private var isExpanded = false

    /// The recap opens with "Welcome back." — true on the expanded card, but
    /// in a one-line strip it spends the only line on a greeting.
    static func collapsedPreview(_ summary: String) -> String {
        let trimmed = summary.trimmingCharacters(in: .whitespacesAndNewlines)
        let greeting = "Welcome back."
        guard trimmed.lowercased().hasPrefix(greeting.lowercased()) else { return trimmed }
        return String(trimmed.dropFirst(greeting.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() }
                } label: {
                    HStack(alignment: .center, spacing: 10) {
                        Image(systemName: "bookmark.fill")
                            .font(IOThemTypography.UI.caption)
                            .foregroundColor(.herText.opacity(0.78))
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Where we left off · \(title)")
                                .font(IOThemTypography.UI.captionStrong)
                                .foregroundColor(.herText.opacity(0.92))
                                .lineLimit(1)
                            if !isExpanded {
                                Text(Self.collapsedPreview(summary))
                                    .font(IOThemTypography.UI.labelRegular)
                                    .foregroundColor(.herText.opacity(0.78))
                                    .lineLimit(1)
                            }
                        }
                        Spacer(minLength: 4)
                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(IOThemTypography.UI.micro)
                            .foregroundColor(.herText.opacity(0.66))
                            .accessibilityHidden(true)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Where we left off, \(title). \(Self.collapsedPreview(summary))")
                .accessibilityHint(isExpanded ? "Collapses the recap." : "Shows the full recap.")
                .accessibilityIdentifier("home.session-continuity.toggle")

                Button(action: onContinue) {
                    Text("Continue")
                        .font(IOThemTypography.UI.captionMedium)
                        .foregroundColor(.herText.opacity(0.95))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(Color.white.opacity(0.26)))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Continue writing")
                .accessibilityIdentifier("home.session-continuity.open-studio")
            }

            if isExpanded {
                Text(summary)
                    .font(IOThemTypography.UI.caption)
                    .foregroundColor(.herText.opacity(0.86))
                    .lineSpacing(3)
                    .lineLimit(6)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("home.session-continuity.summary")

                HStack(spacing: 8) {
                    Button(action: onReviewMemory) {
                        Text("Review Memory")
                            .font(IOThemTypography.UI.caption)
                            .foregroundColor(.herText.opacity(0.88))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(Color.white.opacity(0.16)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home.session-continuity.open-memories")

                    Spacer(minLength: 0)

                    Button(action: onHide) {
                        Text("Hide")
                            .font(IOThemTypography.UI.caption)
                            .foregroundColor(.herText.opacity(0.74))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Hide restored memory")
                    .accessibilityIdentifier("home.session-continuity.hide")
                }
                .transition(.opacity)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: 560, alignment: .leading)
        .background(
            // Frosted, so the orb behind it never shows through the recap.
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(Color.white.opacity(0.16))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.22), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home.session-continuity")
    }
}
