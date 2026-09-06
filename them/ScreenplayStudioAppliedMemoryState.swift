// D009 I4: moved verbatim out of ScreenplayLiveDraftBridge.swift (no behaviour change).
import Foundation
import ScreenplayStudio

struct ScreenplayStudioAppliedMemoryState: Codable, Equatable {
    let id: UUID
    let source: String
    let projectId: String?
    let projectTitle: String?
    let act: String?
    let featureSequence: String?
    let currentBeat: String?
    let nextScenePlan: String?
    let nextThreeTurns: [String]?
    let actThreePayoffPath: [String]?
    let unresolvedSetups: [String]?
    let unresolvedStoryThreads: [String]?
    let characterArcTurns: [String]?
    let imageMotifs: [String]?
    let storyObligationChanges: [BackendStoryObligationChange]?
    let characters: [String]
    let correctedTerms: [String]
    let correctionReplacements: [String]
    let characterBibleApplied: Bool
    let correctionAppliedToPrompt: Bool
    let lastSavedCorrection: String
    let updatedAt: Date

    init(
        id: UUID,
        source: String,
        projectId: String? = nil,
        projectTitle: String? = nil,
        act: String? = nil,
        featureSequence: String? = nil,
        currentBeat: String? = nil,
        nextScenePlan: String? = nil,
        nextThreeTurns: [String]? = nil,
        actThreePayoffPath: [String]? = nil,
        unresolvedSetups: [String]? = nil,
        unresolvedStoryThreads: [String]? = nil,
        characterArcTurns: [String]? = nil,
        imageMotifs: [String]? = nil,
        storyObligationChanges: [BackendStoryObligationChange]? = nil,
        characters: [String],
        correctedTerms: [String],
        correctionReplacements: [String],
        characterBibleApplied: Bool,
        correctionAppliedToPrompt: Bool,
        lastSavedCorrection: String,
        updatedAt: Date
    ) {
        self.id = id
        self.source = source.trimmingCharacters(in: .whitespacesAndNewlines)
        self.projectId = Self.cleanOptional(projectId)
        self.projectTitle = Self.cleanOptional(projectTitle)
        self.act = Self.cleanOptional(act)
        self.featureSequence = Self.cleanOptional(featureSequence)
        self.currentBeat = Self.cleanOptional(currentBeat)
        self.nextScenePlan = Self.cleanOptional(nextScenePlan)
        self.nextThreeTurns = Self.cleanOptionalList(nextThreeTurns, limit: 3)
        self.actThreePayoffPath = Self.cleanOptionalList(actThreePayoffPath, limit: 5)
        self.unresolvedSetups = Self.cleanOptionalList(unresolvedSetups, limit: 5)
        self.unresolvedStoryThreads = Self.cleanOptionalList(unresolvedStoryThreads, limit: 5)
        self.characterArcTurns = Self.cleanOptionalList(characterArcTurns, limit: 5)
        self.imageMotifs = Self.cleanOptionalList(imageMotifs, limit: 5)
        let cleanedChanges = Self.cleanStoryObligationChanges(storyObligationChanges)
        self.storyObligationChanges = cleanedChanges.isEmpty ? nil : cleanedChanges
        self.characters = Self.cleanList(characters)
        self.correctedTerms = Self.cleanList(correctedTerms)
        self.correctionReplacements = Self.cleanList(correctionReplacements)
        self.characterBibleApplied = characterBibleApplied
        self.correctionAppliedToPrompt = correctionAppliedToPrompt
        self.lastSavedCorrection = lastSavedCorrection.trimmingCharacters(in: .whitespacesAndNewlines)
        self.updatedAt = updatedAt
    }

    var hasContent: Bool {
        characterBibleApplied ||
        correctionAppliedToPrompt ||
        storyMemoryHasContent ||
        !characters.isEmpty ||
        !correctedTerms.isEmpty ||
        !correctionReplacements.isEmpty ||
        !lastSavedCorrection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var storyMemoryHasContent: Bool {
        !(projectId ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !(projectTitle ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !(act ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !(featureSequence ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !(currentBeat ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !(nextScenePlan ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !Self.cleanList(nextThreeTurns ?? []).isEmpty ||
            !Self.cleanList(actThreePayoffPath ?? []).isEmpty ||
            !Self.cleanList(unresolvedSetups ?? []).isEmpty ||
            !Self.cleanList(unresolvedStoryThreads ?? []).isEmpty ||
            !Self.cleanList(characterArcTurns ?? []).isEmpty ||
            !Self.cleanList(imageMotifs ?? []).isEmpty ||
            currentStoryObligationChange?.isMeaningful == true
    }

    var primaryCharacter: String {
        characters.first?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    var summary: String {
        let cleanCharacters = characters
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        let cleanReplacements = correctionReplacements
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if !cleanCharacters.isEmpty, !cleanReplacements.isEmpty {
            return "\(cleanCharacters.joined(separator: ", ")): \(cleanReplacements.prefix(2).joined(separator: " / "))"
        }
        if !cleanCharacters.isEmpty {
            return cleanCharacters.joined(separator: ", ")
        }
        if let nextStoryMove = storyRunwayLines.first {
            return nextStoryMove
        }
        if !cleanReplacements.isEmpty {
            return cleanReplacements.prefix(2).joined(separator: " / ")
        }
        return correctionAppliedToPrompt ? "Latest correction" : "Project memory"
    }

    var storyRunwayLines: [String] {
        var lines: [String] = []
        if let change = currentStoryObligationChange {
            lines.append("\(change.statusLabel): \(change.result)")
        }
        let nextTurn = Self.cleanList(nextThreeTurns ?? [], limit: 3).first
            ?? (nextScenePlan ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !nextTurn.isEmpty {
            lines.append("Next: \(nextTurn)")
        }
        if let payoff = Self.cleanList(actThreePayoffPath ?? [], limit: 3).first {
            lines.append("Payoff: \(payoff)")
        }
        if let thread = Self.cleanList(unresolvedStoryThreads ?? [], limit: 3).first
            ?? Self.cleanList(unresolvedSetups ?? [], limit: 3).first {
            lines.append("Thread: \(thread)")
        }
        if let arc = Self.cleanList(characterArcTurns ?? [], limit: 3).first {
            lines.append("Arc: \(arc)")
        }
        if let motif = Self.cleanList(imageMotifs ?? [], limit: 3).first, lines.count < 4 {
            lines.append("Image: \(motif)")
        }
        return Array(lines.prefix(4))
    }

    var currentStoryObligationChange: BackendStoryObligationChange? {
        Self.cleanStoryObligationChanges(storyObligationChanges).first
    }

    var featureMemoryBrief: String {
        guard hasContent else { return "" }
        var parts: [String] = []
        let cleanCharacters = Self.cleanList(characters)
        let cleanReplacements = Self.cleanList(correctionReplacements)
        let cleanTerms = Self.cleanList(correctedTerms)
        if !cleanCharacters.isEmpty {
            parts.append("Characters: \(cleanCharacters.prefix(4).joined(separator: ", "))")
        }
        if !cleanReplacements.isEmpty {
            parts.append("Authoritative corrections: \(cleanReplacements.prefix(4).joined(separator: " / "))")
        } else if !cleanTerms.isEmpty {
            parts.append("Do not repeat outdated terms: \(cleanTerms.prefix(4).joined(separator: ", "))")
        }
        let cleanNextTurns = Self.cleanList(nextThreeTurns ?? [], limit: 3)
        let cleanPayoffs = Self.cleanList(actThreePayoffPath ?? [], limit: 3)
        let cleanThreads = Self.cleanList(unresolvedStoryThreads ?? [], limit: 3)
        let cleanArcTurns = Self.cleanList(characterArcTurns ?? [], limit: 3)
        if let change = currentStoryObligationChange {
            parts.append(
                "Accepted-page \(change.kindLabel.lowercased()) \(change.statusLabel.lowercased()): " +
                    "\(change.result) Evidence: \(change.evidence)"
            )
        }
        if !cleanNextTurns.isEmpty {
            parts.append("Next turns: \(cleanNextTurns.joined(separator: " -> "))")
        }
        if !cleanPayoffs.isEmpty {
            parts.append("Act III payoff path: \(cleanPayoffs.joined(separator: " / "))")
        }
        if !cleanThreads.isEmpty {
            parts.append("Story threads: \(cleanThreads.joined(separator: " / "))")
        }
        if !cleanArcTurns.isEmpty {
            parts.append("Arc turns: \(cleanArcTurns.joined(separator: " / "))")
        }
        if characterBibleApplied {
            parts.append("Use character bible continuity before inventing new facts.")
        }
        if correctionAppliedToPrompt {
            parts.append("Honor corrections before continuing Act I / Act II / Act III pages.")
        }
        let brief = parts.joined(separator: " | ")
        return String(brief.prefix(700))
    }

    static let empty = ScreenplayStudioAppliedMemoryState(
        id: UUID(),
        source: "",
        projectId: nil,
        projectTitle: nil,
        act: nil,
        featureSequence: nil,
        currentBeat: nil,
        nextScenePlan: nil,
        nextThreeTurns: nil,
        actThreePayoffPath: nil,
        unresolvedSetups: nil,
        unresolvedStoryThreads: nil,
        characterArcTurns: nil,
        imageMotifs: nil,
        characters: [],
        correctedTerms: [],
        correctionReplacements: [],
        characterBibleApplied: false,
        correctionAppliedToPrompt: false,
        lastSavedCorrection: "",
        updatedAt: .distantPast
    )

    static func from(
        _ memory: BackendRealtimeStudioMemoryApplied?,
        source: String,
        previousSavedCorrection: String = ""
    ) -> ScreenplayStudioAppliedMemoryState {
        guard let memory else { return .empty }
        let characters = Self.cleanList(memory.characters)
        let correctedTerms = Self.cleanList(memory.correctedTerms)
        let replacements = Self.cleanList(memory.correctionReplacements)
        return ScreenplayStudioAppliedMemoryState(
            id: UUID(),
            source: source.trimmingCharacters(in: .whitespacesAndNewlines),
            projectId: nil,
            projectTitle: nil,
            act: nil,
            featureSequence: nil,
            currentBeat: nil,
            nextScenePlan: nil,
            nextThreeTurns: nil,
            actThreePayoffPath: nil,
            unresolvedSetups: nil,
            unresolvedStoryThreads: nil,
            characterArcTurns: nil,
            imageMotifs: nil,
            characters: characters,
            correctedTerms: correctedTerms,
            correctionReplacements: replacements,
            characterBibleApplied: memory.characterBible == true,
            correctionAppliedToPrompt: memory.correctionAppliedToPrompt == true,
            lastSavedCorrection: previousSavedCorrection.trimmingCharacters(in: .whitespacesAndNewlines),
            updatedAt: Date()
        )
    }

    static func from(
        _ trace: BackendTalkCreativeMemoryTrace,
        source: String,
        previousSavedCorrection: String = ""
    ) -> ScreenplayStudioAppliedMemoryState {
        guard trace.applied else { return .empty }
        let characterNames = Self.cleanList(
            trace.characters.map { $0.name } +
            trace.episodic.flatMap { $0.characters }
        )
        let correctedTerms = Self.cleanList(
            trace.correctedTerms +
            trace.characters.flatMap(\.correctedTerms)
        )
        let replacements = Self.cleanList(
            trace.correctionReplacements +
            trace.characters.flatMap(\.correctionReplacements)
        )
        let projectMemory = trace.screenplayProjectMemory
        return ScreenplayStudioAppliedMemoryState(
            id: UUID(),
            source: source.trimmingCharacters(in: .whitespacesAndNewlines),
            projectId: projectMemory?.projectId,
            projectTitle: projectMemory?.projectTitle,
            act: projectMemory?.act,
            featureSequence: projectMemory?.featureSequence,
            currentBeat: projectMemory?.currentBeat,
            nextScenePlan: projectMemory?.nextScenePlan,
            nextThreeTurns: projectMemory?.nextThreeTurns,
            actThreePayoffPath: projectMemory?.actThreePayoffPath,
            unresolvedSetups: projectMemory?.unresolvedSetups,
            unresolvedStoryThreads: projectMemory?.unresolvedStoryThreads,
            characterArcTurns: projectMemory?.characterArcTurns,
            imageMotifs: projectMemory?.imageMotifs,
            storyObligationChanges: trace.storyObligationChange.map { [$0] },
            characters: characterNames,
            correctedTerms: correctedTerms,
            correctionReplacements: replacements,
            characterBibleApplied: !characterNames.isEmpty,
            correctionAppliedToPrompt: trace.correctionCount > 0 || !correctedTerms.isEmpty || !replacements.isEmpty,
            lastSavedCorrection: previousSavedCorrection.trimmingCharacters(in: .whitespacesAndNewlines),
            updatedAt: Date()
        )
    }

    static func from(
        _ snapshot: BackendSessionContinuitySnapshot,
        source: String,
        previous: ScreenplayStudioAppliedMemoryState
    ) -> ScreenplayStudioAppliedMemoryState {
        guard snapshot.isMeaningful else { return previous }
        let changes = snapshot.storyObligationLedger.isEmpty
            ? snapshot.currentStoryObligationChange.map { [$0] }
            : snapshot.storyObligationLedger
        return ScreenplayStudioAppliedMemoryState(
            id: UUID(),
            source: source,
            projectId: snapshot.projectId,
            projectTitle: snapshot.projectTitle,
            act: snapshot.act,
            featureSequence: snapshot.featureSequence,
            currentBeat: snapshot.currentBeat,
            nextScenePlan: snapshot.nextScenePlan,
            nextThreeTurns: snapshot.nextThreeTurns,
            actThreePayoffPath: snapshot.actThreePayoffPath,
            unresolvedSetups: snapshot.unresolvedSetups,
            unresolvedStoryThreads: snapshot.unresolvedStoryThreads,
            characterArcTurns: snapshot.characterArcTurns,
            imageMotifs: snapshot.imageMotifs,
            storyObligationChanges: changes,
            characters: snapshot.characterFocus,
            correctedTerms: previous.correctedTerms,
            correctionReplacements: previous.correctionReplacements,
            characterBibleApplied: previous.characterBibleApplied || !snapshot.characterFocus.isEmpty,
            correctionAppliedToPrompt: previous.correctionAppliedToPrompt || snapshot.isCorrection,
            lastSavedCorrection: previous.lastSavedCorrection,
            updatedAt: Date()
        )
    }

    static func inlineCorrection(
        character: String,
        correction: String
    ) -> ScreenplayStudioAppliedMemoryInlineCorrection {
        let cleanCharacter = cleanInlineCorrectionFragment(character)
        let cleanCorrection = cleanInlineCorrectionFragment(correction)
        let line = cleanCharacter.isEmpty
            ? "Authoritative correction: \(cleanCorrection)"
            : "Authoritative correction for \(cleanCharacter): \(cleanCorrection)"
        guard !cleanCorrection.isEmpty else {
            return ScreenplayStudioAppliedMemoryInlineCorrection(
                correctionLine: line,
                correctedTerms: [],
                correctionReplacements: []
            )
        }

        let pair = inlineCorrectionReplacementPair(
            character: cleanCharacter,
            correction: cleanCorrection
        )
        let correctedTerms = pair.map { Self.cleanList([$0.old]) } ?? []
        let replacements = pair.map { Self.cleanList(["\($0.old) -> \($0.new)"]) } ?? []
        return ScreenplayStudioAppliedMemoryInlineCorrection(
            correctionLine: line,
            correctedTerms: correctedTerms,
            correctionReplacements: replacements
        )
    }

    static func conversationalCorrection(from text: String) -> String? {
        let cleanText = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        guard !cleanText.isEmpty else { return nil }

        if let directReplacement = conversationalDirectReplacement(from: cleanText) {
            return directReplacement
        }

        let cuePatterns = [
            #"(?i)^(?:actually\s*,?\s*no|no\s*,?\s*actually|correction|retcon|scratch\s+that|not\s+that)\b\s*[,;:\-]?\s*(.+)$"#,
            #"(?i)^no\b\s*[,;:\-]\s*(.+\bnot\b.+)$"#,
            #"(?i)^actually\b\s*[,;:\-]?\s*(.+\bnot\b.+)$"#,
            #"(?i)^(?:change|make)\s+(?:it|this|that)\s+(?:so\s+)?(?:to\s+)?(.+)$"#
        ]

        for pattern in cuePatterns {
            guard
                let groups = regexGroups(pattern: pattern, in: cleanText),
                let rawCorrection = groups.first
            else { continue }

            let correction = cleanInlineCorrectionFragment(rawCorrection)
            guard isLikelyConversationalMemoryCorrection(correction) else { continue }
            return correction
        }

        return nil
    }

    static func mergedMemoryList(_ values: [String]) -> [String] {
        cleanList(values)
    }

    func applyingStoryObligationCorrection(
        change: BackendStoryObligationChange,
        action: String,
        updatedAt: Date = Date()
    ) -> ScreenplayStudioAppliedMemoryState {
        let obligation = change.obligation.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = obligation.lowercased()
        let cleanAction = action.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let remainingChanges = (storyObligationChanges ?? []).filter {
            $0.obligation.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != key
        }
        func removingObligation(_ values: [String]?) -> [String]? {
            let filtered = Self.cleanList(values ?? []).filter { $0.lowercased() != key }
            return filtered.isEmpty ? nil : filtered
        }
        var nextSetups = removingObligation(unresolvedSetups)
        var nextThreads = removingObligation(unresolvedStoryThreads)
        var nextPayoffs = removingObligation(actThreePayoffPath)
        if cleanAction == "keep_open", !obligation.isEmpty {
            if change.kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "promised_payoff" {
                nextPayoffs = Self.cleanList((nextPayoffs ?? []) + [obligation])
            } else if change.kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "accepted_consequence" {
                nextThreads = Self.cleanList((nextThreads ?? []) + [obligation])
            } else {
                nextSetups = Self.cleanList((nextSetups ?? []) + [obligation])
            }
        }
        return ScreenplayStudioAppliedMemoryState(
            id: UUID(),
            source: "story_obligation_correction",
            projectId: projectId,
            projectTitle: projectTitle,
            act: act,
            featureSequence: featureSequence,
            currentBeat: currentBeat,
            nextScenePlan: nextScenePlan,
            nextThreeTurns: nextThreeTurns,
            actThreePayoffPath: nextPayoffs,
            unresolvedSetups: nextSetups,
            unresolvedStoryThreads: nextThreads,
            characterArcTurns: characterArcTurns,
            imageMotifs: imageMotifs,
            storyObligationChanges: remainingChanges,
            characters: characters,
            correctedTerms: correctedTerms,
            correctionReplacements: correctionReplacements,
            characterBibleApplied: characterBibleApplied,
            correctionAppliedToPrompt: true,
            lastSavedCorrection: cleanAction == "retire"
                ? "Retired story obligation: \(obligation)"
                : "Kept story obligation open: \(obligation)",
            updatedAt: updatedAt
        )
    }

    func applyingCanonCorrection(
        correctionText: String,
        retiredFacts: [String],
        projectIdOverride: String? = nil,
        projectTitleOverride: String? = nil,
        source: String = "canon_correction_resolution",
        updatedAt: Date = Date()
    ) -> ScreenplayStudioAppliedMemoryState {
        let cleanCorrection = correctionText.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSource = source.trimmingCharacters(in: .whitespacesAndNewlines)
        return ScreenplayStudioAppliedMemoryState(
            id: UUID(),
            source: cleanSource.isEmpty ? self.source : cleanSource,
            projectId: projectIdOverride ?? projectId,
            projectTitle: projectTitleOverride ?? projectTitle,
            act: act,
            featureSequence: featureSequence,
            currentBeat: currentBeat,
            nextScenePlan: nextScenePlan,
            nextThreeTurns: nextThreeTurns,
            actThreePayoffPath: actThreePayoffPath,
            unresolvedSetups: unresolvedSetups,
            unresolvedStoryThreads: unresolvedStoryThreads,
            characterArcTurns: characterArcTurns,
            imageMotifs: imageMotifs,
            storyObligationChanges: storyObligationChanges,
            characters: characters,
            correctedTerms: Self.cleanList(retiredFacts + correctedTerms),
            correctionReplacements: correctionReplacements,
            characterBibleApplied: characterBibleApplied,
            correctionAppliedToPrompt: true,
            lastSavedCorrection: cleanCorrection.isEmpty ? lastSavedCorrection : cleanCorrection,
            updatedAt: updatedAt
        )
    }

    private static func conversationalDirectReplacement(from text: String) -> String? {
        let patterns = [
            #"(?i)^(?:correction|retcon)?\s*[:\-]?\s*(?:change|replace|swap)\s+(.+?)\s+(?:to|with|into)\s+(.+)$"#,
            #"(?i)^(.+?)\s+(?:instead\s+of|rather\s+than)\s+(.+)$"#
        ]
        for pattern in patterns {
            guard let groups = regexGroups(pattern: pattern, in: text), groups.count == 2 else { continue }
            let first = cleanInlineCorrectionFragment(groups[0])
            let second = cleanInlineCorrectionFragment(groups[1])
            guard !first.isEmpty, !second.isEmpty else { continue }

            if pattern.contains("instead") || pattern.contains("rather") {
                guard isLikelyConversationalMemoryCorrection("\(first), not \(second)") else { continue }
                return "\(second) -> \(first)"
            }

            let placeholderTerms: Set<String> = ["it", "this", "that"]
            guard !placeholderTerms.contains(first.lowercased()) else { continue }
            return "\(first) -> \(second)"
        }
        return nil
    }

    private static func isLikelyConversationalMemoryCorrection(_ correction: String) -> Bool {
        let clean = correction.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count >= 5 else { return false }
        let normalized = " \(clean.lowercased()) "
            .replacingOccurrences(of: "’", with: "'")
        let markers = [
            " not ",
            " -> ",
            " => ",
            " instead of ",
            " rather than ",
            " is ",
            " are ",
            " was ",
            " were ",
            " should be ",
            "'s "
        ]
        return markers.contains { normalized.contains($0) }
    }

    private static func inlineCorrectionReplacementPair(
        character: String,
        correction: String
    ) -> (old: String, new: String)? {
        if let direct = directReplacementPair(from: correction) {
            return direct
        }
        guard let notPair = notReplacementPair(character: character, correction: correction) else {
            return nil
        }
        let old = cleanInlineCorrectionOldTerm(notPair.old)
        let new = cleanInlineCorrectionNewTerm(notPair.new, character: character)
        guard !old.isEmpty, !new.isEmpty, old.caseInsensitiveCompare(new) != .orderedSame else {
            return nil
        }
        return (old, new)
    }

    private static func directReplacementPair(from correction: String) -> (old: String, new: String)? {
        let separators = ["->", "=>"]
        for separator in separators where correction.contains(separator) {
            let parts = correction.components(separatedBy: separator)
            guard parts.count >= 2 else { continue }
            let old = cleanInlineCorrectionOldTerm(parts[0])
            let new = cleanInlineCorrectionNewTerm(parts.dropFirst().joined(separator: separator), character: "")
            guard !old.isEmpty, !new.isEmpty, old.caseInsensitiveCompare(new) != .orderedSame else { continue }
            return (old, new)
        }
        return nil
    }

    private static func notReplacementPair(
        character: String,
        correction: String
    ) -> (old: String, new: String)? {
        let patterns = [
            #"(?i)^(.+?)\s*,?\s+not\s+(.+?)$"#,
            #"(?i)^not\s+(.+?)[,;]\s*(.+?)$"#
        ]
        for pattern in patterns {
            guard let groups = regexGroups(pattern: pattern, in: correction), groups.count == 2 else {
                continue
            }
            if pattern.contains("^not") {
                return (old: groups[0], new: groups[1])
            }
            return (old: groups[1], new: groups[0])
        }
        return nil
    }

    private static func regexGroups(pattern: String, in value: String) -> [String]? {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(value.startIndex..<value.endIndex, in: value)
        guard let match = regex.firstMatch(in: value, range: range), match.numberOfRanges > 1 else {
            return nil
        }
        var groups: [String] = []
        for index in 1..<match.numberOfRanges {
            guard let groupRange = Range(match.range(at: index), in: value) else { continue }
            groups.append(String(value[groupRange]))
        }
        return groups
    }

    private static func cleanInlineCorrectionNewTerm(_ value: String, character: String) -> String {
        var clean = cleanInlineCorrectionFragment(value)
        let cleanCharacter = cleanInlineCorrectionFragment(character)
        if !cleanCharacter.isEmpty {
            let escaped = NSRegularExpression.escapedPattern(for: cleanCharacter)
            let patterns = [
                #"(?i)^\#(escaped)\s+(?:is actually|was actually|should be|becomes|became|is|was)\s+"#,
                #"(?i)^she\s+(?:is actually|was actually|should be|becomes|became|is|was)\s+"#,
                #"(?i)^he\s+(?:is actually|was actually|should be|becomes|became|is|was)\s+"#,
                #"(?i)^they\s+(?:are actually|were actually|should be|become|became|are|were)\s+"#
            ]
            for pattern in patterns {
                clean = clean.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
            }
        }
        return cleanInlineCorrectionFragment(clean)
    }

    private static func cleanInlineCorrectionOldTerm(_ value: String) -> String {
        var clean = cleanInlineCorrectionFragment(value)
        let patterns = [
            #"(?i)^(?:his|her|their|its|the|a|an)\s+"#,
            #"(?i)^that\s+(?:he|she|they|it)\s+(?:is|was|are|were)\s+"#,
            #"(?i)^(?:he|she|they|it)\s+(?:is|was|are|were)\s+"#
        ]
        for pattern in patterns {
            clean = clean.replacingOccurrences(of: pattern, with: "", options: .regularExpression)
        }
        return cleanInlineCorrectionFragment(clean)
    }

    private static func cleanInlineCorrectionFragment(_ value: String) -> String {
        let trimmed = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: " .,!?:;\"'()[]{}"))
        return String(trimmed.prefix(160))
    }

    private static func cleanOptional(_ value: String?) -> String? {
        let clean = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression) ?? ""
        return clean.isEmpty ? nil : String(clean.prefix(220))
    }

    private static func cleanOptionalList(_ values: [String]?, limit: Int) -> [String]? {
        let clean = cleanList(values, limit: limit)
        return clean.isEmpty ? nil : clean
    }

    private static func cleanStoryObligationChanges(
        _ values: [BackendStoryObligationChange]?
    ) -> [BackendStoryObligationChange] {
        var seen = Set<String>()
        var out: [BackendStoryObligationChange] = []
        for value in values ?? [] where value.isMeaningful {
            let key = value.obligation
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            guard !key.isEmpty, seen.insert(key).inserted else { continue }
            out.append(value)
            if out.count >= 6 { break }
        }
        return out
    }

    private static func cleanList(_ values: [String]?, limit: Int = 12) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for value in values ?? [] {
            let clean = value
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard !seen.contains(key) else { continue }
            seen.insert(key)
            out.append(String(clean.prefix(160)))
            if out.count >= limit { break }
        }
        return out
    }
}
