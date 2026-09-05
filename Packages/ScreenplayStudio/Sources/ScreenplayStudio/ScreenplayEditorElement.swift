public enum ScreenplayEditorElement: String, CaseIterable, Identifiable, Codable {
    case sceneHeading
    case action
    case character
    case dialogue
    case parenthetical
    case transition

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .sceneHeading: return "Scene Heading"
        case .action: return "Action"
        case .character: return "Character"
        case .dialogue: return "Dialogue"
        case .parenthetical: return "Parenthetical"
        case .transition: return "Transition"
        }
    }

    public var shortTitle: String {
        switch self {
        case .sceneHeading: return "Scene"
        case .action: return "Action"
        case .character: return "Character"
        case .dialogue: return "Dialogue"
        case .parenthetical: return "Paren"
        case .transition: return "Transition"
        }
    }

    public var systemImage: String {
        switch self {
        case .sceneHeading: return "mappin.and.ellipse"
        case .action: return "text.alignleft"
        case .character: return "person.text.rectangle"
        case .dialogue: return "text.quote"
        case .parenthetical: return "parentheses"
        case .transition: return "arrow.turn.down.right"
        }
    }

    public var shortcutKey: String {
        switch self {
        case .sceneHeading: return "1"
        case .action: return "2"
        case .character: return "3"
        case .dialogue: return "4"
        case .parenthetical: return "5"
        case .transition: return "6"
        }
    }

    public var hint: String {
        switch self {
        case .sceneHeading: return "INT. HOUSE - NIGHT"
        case .action: return "Left-aligned action in present tense"
        case .character: return "Centered uppercase character cue"
        case .dialogue: return "Dialogue under the character cue"
        case .parenthetical: return "Small performance note in parentheses"
        case .transition: return "Right-aligned CUT TO: / FADE OUT:"
        }
    }

    public var expectsUppercase: Bool {
        switch self {
        case .sceneHeading, .character, .transition:
            return true
        case .action, .dialogue, .parenthetical:
            return false
        }
    }

    public var next: ScreenplayEditorElement {
        let all = Self.allCases
        guard let index = all.firstIndex(of: self) else { return .action }
        return all[(index + 1) % all.count]
    }

    public var previous: ScreenplayEditorElement {
        let all = Self.allCases
        guard let index = all.firstIndex(of: self) else { return .action }
        return all[(index - 1 + all.count) % all.count]
    }

    public var screenplayTabForward: ScreenplayEditorElement {
        switch self {
        case .sceneHeading:
            return .action
        case .action:
            return .character
        case .character:
            return .dialogue
        case .dialogue:
            return .parenthetical
        case .parenthetical:
            return .transition
        case .transition:
            return .sceneHeading
        }
    }

    public var screenplayTabBackward: ScreenplayEditorElement {
        switch self {
        case .sceneHeading:
            return .sceneHeading
        case .action:
            return .sceneHeading
        case .character:
            return .action
        case .dialogue:
            return .character
        case .parenthetical:
            return .dialogue
        case .transition:
            return .action
        }
    }

    public static func inferredElement(
        for line: String,
        previousElement: ScreenplayEditorElement?
    ) -> ScreenplayEditorElement {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .action }

        if looksLikeSceneHeadingStart(trimmed) {
            return .sceneHeading
        }
        if looksLikeTransition(trimmed) {
            return .transition
        }
        if trimmed.hasPrefix("(") && trimmed.hasSuffix(")") {
            return .parenthetical
        }
        if looksLikeCharacterCue(trimmed) {
            return .character
        }
        if previousElement == .character || previousElement == .parenthetical || previousElement == .dialogue {
            return .dialogue
        }
        return .action
    }

    public static func inferredSequence(for draft: String) -> [ScreenplayEditorElement?] {
        let lines = draft.components(separatedBy: .newlines)
        var result: [ScreenplayEditorElement?] = []
        var previousElement: ScreenplayEditorElement? = nil

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else {
                result.append(nil)
                previousElement = nil
                continue
            }
            let element = inferredElement(for: trimmed, previousElement: previousElement)
            result.append(element)
            previousElement = element
        }

        return result
    }

    public static func nextElementAfterReturn(
        currentLine: String,
        currentElement: ScreenplayEditorElement,
        previousElementBeforeCurrentLine: ScreenplayEditorElement?
    ) -> ScreenplayEditorElement {
        let trimmed = currentLine.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmed.isEmpty {
            switch previousElementBeforeCurrentLine {
            case .character:
                return .dialogue
            case .dialogue, .parenthetical:
                return .action
            case .transition:
                return .sceneHeading
            default:
                return .action
            }
        }

        let inferredCurrent = inferredElement(for: trimmed, previousElement: previousElementBeforeCurrentLine)
        switch inferredCurrent {
        case .sceneHeading:
            return .action
        case .character, .parenthetical:
            return .dialogue
        case .dialogue:
            return .dialogue
        case .transition:
            return .sceneHeading
        case .action:
            return .action
        }
    }

    public static func looksLikeSceneHeadingStart(_ line: String) -> Bool {
        let upper = line.uppercased()
        return upper.hasPrefix("INT.")
            || upper.hasPrefix("EXT.")
            || upper.hasPrefix("INT/EXT.")
            || upper.hasPrefix("EXT/INT.")
            || upper.hasPrefix("I/E.")
    }

    public static func looksLikeTransition(_ line: String) -> Bool {
        let upper = line.uppercased()
        return upper.hasSuffix("TO:")
            || upper == "FADE IN:"
            || upper == "FADE IN ON:"
            || upper == "FADE OUT:"
            || upper == "FADE OUT."
            || upper == "FADE TO BLACK:"
            || upper == "FADE TO BLACK."
            || upper == "SMASH TO BLACK:"
            || upper == "THE END"
    }

    public static func looksLikeCharacterCue(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        let upper = trimmed.uppercased()
        guard trimmed == upper else { return false }
        guard !looksLikeSceneHeadingStart(trimmed), !looksLikeTransition(trimmed) else { return false }
        guard !trimmed.contains(".") && !trimmed.contains(":") else { return false }
        guard trimmed.count <= 32 else { return false }
        // A trailing caret is Fountain's dual-dialogue marker ("MARCUS ^"):
        // the cue still names a speaker, it just shares the page with the one above.
        return trimmed.range(of: #"^[A-Z0-9 '\-()]+(?:\s*\^)?$"#, options: .regularExpression) != nil
    }

    /// True when a character cue carries Fountain's dual-dialogue marker (a trailing `^`).
    public static func isDualDialogueCue(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.hasSuffix("^") && looksLikeCharacterCue(trimmed)
    }

    /// The cue with the dual-dialogue marker removed, for renderers that carry
    /// the marker as an attribute instead (Final Draft, PDF).
    public static func characterCueName(_ line: String) -> String {
        var trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.hasSuffix("^") {
            trimmed.removeLast()
            trimmed = trimmed.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return trimmed
    }
}
