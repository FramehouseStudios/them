import SwiftUI

public enum IOThemTypography {
    public enum UI {
        public static let largeTitle = Font.system(size: 34, weight: .semibold, design: .default)
        public static let editorialTitle = Font.system(size: 30, weight: .semibold, design: .serif)
        public static let title = Font.system(size: 22, weight: .semibold, design: .default)
        public static let editorialMetric = Font.system(size: 18, weight: .semibold, design: .serif)
        public static let compactTitle = Font.system(size: 17, weight: .semibold, design: .default)
        public static let sectionTitle = Font.system(size: 16, weight: .semibold, design: .default)
        public static let body = Font.system(size: 15, weight: .regular, design: .default)
        public static let bodyMedium = Font.system(size: 15, weight: .medium, design: .default)
        public static let bodyStrong = Font.system(size: 15, weight: .semibold, design: .default)
        public static let prominentCallout = Font.system(size: 14, weight: .semibold, design: .default)
        public static let callout = Font.system(size: 13, weight: .regular, design: .default)
        public static let calloutMedium = Font.system(size: 13, weight: .medium, design: .default)
        public static let calloutStrong = Font.system(size: 13, weight: .semibold, design: .default)
        public static let editorialCallout = Font.system(size: 13, weight: .semibold, design: .serif)
        public static let caption = Font.system(size: 12, weight: .regular, design: .default)
        public static let captionMedium = Font.system(size: 12, weight: .medium, design: .default)
        public static let captionStrong = Font.system(size: 12, weight: .semibold, design: .default)
        public static let labelRegular = Font.system(size: 11, weight: .regular, design: .default)
        public static let labelMedium = Font.system(size: 11, weight: .medium, design: .default)
        public static let label = Font.system(size: 11, weight: .semibold, design: .default)
        public static let compactLabelMedium = Font.system(size: 10.5, weight: .medium, design: .default)
        public static let compactLabel = Font.system(size: 10.5, weight: .semibold, design: .default)
        public static let microRegular = Font.system(size: 10, weight: .regular, design: .default)
        public static let microMedium = Font.system(size: 10, weight: .medium, design: .default)
        public static let micro = Font.system(size: 10, weight: .semibold, design: .default)
        public static let microBold = Font.system(size: 10, weight: .bold, design: .default)
        public static let nanoRegular = Font.system(size: 9, weight: .regular, design: .default)
        public static let nanoMedium = Font.system(size: 9, weight: .medium, design: .default)
        public static let nano = Font.system(size: 9, weight: .semibold, design: .default)
        public static let monoPrompt = Font.system(size: 16, weight: .light, design: .monospaced)
        public static let monoCaption = Font.system(size: 12, weight: .medium, design: .monospaced)
        public static let monoCaptionLight = Font.system(size: 12, weight: .light, design: .monospaced)
        public static let monoLabel = Font.system(size: 11, weight: .medium, design: .monospaced)
        public static let monoLabelStrong = Font.system(size: 11, weight: .semibold, design: .monospaced)
        public static let monoMicroRegular = Font.system(size: 10, weight: .regular, design: .monospaced)
        public static let monoMicro = Font.system(size: 10, weight: .semibold, design: .monospaced)
        public static let monoNanoRegular = Font.system(size: 9, weight: .regular, design: .monospaced)
        public static let monoNano = Font.system(size: 9, weight: .semibold, design: .monospaced)
        public static let monoBadge = Font.system(size: 8.5, weight: .semibold, design: .monospaced)
        public static let monoThumbnail = Font.system(size: 7.2, weight: .regular, design: .monospaced)
    }

    public enum Screenplay {
        public static let baseFontSize: CGFloat = 14
        public static let referenceText = Font.custom("Courier", size: 12)

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
            case .sceneHeading:
                return afterKind == nil ? 0 : 20
            case .action:
                return afterKind == .sceneHeading ? 4 : 12
            case .character:
                return 16
            case .dialogue, .parenthetical:
                return 2
            case .transition:
                return 16
            case .blank:
                return 8
            }
        }

        public static func classifyLine(_ line: String) -> FountainElement.Kind {
            guard !line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return .blank }
            return kind(for: ScreenplayEditorElement.inferredElement(for: line, previousElement: nil))
        }

        public static func kind(for element: ScreenplayEditorElement) -> FountainElement.Kind {
            switch element {
            case .sceneHeading: return .sceneHeading
            case .action: return .action
            case .character: return .character
            case .dialogue: return .dialogue
            case .parenthetical: return .parenthetical
            case .transition: return .transition
            }
        }
    }
}
