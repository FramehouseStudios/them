import Foundation
import ScreenplayStudio

/// Converts the screenplay's source lines into the structured scene payload
/// expected by `/screenplay/export/fdx`.
nonisolated enum ScreenplayExportSceneBuilder {
    static func scenes(from draft: String) -> [[String: Any]] {
        let rawLines = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")
        var scenes: [[String: Any]] = []
        var heading = ""
        var exportLines: [[String: Any]] = []

        func flushScene() {
            guard !heading.isEmpty || !exportLines.isEmpty else { return }
            var scene: [String: Any] = [:]
            if !heading.isEmpty { scene["heading"] = heading }
            scene["lines"] = exportLines
            scenes.append(scene)
            heading = ""
            exportLines = []
        }

        var index = rawLines.startIndex
        while index < rawLines.endIndex {
            let trimmed = rawLines[index].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { index += 1; continue }

            if isSceneHeading(trimmed) {
                flushScene()
                heading = ScreenplayEditorElement.renderedText(for: trimmed)
                index += 1
                continue
            }
            if isTransition(trimmed) {
                exportLines.append(["kind": "transition", "text": ScreenplayEditorElement.renderedText(for: trimmed)])
                index += 1
                continue
            }

            if isCharacterCue(trimmed) {
                var parenthetical = ""
                var dialogue: [String] = []
                var cursor = index + 1
                while cursor < rawLines.endIndex {
                    let next = rawLines[cursor].trimmingCharacters(in: .whitespacesAndNewlines)
                    if next.isEmpty || isSceneHeading(next) || isTransition(next) || isCharacterCue(next) { break }
                    if parenthetical.isEmpty, isParenthetical(next) {
                        parenthetical = ScreenplayEditorElement.renderedText(for: next)
                    } else {
                        dialogue.append(ScreenplayEditorElement.renderedText(for: next))
                    }
                    cursor += 1
                }
                if !dialogue.isEmpty {
                    var line: [String: Any] = [
                        "kind": "character",
                        "name": ScreenplayEditorElement.characterCueName(trimmed),
                        "dialogue": dialogue,
                    ]
                    if !parenthetical.isEmpty { line["parenthetical"] = parenthetical }
                    exportLines.append(line)
                    index = max(cursor, index + 1)
                    continue
                }
            }

            exportLines.append(["kind": "action", "text": ScreenplayEditorElement.renderedText(for: trimmed)])
            index += 1
        }

        flushScene()
        return scenes
    }

    private static func isSceneHeading(_ text: String) -> Bool {
        let rendered = ScreenplayEditorElement.renderedText(for: text)
        return text.range(
            of: #"^(INT|EXT|EST|INT/EXT|I/E)\."#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil || (text.hasPrefix(".") && ScreenplayEditorElement.looksLikeSceneHeadingStart(rendered))
    }

    private static func isTransition(_ text: String) -> Bool {
        if text.hasPrefix(">") { return true }
        return ScreenplayEditorElement.renderedText(for: text).range(
            of: #"^(CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|WIPE TO:|INTERCUT WITH:|FADE IN:|FADE IN ON:|FADE OUT:|FADE OUT\.|FADE TO BLACK:|FADE TO BLACK\.|SMASH TO BLACK:|THE END)$"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    private static func isParenthetical(_ text: String) -> Bool {
        text.hasPrefix("(") && text.hasSuffix(")") && text.count <= 80
    }

    private static func isCharacterCue(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasPrefix("!") { return false }
        if trimmed.hasPrefix("@") { return true }
        let rendered = ScreenplayEditorElement.renderedText(for: trimmed)
        guard !rendered.isEmpty, rendered.count <= 32 else { return false }
        guard rendered == rendered.uppercased() else { return false }
        guard rendered.rangeOfCharacter(from: .letters) != nil else { return false }
        return !rendered.contains(":") && !rendered.contains(".")
    }
}
