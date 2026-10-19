import SwiftUI

struct ClementineStudioVoiceCaption: View {
    let partialTranscript: String
    let isListening: Bool
    let textColor: Color
    let secondaryTextColor: Color
    let panelColor: Color
    let strokeColor: Color

    private var cleanPartial: String {
        partialTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: cleanPartial.isEmpty ? "square.and.pencil" : "waveform")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color.accentColor.opacity(0.86))
                .accessibilityHidden(true)
            if !cleanPartial.isEmpty {
                Text("Hearing:")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(textColor.opacity(0.88))
                    .fixedSize(horizontal: true, vertical: false)
            }
            Text(cleanPartial.isEmpty ? (isListening ? "Live Write is listening — each pause becomes screenplay" : "Live Write ready — start when you’re ready") : cleanPartial)
                .font(.system(size: 11, weight: cleanPartial.isEmpty ? .medium : .regular))
                .foregroundStyle(secondaryTextColor)
                .lineLimit(1)
                .truncationMode(cleanPartial.isEmpty ? .tail : .head)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(panelColor.opacity(0.98))
        .overlay(alignment: .bottom) {
            Rectangle().fill(strokeColor.opacity(0.45)).frame(height: 1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(cleanPartial.isEmpty ? "Live Write status" : "Clementine is hearing")
        .accessibilityValue(cleanPartial.isEmpty ? (isListening ? "Listening; each pause becomes screenplay" : "Ready") : cleanPartial)
        .accessibilityIdentifier(cleanPartial.isEmpty ? "studio.live-write.status" : "studio.voice.partial-transcript")
    }
}

struct ClementineLiveWritePreview: View {
    let screenplay: String
    let textColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label("Clementine is formatting", systemImage: "square.and.pencil")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(Color.accentColor)
            Text(screenplay)
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .foregroundStyle(textColor)
                .lineLimit(8)
                .frame(maxWidth: 360, alignment: .leading)
        }
        .padding(12)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.accentColor.opacity(0.32), lineWidth: 1)
        }
        .padding(16)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Clementine screenplay preview")
        .accessibilityIdentifier("studio.live-write.preview")
    }
}

struct ClementineLiveWriteSetting: View {
    @Binding var isEnabled: Bool
    let secondaryTextColor: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button { isEnabled.toggle() } label: {
                HStack(spacing: 8) {
                    Image(systemName: isEnabled ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(isEnabled ? Color.accentColor : secondaryTextColor)
                    Text("Live Write").font(.system(size: 12, weight: .semibold))
                    Spacer(minLength: 8)
                    Text(isEnabled ? "On" : "Off")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(secondaryTextColor)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Live Write")
            .accessibilityValue(isEnabled ? "Enabled" : "Disabled")
            .accessibilityIdentifier("studio.live-write.toggle")
            Text("At each natural pause, Clementine formats that passage onto the page while you keep telling the story.")
                .font(.system(size: 10))
                .foregroundStyle(secondaryTextColor)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
