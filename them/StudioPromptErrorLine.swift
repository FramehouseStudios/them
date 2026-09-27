import SwiftUI
import ScreenplayStudio

/// A failed command-bar request, shown directly under the field. Seen live
/// 2026-09-27: a failed request left the text in the field with no visible
/// explanation, because the only message sat at the bottom of the rail.
struct StudioPromptErrorLine: View {
    let text: String

    var body: some View {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty {
            Label(clean, systemImage: "exclamationmark.circle")
                .font(IOThemTypography.UI.caption)
                .foregroundStyle(Color.red.opacity(0.82))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("studio.prompt.error")
        }
    }
}
