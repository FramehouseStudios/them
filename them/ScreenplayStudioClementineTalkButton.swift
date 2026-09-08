import SwiftUI

struct ScreenplayStudioClementineTalkButton: View {
    enum Style {
        case compact
        case expanded
    }

    let style: Style
    let isActive: Bool
    let canTalk: Bool
    let statusText: String
    let isLiveWriteMode: Bool
    let workspace: ScreenplayStudioVoiceWorkspaceContext
    let textColor: Color
    let secondaryTextColor: Color
    let panelColor: Color
    let strokeColor: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            switch style {
            case .compact:
                compactLabel
            case .expanded:
                expandedLabel
            }
        }
        .buttonStyle(.plain)
        .disabled(!canTalk && !isActive)
        .accessibilityLabel(
            isActive
                ? (isLiveWriteMode ? "Stop Live Write" : "Stop Clementine")
                : (isLiveWriteMode ? "Start Live Write" : "Talk to Clementine")
        )
        .accessibilityHint(workspace.talkAccessibilityHint)
        .accessibilityValue("\(workspace.title) context. \(statusText)")
        .accessibilityIdentifier(style == .compact ? "studio.compact.talk" : "studio.talk")
        .help(
            isActive
                ? (isLiveWriteMode ? "Stop Live Write" : "Stop Clementine")
                : (isLiveWriteMode ? "Start Live Write from \(workspace.title)" : "Talk to Clementine from \(workspace.title)")
        )
    }

    private var compactLabel: some View {
        Image(systemName: isActive ? "stop.fill" : (isLiveWriteMode ? "square.and.pencil" : "waveform"))
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(
                isActive
                    ? Color.red.opacity(0.86)
                    : (canTalk ? textColor.opacity(0.90) : secondaryTextColor)
            )
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(isActive ? Color.red.opacity(0.10) : panelColor)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(
                        isActive ? Color.red.opacity(0.22) : strokeColor.opacity(0.55),
                        lineWidth: 1
                    )
            )
    }

    private var expandedLabel: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(
                    isActive
                        ? Color.white.opacity(0.92)
                        : (canTalk ? Color.white.opacity(0.92) : Color.herStudioActiveFill.opacity(0.30))
                )
                .frame(width: 8, height: 8)
            Text(isActive ? "Stop" : (isLiveWriteMode ? "Live Write" : "Talk"))
                .font(.system(size: 11, weight: .semibold, design: .default))
        }
        .foregroundStyle(
            isActive
                ? Color.red.opacity(0.86)
                : (canTalk ? Color.white : Color.herText.opacity(0.42))
        )
        .padding(.horizontal, 11)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(
                    isActive
                        ? Color.red.opacity(0.10)
                        : (canTalk ? Color.accentColor.opacity(0.92) : panelColor)
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .stroke(
                    isActive
                        ? Color.red.opacity(0.22)
                        : (canTalk ? Color.accentColor.opacity(0.94) : strokeColor.opacity(0.55)),
                    lineWidth: 1
                )
        )
    }
}
