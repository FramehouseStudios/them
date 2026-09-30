import Foundation
import ScreenplayStudio
#if os(iOS)
import UIKit
#else
import AppKit
#endif

func screenplayParagraphStyle(
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

func applyScreenplayParagraphAttributes(
    to textStorage: NSTextStorage,
    fullText: String,
    elements: [ScreenplayEditorElement?],
    containerWidth: CGFloat,
    font: Any,
    foregroundColor: Any
) {
    let nsText = fullText as NSString
    let lines = screenplayLineTexts(fullText)
    // Title page keys ("Title: …") read as its own sheet: centered, muted.
    let titlePageLines = ScreenplayTitlePage.leadingLineCount(in: fullText)
    let window = ScreenplayTypingRestyle.window(
        for: textStorage, lines: lines, elements: elements,
        containerWidth: containerWidth, titlePageLines: titlePageLines,
        font: font, foregroundColor: foregroundColor
    )

    textStorage.beginEditing()
    var lineStart = 0
    var removed = false
    for (index, line) in lines.enumerated() {
        let lineLength = (line as NSString).length
        let hasTrailingNewline = index < lines.count - 1
        let rangeLength = lineLength + (hasTrailingNewline ? 1 : 0)
        defer { lineStart += rangeLength }
        guard window.contains(index) else { continue }
        if !removed {
            // Only the restyled lines lose their old attributes; the rest of
            // the page keeps the ones it was given for the same text.
            let windowEnd = lines[index..<min(window.upperBound, lines.count)].enumerated().reduce(lineStart) { offset, pair in
                let absolute = index + pair.offset
                return offset + (pair.element as NSString).length + (absolute < lines.count - 1 ? 1 : 0)
            }
            let span = NSRange(location: lineStart, length: min(nsText.length, windowEnd) - lineStart)
            textStorage.removeAttribute(.paragraphStyle, range: span)
            textStorage.removeAttribute(.font, range: span)
            textStorage.removeAttribute(.foregroundColor, range: span)
            textStorage.removeAttribute(.screenplayElementRaw, range: span)
            removed = true
        }
        let range = NSRange(location: lineStart, length: rangeLength)
        let resolvedElement = (index < elements.count ? elements[index] : nil) ?? .action
        let previousElement: ScreenplayEditorElement? = {
            guard index > 0 else { return nil }
            return index - 1 < elements.count ? elements[index - 1] : nil
        }()
        let nextElement: ScreenplayEditorElement? = {
            guard index + 1 < lines.count else { return nil }
            return index + 1 < elements.count ? elements[index + 1] : nil
        }()
        let paragraphStyle = screenplayParagraphStyle(
            for: ScreenplayEditorElement.layoutElement(resolvedElement, line: line),
            previousElement: previousElement,
            nextElement: nextElement,
            containerWidth: containerWidth
        )
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: foregroundColor,
            .paragraphStyle: paragraphStyle,
        ]
        if index < titlePageLines, let centered = paragraphStyle.mutableCopy() as? NSMutableParagraphStyle {
            centered.alignment = .center
            attributes[.paragraphStyle] = centered
            #if os(iOS)
            attributes[.foregroundColor] = (foregroundColor as? UIColor)?.withAlphaComponent(0.55) ?? foregroundColor
            #else
            attributes[.foregroundColor] = (foregroundColor as? NSColor)?.withAlphaComponent(0.55) ?? foregroundColor
            #endif
        }
        if index < elements.count, let element = elements[index] {
            attributes[.screenplayElementRaw] = element.rawValue
        }
        textStorage.addAttributes(attributes, range: range)
    }
    textStorage.endEditing()
    ScreenplayTypingRestyle.remember(
        textStorage, lines: lines, elements: elements,
        containerWidth: containerWidth, titlePageLines: titlePageLines,
        font: font, foregroundColor: foregroundColor
    )
}

/// Typing in a long script restyled every line of the page on every
/// keystroke (~18 ms a key at 51 pages, sampled 2026-09-30). A keystroke
/// changes a line or two; the rest of the page already carries the
/// attributes it was given for the same text. While the editor handles a
/// keystroke (`typing { }`), only the lines that differ from what was last
/// styled are restyled, with one neighbour each side (spacing depends on the
/// next and previous element). Every other caller (loads, page writes, voice
/// reveal, width changes) still restyles the whole page.
enum ScreenplayTypingRestyle {
    private struct Styled {
        let lines: [String]
        let elements: [ScreenplayEditorElement?]
        let containerWidth: CGFloat
        let titlePageLines: Int
        let font: NSObject?
        let foregroundColor: NSObject?
    }

    nonisolated(unsafe) private static var isTypingPass = false
    nonisolated(unsafe) private static var styled: [ObjectIdentifier: Styled] = [:]

    static func typing(_ body: () -> Void) {
        isTypingPass = true
        defer { isTypingPass = false }
        body()
    }

    /// The line indices to restyle: all of them unless this is a keystroke
    /// on a page styled for the same width, font and title page.
    static func window(
        for storage: NSTextStorage,
        lines: [String],
        elements: [ScreenplayEditorElement?],
        containerWidth: CGFloat,
        titlePageLines: Int,
        font: Any,
        foregroundColor: Any
    ) -> Range<Int> {
        let all = 0..<lines.count
        guard isTypingPass, let last = styled[ObjectIdentifier(storage)],
              last.containerWidth == containerWidth,
              last.titlePageLines == titlePageLines,
              last.font?.isEqual(font as AnyObject) == true,
              last.foregroundColor?.isEqual(foregroundColor as AnyObject) == true else { return all }
        return changedLines(from: (last.lines, last.elements), to: (lines, elements))
    }

    /// Lines that differ between two stylings, widened by one line each side.
    static func changedLines(
        from old: (lines: [String], elements: [ScreenplayEditorElement?]),
        to new: (lines: [String], elements: [ScreenplayEditorElement?])
    ) -> Range<Int> {
        func element(_ list: [ScreenplayEditorElement?], _ index: Int) -> ScreenplayEditorElement? {
            index < list.count ? list[index] : nil
        }
        let shorter = min(old.lines.count, new.lines.count)
        var prefix = 0
        while prefix < shorter,
              old.lines[prefix] == new.lines[prefix],
              element(old.elements, prefix) == element(new.elements, prefix) { prefix += 1 }
        var suffix = 0
        while suffix < shorter - prefix,
              old.lines[old.lines.count - 1 - suffix] == new.lines[new.lines.count - 1 - suffix],
              element(old.elements, old.lines.count - 1 - suffix) == element(new.elements, new.lines.count - 1 - suffix) { suffix += 1 }
        if prefix == new.lines.count, old.lines.count == new.lines.count { return 0..<0 }
        let lower = max(0, prefix - 1)
        let upper = min(new.lines.count, new.lines.count - suffix + 1)
        return lower..<max(lower, upper)
    }

    static func remember(
        _ storage: NSTextStorage,
        lines: [String],
        elements: [ScreenplayEditorElement?],
        containerWidth: CGFloat,
        titlePageLines: Int,
        font: Any,
        foregroundColor: Any
    ) {
        styled[ObjectIdentifier(storage)] = Styled(
            lines: lines, elements: elements, containerWidth: containerWidth,
            titlePageLines: titlePageLines,
            font: font as AnyObject as? NSObject, foregroundColor: foregroundColor as AnyObject as? NSObject
        )
    }
}
