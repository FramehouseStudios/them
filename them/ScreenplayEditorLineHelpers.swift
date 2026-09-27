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
