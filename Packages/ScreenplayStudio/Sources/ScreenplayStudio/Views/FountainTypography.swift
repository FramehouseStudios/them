import SwiftUI

public enum FountainTypography {
    // Standard screenplay: Courier 12pt, but we use system monospaced for availability
    public static let baseFontSize: CGFloat = 14
    public static let pageBackgroundColor = Color.black
    public static let paperColor = Color(white: 0.06)
    public static let textColor = Color(white: 0.92)
    public static let hiddenColor = Color.clear
    public static let cursorColor = Color(red: 1, green: 0.6, blue: 0.2) // warm amber

    // Screenplay element indentation (proportional to standard 8.5x11 margins)
    public static let sceneHeadingIndent: CGFloat = 0
    public static let actionIndent: CGFloat = 0
    public static let characterIndent: CGFloat = 120
    public static let dialogueIndent: CGFloat = 72
    public static let parentheticalIndent: CGFloat = 90
    public static let transitionIndent: CGFloat = 0 // right-aligned handled separately

    public static func font(for kind: FountainElement.Kind, size: CGFloat = baseFontSize) -> Font {
        switch kind {
        case .sceneHeading:
            return .system(size: size, weight: .bold, design: .monospaced)
        case .character:
            return .system(size: size, weight: .semibold, design: .monospaced)
        case .parenthetical:
            return .system(size: size * 0.95, weight: .regular, design: .monospaced).italic()
        default:
            return .system(size: size, weight: .regular, design: .monospaced)
        }
    }

    public static func indent(for kind: FountainElement.Kind) -> CGFloat {
        switch kind {
        case .sceneHeading: return sceneHeadingIndent
        case .action: return actionIndent
        case .character: return characterIndent
        case .dialogue: return dialogueIndent
        case .parenthetical: return parentheticalIndent
        case .transition: return transitionIndent
        case .blank: return 0
        }
    }

    public static func alignment(for kind: FountainElement.Kind) -> TextAlignment {
        switch kind {
        case .transition: return .trailing
        default: return .leading
        }
    }

    public static func horizontalAlignment(for kind: FountainElement.Kind) -> HorizontalAlignment {
        switch kind {
        case .transition: return .trailing
        default: return .leading
        }
    }

    public static func topSpacing(for kind: FountainElement.Kind, afterKind: FountainElement.Kind?) -> CGFloat {
        switch kind {
        case .sceneHeading: return afterKind == nil ? 0 : 20
        case .action:
            if afterKind == .sceneHeading { return 4 }
            return 12
        case .character: return 16
        case .dialogue: return 2
        case .parenthetical: return 2
        case .transition: return 16
        case .blank: return 8
        }
    }

    /// Classifies a rendered Fountain line into its element kind.
    public static func classifyLine(_ line: String) -> FountainElement.Kind {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .blank }

        let upper = trimmed.uppercased()
        if upper.hasPrefix("INT.") || upper.hasPrefix("EXT.") ||
            upper.hasPrefix("INT/EXT.") || upper.hasPrefix("I/E.") {
            return .sceneHeading
        }

        if upper.hasSuffix("TO:") || upper == "FADE IN:" || upper == "FADE OUT:" ||
            upper == "FADE TO BLACK:" || upper == "THE END" ||
            upper == "SMASH TO BLACK:" {
            return .transition
        }

        if trimmed.hasPrefix("(") && trimmed.hasSuffix(")") {
            return .parenthetical
        }

        // All-caps short line = character cue
        if trimmed == trimmed.uppercased() && trimmed.count <= 40 &&
            !trimmed.contains(":") && trimmed.count > 0 &&
            trimmed.range(of: #"^[A-Z0-9 '\-().]+$"#, options: .regularExpression) != nil {
            return .character
        }

        return .action
    }
}
