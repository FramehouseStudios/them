import Foundation
import ScreenplayStudio

// Free line helpers for the screenplay editor coordinators, moved verbatim
// out of ScreenplayLiveDraftBridge.swift to keep that file from growing.

func screenplayCurrentLineDetails(
    for location: Int,
    in content: String
) -> (lineRange: NSRange, lineText: String, lineIndex: Int) {
    let ns = content as NSString
    let safeLocation = max(0, min(location, ns.length))
    let fullLineRange = ns.lineRange(for: NSRange(location: safeLocation, length: 0))
    let fullLineText = ns.substring(with: fullLineRange)
    let trimmedLineText = fullLineText.trimmingCharacters(in: CharacterSet(charactersIn: "\n"))
    let lineRange = NSRange(
        location: fullLineRange.location,
        length: (trimmedLineText as NSString).length
    )
    return (lineRange, trimmedLineText, screenplayLineIndex(for: lineRange.location, in: content))
}

func shouldNormalizeScreenplayLineDuringTyping(
    _ lineText: String,
    as element: ScreenplayEditorElement
) -> Bool {
    let trimmed = lineText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return false }

    switch element {
    case .sceneHeading, .character, .transition:
        return true
    case .action, .dialogue, .parenthetical:
        return false
    }
}

func screenplayPreviousFlowElement(before lineIndex: Int, in elements: [ScreenplayEditorElement?]) -> ScreenplayEditorElement? {
    guard lineIndex > 0 else { return nil }
    for index in stride(from: lineIndex - 1, through: 0, by: -1) {
        guard index < elements.count else { continue }
        if let element = elements[index] {
            return element
        }
    }
    return nil
}

func screenplayLineTexts(_ text: String) -> [String] {
    text.components(separatedBy: .newlines)
}

func bootstrapScreenplayParagraphElements(
    for text: String,
    attributedText: NSAttributedString? = nil
) -> [ScreenplayEditorElement?] {
    let lines = screenplayLineTexts(text)
    let nsText = text as NSString
    var result: [ScreenplayEditorElement?] = []
    var previousElement: ScreenplayEditorElement? = nil
    var lineStart = 0

    for (index, line) in lines.enumerated() {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        let lineLength = (line as NSString).length
        let hasTrailingNewline = index < lines.count - 1
        let rangeLength = lineLength + (hasTrailingNewline ? 1 : 0)

        guard !trimmed.isEmpty else {
            result.append(nil)
            previousElement = nil // A blank line ends a Fountain dialogue block.
            lineStart += rangeLength
            continue
        }

        var attributedElement: ScreenplayEditorElement?
        if let attributedText, attributedText.length > 0 {
            let lookupLocation = min(lineStart, max(0, nsText.length - 1))
            if lookupLocation >= 0, lookupLocation < attributedText.length,
               let raw = attributedText.attribute(.screenplayElementRaw, at: lookupLocation, effectiveRange: nil) as? String {
                attributedElement = ScreenplayEditorElement(rawValue: raw)
            }
        }

        let element = attributedElement ?? ScreenplayEditorElement.inferredElement(
            for: trimmed,
            previousElement: previousElement
        )
        result.append(element)
        previousElement = element
        lineStart += rangeLength
    }

    return result
}

func reconcileScreenplayParagraphElements(
    previousText: String,
    nextText: String,
    previousElements: [ScreenplayEditorElement?],
    activeLineIndex: Int?,
    explicitCurrentLineElement: ScreenplayEditorElement?
) -> [ScreenplayEditorElement?] {
    let previousLines = screenplayLineTexts(previousText)
    let nextLines = screenplayLineTexts(nextText)

    guard !previousLines.isEmpty else {
        var bootstrapped = bootstrapScreenplayParagraphElements(for: nextText)
        if let activeLineIndex,
           activeLineIndex < nextLines.count,
           let explicitCurrentLineElement,
           !nextLines[activeLineIndex].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            bootstrapped[activeLineIndex] = explicitCurrentLineElement
        }
        return bootstrapped
    }

    var prefixCount = 0
    while prefixCount < previousLines.count,
          prefixCount < nextLines.count,
          previousLines[prefixCount] == nextLines[prefixCount] {
        prefixCount += 1
    }

    var suffixCount = 0
    while suffixCount < (previousLines.count - prefixCount),
          suffixCount < (nextLines.count - prefixCount),
          previousLines[previousLines.count - 1 - suffixCount] == nextLines[nextLines.count - 1 - suffixCount] {
        suffixCount += 1
    }

    var result = Array<ScreenplayEditorElement?>(repeating: nil, count: nextLines.count)

    for index in 0..<min(prefixCount, nextLines.count) {
        result[index] = index < previousElements.count ? previousElements[index] : nil
    }

    if suffixCount > 0 {
        for offset in 0..<suffixCount {
            let nextIndex = nextLines.count - suffixCount + offset
            let previousIndex = previousLines.count - suffixCount + offset
            result[nextIndex] = previousIndex < previousElements.count ? previousElements[previousIndex] : nil
        }
    }

    let previousChangedStart = prefixCount
    let previousChangedEnd = max(previousChangedStart, previousLines.count - suffixCount)
    let nextChangedStart = prefixCount
    let nextChangedEnd = max(nextChangedStart, nextLines.count - suffixCount)
    let previousChangedCount = max(0, previousChangedEnd - previousChangedStart)

    var previousFlow = nextChangedStart > 0 && nextLines[nextChangedStart - 1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : screenplayPreviousFlowElement(before: nextChangedStart, in: result)

    for nextIndex in nextChangedStart..<nextChangedEnd {
        let line = nextLines[nextIndex]
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            result[nextIndex] = nil
            previousFlow = nil
            continue
        }

        let relativeIndex = nextIndex - nextChangedStart
        let preserved: ScreenplayEditorElement? = {
            guard relativeIndex < previousChangedCount else { return nil }
            let previousIndex = previousChangedStart + relativeIndex
            guard previousIndex < previousElements.count else { return nil }
            return previousElements[previousIndex]
        }()

        let resolved: ScreenplayEditorElement
        if activeLineIndex == nextIndex, let explicitCurrentLineElement {
            resolved = explicitCurrentLineElement
        } else if let preserved {
            resolved = preserved
        } else {
            resolved = ScreenplayEditorElement.inferredElement(for: trimmed, previousElement: previousFlow)
        }

        result[nextIndex] = resolved
        previousFlow = resolved
    }

    if result.count != nextLines.count {
        return bootstrapScreenplayParagraphElements(for: nextText)
    }

    return result
}

/// The lines of a finished write (a page Clementine wrote, streamed in as
/// fragments) are classified from their final text. A streamed line otherwise
/// keeps the element its first fragment got, so cues and dialogue showed as
/// action until the Studio was reopened (live 2026-09-30). `lines` is 1-based.
func reinferScreenplayParagraphElements(
    _ elements: [ScreenplayEditorElement?],
    text: String,
    lines: ClosedRange<Int>
) -> [ScreenplayEditorElement?] {
    let lineTexts = screenplayLineTexts(text)
    guard elements.count == lineTexts.count, !lineTexts.isEmpty else { return elements }
    let start = max(0, lines.lowerBound - 1)
    let end = min(lineTexts.count - 1, lines.upperBound - 1)
    guard start <= end else { return elements }
    var result = elements
    var previous: ScreenplayEditorElement? = start > 0 &&
        !lineTexts[start - 1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? result[start - 1] : nil
    for index in start...end {
        let trimmed = lineTexts[index].trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            result[index] = nil
            previous = nil
            continue
        }
        let inferred = ScreenplayEditorElement.inferredElement(for: trimmed, previousElement: previous)
        result[index] = inferred
        previous = inferred
    }
    return result
}
