import SwiftUI

/// "Press 1 to … or 2 to …" and "1 Keep Local" buttons were keyboard
/// instructions shown on an iPhone. The number labels and hints appear where
/// a keyboard is the norm; the key shortcuts stay active everywhere, so an
/// iPad or iPhone with a hardware keyboard still gets them.
enum NumberedChoicePresentation {
    #if os(macOS)
    static let showsKeyNumbers = true
    #else
    static let showsKeyNumbers = false
    #endif

    static func label(number: String, title: String, showsKeyNumbers: Bool = showsKeyNumbers) -> String {
        showsKeyNumbers ? "\(number) \(title)" : title
    }

    /// Other keyboard-only instructions ("Press 1 …", "⌥⌘B") follow the same
    /// rule: shown where a keyboard is the norm, nil elsewhere.
    static func keyboardHint(_ text: String, showsKeyNumbers: Bool = showsKeyNumbers) -> String? {
        showsKeyNumbers ? text : nil
    }
}

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
    let action: () -> Void

    private var labelText: String {
        NumberedChoicePresentation.label(number: number, title: title)
    }

    private var shortcut: KeyEquivalent {
        KeyEquivalent(number.first ?? "1")
    }

    @ViewBuilder
    var body: some View {
        if prominence == .prominent {
            Button(labelText, role: role, action: action)
                .buttonStyle(.borderedProminent)
                .tint(tint)
                .disabled(isDisabled)
                .keyboardShortcut(shortcut, modifiers: [])
        } else {
            Button(labelText, role: role, action: action)
                .buttonStyle(.bordered)
                .tint(tint)
                .disabled(isDisabled)
                .keyboardShortcut(shortcut, modifiers: [])
        }
    }
}

struct NumberedChoiceKeyBadge: View {
    let number: String

    @ViewBuilder
    var body: some View {
        if NumberedChoicePresentation.showsKeyNumbers {
            badge
        }
    }

    private var badge: some View {
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

    @ViewBuilder
    var body: some View {
        if NumberedChoicePresentation.showsKeyNumbers {
            Text(message)
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.64))
        }
    }
}
