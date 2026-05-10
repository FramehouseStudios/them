import SwiftUI

@available(*, deprecated, message: "Use IOThemTypography, IOThemColors, and IOThemSpacing directly.")
public enum FountainTypography {
    public static let baseFontSize = IOThemTypography.Screenplay.baseFontSize
    public static let pageBackgroundColor = IOThemColors.Screenplay.pageBackground
    public static let paperColor = IOThemColors.Screenplay.paper
    public static let textColor = IOThemColors.Screenplay.text
    public static let hiddenColor = IOThemColors.Screenplay.hidden
    public static let cursorColor = IOThemColors.Screenplay.cursor

    public static let sceneHeadingIndent = IOThemSpacing.ScreenplayIndent.sceneHeading
    public static let actionIndent = IOThemSpacing.ScreenplayIndent.action
    public static let characterIndent = IOThemSpacing.ScreenplayIndent.character
    public static let dialogueIndent = IOThemSpacing.ScreenplayIndent.dialogue
    public static let parentheticalIndent = IOThemSpacing.ScreenplayIndent.parenthetical
    public static let transitionIndent = IOThemSpacing.ScreenplayIndent.transition

    public static func font(for kind: FountainElement.Kind, size: CGFloat = baseFontSize) -> Font {
        IOThemTypography.Screenplay.font(for: kind, size: size)
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
        IOThemTypography.Screenplay.topSpacing(for: kind, afterKind: afterKind)
    }

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

        if trimmed == trimmed.uppercased() && trimmed.count <= 40 &&
            !trimmed.contains(":") && trimmed.count > 0 &&
            trimmed.range(of: #"^[A-Z0-9 \x{27}\-().]+$"#, options: .regularExpression) != nil {
            return .character
        }

        return .action
    }
}
