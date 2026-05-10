import CoreGraphics

public enum IOThemSpacing {
    public enum Scale {
        public static let xxxs: CGFloat = 2
        public static let xxs: CGFloat = 4
        public static let xs: CGFloat = 6
        public static let sm: CGFloat = 8
        public static let md: CGFloat = 12
        public static let lg: CGFloat = 16
        public static let xl: CGFloat = 20
        public static let xxl: CGFloat = 24
        public static let xxxl: CGFloat = 34
    }

    public enum Radius {
        public static let sm: CGFloat = 8
        public static let md: CGFloat = 14
        public static let lg: CGFloat = 18
        public static let pill: CGFloat = 999
    }

    public enum ScreenplayPageChrome {
        public static let cornerRadius: CGFloat = Radius.md
        public static let headerContentMinHeight: CGFloat = 36
        public static let headerTopPadding: CGFloat = 18
        public static let headerBottomPadding: CGFloat = Scale.lg - 2
        public static let headerHeight: CGFloat = headerContentMinHeight + headerTopPadding + headerBottomPadding
        public static let contentTopPadding: CGFloat = 18
        public static let contentBottomPadding: CGFloat = Scale.xxxl
    }

    public enum ScreenplayIndent {
        public static let sceneHeading: CGFloat = 0
        public static let action: CGFloat = 0
        public static let character: CGFloat = 120
        public static let dialogue: CGFloat = 72
        public static let parenthetical: CGFloat = 90
        public static let transition: CGFloat = 0

        public static func indent(for kind: FountainElement.Kind) -> CGFloat {
            switch kind {
            case .sceneHeading: return sceneHeading
            case .action: return action
            case .character: return character
            case .dialogue: return dialogue
            case .parenthetical: return parenthetical
            case .transition: return transition
            case .blank: return 0
            }
        }
    }
}
