import SwiftUI

enum NumberedChoiceProminence {
    case regular
    case prominent
}

struct NumberedChoiceActionButton: View {
    let number: String
    let title: String
    var role: ButtonRole? = nil
    var prominence: NumberedChoiceProminence = .regular
    var tint: Color = Color.white.opacity(0.24)
    var isDisabled: Bool = false
    var minimumLabelHeight: CGFloat? = nil
    let action: () -> Void

    private var labelText: String {
        "\(number) \(title)"
    }

    private var shortcut: KeyEquivalent {
        KeyEquivalent(number.first ?? "1")
    }

    private var label: some View {
        Text(labelText)
            .frame(minHeight: minimumLabelHeight)
            .contentShape(Rectangle())
    }

    @ViewBuilder
    var body: some View {
        if prominence == .prominent {
            Button(role: role, action: action) { label }
                .buttonStyle(.borderedProminent)
                .tint(tint)
                .disabled(isDisabled)
                .keyboardShortcut(shortcut, modifiers: [])
        } else {
            Button(role: role, action: action) { label }
                .buttonStyle(.bordered)
                .tint(tint)
                .disabled(isDisabled)
                .keyboardShortcut(shortcut, modifiers: [])
        }
    }
}

struct NumberedChoiceKeyBadge: View {
    let number: String

    var body: some View {
        Text(number)
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundColor(.herText.opacity(0.92))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.white.opacity(0.22))
            .clipShape(Capsule())
    }
}

struct NumberedChoiceHintText: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.system(size: 11, weight: .regular, design: .default))
            .foregroundStyle(Color.herText.opacity(0.64))
    }
}
