import Foundation

// MARK: - FountainFormatter
//
// Converts natural language voice input into strict, simple Fountain screenplay text.
//
// Design principles:
// - Pure deterministic Swift. No network calls, no AI.
// - Fast and synchronous.
// - Conservative fallback: emit Action when uncertain.
// - Favor a minimal Hollywood format: sluglines, action, character, dialogue,
//   parenthetical, transition.

public struct FountainElement {
    public enum Kind {
        case sceneHeading
        case action
        case character
        case dialogue
        case parenthetical
        case transition
        case blank
    }

    public let kind: Kind
    public let text: String

    public var formatted: String {
        switch kind {
        case .sceneHeading:
            return text.uppercased()
        case .action:
            return FountainFormatter.ensurePeriod(text.screenplaySentenceCase())
        case .character:
            return text.uppercased()
        case .dialogue:
            return text.screenplaySentenceCase()
        case .parenthetical:
            let inner = text.lowercased()
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .trimmingCharacters(in: CharacterSet(charactersIn: "()"))
            return "(\(inner))"
        case .transition:
            return text.uppercased()
        case .blank:
            return ""
        }
    }
}

public struct ScreenplayPageIntegrityIssue: Identifiable, Equatable, Hashable {
    public let startLine: Int
    public let endLine: Int
    public let preview: String
    public let reason: String

    public var id: String {
        "\(startLine)-\(endLine)-\(preview)"
    }
}

public enum FountainFormatter {

    public static func format(rawText: String, existingDraft: String = "") -> String {
        normalizeHollywoodDraft(rawText, existingDraft: existingDraft)
    }

    public static func normalizeHollywoodDraft(_ rawText: String, existingDraft: String = "") -> String {
        let sanitized = sanitizeRawScreenplayText(rawText)
        guard !sanitized.isEmpty else { return "" }
        let cleaned = stripMetaInstructionPrefix(sanitized)
        guard !cleaned.isEmpty else { return "" }

        let candidate: String
        if looksLikeStructuredFountain(cleaned) {
            candidate = normalizeStructuredFountain(cleaned, existingDraft: existingDraft)
        } else {
            let elements = applyingFirstAppearanceFormatting(
                to: parseNaturalLanguage(cleaned, existingDraft: existingDraft),
                existingDraft: existingDraft
            )
            candidate = renderElements(elements)
        }

        return normalizeStructuredFountain(candidate, existingDraft: existingDraft)
    }

    public static func normalizePastedScreenplayBlock(_ rawText: String, existingDraft: String = "") -> String {
        let sanitized = sanitizeRawScreenplayText(rawText)
        guard !sanitized.isEmpty else { return "" }
        let cleaned = stripMetaInstructionPrefix(sanitized)
        guard !cleaned.isEmpty else { return "" }

        let looksLikeScreenplay =
            cleaned.contains("\n")
            || looksLikeStructuredFountain(cleaned)
            || extractCharacterDialogue(cleaned) != nil
            || extractInlineCharacterDialogue(cleaned) != nil
            || looksLikeSceneHeading(cleaned.lowercased(), upper: cleaned.uppercased())

        guard looksLikeScreenplay else {
            return cleaned
        }

        return normalizeHollywoodDraft(cleaned, existingDraft: existingDraft)
    }

    // Lightweight client-side validation for Studio auto-insert.
    public static func isLikelyFountainBlock(_ rawText: String) -> Bool {
        let raw = sanitizeRawScreenplayText(rawText)
        guard !raw.isEmpty else { return false }

        let candidate = looksLikeStructuredFountain(raw)
            ? normalizeStructuredFountain(raw)
            : normalizeHollywoodDraft(raw)
        let lines = candidate
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !lines.isEmpty else { return false }

        let hasSceneHeading = lines.contains { isSceneHeadingLine($0) }
        let hasTransition = lines.contains { isTransitionLine($0) }
        let hasCharacterDialogue = hasCharacterDialoguePair(lines)

        if hasSceneHeading || hasTransition || hasCharacterDialogue {
            return true
        }

        // Action-only blocks are valid, but reject obvious conversational drift.
        if lines.count == 1 {
            let line = lines[0]
            if line.hasSuffix("?") { return false }
            return !isLikelyConversationalLine(line)
        }

        let conversationalCount = lines.filter { isLikelyConversationalLine($0) }.count
        return conversationalCount * 2 < lines.count
    }

    public static func isStrongStudioPageWriteCandidate(
        _ rawText: String,
        allowActionOnly: Bool = false
    ) -> Bool {
        let raw = sanitizeRawScreenplayText(rawText)
        guard !raw.isEmpty else { return false }
        guard isLikelyFountainBlock(raw) else { return false }

        let candidate = looksLikeStructuredFountain(raw)
            ? normalizeStructuredFountain(raw)
            : normalizeHollywoodDraft(raw)
        let lines = candidate
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !lines.isEmpty else { return false }

        let hasSceneHeading = lines.contains { isSceneHeadingLine($0) }
        let hasTransition = lines.contains { isTransitionLine($0) }
        let hasCharacterDialogue = hasCharacterDialoguePair(lines)
        if hasSceneHeading || hasTransition || hasCharacterDialogue {
            return true
        }

        guard allowActionOnly else { return false }

        if lines.count == 1 {
            let line = lines[0]
            if line.hasSuffix("?") { return false }
            return !isLikelyConversationalLine(line)
        }

        let conversationalCount = lines.filter { isLikelyConversationalLine($0) }.count
        return conversationalCount == 0
    }

    public static func screenplayIntegrityIssues(in draft: String) -> [ScreenplayPageIntegrityIssue] {
        let normalized = draft
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.components(separatedBy: "\n")
        guard !lines.isEmpty else { return [] }

        var issues: [ScreenplayPageIntegrityIssue] = []
        var blockLines: [String] = []
        var blockStartLine = 1

        func flushBlock(endingAt lineNumber: Int) {
            guard !blockLines.isEmpty else { return }
            let startLine = blockStartLine
            let endLine = max(startLine, lineNumber - 1)
            let trimmedLines = blockLines
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
            blockLines.removeAll()
            guard !trimmedLines.isEmpty else { return }

            let blockText = trimmedLines.joined(separator: "\n")
            guard !isStrongStudioPageWriteCandidate(blockText, allowActionOnly: true) else { return }

            let conversationalCount = trimmedLines.filter { isLikelyConversationalLine($0) }.count
            let containsQuestion = trimmedLines.contains { $0.hasSuffix("?") }
            guard conversationalCount > 0 || containsQuestion else { return }

            let preview = trimmedLines
                .joined(separator: " ")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !preview.isEmpty else { return }

            let reason: String
            if conversationalCount >= max(1, trimmedLines.count - 1) {
                reason = "This block reads like companion or conversational prose, not screenplay formatting."
            } else {
                reason = "This block breaks screenplay structure and should be reviewed before it stays on the page."
            }

            issues.append(
                ScreenplayPageIntegrityIssue(
                    startLine: startLine,
                    endLine: endLine,
                    preview: String(preview.prefix(140)),
                    reason: reason
                )
            )
        }

        for (index, rawLine) in lines.enumerated() {
            let lineNumber = index + 1
            let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                flushBlock(endingAt: lineNumber)
                blockStartLine = lineNumber + 1
                continue
            }

            if blockLines.isEmpty {
                blockStartLine = lineNumber
            }
            blockLines.append(rawLine)
        }

        flushBlock(endingAt: lines.count + 1)
        return issues
    }

    public static func normalizeEditorLine(
        _ rawLine: String,
        as element: ScreenplayEditorElement,
        existingDraft: String = ""
    ) -> String {
        let sanitized = sanitizeRawScreenplayText(rawLine)
        guard !sanitized.isEmpty else { return rawLine }

        if let inlineCharacter = extractInlineCharacterDialogue(sanitized) {
            var elements: [FountainElement] = [
                FountainElement(kind: .character, text: normalizeCharacterCue(inlineCharacter.character))
            ]
            if let parenthetical = inlineCharacter.parenthetical {
                elements.append(FountainElement(kind: .parenthetical, text: parenthetical))
            }
            elements.append(FountainElement(kind: .dialogue, text: inlineCharacter.dialogue))
            return renderElements(elements)
        }

        if looksLikeSceneHeading(sanitized.lowercased(), upper: sanitized.uppercased()) || element == .sceneHeading {
            return normalizeSceneHeading(sanitized)
        }

        if let transition = normalizeTransitionLine(sanitized) {
            return transition
        }

        switch element {
        case .sceneHeading:
            return normalizeSceneHeading(sanitized)
        case .action:
            let action = normalizeActionText(sanitized)
            let normalized = applyingFirstAppearanceFormatting(
                to: [FountainElement(kind: .action, text: action)],
                existingDraft: existingDraft
            )
            return renderElements(normalized)
        case .character:
            return normalizeCharacterCue(sanitized)
        case .dialogue:
            return sanitized.screenplaySentenceCase()
        case .parenthetical:
            return normalizeParentheticalFallback(sanitized)
        case .transition:
            return normalizeTransitionFallback(sanitized)
        }
    }

    // MARK: - Detection

    private static func sanitizeRawScreenplayText(_ raw: String) -> String {
        var text = raw
            .replacingOccurrences(of: "\\\\r\\\\n", with: "\n")
            .replacingOccurrences(of: "\\\\n", with: "\n")
            .replacingOccurrences(of: "\\\\r", with: "\n")
            .replacingOccurrences(of: "\\r\\n", with: "\n")
            .replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\r", with: "\n")
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\t", with: "    ")
            .replacingOccurrences(of: "\u{2018}", with: "'")
            .replacingOccurrences(of: "\u{2019}", with: "'")
            .replacingOccurrences(of: "\u{201C}", with: "\"")
            .replacingOccurrences(of: "\u{201D}", with: "\"")
            .replacingOccurrences(of: "\u{2013}", with: "-")
            .replacingOccurrences(of: "\u{2014}", with: "-")

        text = text.replacingOccurrences(
            of: #"^```[A-Za-z0-9_-]*\s*"#,
            with: "",
            options: .regularExpression
        )
        text = text.replacingOccurrences(
            of: #"\s*```$"#,
            with: "",
            options: .regularExpression
        )
        text = text.replacingOccurrences(
            of: #"(?m)^\s*[-*•]+\s+"#,
            with: "",
            options: .regularExpression
        )
        text = text.replacingOccurrences(
            of: #"(?m)^\s*\d+[.)]\s+"#,
            with: "",
            options: .regularExpression
        )
        text = text.replacingOccurrences(
            of: #"\n{3,}"#,
            with: "\n\n",
            options: .regularExpression
        )

        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func stripMetaInstructionPrefix(_ text: String) -> String {
        guard let colonIndex = text.firstIndex(of: ":") else { return text }

        let beforeColon = String(text[..<colonIndex]).trimmingCharacters(in: .whitespacesAndNewlines)
        let afterColon = String(text[text.index(after: colonIndex)...])
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !beforeColon.isEmpty, !afterColon.isEmpty else { return text }

        let lowerPrefix = beforeColon.lowercased()
        let words = lowerPrefix.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        let metaIndicators = [
            "write", "add", "insert", "include", "describe", "give",
            "screenplay", "script", "scene", "action", "dialogue",
            "line", "tense", "short", "single", "following", "here is", "here's", "next"
        ]
        let hasMetaWord = metaIndicators.contains { lowerPrefix.contains($0) }
        let looksLikeSluglinePrefix =
            lowerPrefix.hasPrefix("int.") ||
            lowerPrefix.hasPrefix("ext.") ||
            lowerPrefix.hasPrefix("int/ext.") ||
            lowerPrefix.hasPrefix("i/e.")

        if (hasMetaWord || words.count > 3) && !looksLikeSluglinePrefix {
            return afterColon
        }

        return text
    }

    private static func looksLikeStructuredFountain(_ text: String) -> Bool {
        let firstLine = text.components(separatedBy: "\n").first?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let upper = firstLine.uppercased()

        if upper.hasPrefix("INT.") || upper.hasPrefix("EXT.") ||
            upper.hasPrefix("INT/EXT.") || upper.hasPrefix("I/E.") {
            return true
        }

        if firstLine.hasPrefix(".") && firstLine.count > 1 { return true }

        if upper.hasSuffix("TO:") || upper == "FADE IN:" || upper == "FADE IN ON:" ||
            upper == "FADE OUT:" || upper == "FADE OUT." ||
            upper == "FADE TO BLACK:" || upper == "FADE TO BLACK." ||
            upper == "SMASH TO BLACK:" || upper == "THE END" {
            return true
        }

        let lines = text.components(separatedBy: "\n")
        if lines.count >= 3 {
            let hasBlankLine = lines.contains { $0.trimmingCharacters(in: .whitespaces).isEmpty }
            let hasUpperLine = lines.contains { line in
                let t = line.trimmingCharacters(in: .whitespaces)
                return !t.isEmpty && t == t.uppercased() && t.count < 40
            }
            if hasBlankLine && hasUpperLine { return true }
        }
        return false
    }

    private static func normalizeStructuredFountain(_ text: String, existingDraft: String = "") -> String {
        let rawLines = sanitizeRawScreenplayText(text).components(separatedBy: "\n")
        var elements: [FountainElement] = []
        var previousKind: FountainElement.Kind?
        var pendingBlank = false
        let hasExistingDraft = !existingDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        var shouldStripLeadingOpeningTransition = hasExistingDraft
        var pendingSceneHeadingFragment: String?

        for rawLine in rawLines {
            let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                pendingBlank = true
                continue
            }

            if shouldStripLeadingOpeningTransition,
               let transition = normalizeTransitionLine(trimmed),
               transition == "FADE IN:" || transition == "FADE IN ON:" {
                pendingBlank = false
                shouldStripLeadingOpeningTransition = false
                continue
            }
            shouldStripLeadingOpeningTransition = false

            if let fragment = normalizedSceneHeadingFragment(trimmed) ?? normalizedIncompleteSceneHeadingFragment(trimmed) {
                pendingSceneHeadingFragment = fragment
                pendingBlank = false
                continue
            }

            let lineToClassify: String
            var attachedAction: String?
            if let fragment = pendingSceneHeadingFragment {
                if normalizedIncompleteSceneHeadingFragment(fragment) != nil,
                   let completion = completeIncompleteSceneHeadingFragment(fragment, with: trimmed) {
                    lineToClassify = completion.heading
                    attachedAction = completion.action
                    pendingSceneHeadingFragment = nil
                } else if isSceneHeadingLine(trimmed) {
                    lineToClassify = trimmed
                    pendingSceneHeadingFragment = nil
                } else if canCompleteSceneHeadingFragment(trimmed) {
                    lineToClassify = fragment + " " + trimmed
                    pendingSceneHeadingFragment = nil
                } else {
                    lineToClassify = trimmed
                    pendingSceneHeadingFragment = nil
                }
            } else {
                lineToClassify = trimmed
            }

            if let split = splitSceneHeadingLineWithAttachedAction(lineToClassify) {
                if pendingBlank, !elements.isEmpty, elements.last?.kind != .blank {
                    elements.append(FountainElement(kind: .blank, text: ""))
                }
                pendingBlank = false
                let normalizedHeading = normalizeSceneHeading(split.heading)
                if previousKind != .sceneHeading || elements.last?.text != normalizedHeading {
                    elements.append(FountainElement(kind: .sceneHeading, text: normalizedHeading))
                }
                previousKind = .sceneHeading
                if let action = split.action, !action.isEmpty {
                    elements.append(FountainElement(kind: .action, text: normalizeActionText(action)))
                    previousKind = .action
                }
                continue
            }

            if pendingBlank, !elements.isEmpty, elements.last?.kind != .blank {
                elements.append(FountainElement(kind: .blank, text: ""))
            }
            pendingBlank = false

            if let inlineCharacter = extractInlineCharacterDialogue(lineToClassify) {
                elements.append(FountainElement(kind: .character, text: normalizeCharacterCue(inlineCharacter.character)))
                if let parenthetical = inlineCharacter.parenthetical {
                    elements.append(FountainElement(kind: .parenthetical, text: parenthetical))
                }
                elements.append(FountainElement(kind: .dialogue, text: inlineCharacter.dialogue))
                previousKind = .dialogue
                continue
            }

            if let (character, dialogue) = extractCharacterDialogue(lineToClassify) {
                elements.append(FountainElement(kind: .character, text: "\(normalizeCharacterCue(character))§\(dialogue)"))
                previousKind = .dialogue
                continue
            }

            if let transition = normalizeTransitionLine(lineToClassify) {
                if previousKind == .transition,
                   elements.last?.text == transition {
                    continue
                }
                elements.append(FountainElement(kind: .transition, text: transition))
                previousKind = .transition
                continue
            }

            let lower = lineToClassify.lowercased()
            let upper = lineToClassify.uppercased()
            if isSceneHeadingLine(lineToClassify) || looksLikeSceneHeading(lower, upper: upper) {
                let normalizedHeading = normalizeSceneHeading(lineToClassify)
                if previousKind == .sceneHeading,
                   elements.last?.text == normalizedHeading {
                    continue
                }
                elements.append(FountainElement(kind: .sceneHeading, text: normalizedHeading))
                previousKind = .sceneHeading
                if let attachedAction,
                   !attachedAction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    elements.append(FountainElement(kind: .action, text: normalizeActionText(attachedAction)))
                    previousKind = .action
                }
                continue
            }

            if isParentheticalLine(lineToClassify) {
                elements.append(FountainElement(kind: .parenthetical, text: lineToClassify))
                previousKind = .parenthetical
                continue
            }

            if isCharacterCueLine(lineToClassify) {
                elements.append(FountainElement(kind: .character, text: normalizeCharacterCue(lineToClassify)))
                previousKind = .character
                continue
            }

            if previousKind == .character || previousKind == .parenthetical {
                elements.append(FountainElement(kind: .dialogue, text: lineToClassify))
                previousKind = .dialogue
            } else {
                elements.append(FountainElement(kind: .action, text: normalizeActionText(lineToClassify)))
                previousKind = .action
            }
        }

        let normalizedElements = applyingFirstAppearanceFormatting(to: elements, existingDraft: existingDraft)
        return renderElements(normalizedElements)
    }

    // MARK: - Parser

    private static func parseNaturalLanguage(_ text: String, existingDraft: String) -> [FountainElement] {
        let chunks = splitIntoParsableChunks(text)
        var elements: [FountainElement] = []
        var previousKind: FountainElement.Kind?
        let draftContext = inferDraftContext(existingDraft)

        for (index, chunk) in chunks.enumerated() {
            let trimmedChunk = chunk.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedChunk.isEmpty else { continue }

            if let inlineCharacter = extractInlineCharacterDialogue(trimmedChunk) {
                elements.append(FountainElement(kind: .character, text: normalizeCharacterCue(inlineCharacter.character)))
                if let parenthetical = inlineCharacter.parenthetical {
                    elements.append(FountainElement(kind: .parenthetical, text: parenthetical))
                }
                elements.append(FountainElement(kind: .dialogue, text: inlineCharacter.dialogue))
                previousKind = .dialogue
                continue
            }

            let element = classifyChunk(
                trimmedChunk,
                index: index,
                totalChunks: chunks.count,
                previousKind: previousKind,
                draftContext: draftContext
            )
            elements.append(element)
            previousKind = element.kind
        }

        return elements
    }

    private static func splitIntoParsableChunks(_ text: String) -> [String] {
        let byNewline = text.components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if byNewline.count > 1 { return byNewline }

        var chunks: [String] = []
        let pattern = #"(?<=[.!?])\s+"#
        if let regex = try? NSRegularExpression(pattern: pattern) {
            let ns = text as NSString
            let matches = regex.matches(in: text, range: NSRange(location: 0, length: ns.length))
            var lastEnd = 0

            for match in matches {
                let chunkRange = NSRange(location: lastEnd, length: match.range.location - lastEnd)
                let chunk = ns.substring(with: chunkRange).trimmingCharacters(in: .whitespacesAndNewlines)
                if !chunk.isEmpty { chunks.append(chunk) }
                lastEnd = match.range.location + match.range.length
            }

            let remainder = ns.substring(from: lastEnd).trimmingCharacters(in: .whitespacesAndNewlines)
            if !remainder.isEmpty { chunks.append(remainder) }
        }

        return chunks.isEmpty ? [text] : chunks
    }

    enum DraftContext {
        case empty
        case midScene
        case afterHeading
        case afterCharacter
    }

    private static func inferDraftContext(_ draft: String) -> DraftContext {
        guard !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .empty
        }

        let lines = draft.components(separatedBy: "\n").reversed()
        for line in lines {
            let t = line.trimmingCharacters(in: .whitespaces)
            guard !t.isEmpty else { continue }
            let upper = t.uppercased()
            if upper.hasPrefix("INT.") || upper.hasPrefix("EXT.") { return .afterHeading }
            if t == upper && t.count < 35 && !t.contains(".") { return .afterCharacter }
            return .midScene
        }
        return .empty
    }

    private static func classifyChunk(
        _ text: String,
        index: Int,
        totalChunks: Int,
        previousKind: FountainElement.Kind?,
        draftContext: DraftContext
    ) -> FountainElement {
        _ = index
        _ = totalChunks
        _ = draftContext
        let upper = text.uppercased()
        let lower = text.lowercased()
        let words = text.components(separatedBy: .whitespaces).filter { !$0.isEmpty }

        if isParentheticalLine(text) {
            return FountainElement(kind: .parenthetical, text: text)
        }
        if previousKind == .character,
           words.count <= 3,
           !text.contains("."),
           isAdverbOrParentheticalWord(lower) {
            return FountainElement(kind: .parenthetical, text: text)
        }

        if let transition = normalizeTransitionLine(text) {
            return FountainElement(kind: .transition, text: transition)
        }

        if looksLikeSceneHeading(lower, upper: upper) {
            return FountainElement(kind: .sceneHeading, text: normalizeSceneHeading(text))
        }

        if let (char, dialogue) = extractCharacterDialogue(text) {
            return FountainElement(kind: .character, text: "\(normalizeCharacterCue(char))§\(dialogue)")
        }

        if previousKind == .character || previousKind == .parenthetical {
            return FountainElement(kind: .dialogue, text: text)
        }

        return FountainElement(kind: .action, text: normalizeActionText(text))
    }

    // MARK: - Renderer

    private static func renderElements(_ elements: [FountainElement]) -> String {
        var lines: [String] = []
        var previous: FountainElement.Kind?

        for element in elements {
            if element.kind == .blank {
                if lines.last != "" {
                    lines.append("")
                }
                continue
            }

            if element.kind == .character && element.text.contains("§") {
                let parts = element.text.components(separatedBy: "§")
                let charName = normalizeCharacterCue(parts[0])
                let dialogueText = parts.count > 1 ? parts[1].screenplaySentenceCase() : ""

                if previous != nil && lines.last != "" { lines.append("") }
                lines.append(charName)
                if !dialogueText.isEmpty {
                    lines.append(dialogueText)
                }
                previous = .dialogue
                continue
            }

            switch element.kind {
            case .sceneHeading:
                if previous != nil && lines.last != "" { lines.append("") }
                lines.append(element.formatted)
                lines.append("")

            case .action:
                if previous == .sceneHeading {
                    lines.append(element.formatted)
                } else if previous == .action {
                    lines.append("")
                    lines.append(element.formatted)
                } else {
                    if previous != nil && lines.last != "" { lines.append("") }
                    lines.append(element.formatted)
                }

            case .character:
                if previous != nil && lines.last != "" { lines.append("") }
                lines.append(normalizeCharacterCue(element.formatted))

            case .dialogue:
                lines.append(element.formatted)

            case .parenthetical:
                lines.append(element.formatted)

            case .transition:
                if previous != nil && lines.last != "" { lines.append("") }
                lines.append(element.formatted)
                lines.append("")

            case .blank:
                break
            }

            previous = element.kind
        }

        while lines.last == "" {
            lines.removeLast()
        }

        return lines.joined(separator: "\n")
    }

    // MARK: - Scene heading

    private static func looksLikeSceneHeading(_ lower: String, upper: String) -> Bool {
        if upper.hasPrefix("INT.") || upper.hasPrefix("EXT.") ||
            upper.hasPrefix("INT/EXT.") || upper.hasPrefix("I/E.") {
            return true
        }

        let interiorKeywords = ["interior", "inside", "int "]
        let exteriorKeywords = ["exterior", "outside", "ext "]
        let sceneStartKeywords = interiorKeywords + exteriorKeywords + [
            "we're in ", "we are in ", "the scene is ", "scene:", "new scene",
            "location:", "we open on ", "we open in ", "we cut to ",
        ]

        for keyword in sceneStartKeywords {
            if lower.hasPrefix(keyword) || lower.contains(" - " + keyword) { return true }
        }

        let timeWords = [
            "day", "night", "dawn", "dusk", "morning", "evening",
            "afternoon", "later", "continuous", "moments later",
        ]
        let placeWords = [
            "diner", "office", "apartment", "house", "street",
            "park", "car", "bar", "cafe", "coffee shop", "hospital",
            "kitchen", "bedroom", "living room", "hallway", "lobby",
            "rooftop", "alley", "warehouse", "studio", "school",
            "library", "parking lot", "subway", "train", "airport",
            "hotel", "motel", "room", "building", "bathroom", "garage",
        ]

        let words = lower.components(separatedBy: .whitespacesAndNewlines)
        let hasTime = words.contains {
            timeWords.contains($0.trimmingCharacters(in: .punctuationCharacters))
        }
        let hasPlace = placeWords.contains(where: { lower.contains($0) })
        let firstWord = words.first?.trimmingCharacters(in: .punctuationCharacters) ?? ""
        if ["a", "an", "the"].contains(firstWord),
           hasPlace {
            let articleHeadingPattern = #"^(?:a|an|the)\s+.+\s-\s*(?:day|night|dawn|dusk|morning|evening|afternoon|later|continuous|moments later)\b"#
            let hasArticleTimeHeading = lower.range(
                of: articleHeadingPattern,
                options: .regularExpression
            ) != nil
            if !hasArticleTimeHeading && !(hasTime && words.count <= 5) {
                return false
            }
        }

        if hasPlace && words.count <= 8 { return true }
        if hasPlace && hasTime { return true }

        return false
    }

    private static func normalizeSceneHeading(_ raw: String) -> String {
        let upper = raw.uppercased()
        let trimmed = upper.trimmingCharacters(in: .whitespacesAndNewlines)

        if let fragment = normalizedSceneHeadingFragment(trimmed) {
            return fragment
        }

        if trimmed.hasPrefix("INT.") || trimmed.hasPrefix("EXT.") ||
            trimmed.hasPrefix("INT/EXT.") || trimmed.hasPrefix("I/E.") {
            return trimmed.replacingOccurrences(of: #"\s*-\s*"#, with: " - ", options: .regularExpression)
        }

        let intReplacements = ["INT "]
        let extReplacements = ["EXT "]

        for prefix in intReplacements where trimmed.hasPrefix(prefix) {
            return "INT. " + String(trimmed.dropFirst(prefix.count))
        }
        for prefix in extReplacements where trimmed.hasPrefix(prefix) {
            return "EXT. " + String(trimmed.dropFirst(prefix.count))
        }

        let lower = raw.lowercased()
        var location = trimmed
        var timeOfDay = ""

        let timeMap: [(String, String)] = [
            ("at night", "NIGHT"), ("at dawn", "DAWN"), ("at dusk", "DUSK"),
            ("in the morning", "DAY"), ("in the afternoon", "DAY"),
            ("in the evening", "NIGHT"), ("continuous", "CONTINUOUS"),
            ("moments later", "MOMENTS LATER"), ("later", "LATER"),
            ("- night", "NIGHT"), ("- day", "DAY"), ("- dawn", "DAWN"),
            ("- dusk", "DUSK"), ("- later", "LATER"), ("- continuous", "CONTINUOUS"),
            (" night", "NIGHT"), (" day", "DAY"),
        ]

        for (phrase, tod) in timeMap {
            if lower.contains(phrase) {
                timeOfDay = tod
                if let range = location.range(of: phrase.uppercased()) {
                    location = String(location[..<range.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
                }
                break
            }
        }

        let fillerPrefixes = [
            "INTERIOR THE ", "INTERIOR A ", "INTERIOR ",
            "EXTERIOR THE ", "EXTERIOR A ", "EXTERIOR ",
            "WE'RE IN THE ", "WE ARE IN THE ", "WE'RE IN ",
            "THE SCENE IS ", "SCENE: ", "NEW SCENE ",
            "LOCATION: ", "WE OPEN ON ", "WE OPEN IN ",
            "WE CUT TO ", "INSIDE THE ", "INSIDE A ",
            "OUTSIDE THE ", "OUTSIDE A ",
        ]
        for filler in fillerPrefixes where location.hasPrefix(filler) {
            let inferred = (lower.hasPrefix("outside") || lower.hasPrefix("exterior")) ? "EXT." : "INT."
            location = inferred + " " + String(location.dropFirst(filler.count))
            break
        }

        if !location.hasPrefix("INT.") && !location.hasPrefix("EXT.") {
            location = "INT. " + location
        }

        let normalizedLocation = location.replacingOccurrences(
            of: #"\s*-\s*"#,
            with: " - ",
            options: .regularExpression
        )

        if timeOfDay.isEmpty { return normalizedLocation }
        return normalizedLocation + " - " + timeOfDay
    }

    // MARK: - Character + Dialogue

    private static func extractCharacterDialogue(_ text: String) -> (character: String, dialogue: String)? {
        let colonPatterns = [
            #"^([A-Z][a-zA-Z0-9\s'\-.()]{1,24})\s+(?:says?|whispers?|shouts?|yells?|mutters?|asks?|replies?|responds?|continues?|adds?):\s*(.+)$"#,
            #"^([A-Z][a-zA-Z0-9\s'\-.()]{1,24}):\s*(.+)$"#,
        ]

        for pattern in colonPatterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { continue }
            guard let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
                  match.numberOfRanges >= 3 else { continue }

            let charRange = Range(match.range(at: 1), in: text)
            let dialRange = Range(match.range(at: 2), in: text)
            if let charRange, let dialRange {
                let char = String(text[charRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                let dial = String(text[dialRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                let charWords = char.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                let charLower = char.lowercased()
                let metaPrefixes = [
                    "write", "add", "insert", "include", "describe", "give",
                    "here", "action", "scene", "dialogue", "line", "following",
                    "this", "now", "next"
                ]
                let isMetaPrefix = metaPrefixes.contains { charLower.hasPrefix($0) }
                if charWords.count <= 3 && !char.contains(".") && !isMetaPrefix {
                    return (char, dial)
                }
            }
        }
        return nil
    }

    private static func extractInlineCharacterDialogue(
        _ text: String
    ) -> (character: String, parenthetical: String?, dialogue: String)? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard !isSceneHeadingLine(trimmed), !isTransitionLine(trimmed) else { return nil }

        let pattern = #"^([A-Z][A-Z0-9 '\-]{0,28})(?:\s+\(([^)]+)\))?\s+([\"'A-Z].+)$"#
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return nil }
        guard let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
              match.numberOfRanges >= 4 else {
            return nil
        }

        guard let characterRange = Range(match.range(at: 1), in: trimmed),
              let dialogueRange = Range(match.range(at: 3), in: trimmed) else {
            return nil
        }

        let character = String(trimmed[characterRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        let words = character.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        guard (1...3).contains(words.count), isCharacterCueLine(character) else { return nil }

        let dialogue = String(trimmed[dialogueRange]).trimmingCharacters(in: .whitespacesAndNewlines)
        guard dialogue.range(of: #"[a-z]"#, options: .regularExpression) != nil else { return nil }

        var parenthetical: String?
        if match.range(at: 2).location != NSNotFound,
           let parentheticalRange = Range(match.range(at: 2), in: trimmed) {
            let inner = String(trimmed[parentheticalRange]).trimmingCharacters(in: .whitespacesAndNewlines)
            if !inner.isEmpty {
                parenthetical = "(\(inner.lowercased()))"
            }
        }

        return (character, parenthetical, dialogue)
    }

    // MARK: - Helpers

    private static func normalizeActionText(_ text: String) -> String {
        text
            .replacingOccurrences(of: #"^\s*[-*•]+\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(
                of: #"\b(SUN|HALF|BLOOD|RAIN|NEON|MOON|SHADOW|COFFEE|TEAR|SWEAT|WATER|DUST)\s+-\s+(DRENCHED|FINISHED|STAINED|LIT|SOAKED|WASHED|WORN|COVERED|FILLED|SLICK|DARK)\b"#,
                with: "$1-$2",
                options: [.regularExpression, .caseInsensitive]
            )
            .replacingOccurrences(of: ",.", with: ".")
            .replacingOccurrences(of: ";.", with: ".")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizeCharacterCue(_ text: String) -> String {
        text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .uppercased()
    }

    private static func isParentheticalLine(_ text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.hasPrefix("(") && trimmed.hasSuffix(")")
    }

    private static func normalizeTransitionLine(_ text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let upper = trimmed.uppercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)

        if upper == "FADE IN" || upper == "FADE IN:" { return "FADE IN:" }
        if upper == "FADE IN ON" || upper == "FADE IN ON:" { return "FADE IN ON:" }
        if upper == "FADE OUT" || upper == "FADE OUT." || upper == "FADE OUT:" { return "FADE OUT:" }
        if upper == "FADE TO BLACK" || upper == "FADE TO BLACK." || upper == "FADE TO BLACK:" { return "FADE TO BLACK:" }
        if upper == "SMASH TO BLACK" || upper == "SMASH TO BLACK." || upper == "SMASH TO BLACK:" {
            return "SMASH TO BLACK:"
        }
        if upper == "THE END" {
            return "THE END"
        }

        let suffixTransitions = [
            "CUT TO", "SMASH CUT TO", "DISSOLVE TO", "MATCH CUT TO", "WIPE TO", "INTERCUT WITH"
        ]
        for candidate in suffixTransitions {
            if upper == candidate || upper == candidate + ":" {
                return candidate + ":"
            }
        }

        if upper.hasSuffix(" TO:") || upper.hasSuffix(" TO") {
            return upper.hasSuffix(":") ? upper : upper + ":"
        }

        return nil
    }

    private static func normalizeTransitionFallback(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return trimmed }
        if let normalized = normalizeTransitionLine(trimmed) {
            return normalized
        }

        let collapsed = trimmed.uppercased()
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        if collapsed == "THE END" { return "THE END" }
        if collapsed.hasSuffix(":") { return collapsed }
        if collapsed.hasSuffix(".") {
            return String(collapsed.dropLast()) + ":"
        }
        return collapsed + ":"
    }

    private static func normalizeParentheticalFallback(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return trimmed }

        var inner = trimmed
            .trimmingCharacters(in: CharacterSet(charactersIn: "()"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)

        while let last = inner.last, [".", ",", ";", ":", "!", "?"].contains(last) {
            inner = String(inner.dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        guard !inner.isEmpty else { return "()" }
        return "(\(inner.lowercased()))"
    }

    private static func isAdverbOrParentheticalWord(_ word: String) -> Bool {
        let parentheticals = [
            "quietly", "nervously", "sadly", "angrily", "softly", "gently",
            "quickly", "slowly", "loudly", "whispered", "whispering", "shouting",
            "crying", "laughing", "smiling", "coldly", "warmly", "bitterly",
            "beat", "long pause", "pause", "to herself", "to himself",
            "under her breath", "under his breath", "voice breaking",
            "off screen", "o.s.", "v.o.", "voice over",
        ]
        return parentheticals.contains { word.contains($0) }
    }

    private static func isSceneHeadingLine(_ line: String) -> Bool {
        let upper = line.uppercased()
        if normalizedSceneHeadingFragment(upper) != nil { return false }
        return upper.hasPrefix("INT.") || upper.hasPrefix("EXT.") ||
            upper.hasPrefix("INT/EXT.") || upper.hasPrefix("I/E.")
    }

    private static func normalizedSceneHeadingFragment(_ line: String) -> String? {
        let trimmed = line
            .uppercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        switch trimmed {
        case "INT.", "EXT.", "INT/EXT.", "I/E.":
            return trimmed
        default:
            return nil
        }
    }

    private static func normalizedIncompleteSceneHeadingFragment(_ line: String) -> String? {
        let trimmed = line
            .uppercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s*-\s*$"#, with: " -", options: .regularExpression)
        guard trimmed.range(
            of: #"^(?:INT\.|EXT\.|INT/EXT\.|I/E\.)\s+.+\s-$"#,
            options: .regularExpression
        ) != nil else {
            return nil
        }
        return trimmed
    }

    private static func completeIncompleteSceneHeadingFragment(
        _ fragment: String,
        with line: String
    ) -> (heading: String, action: String?)? {
        guard let timeSplit = splitLeadingSceneTimeAndAttachedAction(line) else {
            return nil
        }
        let cleanFragment = normalizedIncompleteSceneHeadingFragment(fragment) ?? fragment
        return (
            heading: "\(cleanFragment) \(timeSplit.time)",
            action: timeSplit.action
        )
    }

    private static func splitSceneHeadingLineWithAttachedAction(
        _ line: String
    ) -> (heading: String, action: String?)? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isSceneHeadingLine(trimmed) else { return nil }
        guard let regex = try? NSRegularExpression(
            pattern: #"^((?:INT\.|EXT\.|INT/EXT\.|I/E\.)\s+.+?\s-\s*)(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|AFTERNOON|LATER|CONTINUOUS|MOMENTS LATER)(.*)$"#,
            options: [.caseInsensitive]
        ) else {
            return nil
        }
        guard let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
              match.numberOfRanges >= 4,
              let prefixRange = Range(match.range(at: 1), in: trimmed),
              let timeRange = Range(match.range(at: 2), in: trimmed),
              let restRange = Range(match.range(at: 3), in: trimmed) else {
            return nil
        }

        let rawRest = String(trimmed[restRange])
        guard rawRest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                rawRest.hasPrefix(" ") ||
                rawRest.hasPrefix("\t") ||
                rawRest.range(of: #"^(?:A|AN|THE)\b"#, options: [.regularExpression, .caseInsensitive]) != nil else {
            return nil
        }

        let heading = String(trimmed[prefixRange]) + String(trimmed[timeRange])
        let action = rawRest.trimmingCharacters(in: .whitespacesAndNewlines)
        return (heading, action.isEmpty ? nil : action)
    }

    private static func splitLeadingSceneTimeAndAttachedAction(
        _ line: String
    ) -> (time: String, action: String?)? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let regex = try? NSRegularExpression(
            pattern: #"^(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|AFTERNOON|LATER|CONTINUOUS|MOMENTS LATER)(.*)$"#,
            options: [.caseInsensitive]
        ) else {
            return nil
        }
        guard let match = regex.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)),
              match.numberOfRanges >= 3,
              let timeRange = Range(match.range(at: 1), in: trimmed),
              let restRange = Range(match.range(at: 2), in: trimmed) else {
            return nil
        }

        let rawRest = String(trimmed[restRange])
        guard rawRest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                rawRest.hasPrefix(" ") ||
                rawRest.hasPrefix("\t") ||
                rawRest.range(of: #"^(?:A|AN|THE)\b"#, options: [.regularExpression, .caseInsensitive]) != nil else {
            return nil
        }

        let action = rawRest.trimmingCharacters(in: .whitespacesAndNewlines)
        return (String(trimmed[timeRange]).uppercased(), action.isEmpty ? nil : action)
    }

    private static func canCompleteSceneHeadingFragment(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        guard normalizeTransitionLine(trimmed) == nil else { return false }
        guard !isParentheticalLine(trimmed) else { return false }
        guard !isCharacterCueLine(trimmed) else { return false }

        if isSceneHeadingLine(trimmed) { return true }

        let lower = trimmed.lowercased()
        let upper = trimmed.uppercased()
        if looksLikeSceneHeading(lower, upper: upper) {
            return true
        }

        let timeWords = [
            "day", "night", "dawn", "dusk", "morning", "evening",
            "afternoon", "later", "continuous", "moments later"
        ]
        let words = lower.components(separatedBy: .whitespacesAndNewlines)
        let hasTimeWord = words.contains {
            timeWords.contains($0.trimmingCharacters(in: .punctuationCharacters))
        }
        return hasTimeWord && words.count <= 8
    }

    private static func isTransitionLine(_ line: String) -> Bool {
        normalizeTransitionLine(line) != nil
    }

    private static func isCharacterCueLine(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        guard trimmed == trimmed.uppercased() else { return false }
        guard trimmed.count <= 40 else { return false }
        guard !trimmed.contains(":") else { return false }
        guard !isSceneHeadingLine(trimmed) else { return false }
        guard !isTransitionLine(trimmed) else { return false }
        return trimmed.range(of: #"^[A-Z0-9 '\-().]+$"#, options: .regularExpression) != nil
    }

    private static func hasCharacterDialoguePair(_ lines: [String]) -> Bool {
        guard lines.count >= 2 else { return false }
        for index in 0..<(lines.count - 1) {
            let current = lines[index]
            let next = lines[index + 1]
            if isCharacterCueLine(current), !next.hasPrefix("(") {
                return true
            }
        }
        return false
    }

    private static func applyingFirstAppearanceFormatting(
        to elements: [FountainElement],
        existingDraft: String
    ) -> [FountainElement] {
        guard !elements.isEmpty else { return elements }

        var introducedNames = characterNames(inDraft: existingDraft)
        let candidateNames = characterNames(in: elements).union(
            inferredActionCharacterNames(in: elements, excluding: introducedNames)
        )
        guard !candidateNames.isEmpty else { return elements }
        var normalized: [FountainElement] = []
        normalized.reserveCapacity(elements.count)

        for element in elements {
            switch element.kind {
            case .action:
                let promoted = promoteFirstAppearanceNames(
                    in: element.text,
                    candidateNames: candidateNames,
                    introducedNames: &introducedNames
                )
                normalized.append(FountainElement(kind: .action, text: promoted))
            case .character:
                let cue = element.text.components(separatedBy: "§").first ?? element.text
                let canonical = canonicalCharacterName(cue)
                if !canonical.isEmpty {
                    introducedNames.insert(canonical)
                }
                normalized.append(element)
            default:
                normalized.append(element)
            }
        }

        return normalized
    }

    private static func characterNames(in elements: [FountainElement]) -> Set<String> {
        var names = Set<String>()
        for element in elements where element.kind == .character {
            let cue = element.text.components(separatedBy: "§").first ?? element.text
            let canonical = canonicalCharacterName(cue)
            if !canonical.isEmpty {
                names.insert(canonical)
            }
        }
        return names
    }

    private static func characterNames(inDraft draft: String) -> Set<String> {
        var names = Set<String>()
        let lines = sanitizeRawScreenplayText(draft).components(separatedBy: "\n")
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            if isCharacterCueLine(trimmed) {
                let canonical = canonicalCharacterName(trimmed)
                if !canonical.isEmpty {
                    names.insert(canonical)
                }
                continue
            }
            if let inlineCharacter = extractInlineCharacterDialogue(trimmed) {
                let canonical = canonicalCharacterName(inlineCharacter.character)
                if !canonical.isEmpty {
                    names.insert(canonical)
                }
            }
        }
        return names
    }

    private static func canonicalCharacterName(_ cue: String) -> String {
        let withoutParenthetical = cue.replacingOccurrences(
            of: #"\s*\([^)]*\)"#,
            with: "",
            options: .regularExpression
        )
        return withoutParenthetical
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .uppercased()
    }

    private static func promoteFirstAppearanceNames(
        in text: String,
        candidateNames: Set<String>,
        introducedNames: inout Set<String>
    ) -> String {
        var updated = text
        let sortedCandidates = candidateNames.sorted {
            let lhsWords = $0.components(separatedBy: .whitespaces).count
            let rhsWords = $1.components(separatedBy: .whitespaces).count
            if lhsWords == rhsWords {
                return $0.count > $1.count
            }
            return lhsWords > rhsWords
        }

        for candidate in sortedCandidates {
            guard !introducedNames.contains(candidate) else { continue }
            if updated.contains(candidate) {
                introducedNames.insert(candidate)
                continue
            }

            let titled = candidate
                .lowercased()
                .split(separator: " ")
                .map { $0.capitalized }
                .joined(separator: " ")
            guard !titled.isEmpty else { continue }

            let pattern = "(?<![A-Za-z0-9])" + NSRegularExpression.escapedPattern(for: titled) + "(?![A-Za-z0-9])"
            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { continue }
            let range = NSRange(updated.startIndex..., in: updated)
            guard let match = regex.firstMatch(in: updated, range: range),
                  let matchRange = Range(match.range, in: updated) else {
                continue
            }

            updated.replaceSubrange(matchRange, with: candidate)
            introducedNames.insert(candidate)
        }

        return updated
    }

    private static func inferredActionCharacterNames(
        in elements: [FountainElement],
        excluding introducedNames: Set<String>
    ) -> Set<String> {
        var names = Set<String>()
        for element in elements where element.kind == .action {
            for candidate in detectActionIntroductionCandidates(in: element.text) {
                let canonical = canonicalCharacterName(candidate)
                guard !canonical.isEmpty else { continue }
                guard !introducedNames.contains(canonical) else { continue }
                guard !isLikelyLocationLikeName(canonical) else { continue }
                names.insert(canonical)
            }
        }
        return names
    }

    private static func detectActionIntroductionCandidates(in text: String) -> [String] {
        let patterns = [
            #"(^|[.!?]\s+)([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2})(?=\s*,\s*\d{1,2}\b)"#,
            #"(^|[.!?]\s+)([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2})(?=\s+(?:steps|walks|crosses|rushes|hesitates|opens|closes|leans|sits|stands|waits|turns|looks|glances|stares|smiles|whispers|asks|replies|says|nods|breathes|freezes|runs|moves|grabs|drops|listens|backs|pushes|pulls|drifts|slips|checks|studies|watches|pauses|stops|hurries|climbs|kneels|blinks|swallows|laughs|cries)\b)"#,
            #"(^|[.!?]\s+)([A-Z][a-z'’-]+(?:\s+[A-Z][a-z'’-]+){0,2})(?=\s*,\s*(?:a|an)\s+[a-z])"#
        ]

        var matches: [String] = []
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { continue }
            let range = NSRange(text.startIndex..., in: text)
            for match in regex.matches(in: text, range: range) where match.numberOfRanges >= 3 {
                guard let matchRange = Range(match.range(at: 2), in: text) else { continue }
                let candidate = String(text[matchRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !candidate.isEmpty else { continue }
                guard !isLikelyLocationLikeName(candidate) else { continue }
                if !matches.contains(candidate) {
                    matches.append(candidate)
                }
            }
        }

        return matches
    }

    private static func isLikelyLocationLikeName(_ candidate: String) -> Bool {
        let blockedTokens: Set<String> = [
            "airport", "alley", "apartment", "bar", "bathroom", "bedroom", "building",
            "brooklyn", "cafe", "car", "city", "diner", "garage", "hallway", "hospital",
            "hotel", "house", "kitchen", "library", "lobby", "london", "los", "manhattan",
            "motel", "new", "office", "paris", "park", "parking", "room", "rooftop",
            "school", "street", "studio", "subway", "tokyo", "town", "train", "warehouse",
            "york"
        ]
        let tokens = candidate
            .lowercased()
            .split(separator: " ")
            .map(String.init)
        guard !tokens.isEmpty else { return true }
        return tokens.allSatisfy { blockedTokens.contains($0) }
    }

    private static func isLikelyConversationalLine(_ line: String) -> Bool {
        let lower = line.lowercased()
        if lower.contains("?") { return true }
        let cues = [
            "it sounds like",
            "i hear you",
            "i notice",
            "what happened",
            "tell me more",
            "how are you",
            "how do you feel",
            "what does that",
            "let's keep this grounded",
            "say that again",
            "i didn't quite catch that",
        ]
        return cues.contains { lower.contains($0) }
    }

    fileprivate static func ensurePeriod(_ text: String) -> String {
        var t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return t }
        t = t.replacingOccurrences(of: ",.", with: ".")
        t = t.replacingOccurrences(of: ";.", with: ".")
        while let last = t.last, last == "," || last == ";" {
            t = String(t.dropLast()).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard !t.isEmpty else { return "." }
        guard let last = t.last else { return t }
        if last == "." || last == "!" || last == "?" || last == "\"" { return t }
        return t + "."
    }
}

private extension String {
    func screenplaySentenceCase() -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return trimmed }

        let normalized = trimmed == trimmed.uppercased() ? trimmed.lowercased() : trimmed
        let first = normalized.prefix(1).uppercased()
        let rest = normalized.dropFirst()
        return first + rest
    }
}
