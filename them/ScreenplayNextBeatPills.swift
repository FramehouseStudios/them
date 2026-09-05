import SwiftUI
import ScreenplayStudio

/// The three "what happens next" suggestions the Page multipass plan stage leaves
/// behind, shown as tappable pills under the page when the writer is blocked.
/// Tapping one asks Clementine to write that beat to the page; it never edits the
/// draft by itself and never writes the suggestion back as writer canon.
enum ScreenplayNextBeatPills {
    static let maxVisible = 3

    /// Trims, drops empties and duplicates, and caps the list for display.
    static func visibleBeats(_ beats: [String]) -> [String] {
        var seen: Set<String> = []
        var out: [String] = []
        for beat in beats {
            let clean = beat
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            out.append(clean)
            if out.count == maxVisible { break }
        }
        return out
    }

    /// The prompt a tapped pill submits, routed to the page lane.
    static func prompt(for beat: String) -> String {
        let clean = beat.trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: ".!?"))
        return "Write the next beat: \(clean)."
    }

    /// Short label for the pill: the beat up to its first " — cost:" clause.
    static func label(for beat: String) -> String {
        let clean = beat.trimmingCharacters(in: .whitespacesAndNewlines)
        if let range = clean.range(of: #"\s+[—–-]+\s*cost\s*:"#, options: [.regularExpression, .caseInsensitive]) {
            return String(clean[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return clean
    }
}

struct ScreenplayNextBeatPillsView: View {
    let beats: [String]
    let isBusy: Bool
    let onPick: (String) -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: IOThemSpacing.Scale.sm) {
            HStack(spacing: IOThemSpacing.Scale.sm) {
                Image(systemName: "arrow.turn.down.right")
                    .font(IOThemTypography.UI.micro)
                    .foregroundStyle(Color.herText.opacity(0.45))
                Text("Next beat")
                    .font(IOThemTypography.UI.micro)
                    .foregroundStyle(Color.herText.opacity(0.45))
                Spacer(minLength: 0)
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(IOThemTypography.UI.micro)
                        .foregroundStyle(Color.herText.opacity(0.40))
                        .padding(IOThemSpacing.Scale.xxs)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss next-beat suggestions")
                .accessibilityIdentifier("studio.nextBeats.dismiss")
            }
            ForEach(Array(beats.enumerated()), id: \.offset) { index, beat in
                Button {
                    onPick(beat)
                } label: {
                    HStack(alignment: .top, spacing: IOThemSpacing.Scale.sm) {
                        Text(ScreenplayNextBeatPills.label(for: beat))
                            .font(IOThemTypography.UI.captionMedium)
                            .foregroundStyle(Color.herText.opacity(0.82))
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                        Spacer(minLength: 0)
                        Text("write it")
                            .font(IOThemTypography.UI.micro)
                            .foregroundStyle(Color.herText.opacity(0.40))
                    }
                    .padding(.horizontal, IOThemSpacing.Scale.md)
                    .padding(.vertical, IOThemSpacing.Scale.sm)
                    .background(Color.white.opacity(0.56))
                    .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous)
                            .stroke(Color.herText.opacity(0.08), lineWidth: 1)
                    )
                    .contentShape(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(isBusy)
                .opacity(isBusy ? 0.55 : 1)
                .accessibilityLabel("Next beat: \(beat)")
                .accessibilityHint("Asks Clementine to write this beat to the page.")
                .accessibilityIdentifier("studio.nextBeats.pill.\(index)")
            }
        }
        .accessibilityIdentifier("studio.nextBeats")
    }
}
