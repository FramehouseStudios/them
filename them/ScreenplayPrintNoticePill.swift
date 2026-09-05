import SwiftUI

/// Studio banner for the voice print flow: shows the pending "say cancel" window with a
/// tap-to-cancel button, then the spool result. Observes the coordinator directly so it
/// updates without routing through the draft bridge's objectWillChange.
struct ScreenplayPrintNoticePill: View {
    @ObservedObject var coordinator: ScreenplayPrintVoiceCoordinator

    var body: some View {
        Group {
            if let pending = coordinator.pending {
                HStack(spacing: 10) {
                    Image(systemName: "printer")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.herText.opacity(0.62))
                    Text("Printing \(pending.pages) \(pending.pages == 1 ? "page" : "pages") to \(pending.printerName) — say cancel")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color.herText.opacity(0.82))
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    Button("Cancel") {
                        coordinator.cancel()
                    }
                    .buttonStyle(.bordered)
                    .tint(Color.herText.opacity(0.35))
                    .font(.system(size: 12, weight: .semibold))
                    .accessibilityIdentifier("studio.print.cancel")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.70))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.herText.opacity(0.12), lineWidth: 1))
                .accessibilityIdentifier("studio.print.pending")
            } else if let notice = coordinator.notice, !notice.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: coordinator.isSpooling ? "printer.fill" : "printer")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Color.herText.opacity(0.55))
                    Text(notice)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color.herText.opacity(0.78))
                        .lineLimit(2)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.white.opacity(0.56))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.herText.opacity(0.08), lineWidth: 1))
                .accessibilityIdentifier("studio.print.notice")
            }
        }
        .animation(.easeInOut(duration: 0.18), value: coordinator.pending)
        .animation(.easeInOut(duration: 0.18), value: coordinator.notice)
    }
}
