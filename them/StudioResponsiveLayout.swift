import CoreGraphics

enum StudioResponsiveLayout {
    static let drawerLayoutThreshold: CGFloat = 1_080

    static func usesDrawers(containerWidth: CGFloat) -> Bool {
        containerWidth > 0 && containerWidth < drawerLayoutThreshold
    }

    /// Side gutter between the editor column and the page. On a phone every
    /// point of it came straight out of the dialogue column (about 17
    /// characters wide at 28 pt), so narrow editors keep only a hairline.
    static func pageGutter(editorWidth: CGFloat) -> CGFloat {
        editorWidth < 640 ? 6 : 28
    }

    /// Space above the page; narrow editors keep the page near the top bar.
    static func pageTopGutter(editorWidth: CGFloat) -> CGFloat {
        editorWidth < 640 ? 12 : 34
    }

    static func pageWidth(editorWidth: CGFloat) -> CGFloat {
        let available = max(0, editorWidth - pageGutter(editorWidth: editorWidth) * 2)
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
