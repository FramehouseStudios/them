import Foundation

struct ScreenplayFeatureProgressionGuide: Equatable {
    struct Step: Equatable {
        let act: String
        let label: String
        let startRatio: Double
        let endRatio: Double
        let pressure: String
        let obligation: String
        let nextMoves: [String]
    }

    let currentAct: String
    let sequenceLabel: String
    let pageRangeText: String
    let progressText: String
    let dueNow: String
    let nextScenePlan: String
    let nextMoves: [String]
    let comingNext: String

    static let defaultTargetPages = 110

    static func guide(
        actPosition: String,
        currentPage: Int,
        targetPages: Int = defaultTargetPages
    ) -> ScreenplayFeatureProgressionGuide {
        let target = max(1, targetPages)
        let explicitIndex = sequenceIndex(for: actPosition)
        let safePage = max(0, currentPage)
        let lowPageConflictsWithAct = safePage > 0 && safePage <= 2 && explicitIndex > 0
        let step = lowPageConflictsWithAct
            ? template[explicitIndex]
            : stepForPage(safePage, targetPages: target, fallbackIndex: explicitIndex)
        let next = nextStep(after: step)
        let range = pageRange(for: step, targetPages: target)
        let progress = safePage > 0 && !lowPageConflictsWithAct
            ? "p\(min(safePage, target)) / \(target)"
            : "Act estimate"
        let firstMove = step.nextMoves.first ?? "Advance the next irreversible character choice."
        let nextScenePlan = "\(step.act) - \(step.label): \(step.obligation) \(firstMove)"
        let comingNext = next == step
            ? "\(next.act) - \(next.label)"
            : "\(next.act) - \(next.label): \(next.pressure)"

        return ScreenplayFeatureProgressionGuide(
            currentAct: step.act,
            sequenceLabel: step.label,
            pageRangeText: "p\(range.start)-p\(range.end)",
            progressText: progress,
            dueNow: "\(step.pressure) \(step.obligation)",
            nextScenePlan: nextScenePlan,
            nextMoves: Array(step.nextMoves.prefix(3)),
            comingNext: comingNext
        )
    }

    private static let template: [Step] = [
        Step(
            act: "Act I",
            label: "Opening Image / Ordinary World",
            startRatio: 1.0 / 110.0,
            endRatio: 12.0 / 110.0,
            pressure: "Make the protagonist's wound, want, world, and tonal promise visible through behavior.",
            obligation: "Plant the emotional question the ending must answer.",
            nextMoves: [
                "Open on behavior that shows the wound before anyone explains it.",
                "Plant the ordinary-world rule the movie will later break.",
                "Echo the ending image in a smaller, incomplete form.",
            ]
        ),
        Step(
            act: "Act I",
            label: "Catalyst To Commitment",
            startRatio: 13.0 / 110.0,
            endRatio: 25.0 / 110.0,
            pressure: "Disrupt the old life, force debate, and end Act I with an irreversible choice.",
            obligation: "The protagonist must choose the movie, not merely receive it.",
            nextMoves: [
                "Turn the catalyst into a personal dilemma, not just an event.",
                "Let debate expose the cost of staying the same.",
                "End the act on a choice that burns one safe exit.",
            ]
        ),
        Step(
            act: "Act II",
            label: "Promise Of The Premise",
            startRatio: 26.0 / 110.0,
            endRatio: 40.0 / 110.0,
            pressure: "Let the premise generate cinematic tests, new rules, and sharper tactics.",
            obligation: "Each scene should make the protagonist try a visible strategy and pay a price.",
            nextMoves: [
                "Write tests that force different tactics instead of repeating the premise.",
                "Give each win a cost that narrows later choices.",
                "Bring the B-story into pressure, not decoration.",
            ]
        ),
        Step(
            act: "Act II",
            label: "Midpoint Pressure",
            startRatio: 41.0 / 110.0,
            endRatio: 55.0 / 110.0,
            pressure: "Drive toward a midpoint reversal that changes the meaning of the pursuit.",
            obligation: "The midpoint must raise stakes, reveal a truth, or turn victory into a trap.",
            nextMoves: [
                "Build to a reversal that redefines what the protagonist thought they wanted.",
                "Make the midpoint public, irreversible, or intimate enough to change tactics.",
                "Let the emotional truth arrive before the exposition.",
            ]
        ),
        Step(
            act: "Act II",
            label: "Reversal Fallout",
            startRatio: 56.0 / 110.0,
            endRatio: 70.0 / 110.0,
            pressure: "Make the midpoint cost emotional, relational, and practical ground.",
            obligation: "The protagonist's old tactics should stop working.",
            nextMoves: [
                "Show the old tactic failing in a way the audience can watch.",
                "Turn allies, secrets, and desire into pressure against the protagonist.",
                "Let the relationship cost sharpen the theme argument.",
            ]
        ),
        Step(
            act: "Act II",
            label: "Collapse / All Is Lost",
            startRatio: 71.0 / 110.0,
            endRatio: 85.0 / 110.0,
            pressure: "Escalate to the loss that forces the protagonist to confront the need beneath the want.",
            obligation: "Pay off planted dread; leave one painful truth that can power Act III.",
            nextMoves: [
                "Cash in the most dangerous unresolved setup.",
                "Strip away the false want so the real need becomes unavoidable.",
                "Leave Act II with a painful truth, not just a plot setback.",
            ]
        ),
        Step(
            act: "Act III",
            label: "Break Into Three / Final Plan",
            startRatio: 86.0 / 110.0,
            endRatio: 98.0 / 110.0,
            pressure: "Synthesize A-story and B-story into a new plan the old self could not have chosen.",
            obligation: "The final plan must express change, not just competence.",
            nextMoves: [
                "Let the final plan be born from the character's need, not a clever external trick.",
                "Bring the B-story lesson into the A-story tactic.",
                "Choose payoffs that make earlier behavior feel inevitable.",
            ]
        ),
        Step(
            act: "Act III",
            label: "Climax / Final Image",
            startRatio: 99.0 / 110.0,
            endRatio: 110.0 / 110.0,
            pressure: "Force the decisive choice, resolve the central question, and land a final image with emotional contrast.",
            obligation: "The climax should make the inner arc visible under maximum external pressure.",
            nextMoves: [
                "Make the climax turn on the changed choice only this protagonist can make.",
                "Resolve the theme through behavior under pressure.",
                "Land a final image that answers the opening image with emotional contrast.",
            ]
        ),
    ]

    private static func stepForPage(_ page: Int, targetPages: Int, fallbackIndex: Int) -> Step {
        guard page > 0 else { return template[fallbackIndex] }
        let safePage = min(max(1, page), targetPages)
        return template.first { step in
            let range = pageRange(for: step, targetPages: targetPages)
            return safePage >= range.start && safePage <= range.end
        } ?? template.last!
    }

    private static func pageRange(for step: Step, targetPages: Int) -> (start: Int, end: Int) {
        let start = min(max(1, Int((step.startRatio * Double(targetPages)).rounded())), targetPages)
        let end = min(max(start, Int((step.endRatio * Double(targetPages)).rounded())), targetPages)
        return (start, end)
    }

    private static func nextStep(after step: Step) -> Step {
        guard let index = template.firstIndex(of: step) else { return template[0] }
        return template[min(index + 1, template.count - 1)]
    }

    private static func sequenceIndex(for actPosition: String) -> Int {
        let text = actPosition.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !text.isEmpty else { return 0 }
        if text.contains("climax") || text.contains("final image") || text.contains("act iii") || text.contains("act 3") || text.contains("third") {
            return 6
        }
        if text.contains("all is lost") || text.contains("collapse") || text.contains("ii-b") || text.contains("iib") || text.contains("2b") {
            return 5
        }
        if text.contains("midpoint") {
            return 3
        }
        if text.contains("act ii") || text.contains("act 2") || text.contains("second") || text.contains("ii-a") || text.contains("iia") || text.contains("2a") {
            return 2
        }
        if text.contains("catalyst") || text.contains("commitment") {
            return 1
        }
        return 0
    }
}
struct ScreenplayFeatureActionContext: Equatable {
    var logline: String = ""
    var themeArgument: String = ""
    var centralQuestion: String = ""
    var protagonistWant: String = ""
    var protagonistNeed: String = ""
    var antagonisticForce: String = ""
    var endingImage: String = ""
    var unresolvedSetups: [String] = []

    var spineLines: [String] {
        var lines: [String] = []
        appendLine("Logline", logline, to: &lines)
        appendLine("Theme argument", themeArgument, to: &lines)
        appendLine("Central dramatic question", centralQuestion, to: &lines)
        appendLine("Protagonist want", protagonistWant, to: &lines)
        appendLine("Protagonist need", protagonistNeed, to: &lines)
        appendLine("Antagonistic force", antagonisticForce, to: &lines)
        appendLine("Ending image", endingImage, to: &lines)
        return lines
    }

    private func appendLine(_ label: String, _ value: String, to lines: inout [String]) {
        let clean = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        guard !clean.isEmpty else { return }
        lines.append("- \(label): \(String(clean.prefix(260)))")
    }
}

enum ScreenplayFeatureActionCommand: String, Codable, Equatable {
    case writeNextScene = "write_next_scene"
    case outlineNextThreeTurns = "outline_next_three_turns"
    case mapFeatureRoadmap = "map_feature_roadmap"

    var displayText: String {
        switch self {
        case .writeNextScene:
            return "Write next feature scene"
        case .outlineNextThreeTurns:
            return "Outline next three turns"
        case .mapFeatureRoadmap:
            return "Map Act I to Act III"
        }
    }

    var successMessage: String {
        switch self {
        case .writeNextScene:
            return "Asked THEM to write the next feature scene."
        case .outlineNextThreeTurns:
            return "Asked THEM to draft the next three feature turns."
        case .mapFeatureRoadmap:
            return "Asked THEM to map the feature from Act I to Act III."
        }
    }

    var routingModeRawValue: String {
        switch self {
        case .writeNextScene, .outlineNextThreeTurns:
            return "page"
        case .mapFeatureRoadmap:
            return "voicePin"
        }
    }
}

struct ScreenplayFeatureActionPromptBuilder {
    static func prompt(
        for command: ScreenplayFeatureActionCommand,
        guide: ScreenplayFeatureProgressionGuide,
        context: ScreenplayFeatureActionContext
    ) -> String {
        switch command {
        case .writeNextScene:
            return writeNextScenePrompt(guide: guide, context: context)
        case .outlineNextThreeTurns:
            return outlineNextThreeTurnsPrompt(guide: guide, context: context)
        case .mapFeatureRoadmap:
            return mapFeatureRoadmapPrompt(guide: guide, context: context)
        }
    }

    private static func writeNextScenePrompt(
        guide: ScreenplayFeatureProgressionGuide,
        context: ScreenplayFeatureActionContext
    ) -> String {
        var lines: [String] = [
            "Write the next scene directly into the screenplay draft as playable Fountain pages only.",
            "",
            "Current feature position: \(guide.currentAct) - \(guide.sequenceLabel) (\(guide.pageRangeText)); \(guide.progressText).",
            "Structural obligation due now: \(guide.dueNow)",
            "Next scene plan: \(guide.nextScenePlan)",
        ]
        appendFeatureContext(context, guide: guide, to: &lines)
        lines.append(contentsOf: [
            "",
            "Requirements:",
            "- Start with a slugline if the location or time changes; otherwise continue cleanly from the current draft.",
            "- Write a complete scene section with visible behavior, conflict, subtext, and emotional handoff.",
            "- Pay off or complicate at least one existing setup when it fits naturally.",
            "- Do not include analysis, markdown, headings about craft, or notes to the writer.",
            "- Return screenplay text only.",
        ])
        return lines.joined(separator: "\n")
    }

    private static func outlineNextThreeTurnsPrompt(
        guide: ScreenplayFeatureProgressionGuide,
        context: ScreenplayFeatureActionContext
    ) -> String {
        var lines: [String] = [
            "Draft the next three structural turns directly into the screenplay draft as playable Fountain scene beats, not advice.",
            "",
            "Current feature position: \(guide.currentAct) - \(guide.sequenceLabel) (\(guide.pageRangeText)); \(guide.progressText).",
            "Structural obligation due now: \(guide.dueNow)",
            "Next scene plan: \(guide.nextScenePlan)",
        ]
        appendFeatureContext(context, guide: guide, to: &lines)
        lines.append(contentsOf: [
            "",
            "Requirements:",
            "- Write three numbered screenplay turn sections using Fountain-friendly scene headings, action, and optional dialogue fragments.",
            "- Each turn must change the protagonist's tactic, cost, or emotional denial.",
            "- Keep the turns causally linked from the current sequence toward \(guide.comingNext).",
            "- Do not include analysis, markdown beyond the turn numbers, or notes to the writer.",
            "- Return screenplay-facing text only.",
        ])
        return lines.joined(separator: "\n")
    }

    private static func mapFeatureRoadmapPrompt(
        guide: ScreenplayFeatureProgressionGuide,
        context: ScreenplayFeatureActionContext
    ) -> String {
        var lines: [String] = [
            "Build a feature-completion roadmap for this screenplay from Act I through Act III.",
            "",
            "Current feature position: \(guide.currentAct) - \(guide.sequenceLabel) (\(guide.pageRangeText)); \(guide.progressText).",
            "Structural obligation due now: \(guide.dueNow)",
            "Next scene plan: \(guide.nextScenePlan)",
        ]
        appendFeatureContext(context, guide: guide, to: &lines)
        lines.append(contentsOf: [
            "",
            "Response shape:",
            "- Current diagnosis: two concise bullets about the active act/sequence pressure.",
            "- Act I spine: the wound, want, catalyst, debate, and irreversible choice this movie needs.",
            "- Act II engine: the tests, midpoint reversal, false-want collapse, and all-is-lost cost.",
            "- Act III payoff path: the changed plan, climax choice, and final image answer.",
            "- Next three turns: scene-level moves that can be written immediately.",
            "- Setup/payoff watchlist: promises to preserve or pay off before the ending.",
            "",
            "Rules:",
            "- Use the existing feature spine; do not invent a different movie.",
            "- Be specific enough that the writer can draft pages from the roadmap.",
            "- Keep it cinematic, emotionally intelligent, and concise.",
            "- Do not output screenplay pages in this response unless the user asks next.",
        ])
        return lines.joined(separator: "\n")
    }

    private static func appendFeatureContext(
        _ context: ScreenplayFeatureActionContext,
        guide: ScreenplayFeatureProgressionGuide,
        to lines: inout [String]
    ) {
        let spineLines = context.spineLines
        if !spineLines.isEmpty {
            lines.append("")
            lines.append("Feature spine:")
            lines.append(contentsOf: spineLines)
        }

        if !guide.nextMoves.isEmpty {
            lines.append("")
            lines.append("Next page moves:")
            for move in guide.nextMoves {
                lines.append("- \(move)")
            }
        }

        if !context.unresolvedSetups.isEmpty {
            lines.append("")
            lines.append("Unresolved setups to protect:")
            for setup in context.unresolvedSetups.prefix(6) {
                lines.append("- \(setup)")
            }
        }
    }
}

struct ScreenplayFeaturePlannerActionSnapshot: Codable, Equatable, Identifiable {
    let id: String
    let projectId: String
    let projectTitle: String
    let commandRawValue: String
    let displayText: String
    let prompt: String
    let currentAct: String
    let sequenceLabel: String
    let pageRangeText: String
    let requestID: String
    let submittedAt: TimeInterval
    var routingModeRawValue: String? = nil

    var command: ScreenplayFeatureActionCommand? {
        ScreenplayFeatureActionCommand(rawValue: commandRawValue)
    }

    var resolvedRoutingModeRawValue: String {
        let stored = (routingModeRawValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !stored.isEmpty { return stored }
        return command?.routingModeRawValue ?? "page"
    }

    var submittedDate: Date {
        Date(timeIntervalSince1970: submittedAt)
    }

    func retrySnapshot(
        requestID: String,
        submittedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> ScreenplayFeaturePlannerActionSnapshot {
        ScreenplayFeaturePlannerActionSnapshot(
            id: id,
            projectId: projectId,
            projectTitle: projectTitle,
            commandRawValue: commandRawValue,
            displayText: displayText,
            prompt: prompt,
            currentAct: currentAct,
            sequenceLabel: sequenceLabel,
            pageRangeText: pageRangeText,
            requestID: requestID,
            submittedAt: submittedAt,
            routingModeRawValue: routingModeRawValue
        )
    }
}

struct ScreenplayFeaturePlannerActionRecoveryStore {
    static let defaultKey = "studio.feature.planner.pending.v1"

    static func snapshots(from rawValue: String) -> [String: ScreenplayFeaturePlannerActionSnapshot] {
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let data = trimmed.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String: ScreenplayFeaturePlannerActionSnapshot].self, from: data) else {
            return [:]
        }
        return decoded.filter { key, snapshot in
            !key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                !snapshot.projectId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
                !snapshot.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    static func encoded(_ snapshots: [String: ScreenplayFeaturePlannerActionSnapshot]) -> String {
        guard !snapshots.isEmpty,
              let data = try? JSONEncoder().encode(snapshots),
              let encoded = String(data: data, encoding: .utf8) else {
            return ""
        }
        return encoded
    }

    static func save(
        _ snapshot: ScreenplayFeaturePlannerActionSnapshot,
        in rawValue: String
    ) -> String {
        let projectId = snapshot.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !projectId.isEmpty,
              !snapshot.prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return rawValue
        }
        var next = snapshots(from: rawValue)
        next[projectId] = snapshot
        return encoded(next)
    }

    static func clear(
        projectId: String,
        in rawValue: String
    ) -> String {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return rawValue }
        var next = snapshots(from: rawValue)
        next.removeValue(forKey: normalizedProjectId)
        return encoded(next)
    }

    static func clear(
        id: String,
        in rawValue: String
    ) -> String {
        let normalizedID = id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedID.isEmpty else { return rawValue }
        let next = snapshots(from: rawValue).filter { _, snapshot in
            snapshot.id.trimmingCharacters(in: .whitespacesAndNewlines) != normalizedID
        }
        return encoded(next)
    }

    static func pendingSnapshot(
        projectId: String,
        in rawValue: String
    ) -> ScreenplayFeaturePlannerActionSnapshot? {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return nil }
        return snapshots(from: rawValue)[normalizedProjectId]
    }
}
