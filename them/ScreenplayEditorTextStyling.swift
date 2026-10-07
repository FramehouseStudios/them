import Foundation
import ScreenplayStudio
#if os(macOS)
import AppKit
#elseif os(iOS)
import UIKit
#endif

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
        return ScreenplayStackMetrics(
            printableWidth: printableWidth,
            dialogueLeading: max(22, desktopReference.dialogueLeading * scale),
            dialogueTrailing: max(18, desktopReference.dialogueTrailing * scale),
            characterLeading: max(38, desktopReference.characterLeading * scale),
            characterTrailing: max(22, desktopReference.characterTrailing * scale),
            parentheticalLeading: max(30, desktopReference.parentheticalLeading * scale),
            parentheticalTrailing: max(24, desktopReference.parentheticalTrailing * scale),
            transitionTrailing: min(max(printableWidth * 0.035, 6), 18),
            sceneHeadingSpacingAfter: min(max(printableWidth * 0.010, 3), 6),
            actionCueSpacingAfter: min(max(printableWidth * 0.014, 4), 8),
            transitionSpacingBefore: min(max(printableWidth * 0.012, 4), 8)
        )
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

extension NSAttributedString.Key {
    static let screenplayElementRaw = NSAttributedString.Key("io.them.them.screenplayElementRaw")
}

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
    let fullRange = NSRange(location: 0, length: nsText.length)

    textStorage.beginEditing()
    textStorage.removeAttribute(.paragraphStyle, range: fullRange)
    textStorage.removeAttribute(.font, range: fullRange)
    textStorage.removeAttribute(.foregroundColor, range: fullRange)
    textStorage.removeAttribute(.screenplayElementRaw, range: fullRange)

    var lineStart = 0
    let lines = screenplayLineTexts(fullText)
    for (index, line) in lines.enumerated() {
        let lineLength = (line as NSString).length
        let hasTrailingNewline = index < lines.count - 1
        let rangeLength = lineLength + (hasTrailingNewline ? 1 : 0)
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
            for: resolvedElement,
            previousElement: previousElement,
            nextElement: nextElement,
            containerWidth: containerWidth
        )
        var attributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: foregroundColor,
            .paragraphStyle: paragraphStyle,
        ]
        if index < elements.count, let element = elements[index] {
            attributes[.screenplayElementRaw] = element.rawValue
        }
        textStorage.addAttributes(attributes, range: range)
        lineStart += rangeLength
    }
    textStorage.endEditing()
}

enum ScreenplayParagraphRestylePolicy {
    static func shouldRestyle(
        previousElements: [ScreenplayEditorElement?],
        currentElements: [ScreenplayEditorElement?],
        paragraphStructureChanged: Bool
    ) -> Bool {
        paragraphStructureChanged || previousElements != currentElements
    }
}

struct ScreenplayLineIndex {
    private(set) var lineLengths: [Int] = [0]
    private var fenwickTree: [Int] = [0, 0]

    init(text: String = "") {
        rebuild(for: text)
    }

    mutating func rebuild(for text: String) {
        let scannedLines = Self.scanLines(in: text)
        lineLengths = scannedLines.map { $0.utf16Length }
        fenwickTree = Array(repeating: 0, count: lineLengths.count + 1)
        for index in 1...lineLengths.count {
            fenwickTree[index] += lineLengths[index - 1]
            let parent = index + (index & -index)
            if parent <= lineLengths.count {
                fenwickTree[parent] += fenwickTree[index]
            }
        }
    }

    static func lineTexts(in text: String) -> [String] {
        scanLines(in: text).map { $0.text }
    }

    static func lineIndex(atUTF16Location location: Int, in text: String) -> Int {
        let nsText = text as NSString
        let target = max(0, min(location, nsText.length))
        var lineIndex = 0
        var offset = 0
        while offset < target {
            let breakLength = lineBreakLength(in: nsText, at: offset)
            if breakLength > 0 {
                if offset + breakLength <= target {
                    lineIndex += 1
                }
                offset += breakLength
            } else {
                offset += 1
            }
        }
        return lineIndex
    }

    private static func scanLines(in text: String) -> [(text: String, utf16Length: Int)] {
        let nsText = text as NSString
        let textLength = nsText.length
        var lines: [(text: String, utf16Length: Int)] = []
        var lineStart = 0
        var offset = 0

        while offset < textLength {
            let breakLength = lineBreakLength(in: nsText, at: offset)
            if breakLength > 0 {
                lines.append((
                    text: nsText.substring(with: NSRange(location: lineStart, length: offset - lineStart)),
                    utf16Length: offset + breakLength - lineStart
                ))
                offset += breakLength
                lineStart = offset
            } else {
                offset += 1
            }
        }

        lines.append((
            text: nsText.substring(with: NSRange(location: lineStart, length: textLength - lineStart)),
            utf16Length: textLength - lineStart
        ))
        return lines
    }

    private static func lineBreakLength(in text: NSString, at offset: Int) -> Int {
        guard offset >= 0, offset < text.length else { return 0 }
        switch text.character(at: offset) {
        case 0x000A, 0x000B, 0x000C, 0x0085, 0x2028, 0x2029:
            return 1
        case 0x000D:
            return offset + 1 < text.length && text.character(at: offset + 1) == 0x000A ? 2 : 1
        default:
            return 0
        }
    }

    func lineIndex(atUTF16Location location: Int) -> Int {
        let target = max(0, location)
        var prefixCount = 0
        var prefixLength = 0
        var step = 1
        while step * 2 <= lineLengths.count {
            step *= 2
        }
        while step > 0 {
            let candidate = prefixCount + step
            if candidate <= lineLengths.count,
               prefixLength + fenwickTree[candidate] <= target {
                prefixCount = candidate
                prefixLength += fenwickTree[candidate]
            }
            step /= 2
        }
        return min(prefixCount, max(0, lineLengths.count - 1))
    }

    func lineStart(at index: Int) -> Int {
        let safeIndex = max(0, min(index, lineLengths.count))
        var total = 0
        var cursor = safeIndex
        while cursor > 0 {
            total += fenwickTree[cursor]
            cursor -= cursor & -cursor
        }
        return total
    }

    mutating func applyInlineEdit(onLineAt index: Int, utf16LengthDelta: Int) {
        guard utf16LengthDelta != 0,
              index >= 0,
              index < lineLengths.count else { return }
        lineLengths[index] += utf16LengthDelta
        var cursor = index + 1
        while cursor < fenwickTree.count {
            fenwickTree[cursor] += utf16LengthDelta
            cursor += cursor & -cursor
        }
    }
}
