import ScreenplayStudio
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

enum ScreenplayParagraphStyleFactory {
    static func make(
        for element: ScreenplayEditorElement,
        previousElement: ScreenplayEditorElement?,
        nextElement: ScreenplayEditorElement?,
        containerWidth: CGFloat
    ) -> NSParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.lineBreakMode = .byWordWrapping
        style.paragraphSpacing = 0
        style.paragraphSpacingBefore = 0
        style.lineHeightMultiple = 1.0
        style.tabStops = []

        let metrics = ScreenplayStackMetrics.editor(containerWidth: containerWidth)
        switch element {
        case .sceneHeading:
            style.alignment = .left
            style.firstLineHeadIndent = 0
            style.headIndent = 0
            style.tailIndent = 0
            if nextElement == .action || nextElement == .character {
                style.paragraphSpacing = metrics.sceneHeadingSpacingAfter
            }
        case .action:
            style.alignment = .left
            style.firstLineHeadIndent = 0
            style.headIndent = 0
            style.tailIndent = 0
            if nextElement == .character || nextElement == .transition {
                style.paragraphSpacing = metrics.actionCueSpacingAfter
            }
        case .character:
            style.alignment = .center
            style.firstLineHeadIndent = metrics.characterLeading
            style.headIndent = metrics.characterLeading
            style.tailIndent = -metrics.characterTrailing
        case .centered:
            style.alignment = .center
            style.firstLineHeadIndent = 0
            style.headIndent = 0
            style.tailIndent = 0
        case .dialogue:
            style.alignment = .left
            style.firstLineHeadIndent = metrics.dialogueLeading
            style.headIndent = metrics.dialogueLeading
            style.tailIndent = -metrics.dialogueTrailing
        case .parenthetical:
            style.alignment = .left
            style.firstLineHeadIndent = metrics.parentheticalLeading
            style.headIndent = metrics.parentheticalLeading
            style.tailIndent = -metrics.parentheticalTrailing
        case .transition:
            style.alignment = .right
            style.firstLineHeadIndent = 0
            style.headIndent = 0
            style.tailIndent = -metrics.transitionTrailing
            if previousElement == .dialogue || previousElement == .parenthetical {
                style.paragraphSpacingBefore = metrics.transitionSpacingBefore
            }
        }
        return style
    }
}
