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
        IOThemTypography.Screenplay.classifyLine(line)
    }
}
