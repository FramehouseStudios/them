import CoreGraphics

enum StudioResponsiveLayout {
    static let drawerLayoutThreshold: CGFloat = 1_080

    static func usesDrawers(containerWidth: CGFloat) -> Bool {
        containerWidth > 0 && containerWidth < drawerLayoutThreshold
    }

    static func pageWidth(editorWidth: CGFloat) -> CGFloat {
        let available = max(0, editorWidth - 56)
        guard editorWidth >= 640 else { return available }
        let preferred = max(editorWidth * 0.56, min(500, available))
        return min(560, min(available, preferred))
    }

    static func compactTopInset(safeAreaInset: CGFloat, isPhone: Bool) -> CGFloat {
        max(safeAreaInset, isPhone ? 54 : 24)
    }

    static func sidebarDrawerWidth(containerWidth: CGFloat) -> CGFloat {
        fittedDrawerWidth(
            containerWidth: containerWidth,
            preferredFraction: 0.82,
            minimum: 260,
            maximum: 320
        )
    }

    static func inspectorDrawerWidth(containerWidth: CGFloat) -> CGFloat {
        fittedDrawerWidth(
            containerWidth: containerWidth,
            preferredFraction: 0.90,
            minimum: 280,
            maximum: 360
        )
    }

    private static func fittedDrawerWidth(
        containerWidth: CGFloat,
        preferredFraction: CGFloat,
        minimum: CGFloat,
        maximum: CGFloat
    ) -> CGFloat {
        let available = max(0, containerWidth - 24)
        let preferred = max(minimum, containerWidth * preferredFraction)
        return min(available, min(maximum, preferred))
    }
}
