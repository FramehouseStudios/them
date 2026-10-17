import Foundation

/// Pure Final Draft request encoding. Transport, authentication and server
/// error handling remain owned by BackendMemoryAPI.
nonisolated enum ScreenplayFDXRequestPayload {
    static func document(draft: String, title: String) -> [String: Any] {
        var payload: [String: Any] = [:]
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanTitle.isEmpty {
            payload["title"] = ["title": cleanTitle]
        }
        payload["scenes"] = screenplayExportScenes(from: draft)
        return payload
    }

    private static func screenplayExportScenes(from draft: String) -> [[String: Any]] {
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
            if !heading.isEmpty {
                scene["heading"] = heading
            }
            scene["lines"] = exportLines
            scenes.append(scene)
            heading = ""
            exportLines = []
        }

        var index = rawLines.startIndex
        while index < rawLines.endIndex {
            let trimmed = rawLines[index].trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                index += 1
                continue
            }

            if isScreenplayExportSceneHeading(trimmed) {
                flushScene()
                heading = trimmed
                index += 1
                continue
            }

            if isScreenplayExportTransition(trimmed) {
                exportLines.append(["kind": "transition", "text": trimmed])
                index += 1
                continue
            }

            if isScreenplayExportCharacterCue(trimmed) {
                var parenthetical = ""
                var dialogue: [String] = []
                var cursor = index + 1
                while cursor < rawLines.endIndex {
                    let next = rawLines[cursor].trimmingCharacters(in: .whitespacesAndNewlines)
                    if next.isEmpty { break }
                    if isScreenplayExportSceneHeading(next)
                        || isScreenplayExportTransition(next)
                        || isScreenplayExportCharacterCue(next) {
                        break
                    }
                    if parenthetical.isEmpty, isScreenplayExportParenthetical(next) {
                        parenthetical = next
                    } else {
                        dialogue.append(next)
                    }
                    cursor += 1
                }
                if !dialogue.isEmpty {
                    var line: [String: Any] = [
                        "kind": "character",
                        "name": trimmed,
                        "dialogue": dialogue,
                    ]
                    if !parenthetical.isEmpty {
                        line["parenthetical"] = parenthetical
                    }
                    exportLines.append(line)
                    index = max(cursor, index + 1)
                    continue
                }
            }

            exportLines.append(["kind": "action", "text": trimmed])
            index += 1
        }

        flushScene()
        return scenes
    }

    private static func isScreenplayExportSceneHeading(_ text: String) -> Bool {
        text.range(
            of: #"^(INT|EXT|EST|INT/EXT|I/E)\."#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    private static func isScreenplayExportTransition(_ text: String) -> Bool {
        text.range(
            of: #"^(CUT TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|WIPE TO:|INTERCUT WITH:|FADE IN:|FADE IN ON:|FADE OUT:|FADE OUT\.|FADE TO BLACK:|FADE TO BLACK\.|SMASH TO BLACK:|THE END)$"#,
            options: [.regularExpression, .caseInsensitive]
        ) != nil
    }

    private static func isScreenplayExportParenthetical(_ text: String) -> Bool {
        text.hasPrefix("(") && text.hasSuffix(")") && text.count <= 80
    }

    private static func isScreenplayExportCharacterCue(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 32 else { return false }
        guard trimmed == trimmed.uppercased() else { return false }
        guard trimmed.rangeOfCharacter(from: .letters) != nil else { return false }
        return !trimmed.contains(":") && !trimmed.contains(".")
    }
}
