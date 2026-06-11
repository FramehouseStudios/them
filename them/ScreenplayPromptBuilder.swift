import Foundation

struct BackendScreenplayPromptSessionContext: Codable, Equatable {
    var projectId: String
    var versionId: String
    var scene: String
    var phase: String = ""
    var pack: String = ""
    var draftExcerpt: String = ""
    var act: String = ""
    var sceneObjective: String = ""
    var sceneSummary: String = ""
    var currentBeat: String = ""
    var logline: String = ""
    var themeArgument: String = ""
    var centralQuestion: String = ""
    var protagonistWant: String = ""
    var protagonistNeed: String = ""
    var antagonisticForce: String = ""
    var endingImage: String = ""
    var featureSequence: String = ""
    var featureObligation: String = ""
    var nextScenePlan: String = ""
    var nextSceneMoves: [String] = []
    var beatSequence: [String] = []
    var characterFocus: [String] = []
    var unresolvedSetups: [String] = []
    var continuityNotes: [String] = []
    var emotionalContinuity: String = ""
    var pageCount: Int = 0
    var targetPages: Int = 0

    enum CodingKeys: String, CodingKey {
        case projectId = "project_id"
        case versionId = "version_id"
        case scene
        case phase
        case pack
        case draftExcerpt = "draft_excerpt"
        case act
        case sceneObjective = "scene_objective"
        case sceneSummary = "scene_summary"
        case currentBeat = "current_beat"
        case logline
        case themeArgument = "theme_argument"
        case centralQuestion = "central_question"
        case protagonistWant = "protagonist_want"
        case protagonistNeed = "protagonist_need"
        case antagonisticForce = "antagonistic_force"
        case endingImage = "ending_image"
        case featureSequence = "feature_sequence"
        case featureObligation = "feature_obligation"
        case nextScenePlan = "next_scene_plan"
        case nextSceneMoves = "next_scene_moves"
        case beatSequence = "beat_sequence"
        case characterFocus = "character_focus"
        case unresolvedSetups = "unresolved_setups"
        case continuityNotes = "continuity_notes"
        case emotionalContinuity = "emotional_continuity"
        case pageCount = "page_count"
        case targetPages = "target_pages"
    }
}

struct BackendScreenplayPromptBuildRequest: Codable, Equatable {
    var persona: String
    var userInput: String
    var screenplayTaskHint: String = ""
    var sessionContext: BackendScreenplayPromptSessionContext?
    var includeCraftContext: Bool
    var craftFrameworkId: String

    enum CodingKeys: String, CodingKey {
        case persona
        case userInput = "user_input"
        case screenplayTaskHint = "screenplay_task_hint"
        case sessionContext = "session_context"
        case includeCraftContext = "include_craft_context"
        case craftFrameworkId = "craft_framework_id"
    }
}

struct BackendScreenplayPromptBuildResponse: Codable, Equatable {
    var ok: Bool
    var action: String
    var schemaVersion: Int
    var source: String
    var prompt: String
    var memoryApplied: Bool
    var sessionContextApplied: Bool
    var craftContextApplied: Bool
    var craftFrameworkId: String
    var screenplayTaskIntent: String = ""
    var screenplayTaskLabel: String = ""

    enum CodingKeys: String, CodingKey {
        case ok
        case action
        case schemaVersion = "schema_version"
        case source
        case prompt
        case memoryApplied = "memory_applied"
        case sessionContextApplied = "session_context_applied"
        case craftContextApplied = "craft_context_applied"
        case craftFrameworkId = "craft_framework_id"
        case screenplayTaskIntent = "screenplay_task_intent"
        case screenplayTaskLabel = "screenplay_task_label"
    }
}

protocol ScreenplayPromptBackendBuilding {
    func buildScreenplayModelPrompt(
        _ request: BackendScreenplayPromptBuildRequest
    ) async throws -> BackendScreenplayPromptBuildResponse
}

struct ScreenplayPromptBuilder {
    private static let backendRetryDelayNanoseconds: UInt64 = 80_000_000

    struct Request: Equatable {
        var persona: String
        var userInput: String = ""
        var projectId: String = ""
        var versionId: String = ""
        var scene: String = ""
        var phase: String = ""
        var pack: String = ""
        var draftExcerpt: String = ""
        var act: String = ""
        var sceneObjective: String = ""
        var sceneSummary: String = ""
        var currentBeat: String = ""
        var logline: String = ""
        var themeArgument: String = ""
        var centralQuestion: String = ""
        var protagonistWant: String = ""
        var protagonistNeed: String = ""
        var antagonisticForce: String = ""
        var endingImage: String = ""
        var featureSequence: String = ""
        var featureObligation: String = ""
        var nextScenePlan: String = ""
        var nextSceneMoves: [String] = []
        var beatSequence: [String] = []
        var characterFocus: [String] = []
        var unresolvedSetups: [String] = []
        var continuityNotes: [String] = []
        var emotionalContinuity: String = ""
        var pageCount: Int = 0
        var targetPages: Int = 0
        var screenplayTaskHint: String = ""
        var isScreenplayMode: Bool = false
        var shouldWriteToPage: Bool = false
        var craftFrameworkId: String = ""
    }

    struct Result: Equatable {
        var prompt: String
        var usedBackendAssembly: Bool
        var fallbackReason: String
        var screenplayTaskIntent: String = ""
        var screenplayTaskLabel: String = ""
    }

    static func makeLocalPersonaPrompt(
        context: HerVoiceSpec.Context,
        speakingPace: Double,
        memoryDomain: StudioMemoryDomain,
        shouldWriteToPage: Bool,
        companionInstruction: String,
        companionSignals: CreativeCompanionSignalState
    ) -> String {
        let base = applySpeakingPace(
            to: HerVoiceSpec.makeSystemPrompt(context),
            speakingPace: speakingPace
        )
        let routed = appendStudioMemoryDomainInstruction(
            to: base,
            memoryDomain: memoryDomain,
            shouldWriteToPage: shouldWriteToPage,
            companionInstruction: companionInstruction
        )
        return appendCreativeIntentInstruction(
            to: routed,
            signalState: companionSignals
        )
    }

    func buildModelPrompt(
        backend: ScreenplayPromptBackendBuilding,
        request: Request
    ) async -> Result {
        let persona = request.persona.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !persona.isEmpty else {
            return Result(prompt: "", usedBackendAssembly: false, fallbackReason: "empty_persona")
        }

        let promptRequest = BackendScreenplayPromptBuildRequest(
            persona: persona,
            userInput: request.userInput.trimmingCharacters(in: .whitespacesAndNewlines),
            screenplayTaskHint: screenplayTaskHint(from: request),
            sessionContext: sessionContext(from: request),
            includeCraftContext: request.isScreenplayMode && request.shouldWriteToPage,
            craftFrameworkId: request.craftFrameworkId.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        var lastError: Error?
        for attempt in 0..<2 {
            if attempt > 0 {
                try? await Task.sleep(nanoseconds: Self.backendRetryDelayNanoseconds)
            }
            do {
                let response = try await backend.buildScreenplayModelPrompt(
                    promptRequest
                )
                let prompt = response.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
                if !prompt.isEmpty {
                    return Result(
                        prompt: prompt,
                        usedBackendAssembly: true,
                        fallbackReason: "",
                        screenplayTaskIntent: response.screenplayTaskIntent,
                        screenplayTaskLabel: response.screenplayTaskLabel
                    )
                }
                return Result(
                    prompt: localFallbackPrompt(from: request, persona: persona),
                    usedBackendAssembly: false,
                    fallbackReason: "empty_backend_prompt"
                )
            } catch {
                lastError = error
            }
        }
        return Result(
            prompt: localFallbackPrompt(from: request, persona: persona),
            usedBackendAssembly: false,
            fallbackReason: lastError?.localizedDescription ?? "prompt_build_failed"
        )
    }

    private func screenplayTaskHint(from request: Request) -> String {
        let explicit = request.screenplayTaskHint.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
        if !explicit.isEmpty { return explicit }
        return request.userInput.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
    }

    private func sessionContext(from request: Request) -> BackendScreenplayPromptSessionContext? {
        let projectId = request.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let versionId = request.versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let scene = request.scene.trimmingCharacters(in: .whitespacesAndNewlines)
        let phase = request.phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let pack = request.pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let draftExcerpt = request.draftExcerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        let act = request.act.trimmingCharacters(in: .whitespacesAndNewlines)
        let sceneObjective = request.sceneObjective.trimmingCharacters(in: .whitespacesAndNewlines)
        let sceneSummary = request.sceneSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentBeat = request.currentBeat.trimmingCharacters(in: .whitespacesAndNewlines)
        let logline = request.logline.trimmingCharacters(in: .whitespacesAndNewlines)
        let themeArgument = request.themeArgument.trimmingCharacters(in: .whitespacesAndNewlines)
        let centralQuestion = request.centralQuestion.trimmingCharacters(in: .whitespacesAndNewlines)
        let protagonistWant = request.protagonistWant.trimmingCharacters(in: .whitespacesAndNewlines)
        let protagonistNeed = request.protagonistNeed.trimmingCharacters(in: .whitespacesAndNewlines)
        let antagonisticForce = request.antagonisticForce.trimmingCharacters(in: .whitespacesAndNewlines)
        let endingImage = request.endingImage.trimmingCharacters(in: .whitespacesAndNewlines)
        let featureSequence = request.featureSequence.trimmingCharacters(in: .whitespacesAndNewlines)
        let featureObligation = request.featureObligation.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextScenePlan = request.nextScenePlan.trimmingCharacters(in: .whitespacesAndNewlines)
        let emotionalContinuity = request.emotionalContinuity.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextSceneMoves = Self.sanitizedContextList(request.nextSceneMoves, limit: 5)
        let beatSequence = Self.sanitizedContextList(request.beatSequence, limit: 8)
        let characterFocus = Self.sanitizedContextList(request.characterFocus, limit: 8)
        let unresolvedSetups = Self.sanitizedContextList(request.unresolvedSetups, limit: 8)
        let continuityNotes = Self.sanitizedContextList(request.continuityNotes, limit: 8)
        let pageCount = max(0, request.pageCount)
        let targetPages = max(0, request.targetPages)
        guard !projectId.isEmpty || !versionId.isEmpty || !scene.isEmpty || !phase.isEmpty || !pack.isEmpty ||
                !draftExcerpt.isEmpty || !act.isEmpty || !sceneObjective.isEmpty || !sceneSummary.isEmpty ||
                !currentBeat.isEmpty || !logline.isEmpty || !themeArgument.isEmpty || !centralQuestion.isEmpty ||
                !protagonistWant.isEmpty || !protagonistNeed.isEmpty || !antagonisticForce.isEmpty ||
                !endingImage.isEmpty || !featureSequence.isEmpty || !featureObligation.isEmpty ||
                !nextScenePlan.isEmpty || !nextSceneMoves.isEmpty || !emotionalContinuity.isEmpty ||
                !beatSequence.isEmpty || !characterFocus.isEmpty || !unresolvedSetups.isEmpty || !continuityNotes.isEmpty ||
                pageCount > 0 || targetPages > 0 else { return nil }
        return BackendScreenplayPromptSessionContext(
            projectId: projectId,
            versionId: versionId,
            scene: scene,
            phase: phase,
            pack: pack,
            draftExcerpt: String(draftExcerpt.suffix(6_000)),
            act: act,
            sceneObjective: sceneObjective,
            sceneSummary: sceneSummary,
            currentBeat: currentBeat,
            logline: logline,
            themeArgument: themeArgument,
            centralQuestion: centralQuestion,
            protagonistWant: protagonistWant,
            protagonistNeed: protagonistNeed,
            antagonisticForce: antagonisticForce,
            endingImage: endingImage,
            featureSequence: featureSequence,
            featureObligation: featureObligation,
            nextScenePlan: nextScenePlan,
            nextSceneMoves: nextSceneMoves,
            beatSequence: beatSequence,
            characterFocus: characterFocus,
            unresolvedSetups: unresolvedSetups,
            continuityNotes: continuityNotes,
            emotionalContinuity: emotionalContinuity,
            pageCount: pageCount,
            targetPages: targetPages
        )
    }

    private static func sanitizedContextList(_ items: [String], limit: Int) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for item in items {
            let clean = item
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard seen.insert(key).inserted else { continue }
            result.append(String(clean.prefix(220)))
            if result.count >= limit { break }
        }
        return result
    }

    private func localFallbackPrompt(from request: Request, persona: String) -> String {
        let featureBlock = localFeatureFilmFallbackBlock(from: request)
        guard !featureBlock.isEmpty else { return persona }
        return [persona, featureBlock].joined(separator: "\n\n")
    }

    private func localFeatureFilmFallbackBlock(from request: Request) -> String {
        guard request.isScreenplayMode else { return "" }
        let taskHint = screenplayTaskHint(from: request)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedPages = Self.requestedPageBatch(from: taskHint)
        let requestedAct = Self.requestedActLabel(from: taskHint)
        let act = request.act.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentBeat = request.currentBeat.trimmingCharacters(in: .whitespacesAndNewlines)
        let sceneObjective = request.sceneObjective.trimmingCharacters(in: .whitespacesAndNewlines)
        let sceneSummary = request.sceneSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        let logline = request.logline.trimmingCharacters(in: .whitespacesAndNewlines)
        let themeArgument = request.themeArgument.trimmingCharacters(in: .whitespacesAndNewlines)
        let centralQuestion = request.centralQuestion.trimmingCharacters(in: .whitespacesAndNewlines)
        let protagonistWant = request.protagonistWant.trimmingCharacters(in: .whitespacesAndNewlines)
        let protagonistNeed = request.protagonistNeed.trimmingCharacters(in: .whitespacesAndNewlines)
        let antagonisticForce = request.antagonisticForce.trimmingCharacters(in: .whitespacesAndNewlines)
        let endingImage = request.endingImage.trimmingCharacters(in: .whitespacesAndNewlines)
        let featureSequence = request.featureSequence.trimmingCharacters(in: .whitespacesAndNewlines)
        let featureObligation = request.featureObligation.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextScenePlan = request.nextScenePlan.trimmingCharacters(in: .whitespacesAndNewlines)
        let emotionalContinuity = request.emotionalContinuity.trimmingCharacters(in: .whitespacesAndNewlines)
        let draftExcerpt = request.draftExcerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        let pageCount = max(0, request.pageCount)
        let targetPages = max(0, request.targetPages)
        let hasFeatureContext = request.shouldWriteToPage ||
            !taskHint.isEmpty ||
            !act.isEmpty ||
            !currentBeat.isEmpty ||
            !sceneObjective.isEmpty ||
            !sceneSummary.isEmpty ||
            !logline.isEmpty ||
            !themeArgument.isEmpty ||
            !centralQuestion.isEmpty ||
            !protagonistWant.isEmpty ||
            !protagonistNeed.isEmpty ||
            !antagonisticForce.isEmpty ||
            !endingImage.isEmpty ||
            !featureSequence.isEmpty ||
            !featureObligation.isEmpty ||
            !nextScenePlan.isEmpty ||
            !emotionalContinuity.isEmpty ||
            !draftExcerpt.isEmpty ||
            pageCount > 0 ||
            targetPages > 0
        guard hasFeatureContext else { return "" }

        var lines: [String] = [
            "LOCAL FEATURE-FILM CONTINUITY FALLBACK:",
            "- Clementine must think like a whole-feature screenwriter, not a single-scene chatbot.",
            "- Act I: wound, want, catalyst, debate, irreversible choice.",
            "- Act II: tests, reversals, midpoint truth, escalating cost, all-is-lost collapse.",
            "- Act III: synthesis, final plan, climax under maximum pressure, final image.",
            "- Act bridge ladder: Act I choice -> Act II pressure -> midpoint truth -> all-is-lost cost -> Act III payoff -> final image.",
            "- Feature compass: before pages, silently lock act, sequence, scene job, protagonist want/need, emotional handoff, open setup, exit turn, and final-image pressure.",
            "- Feature completion method: track current sequence, next three turns, unresolved promises, Act III payoff path, and final image.",
            "- Scene-to-feature loop: each scene must satisfy its local objective while changing the whole movie's pressure.",
            "- Page batch discipline: for 5-15 page asks, write escalating scene turns where story state changes every 1-2 pages.",
            "- Page-first delivery: if the request targets screenplay pages, write the pages immediately; no preamble, no markdown fence, no options menu, no permission check.",
            "- Feature page sprint: for multi-page asks, silently choose the strongest sequence obligation and deliver a continuous playable run with built-in escalation.",
            "- Expert page engine: every scene needs objective, obstacle, pressure clock, escalation, reversal or turn, emotional residue, and an exit image.",
            "- Scene intelligence: silently know the scene job, relationship fracture, hidden want, turn, and exit problem before writing.",
            "- Subtext engine: dialogue carries tactic, concealment, interruption, pressure, and character-specific rhythm.",
            "- Image system: plant, echo, and transform visual motifs so the ending feels earned.",
            "- Feature-scale output contract: launch pressure, complication, reversal, exit image; no filler conversation, static explanation, repeated tactic, markdown fence, or permission language.",
            "- Page quality gate: no placeholder scenes, generic banter, prose summary, or invented deus-ex-machina information; use visual action, conflict, subtext, and consequence.",
            "- Protect setups/payoffs, character need, theme argument, emotional handoff, and ending image.",
            "- Carry one unresolved setup forward and plant, echo, or pay off one image toward the final image.",
            "- For Act I -> Act II -> Act III requests, keep every beat causally linked to protagonist want/need.",
            "- When asked to finish pages, give one concise strategy note, then write playable Fountain immediately.",
            "- Production format: present-tense action, clean white space, actable lines, and no novelistic interiority.",
        ]

        if !act.isEmpty {
            lines.append("- Active act: \(String(act.prefix(120)))")
        }
        if requestedPages > 0 {
            lines.append("- Requested page batch: \(requestedPages) pages")
            let targetAct = requestedAct.isEmpty ? act : requestedAct
            if !targetAct.isEmpty {
                lines.append("- Target act from request: \(String(targetAct.prefix(120)))")
            }
            lines.append("- Page-batch execution plan: write the next continuous run as playable Fountain; split it into 2-4 escalating scene turns; change story state every 1-2 pages; write toward the next structural obligation, not merely the next incident.")
            lines.append("- Batch end condition: leave a decision, reveal, cost, or image that hands into the next sequence.")
        } else if !requestedAct.isEmpty {
            lines.append("- Target act from request: \(String(requestedAct.prefix(120)))")
        }
        if pageCount > 0 {
            let target = targetPages > 0 ? targetPages : 110
            lines.append("- Estimated position: p\(pageCount) / \(target)")
        } else if targetPages > 0 {
            lines.append("- Target length: \(targetPages) pages")
        }
        if !sceneObjective.isEmpty {
            lines.append("- Current scene objective: \(String(sceneObjective.prefix(220)))")
        }
        if !sceneSummary.isEmpty {
            lines.append("- Current scene summary: \(String(sceneSummary.prefix(220)))")
        }
        if !currentBeat.isEmpty {
            lines.append("- Current beat: \(String(currentBeat.prefix(180)))")
        }
        if !logline.isEmpty {
            lines.append("- Feature logline: \(String(logline.prefix(260)))")
        }
        if !themeArgument.isEmpty {
            lines.append("- Theme argument: \(String(themeArgument.prefix(260)))")
        }
        if !centralQuestion.isEmpty {
            lines.append("- Central dramatic question: \(String(centralQuestion.prefix(260)))")
        }
        if !protagonistWant.isEmpty || !protagonistNeed.isEmpty {
            lines.append("- Protagonist engine: want=\(String(protagonistWant.prefix(180))); need=\(String(protagonistNeed.prefix(180)))")
        }
        if !antagonisticForce.isEmpty {
            lines.append("- Antagonistic force: \(String(antagonisticForce.prefix(220)))")
        }
        if !endingImage.isEmpty {
            lines.append("- Ending image: \(String(endingImage.prefix(220)))")
        }
        if !featureSequence.isEmpty {
            lines.append("- Active feature sequence: \(String(featureSequence.prefix(180)))")
        }
        if !featureObligation.isEmpty {
            lines.append("- Structural obligation due now: \(String(featureObligation.prefix(260)))")
        }
        if !nextScenePlan.isEmpty {
            lines.append("- Next scene planner: \(String(nextScenePlan.prefix(320)))")
        }
        if !emotionalContinuity.isEmpty {
            lines.append("- Emotional continuity: \(String(emotionalContinuity.prefix(260)))")
        }
        lines.append("- Next page moves: name the active structural obligation; advance one irreversible character choice; preserve the emotional handoff.")

        let nextSceneMoves = Self.sanitizedContextList(request.nextSceneMoves, limit: 4)
        if !nextSceneMoves.isEmpty {
            lines.append("- Next scene moves: \(nextSceneMoves.joined(separator: " -> "))")
        }
        let beatSequence = Self.sanitizedContextList(request.beatSequence, limit: 6)
        if !beatSequence.isEmpty {
            lines.append("- Beat chain: \(beatSequence.joined(separator: " -> "))")
        }
        let unresolvedSetups = Self.sanitizedContextList(request.unresolvedSetups, limit: 4)
        if !unresolvedSetups.isEmpty {
            lines.append("- Unresolved setups: \(unresolvedSetups.joined(separator: "; "))")
        }
        let characterFocus = Self.sanitizedContextList(request.characterFocus, limit: 5)
        if !characterFocus.isEmpty {
            lines.append("- Character focus: \(characterFocus.joined(separator: "; "))")
        }
        let continuityNotes = Self.sanitizedContextList(request.continuityNotes, limit: 4)
        if !continuityNotes.isEmpty {
            lines.append("- Continuity notes: \(continuityNotes.joined(separator: "; "))")
        }

        return lines.joined(separator: "\n")
    }

    private static func requestedPageBatch(from hint: String) -> Int {
        let lowered = hint
            .lowercased()
            .replacingOccurrences(of: "-", with: " ")
        let tokens = lowered
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
        guard tokens.count >= 2 else { return 0 }
        let pageWords: [String: Int] = [
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
            "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
            "nineteen": 19, "twenty": 20,
        ]
        let triggerWords: Set<String> = [
            "next", "another", "first", "final", "last", "write", "draft",
            "continue", "generate", "give", "do",
        ]
        for index in tokens.indices where tokens[index].hasPrefix("page") && index > tokens.startIndex {
            let previous = tokens[tokens.index(before: index)]
            let count = Int(previous) ?? pageWords[previous] ?? 0
            guard count > 0 && count <= 30 else { continue }
            let windowStart = max(tokens.startIndex, index - 6)
            let triggerWindow = tokens[windowStart..<index]
            if triggerWindow.contains(where: { triggerWords.contains($0) }) {
                return count
            }
        }
        return 0
    }

    private static func requestedActLabel(from hint: String) -> String {
        let lowered = hint.lowercased()
        let hasActOne = matches(#"\bact\s*(i|1|one)\b"#, in: lowered) ||
            lowered.contains("first act")
        let hasActTwo = matches(#"\bact\s*(ii|2|two)\b"#, in: lowered) ||
            lowered.contains("second act")
        let hasActThree = matches(#"\bact\s*(iii|3|three)\b"#, in: lowered) ||
            lowered.contains("third act") ||
            lowered.contains("final act") ||
            lowered.contains("final sequence") ||
            lowered.contains("finale")
        if hasActOne && hasActTwo && hasActThree {
            return "Act I -> Act II -> Act III"
        }
        if hasActThree { return "Act III" }
        if hasActTwo { return "Act II" }
        if hasActOne { return "Act I" }
        return ""
    }

    private static func matches(_ pattern: String, in text: String) -> Bool {
        text.range(of: pattern, options: .regularExpression) != nil
    }

    private static func applySpeakingPace(to systemPrompt: String, speakingPace: Double) -> String {
        let clampedPace = min(max(speakingPace, 0.7), 1.5)
        guard abs(clampedPace - 1.0) > 0.001 else { return systemPrompt }

        let instruction: String
        switch clampedPace {
        case ..<0.95:
            instruction = "SPEAKING PACE: Slower. Speak more slowly and deliberately than usual, with a little more space between thoughts."
        case ..<1.15:
            instruction = "SPEAKING PACE: Natural. Keep a natural conversational pace, clear and unforced."
        case ..<1.32:
            instruction = "SPEAKING PACE: Brisk. Keep the pace a bit quicker than natural, efficient but still clear."
        default:
            instruction = "SPEAKING PACE: Fast. Speak quickly and efficiently, keep momentum high, and avoid lingering."
        }

        return systemPrompt + "\n\n" + instruction
    }

    private static func appendStudioMemoryDomainInstruction(
        to systemPrompt: String,
        memoryDomain: StudioMemoryDomain,
        shouldWriteToPage: Bool,
        companionInstruction: String
    ) -> String {
        let instruction: String
        switch memoryDomain {
        case .project:
            instruction = shouldWriteToPage
                ? "MEMORY ROUTE: Treat this as project memory. Prioritize screenplay continuity, story facts, and draft state over companion chat."
                : "MEMORY ROUTE: Treat this as project memory. Respond as a focused screenwriting collaborator, not as a romantic or dependency-seeking companion."
        case .companion:
            instruction = "MEMORY ROUTE: Treat this as companion memory. Stay relational and supportive. Do not change the screenplay page unless the user explicitly asks. If you suggest screenplay language, frame it as optional support and do not describe yourself in page mode or tool-state language.\n\(companionInstruction)"
        case .mixed:
            instruction = "MEMORY ROUTE: This is mixed. Acknowledge the user's emotional state briefly, then return to the screenplay problem with concrete craft help. If you draft lines, present them as a grounded suggestion rather than generic page-mode status copy.\n\(companionInstruction)"
        }
        return systemPrompt + "\n\n" + instruction
    }

    private static func appendCreativeIntentInstruction(
        to systemPrompt: String,
        signalState: CreativeCompanionSignalState
    ) -> String {
        guard signalState.hasContent else { return systemPrompt }
        return systemPrompt + "\n\n" + signalState.promptGuidance()
    }
}

extension BackendClient: ScreenplayPromptBackendBuilding {}
