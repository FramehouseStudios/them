import SwiftUI
import ScreenplayStudio

/// Studio banner for the voice print flow: shows the pending "say cancel" window with a
/// tap-to-cancel button, then the spool result. Observes the coordinator directly so it
/// updates without routing through the draft bridge's objectWillChange.
struct ScreenplayPrintNoticePill: View {
    @ObservedObject var coordinator: ScreenplayPrintVoiceCoordinator

    var body: some View {
        Group {
            if let pending = coordinator.pending {
                HStack(spacing: IOThemSpacing.Scale.sm) {
                    Image(systemName: "printer")
                        .font(IOThemTypography.UI.label)
                        .foregroundStyle(Color.herText.opacity(0.62))
                    Text("Printing \(pending.pages) \(pending.pages == 1 ? "page" : "pages") to \(pending.printerName) — say cancel")
                        .font(IOThemTypography.UI.captionMedium)
                        .foregroundStyle(Color.herText.opacity(0.82))
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    Button("Cancel") {
                        coordinator.cancel()
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.herText.opacity(0.35))
                    .font(IOThemTypography.UI.captionStrong)
                    .accessibilityIdentifier("studio.print.cancel")
                }
                .padding(.horizontal, IOThemSpacing.Scale.md)
                .padding(.vertical, IOThemSpacing.Scale.sm)
                .background(Color.white.opacity(0.70))
                .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm).stroke(Color.herText.opacity(0.12), lineWidth: 1))
                .accessibilityIdentifier("studio.print.pending")
            } else if let notice = coordinator.notice, !notice.isEmpty {
                HStack(spacing: IOThemSpacing.Scale.sm) {
                    Image(systemName: coordinator.isSpooling ? "printer.fill" : "printer")
                        .font(IOThemTypography.UI.label)
                        .foregroundStyle(Color.herText.opacity(0.55))
                    Text(notice)
                        .font(IOThemTypography.UI.captionMedium)
                        .foregroundStyle(Color.herText.opacity(0.78))
                        .lineLimit(2)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, IOThemSpacing.Scale.md)
                .padding(.vertical, IOThemSpacing.Scale.sm)
                .background(Color.white.opacity(0.56))
                .clipShape(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: IOThemSpacing.Radius.sm).stroke(Color.herText.opacity(0.08), lineWidth: 1))
                .accessibilityIdentifier("studio.print.notice")
            }
        }
        .animation(.easeInOut(duration: 0.18), value: coordinator.pending)
        .animation(.easeInOut(duration: 0.18), value: coordinator.notice)
    }
}
