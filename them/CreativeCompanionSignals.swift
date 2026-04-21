import Foundation

nonisolated enum CreativeIntentKind: String, Codable, CaseIterable, Identifiable {
    case screenplayPageWrite = "screenplay_page_write"
    case storyDevelopment = "story_development"
    case mixedSupport = "mixed_support"
    case companionSupport = "companion_support"
    case practicalSupport = "practical_support"
    case reflectiveSupport = "reflective_support"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .screenplayPageWrite:
            return "Page Write"
        case .storyDevelopment:
            return "Story Development"
        case .mixedSupport:
            return "Companion + Craft"
        case .companionSupport:
            return "Support"
        case .practicalSupport:
            return "Practical Help"
        case .reflectiveSupport:
            return "Reflection"
        }
    }
}

nonisolated struct CreativeIntentSnapshot: Codable, Equatable, Hashable {
    let kind: CreativeIntentKind
    let label: String
    let summary: String
    let nextMove: String
    let confidence: Double
    let sourceText: String
    let updatedAt: Date

    static let empty = CreativeIntentSnapshot(
        kind: .reflectiveSupport,
        label: "",
        summary: "",
        nextMove: "",
        confidence: 0,
        sourceText: "",
        updatedAt: .distantPast
    )

    var hasSignal: Bool {
        !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !nextMove.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

nonisolated struct CreativePresenceSnapshot: Codable, Equatable, Hashable {
    let title: String
    let detail: String
    let updatedAt: Date

    static let empty = CreativePresenceSnapshot(
        title: "",
        detail: "",
        updatedAt: .distantPast
    )

    var hasSignal: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        !detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

nonisolated struct CreativeProactiveSuggestion: Codable, Equatable, Hashable, Identifiable {
    let category: String
    let prompt: String
    let reason: String
    let updatedAt: Date

    var id: String {
        [
            category.trimmingCharacters(in: .whitespacesAndNewlines),
            prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        ].joined(separator: "|")
    }

    var hasSignal: Bool {
        !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

nonisolated struct CreativeCompanionSignalState: Codable, Equatable, Hashable {
    let intent: CreativeIntentSnapshot
    let presence: CreativePresenceSnapshot
    let proactiveSuggestion: CreativeProactiveSuggestion?

    static let empty = CreativeCompanionSignalState(
        intent: .empty,
        presence: .empty,
        proactiveSuggestion: nil
    )

    var hasContent: Bool {
        intent.hasSignal || presence.hasSignal || proactiveSuggestion?.hasSignal == true
    }

    func promptGuidance() -> String {
        let intentLabel = intent.label.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextMove = intent.nextMove.trimmingCharacters(in: .whitespacesAndNewlines)
        let presenceTitle = presence.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let proactivePrompt = proactiveSuggestion?.prompt.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        let responseFocus = nextMove.isEmpty
            ? "Keep the response grounded, specific, and forward-moving."
            : nextMove
        let collaborationPosture = presenceTitle.isEmpty
            ? "Grounded creative partner."
            : presenceTitle
        let followUp = proactivePrompt.isEmpty
            ? "If momentum opens naturally, offer one specific next move instead of a generic sign-off."
            : "If momentum opens naturally, use this next step framing: \(proactivePrompt)"

        return [
            "INTENT SNAPSHOT:",
            "- primary_intent=\(intent.kind.rawValue)\(intentLabel.isEmpty ? "" : " (\(intentLabel))")",
            "- collaboration_posture=\(collaborationPosture)",
            "- response_focus=\(responseFocus)",
            "- proactive_followup=\(followUp)"
        ].joined(separator: "\n")
    }
}

nonisolated enum CreativeCompanionSignalEngine {
    static func build(
        context: HerDirectorContext,
        memoryDomain: StudioMemoryDomain,
        companionMode: StudioCompanionMode,
        isScreenplayMode: Bool,
        shouldWriteToPage: Bool,
        screenplayPhaseHint: String,
        screenplayPackHint: String,
        recentTurns: [(user: String, assistant: String)],
        sourceText: String
    ) -> CreativeCompanionSignalState {
        let now = Date()
        let cleanSource = sourceText.trimmingCharacters(in: .whitespacesAndNewlines)
        let intentKind = resolveIntentKind(
            context: context,
            memoryDomain: memoryDomain,
            isScreenplayMode: isScreenplayMode,
            shouldWriteToPage: shouldWriteToPage
        )
        let intent = CreativeIntentSnapshot(
            kind: intentKind,
            label: intentKind.title,
            summary: intentSummary(
                for: intentKind,
                context: context,
                screenplayPhaseHint: screenplayPhaseHint,
                screenplayPackHint: screenplayPackHint
            ),
            nextMove: nextMove(for: intentKind, context: context),
            confidence: confidence(for: intentKind, context: context),
            sourceText: String(cleanSource.prefix(240)),
            updatedAt: now
        )
        let presence = presenceSnapshot(
            for: intentKind,
            companionMode: companionMode,
            memoryDomain: memoryDomain,
            recentTurns: recentTurns,
            updatedAt: now
        )
        let proactiveSuggestion = proactiveSuggestion(
            for: intentKind,
            context: context,
            memoryDomain: memoryDomain,
            companionMode: companionMode,
            updatedAt: now
        )

        return CreativeCompanionSignalState(
            intent: intent,
            presence: presence,
            proactiveSuggestion: proactiveSuggestion
        )
    }

    static func retone(
        _ state: CreativeCompanionSignalState,
        companionMode: StudioCompanionMode,
        memoryDomain: StudioMemoryDomain = .companion
    ) -> CreativeCompanionSignalState {
        let now = Date()
        return CreativeCompanionSignalState(
            intent: CreativeIntentSnapshot(
                kind: state.intent.kind,
                label: state.intent.label,
                summary: state.intent.summary,
                nextMove: state.intent.nextMove,
                confidence: state.intent.confidence,
                sourceText: state.intent.sourceText,
                updatedAt: now
            ),
            presence: presenceSnapshot(
                for: state.intent.kind,
                companionMode: companionMode,
                memoryDomain: memoryDomain,
                recentTurns: [],
                updatedAt: now
            ),
            proactiveSuggestion: state.proactiveSuggestion.map {
                CreativeProactiveSuggestion(
                    category: $0.category,
                    prompt: $0.prompt,
                    reason: $0.reason,
                    updatedAt: now
                )
            }
        )
    }

    private static func resolveIntentKind(
        context: HerDirectorContext,
        memoryDomain: StudioMemoryDomain,
        isScreenplayMode: Bool,
        shouldWriteToPage: Bool
    ) -> CreativeIntentKind {
        if isScreenplayMode && shouldWriteToPage {
            return .screenplayPageWrite
        }
        if isScreenplayMode && (memoryDomain == .mixed || (memoryDomain == .project && context.isUserVulnerable)) {
            return .mixedSupport
        }
        if isScreenplayMode && (memoryDomain == .project || context.isAskingForStoryHelp) {
            return .storyDevelopment
        }
        if memoryDomain == .companion && (context.isAnxious || context.isGrief || context.isUserVulnerable) {
            return .companionSupport
        }
        if context.isUserDirect || context.isCelebrating {
            return .practicalSupport
        }
        return .reflectiveSupport
    }

    private static func intentSummary(
        for kind: CreativeIntentKind,
        context: HerDirectorContext,
        screenplayPhaseHint: String,
        screenplayPackHint: String
    ) -> String {
        let cleanPack = screenplayPackHint.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanPhase = screenplayPhaseHint
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "_", with: " ")

        switch kind {
        case .screenplayPageWrite:
            if context.isLongFormScreenplayRequest {
                return "Commit to a fuller playable scene section and keep the dramatic momentum intact."
            }
            if !cleanPack.isEmpty {
                return "Translate the user's intent straight into \(cleanPack.lowercased()) pages without detouring into notes."
            }
            return "Translate the user's intent straight into screenplay pages without detouring into notes."
        case .storyDevelopment:
            if context.isCharacterFocused {
                return "Use the turn to clarify motive, pressure, and character choice before locking pages."
            }
            if context.isClimax {
                return "Find the irreversible turn that makes the sequence land harder before drafting."
            }
            if context.isOutlineFocused || context.isSynopsisFocused {
                return "Organize the story direction cleanly so the next writing move is obvious."
            }
            if !cleanPhase.isEmpty {
                return "Keep the \(cleanPhase.lowercased()) thread coherent and make the next story decision feel usable."
            }
            return "Pressure-test the scene or story direction before committing more pages."
        case .mixedSupport:
            return "Acknowledge the user's state briefly, then move quickly back into a concrete craft decision."
        case .companionSupport:
            return "Hold the user's emotional state first, then offer one grounded move without pushing productivity."
        case .practicalSupport:
            return "Answer directly, keep the language clean, and land on one concrete next step."
        case .reflectiveSupport:
            return "Stay present, mirror what matters, and open one clearer doorway instead of overloading the reply."
        }
    }

    private static func nextMove(
        for kind: CreativeIntentKind,
        context: HerDirectorContext
    ) -> String {
        switch kind {
        case .screenplayPageWrite:
            return context.isLongFormScreenplayRequest
                ? "Write the next full scene section in Fountain with no notes."
                : "Write the next playable beat in Fountain with no notes."
        case .storyDevelopment:
            if context.isCharacterFocused {
                return "Sharpen what the character wants, what blocks them, and what changes by the end of the beat."
            }
            if context.isClimax {
                return "Name the choice that makes the scene irreversible, then build the beat around that turn."
            }
            return "Offer one strong story move before branching into alternatives."
        case .mixedSupport:
            return "Acknowledge pressure once, then give one clear creative move the user can act on immediately."
        case .companionSupport:
            return "Stabilize first and keep the next move gentle, specific, and optional."
        case .practicalSupport:
            return "Answer directly and reduce the problem to one concrete next step."
        case .reflectiveSupport:
            return "Mirror the core feeling or tension, then pull one sharper detail into focus."
        }
    }

    private static func confidence(
        for kind: CreativeIntentKind,
        context: HerDirectorContext
    ) -> Double {
        switch kind {
        case .screenplayPageWrite:
            return context.isLongFormScreenplayRequest ? 0.96 : 0.92
        case .storyDevelopment:
            return (context.isOutlineFocused || context.isSynopsisFocused || context.isCharacterFocused) ? 0.86 : 0.80
        case .mixedSupport:
            return 0.82
        case .companionSupport:
            return (context.isAnxious || context.isGrief) ? 0.84 : 0.76
        case .practicalSupport:
            return 0.74
        case .reflectiveSupport:
            return 0.62
        }
    }

    private static func presenceSnapshot(
        for kind: CreativeIntentKind,
        companionMode: StudioCompanionMode,
        memoryDomain: StudioMemoryDomain,
        recentTurns: [(user: String, assistant: String)],
        updatedAt: Date
    ) -> CreativePresenceSnapshot {
        let title: String
        switch companionMode {
        case .coach:
            title = "Calm Coach"
        case .coWriter:
            title = "Co-writer Presence"
        case .comfort:
            title = "Steady Comfort"
        }

        let recentContinuity = recentTurns.isEmpty
            ? "Fresh lane."
            : "\(min(recentTurns.count, 6)) turns of continuity active."
        let detail: String
        switch kind {
        case .screenplayPageWrite:
            detail = "Locked on the page. Keep the writing playable, clear, and forward-moving. \(recentContinuity)"
        case .storyDevelopment:
            detail = "Holding the creative thread and keeping the next story choice concrete. \(recentContinuity)"
        case .mixedSupport:
            detail = "Staying emotionally aware without losing the screenplay problem. \(recentContinuity)"
        case .companionSupport:
            detail = "Prioritizing steadiness and low-pressure support before pushing the work. \(recentContinuity)"
        case .practicalSupport:
            detail = "Keeping the answer direct and actionable instead of drifting into abstractions. \(recentContinuity)"
        case .reflectiveSupport:
            detail = memoryDomain == .project
                ? "Listening for the creative tension underneath the note. \(recentContinuity)"
                : "Listening for the feeling under the ask before moving too fast. \(recentContinuity)"
        }

        return CreativePresenceSnapshot(
            title: title,
            detail: detail,
            updatedAt: updatedAt
        )
    }

    private static func proactiveSuggestion(
        for kind: CreativeIntentKind,
        context: HerDirectorContext,
        memoryDomain: StudioMemoryDomain,
        companionMode: StudioCompanionMode,
        updatedAt: Date
    ) -> CreativeProactiveSuggestion? {
        switch kind {
        case .screenplayPageWrite:
            if context.isLongFormScreenplayRequest {
                return CreativeProactiveSuggestion(
                    category: "Scene",
                    prompt: "Say: write the full scene and let the conflict breathe",
                    reason: "The user is asking for pages, and momentum is best served by staying on the page.",
                    updatedAt: updatedAt
                )
            }
            if context.isClimax {
                return CreativeProactiveSuggestion(
                    category: "Scene",
                    prompt: "Say: write the next beat and make the choice irreversible",
                    reason: "The sequence wants escalation more than another note.",
                    updatedAt: updatedAt
                )
            }
            return CreativeProactiveSuggestion(
                category: "Scene",
                prompt: "Say: write the next beat and keep the same dramatic pressure",
                reason: "A clean next-beat prompt keeps the hands-free page loop moving.",
                updatedAt: updatedAt
            )
        case .storyDevelopment:
            if context.isCharacterFocused {
                return CreativeProactiveSuggestion(
                    category: "Story",
                    prompt: "Ask: what does this character want most in the scene?",
                    reason: "Character intent is the cleanest way to unlock the next draft decision.",
                    updatedAt: updatedAt
                )
            }
            if context.isClimax {
                return CreativeProactiveSuggestion(
                    category: "Scene",
                    prompt: "Ask: where does the scene actually turn irreversible?",
                    reason: "The next collaborative move is identifying the true turn, not adding more surface detail.",
                    updatedAt: updatedAt
                )
            }
            if context.isOutlineFocused || context.isSynopsisFocused {
                return CreativeProactiveSuggestion(
                    category: "Story",
                    prompt: "Ask: give me the cleanest beat sequence for this turn",
                    reason: "A crisp beat sequence keeps story planning actionable.",
                    updatedAt: updatedAt
                )
            }
            return CreativeProactiveSuggestion(
                category: "Story",
                prompt: "Ask: give me three stronger turns for this sequence",
                reason: "The user is still shaping the story move, so stronger alternatives help momentum.",
                updatedAt: updatedAt
            )
        case .mixedSupport:
            return CreativeProactiveSuggestion(
                category: "Scene",
                prompt: "Ask: what's the smallest rewrite that sharpens the scene and lowers the pressure?",
                reason: "This keeps the response emotionally aware while still solving the creative problem.",
                updatedAt: updatedAt
            )
        case .companionSupport:
            let prompt: String
            switch companionMode {
            case .comfort:
                prompt = "Say: stay off the page and talk me through the next move"
            case .coWriter:
                prompt = "Ask: give me one gentle creative next step before we draft"
            case .coach:
                prompt = "Ask: give me one grounded next step from here"
            }
            return CreativeProactiveSuggestion(
                category: memoryDomain == .project ? "Story" : "Task",
                prompt: prompt,
                reason: "The user needs a steadier bridge back into motion, not a big leap.",
                updatedAt: updatedAt
            )
        case .practicalSupport:
            return CreativeProactiveSuggestion(
                category: "Task",
                prompt: "Ask: give me one clear next step from here",
                reason: "The interaction is asking for decisive guidance, so the proactive follow-up should stay concrete.",
                updatedAt: updatedAt
            )
        case .reflectiveSupport:
            return CreativeProactiveSuggestion(
                category: memoryDomain == .project ? "Story" : "Task",
                prompt: memoryDomain == .project
                    ? "Ask: what part of this still feels fuzzy or soft?"
                    : "Ask: what feels most charged right now?",
                reason: "One precise follow-up keeps the loop conversational without stalling momentum.",
                updatedAt: updatedAt
            )
        }
    }
}
