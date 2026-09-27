import CoreGraphics

struct ScreenplayStackMetrics {
    let printableWidth: CGFloat
    let dialogueLeading: CGFloat
    let dialogueTrailing: CGFloat
    let characterLeading: CGFloat
    let characterTrailing: CGFloat
    let parentheticalLeading: CGFloat
    let parentheticalTrailing: CGFloat
    let transitionTrailing: CGFloat
    let sceneHeadingSpacingAfter: CGFloat
    let actionCueSpacingAfter: CGFloat
    let transitionSpacingBefore: CGFloat
    static let editorTextInsetHorizontal: CGFloat = 56
    static let editorTextInsetVertical: CGFloat = 30
    static let pageSurfaceHorizontalPadding: CGFloat = 30

    static func paperGuidePositions(in pageWidth: CGFloat) -> (left: CGFloat, right: CGFloat) {
        let editorWidth = max(0, pageWidth - (pageSurfaceHorizontalPadding * 2))
        let inset = pageSurfaceHorizontalPadding + editorTextInsetHorizontal(forEditorWidth: editorWidth)
        return (left: inset, right: max(inset, pageWidth - inset))
    }

    static func editor(containerWidth: CGFloat) -> ScreenplayStackMetrics {
        let printableWidth = min(max(containerWidth, 120), 520)
        guard printableWidth < 420 else {
            return calibrated(forPrintableWidth: printableWidth)
        }

        let desktopReference = calibrated(forPrintableWidth: 420)
        let scale = printableWidth / 420
        let dialogue = compactColumn(
            leading: max(22, desktopReference.dialogueLeading * scale),
            trailing: max(18, desktopReference.dialogueTrailing * scale),
            printableWidth: printableWidth,
            minimumCharacters: compactDialogueMinimumCharacters
        )
        let scaledParenthetical = (
            leading: max(30, desktopReference.parentheticalLeading * scale),
            trailing: max(24, desktopReference.parentheticalTrailing * scale)
        )
        let parentheticalMinimumWidth = CGFloat(compactDialogueMinimumCharacters - 2) * editorCharacterWidth
        let parenthetical = printableWidth - scaledParenthetical.leading - scaledParenthetical.trailing >= parentheticalMinimumWidth
            ? scaledParenthetical
            : (leading: dialogue.leading + editorCharacterWidth, trailing: dialogue.trailing + editorCharacterWidth)
        return ScreenplayStackMetrics(
            printableWidth: printableWidth,
            dialogueLeading: dialogue.leading,
            dialogueTrailing: dialogue.trailing,
            characterLeading: max(38, desktopReference.characterLeading * scale),
            characterTrailing: max(22, desktopReference.characterTrailing * scale),
            parentheticalLeading: parenthetical.leading,
            parentheticalTrailing: parenthetical.trailing,
            transitionTrailing: min(max(printableWidth * 0.035, 6), 18),
            sceneHeadingSpacingAfter: min(max(printableWidth * 0.010, 3), 6),
            actionCueSpacingAfter: min(max(printableWidth * 0.014, 4), 8),
            transitionSpacingBefore: min(max(printableWidth * 0.012, 4), 8)
        )
    }

    /// Advance of the editor's Courier 12 (`hollywoodScreenplayEditorUIFont`).
    static let editorCharacterWidth: CGFloat = 7.2

    /// On a phone the page keeps paper proportions but not paper font size, so
    /// scaled indents left dialogue about 13 characters wide and
    /// parentheticals about 10: "(whispering)" broke mid-word. Narrow pages
    /// give dialogue at least this many characters and parentheticals two
    /// fewer (one character inside the dialogue column on each side).
    static let compactDialogueMinimumCharacters = 18

    /// Shrinks a column's indents proportionally until it holds
    /// `minimumCharacters`, never below zero and never wider than the page.
    static func compactColumn(
        leading: CGFloat,
        trailing: CGFloat,
        printableWidth: CGFloat,
        minimumCharacters: Int
    ) -> (leading: CGFloat, trailing: CGFloat) {
        let minimumWidth = min(CGFloat(minimumCharacters) * editorCharacterWidth, printableWidth)
        let indents = leading + trailing
        guard indents > 0, printableWidth - indents < minimumWidth else { return (leading, trailing) }
        let factor = max(0, printableWidth - minimumWidth) / indents
        return (leading * factor, trailing * factor)
    }

    static func editorTextInsetHorizontal(forEditorWidth editorWidth: CGFloat) -> CGFloat {
        guard editorWidth > 0 else { return editorTextInsetHorizontal }
        return min(editorTextInsetHorizontal, max(16, (editorWidth - 140) * 0.20))
    }

    static let guideSample = calibrated(forPrintableWidth: 520)

    static func calibrated(forPrintableWidth printableWidth: CGFloat) -> ScreenplayStackMetrics {
        let dialogueLeading = min(max(printableWidth * 0.245, 110), 132)
        let dialogueTrailing = min(max(printableWidth * 0.225, 98), 120)
        let characterLeading = min(max(dialogueLeading + 56, printableWidth * 0.34), 184)
        let characterTrailing = min(max(dialogueTrailing + 18, printableWidth * 0.23), 132)
        let parentheticalLeading = min(max(characterLeading - 12, dialogueLeading + 34), 172)
        let parentheticalTrailing = min(max(characterTrailing + 14, dialogueTrailing + 22), 148)
        let transitionTrailing = min(max(printableWidth * 0.035, 10), 18)
        let sceneHeadingSpacingAfter = min(max(printableWidth * 0.010, 4), 6)
        let actionCueSpacingAfter = min(max(printableWidth * 0.014, 5), 8)
        let transitionSpacingBefore = min(max(printableWidth * 0.012, 5), 8)

        return ScreenplayStackMetrics(
            printableWidth: printableWidth,
            dialogueLeading: dialogueLeading,
            dialogueTrailing: dialogueTrailing,
            characterLeading: characterLeading,
            characterTrailing: characterTrailing,
            parentheticalLeading: parentheticalLeading,
            parentheticalTrailing: parentheticalTrailing,
            transitionTrailing: transitionTrailing,
            sceneHeadingSpacingAfter: sceneHeadingSpacingAfter,
            actionCueSpacingAfter: actionCueSpacingAfter,
            transitionSpacingBefore: transitionSpacingBefore
        )
    }
}
