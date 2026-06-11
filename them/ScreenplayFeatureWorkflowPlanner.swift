import Foundation

struct ScreenplayFeatureWorkflowMove: Identifiable, Equatable, Hashable {
    let id: String
    let title: String
    let detail: String
    let prompt: String

    var shortTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count > 34 else { return trimmed }
        let index = trimmed.index(trimmed.startIndex, offsetBy: 34)
        return String(trimmed[..<index]).trimmingCharacters(in: .whitespacesAndNewlines) + "..."
    }
}

struct ScreenplayFeatureWorkflowSnapshot: Equatable, Hashable {
    let currentActTitle: String
    let currentActDetail: String
    let actProgressLabel: String
    let draftProgressLabel: String
    let acceptedBatchTitle: String
    let acceptedBatchDetail: String
    let acceptedBatchLineRange: ClosedRange<Int>?
    let structuralObligation: String
    let nextSceneTitle: String
    let nextSceneDetail: String
    let nextMoves: [ScreenplayFeatureWorkflowMove]
    let pageWritePrompt: String
    let planningPrompt: String
    let sceneDoctorPrompt: String

    var hasAcceptedBatch: Bool {
        acceptedBatchLineRange != nil
    }
}

struct ScreenplayFeatureWorkflowSessionContext: Codable, Equatable {
    let requestID: String
    let projectID: String
    let versionID: String
    let submittedPrompt: String
    let createdAt: Date
    let act: String
    let sceneObjective: String
    let sceneSummary: String
    let currentBeat: String
    let featureSequence: String
    let featureObligation: String
    let nextScenePlan: String
    let nextSceneMoves: [String]
    let continuityNotes: [String]
    let emotionalContinuity: String
    let pageCount: Int
    let targetPages: Int

    init(
        requestID: String,
        projectID: String = "",
        versionID: String = "",
        submittedPrompt: String,
        snapshot: ScreenplayFeatureWorkflowSnapshot,
        createdAt: Date = Date(),
        pageCount: Int = 0,
        targetPages: Int = 0
    ) {
        self.requestID = Self.clean(requestID, limit: 160)
        self.projectID = Self.clean(projectID, limit: 160)
        self.versionID = Self.clean(versionID, limit: 160)
        self.submittedPrompt = Self.clean(submittedPrompt, limit: 500)
        self.createdAt = createdAt
        self.act = Self.clean(snapshot.currentActTitle, limit: 120)
        self.sceneObjective = Self.clean(snapshot.nextSceneDetail, limit: 280)
        self.sceneSummary = Self.clean(
            "\(snapshot.nextSceneTitle): \(snapshot.nextSceneDetail)",
            limit: 280
        )
        self.currentBeat = Self.clean(snapshot.structuralObligation, limit: 220)
        self.featureSequence = Self.clean(
            "\(snapshot.currentActTitle) - \(snapshot.actProgressLabel); \(snapshot.draftProgressLabel)",
            limit: 220
        )
        self.featureObligation = Self.clean(snapshot.structuralObligation, limit: 280)
        self.nextScenePlan = Self.clean(
            "Next scene: \(snapshot.nextSceneTitle). \(snapshot.nextSceneDetail)",
            limit: 340
        )
        self.nextSceneMoves = Self.cleanList(
            snapshot.nextMoves.map { "\($0.title): \($0.detail)" },
            limit: 5,
            itemLimit: 180
        )
        self.continuityNotes = Self.cleanList([
            "Feature Compass accepted batch: \(snapshot.acceptedBatchDetail)",
            "Feature Compass next scene: \(snapshot.nextSceneTitle)",
            "Feature Compass structural obligation: \(snapshot.structuralObligation)"
        ], limit: 5, itemLimit: 220)
        self.emotionalContinuity = Self.clean(snapshot.nextSceneDetail, limit: 280)
        self.pageCount = max(0, pageCount)
        self.targetPages = max(0, targetPages)
    }

    var isEmpty: Bool {
        requestID.isEmpty &&
            act.isEmpty &&
            sceneObjective.isEmpty &&
            sceneSummary.isEmpty &&
            currentBeat.isEmpty &&
            featureSequence.isEmpty &&
            featureObligation.isEmpty &&
            nextScenePlan.isEmpty &&
            nextSceneMoves.isEmpty &&
            continuityNotes.isEmpty &&
            emotionalContinuity.isEmpty &&
            pageCount <= 0 &&
            targetPages <= 0
    }

    private enum CodingKeys: String, CodingKey {
        case requestID
        case projectID
        case versionID
        case submittedPrompt
        case createdAt
        case act
        case sceneObjective
        case sceneSummary
        case currentBeat
        case featureSequence
        case featureObligation
        case nextScenePlan
        case nextSceneMoves
        case continuityNotes
        case emotionalContinuity
        case pageCount
        case targetPages
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.requestID = Self.clean(try container.decodeIfPresent(String.self, forKey: .requestID) ?? "", limit: 160)
        self.projectID = Self.clean(try container.decodeIfPresent(String.self, forKey: .projectID) ?? "", limit: 160)
        self.versionID = Self.clean(try container.decodeIfPresent(String.self, forKey: .versionID) ?? "", limit: 160)
        self.submittedPrompt = Self.clean(try container.decodeIfPresent(String.self, forKey: .submittedPrompt) ?? "", limit: 500)
        self.createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? .distantPast
        self.act = Self.clean(try container.decodeIfPresent(String.self, forKey: .act) ?? "", limit: 120)
        self.sceneObjective = Self.clean(try container.decodeIfPresent(String.self, forKey: .sceneObjective) ?? "", limit: 280)
        self.sceneSummary = Self.clean(try container.decodeIfPresent(String.self, forKey: .sceneSummary) ?? "", limit: 280)
        self.currentBeat = Self.clean(try container.decodeIfPresent(String.self, forKey: .currentBeat) ?? "", limit: 220)
        self.featureSequence = Self.clean(try container.decodeIfPresent(String.self, forKey: .featureSequence) ?? "", limit: 220)
        self.featureObligation = Self.clean(try container.decodeIfPresent(String.self, forKey: .featureObligation) ?? "", limit: 280)
        self.nextScenePlan = Self.clean(try container.decodeIfPresent(String.self, forKey: .nextScenePlan) ?? "", limit: 340)
        self.nextSceneMoves = Self.cleanList(
            try container.decodeIfPresent([String].self, forKey: .nextSceneMoves) ?? [],
            limit: 5,
            itemLimit: 180
        )
        self.continuityNotes = Self.cleanList(
            try container.decodeIfPresent([String].self, forKey: .continuityNotes) ?? [],
            limit: 5,
            itemLimit: 220
        )
        self.emotionalContinuity = Self.clean(try container.decodeIfPresent(String.self, forKey: .emotionalContinuity) ?? "", limit: 280)
        self.pageCount = max(0, try container.decodeIfPresent(Int.self, forKey: .pageCount) ?? 0)
        self.targetPages = max(0, try container.decodeIfPresent(Int.self, forKey: .targetPages) ?? 0)
    }

    private static func clean(_ value: String, limit: Int) -> String {
        let compact = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return String(compact.prefix(max(0, limit)))
    }

    private static func cleanList(_ values: [String], limit: Int, itemLimit: Int) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values {
            let clean = Self.clean(value, limit: itemLimit)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard seen.insert(key).inserted else { continue }
            result.append(clean)
            if result.count >= limit { break }
        }
        return result
    }
}

@MainActor
enum ScreenplayFeatureWorkflowPlanner {
    static func buildSnapshot(
        project: BackendScreenplayProjectSummary?,
        outline: BackendScreenplayOutline,
        structuredDraft: ScreenplayStructuredDraft,
        projectBinding: ScreenplayProjectBindingSnapshot,
        featureSpine: ScreenplayFeatureSpine,
        lastCommittedWrite: ScreenplayCommittedWrite?,
        acceptedPageBatchCount: Int,
        currentCursorLine: Int,
        draftText: String
    ) -> ScreenplayFeatureWorkflowSnapshot {
        let sortedActs = outline.acts.sorted(by: orderedActs)
        let sortedScenes = outline.scenes.sorted(by: orderedScenes)
        let sortedBeats = outline.beats.sorted(by: orderedBeats)
        let currentDraftScene = structuredDraft.scenes.last { $0.line <= max(1, currentCursorLine) }
        let currentBinding = currentDraftScene.flatMap { draftScene in
            projectBinding.sceneBindings.first(where: { $0.draftSceneID == draftScene.id })
        }
        let currentOutlineScene = currentBinding?.outlineSceneID.flatMap { sceneID in
            sortedScenes.first(where: { $0.id == sceneID })
        }

        let currentAct = resolveCurrentAct(
            sortedActs: sortedActs,
            currentOutlineScene: currentOutlineScene,
            currentBinding: currentBinding,
            featureSpine: featureSpine,
            currentCursorLine: currentCursorLine,
            lineCount: max(structuredDraft.lineCount, lineCount(in: draftText))
        )
        let nextScene = resolveNextScene(
            sortedScenes: sortedScenes,
            currentOutlineScene: currentOutlineScene,
            currentAct: currentAct.act,
            currentBinding: currentBinding,
            projectBinding: projectBinding
        )
        let nextBeat = resolveNextBeat(
            sortedBeats: sortedBeats,
            nextScene: nextScene,
            currentAct: currentAct.act,
            currentOutlineScene: currentOutlineScene
        )
        let structuralObligation = resolveStructuralObligation(
            currentActTitle: currentAct.title,
            featureSpine: featureSpine,
            nextScene: nextScene,
            nextBeat: nextBeat
        )
        let continuityAnchors = makeContinuityAnchors(project: project, featureSpine: featureSpine)
        let nextSceneTitle = sceneTitle(nextScene)
        let nextSceneDetail = sceneDetail(nextScene, fallback: currentDraftScene?.shortLabel ?? "")
        let actDetail = currentAct.detail.isEmpty ? structuralObligation : currentAct.detail
        let draftProgressLabel = draftProgress(lineCount: max(structuredDraft.lineCount, lineCount(in: draftText)))
        let acceptedBatch = acceptedBatchSummary(
            lastCommittedWrite: lastCommittedWrite,
            acceptedPageBatchCount: acceptedPageBatchCount
        )

        let pageWritePrompt = buildPageWritePrompt(
            projectTitle: project?.title ?? "",
            actTitle: currentAct.title,
            nextSceneTitle: nextSceneTitle,
            nextSceneDetail: nextSceneDetail,
            structuralObligation: structuralObligation,
            continuityAnchors: continuityAnchors,
            moveTitle: "Continue the feature"
        )
        let planningPrompt = buildPlanningPrompt(
            actTitle: currentAct.title,
            nextSceneTitle: nextSceneTitle,
            nextSceneDetail: nextSceneDetail,
            structuralObligation: structuralObligation,
            continuityAnchors: continuityAnchors
        )
        let sceneDoctorPrompt = buildSceneDoctorPrompt(
            actTitle: currentAct.title,
            nextSceneTitle: nextSceneTitle,
            nextSceneDetail: nextSceneDetail,
            structuralObligation: structuralObligation,
            continuityAnchors: continuityAnchors
        )
        let moves = buildMoves(
            actTitle: currentAct.title,
            nextScene: nextScene,
            nextBeat: nextBeat,
            fallbackSceneTitle: nextSceneTitle,
            fallbackSceneDetail: nextSceneDetail,
            structuralObligation: structuralObligation,
            continuityAnchors: continuityAnchors
        )

        return ScreenplayFeatureWorkflowSnapshot(
            currentActTitle: currentAct.title,
            currentActDetail: actDetail,
            actProgressLabel: currentAct.progressLabel,
            draftProgressLabel: draftProgressLabel,
            acceptedBatchTitle: acceptedBatch.title,
            acceptedBatchDetail: acceptedBatch.detail,
            acceptedBatchLineRange: acceptedBatch.lineRange,
            structuralObligation: structuralObligation,
            nextSceneTitle: nextSceneTitle,
            nextSceneDetail: nextSceneDetail,
            nextMoves: moves,
            pageWritePrompt: pageWritePrompt,
            planningPrompt: planningPrompt,
            sceneDoctorPrompt: sceneDoctorPrompt
        )
    }

    static func shouldElevateContinuationPrompt(_ rawPrompt: String) -> Bool {
        let prompt = clean(rawPrompt, fallback: "")
        guard !prompt.isEmpty else { return false }
        guard prompt.count <= 180 else { return false }

        let normalized = normalizedPrompt(prompt)
        guard !normalized.isEmpty else { return false }

        if prompt.contains("Clementine standard") ||
            prompt.contains("Feature workflow context") ||
            prompt.contains("Continuity anchors:") {
            return false
        }

        let excludedTerms = [
            "rewrite",
            "revise",
            "polish",
            "punch up",
            "scene doctor",
            "doctor",
            "analyze",
            "outline",
            "plan",
            "feedback",
            "notes"
        ]
        if excludedTerms.contains(where: { normalized.contains($0) }) {
            return false
        }

        let exactPrompts = Set([
            "continue",
            "continue from here",
            "continue the script",
            "continue the screenplay",
            "continue the feature",
            "go on",
            "keep going",
            "keep writing",
            "more",
            "next",
            "next scene",
            "next pages",
            "write more",
            "write next",
            "write next pages",
            "write the next pages",
            "write next scene",
            "write the next scene",
            "finish the scene",
            "finish this scene",
            "take it from here"
        ])
        if exactPrompts.contains(normalized) {
            return true
        }

        let words = normalized.split(separator: " ")
        guard words.count <= 9 else { return false }

        let hasContinuationCue = [
            "continue",
            "next",
            "more",
            "finish",
            "extend"
        ].contains { normalized.contains($0) }
        let hasPageCue = [
            "scene",
            "pages",
            "script",
            "screenplay",
            "feature",
            "draft",
            "act"
        ].contains { normalized.contains($0) }

        return hasContinuationCue && (hasPageCue || words.count <= 4)
    }

    static func enrichedContinuationPrompt(
        for rawPrompt: String,
        snapshot: ScreenplayFeatureWorkflowSnapshot,
        recentStudioContext: [String] = []
    ) -> String? {
        let prompt = clean(rawPrompt, fallback: "")
        guard shouldElevateContinuationPrompt(prompt) else { return nil }
        let restoredStudioContext = cleanContextList(recentStudioContext, limit: 5, itemLimit: 220)

        var lines: [String] = [
            snapshot.pageWritePrompt,
            "",
            "Feature workflow context:",
            "- Writer's immediate direction: \(prompt)",
            "- Current feature position: \(snapshot.currentActTitle) (\(snapshot.actProgressLabel)); \(snapshot.draftProgressLabel).",
            "- Latest accepted page batch: \(snapshot.acceptedBatchDetail)",
            "- Next required scene: \(snapshot.nextSceneTitle).",
            "- Required pressure: \(snapshot.nextSceneDetail)",
            "",
            "Use this as a feature continuation, not a generic response. Pick up at the current insertion point, preserve emotional tone continuity, honor accepted pages, and write the next 3-5 pages as finished Fountain screenplay pages."
        ]

        let nextMoves = snapshot.nextMoves.prefix(3).map { "\($0.title): \($0.detail)" }
        if !nextMoves.isEmpty {
            lines.insert("", at: lines.count - 1)
            lines.insert("Next story turns:", at: lines.count - 1)
            lines.insert(contentsOf: nextMoves.map { "- \($0)" }, at: lines.count - 1)
        }

        if !restoredStudioContext.isEmpty {
            lines.insert("", at: lines.count - 1)
            lines.insert("Restored Studio memory:", at: lines.count - 1)
            lines.insert(contentsOf: restoredStudioContext.map { "- \($0)" }, at: lines.count - 1)
        }

        return lines.joined(separator: "\n")
    }

    private static func cleanContextList(_ values: [String], limit: Int, itemLimit: Int) -> [String] {
        var seen = Set<String>()
        var result: [String] = []
        for value in values {
            let clean = clean(value, fallback: "")
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !clean.isEmpty else { continue }
            let clipped = String(clean.prefix(max(0, itemLimit)))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let key = clipped.lowercased()
            guard !clipped.isEmpty, seen.insert(key).inserted else { continue }
            result.append(clipped)
            if result.count >= limit { break }
        }
        return result
    }

    private static func orderedActs(_ lhs: BackendScreenplayAct, _ rhs: BackendScreenplayAct) -> Bool {
        let lhsOrder = lhs.order ?? Int.max
        let rhsOrder = rhs.order ?? Int.max
        if lhsOrder == rhsOrder { return lhs.title < rhs.title }
        return lhsOrder < rhsOrder
    }

    private static func orderedScenes(_ lhs: BackendScreenplayScene, _ rhs: BackendScreenplayScene) -> Bool {
        let lhsOrder = lhs.order ?? Int.max
        let rhsOrder = rhs.order ?? Int.max
        if lhsOrder == rhsOrder { return sceneTitle(lhs) < sceneTitle(rhs) }
        return lhsOrder < rhsOrder
    }

    private static func orderedBeats(_ lhs: BackendScreenplayBeat, _ rhs: BackendScreenplayBeat) -> Bool {
        let lhsOrder = lhs.order ?? Int.max
        let rhsOrder = rhs.order ?? Int.max
        if lhsOrder == rhsOrder { return lhs.label < rhs.label }
        return lhsOrder < rhsOrder
    }

    private static func resolveCurrentAct(
        sortedActs: [BackendScreenplayAct],
        currentOutlineScene: BackendScreenplayScene?,
        currentBinding: ScreenplayProjectSceneBindingSnapshot?,
        featureSpine: ScreenplayFeatureSpine,
        currentCursorLine: Int,
        lineCount: Int
    ) -> (act: BackendScreenplayAct?, title: String, detail: String, progressLabel: String) {
        if let currentOutlineScene,
           let act = sortedActs.first(where: { $0.id == currentOutlineScene.actId }) {
            let title = clean(act.title, fallback: "Feature")
            let detail = clean(act.summary ?? "", fallback: "")
            let progress = progressLabelForAct(act: act, currentSceneID: currentOutlineScene.id, sortedActs: sortedActs)
            return (act, title, detail, progress)
        }

        if let bindingActTitle = currentBinding?.actTitle,
           !clean(bindingActTitle, fallback: "").isEmpty {
            let title = clean(bindingActTitle, fallback: "Feature")
            let act = sortedActs.first(where: { clean($0.title, fallback: "").caseInsensitiveCompare(title) == .orderedSame })
            let progress = act.map { progressLabelForAct(act: $0, currentSceneID: currentOutlineScene?.id, sortedActs: sortedActs) }
                ?? cursorProgressLabel(currentCursorLine: currentCursorLine, lineCount: lineCount)
            return (act, title, clean(act?.summary ?? "", fallback: ""), progress)
        }

        let spineAct = clean(featureSpine.actPosition, fallback: "")
        if !spineAct.isEmpty {
            let act = sortedActs.first(where: { clean($0.title, fallback: "").caseInsensitiveCompare(spineAct) == .orderedSame })
            return (
                act,
                spineAct,
                clean(act?.summary ?? "", fallback: ""),
                act.map { progressLabelForAct(act: $0, currentSceneID: nil, sortedActs: sortedActs) }
                    ?? cursorProgressLabel(currentCursorLine: currentCursorLine, lineCount: lineCount)
            )
        }

        let inferred = inferredActTitle(currentCursorLine: currentCursorLine, lineCount: lineCount)
        let inferredAct = sortedActs.first(where: { clean($0.title, fallback: "").localizedCaseInsensitiveContains(inferred) })
        return (
            inferredAct,
            inferredAct.map { clean($0.title, fallback: inferred) } ?? inferred,
            clean(inferredAct?.summary ?? "", fallback: ""),
            inferredAct.map { progressLabelForAct(act: $0, currentSceneID: nil, sortedActs: sortedActs) }
                ?? cursorProgressLabel(currentCursorLine: currentCursorLine, lineCount: lineCount)
        )
    }

    private static func resolveNextScene(
        sortedScenes: [BackendScreenplayScene],
        currentOutlineScene: BackendScreenplayScene?,
        currentAct: BackendScreenplayAct?,
        currentBinding: ScreenplayProjectSceneBindingSnapshot?,
        projectBinding: ScreenplayProjectBindingSnapshot
    ) -> BackendScreenplayScene? {
        if let currentOutlineScene,
           let currentIndex = sortedScenes.firstIndex(where: { $0.id == currentOutlineScene.id }),
           sortedScenes.indices.contains(currentIndex + 1) {
            return sortedScenes[currentIndex + 1]
        }

        let boundOutlineSceneIDs = Set(
            projectBinding.sceneBindings.compactMap { binding -> String? in
                let sceneID = (binding.outlineSceneID ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                return sceneID.isEmpty ? nil : sceneID
            }
        )
        if let unrenderedScene = sortedScenes.first(where: { !boundOutlineSceneIDs.contains($0.id) }) {
            return unrenderedScene
        }

        if let currentAct {
            let actSceneIDs = Set(currentAct.sceneIds ?? [])
            if let scene = sortedScenes.first(where: { $0.actId == currentAct.id || actSceneIDs.contains($0.id) }) {
                return scene
            }
        }

        if let bindingSceneID = currentBinding?.outlineSceneID,
           let scene = sortedScenes.first(where: { $0.id == bindingSceneID }) {
            return scene
        }

        return sortedScenes.first
    }

    private static func resolveNextBeat(
        sortedBeats: [BackendScreenplayBeat],
        nextScene: BackendScreenplayScene?,
        currentAct: BackendScreenplayAct?,
        currentOutlineScene: BackendScreenplayScene?
    ) -> BackendScreenplayBeat? {
        if let nextScene {
            let sceneBeatIDs = Set(nextScene.beatIds ?? [])
            if let beat = sortedBeats.first(where: { $0.sceneId == nextScene.id || sceneBeatIDs.contains($0.id) }) {
                return beat
            }
        }

        if let currentAct,
           let beat = sortedBeats.first(where: { $0.actId == currentAct.id }) {
            return beat
        }

        if let currentOutlineScene,
           let currentIndex = sortedBeats.firstIndex(where: { $0.sceneId == currentOutlineScene.id }),
           sortedBeats.indices.contains(currentIndex + 1) {
            return sortedBeats[currentIndex + 1]
        }

        return sortedBeats.first
    }

    private static func buildMoves(
        actTitle: String,
        nextScene: BackendScreenplayScene?,
        nextBeat: BackendScreenplayBeat?,
        fallbackSceneTitle: String,
        fallbackSceneDetail: String,
        structuralObligation: String,
        continuityAnchors: [String]
    ) -> [ScreenplayFeatureWorkflowMove] {
        let sceneMove = ScreenplayFeatureWorkflowMove(
            id: "next-scene",
            title: "Write \(fallbackSceneTitle)",
            detail: fallbackSceneDetail,
            prompt: buildPageWritePrompt(
                projectTitle: "",
                actTitle: actTitle,
                nextSceneTitle: fallbackSceneTitle,
                nextSceneDetail: fallbackSceneDetail,
                structuralObligation: structuralObligation,
                continuityAnchors: continuityAnchors,
                moveTitle: "Write the next scene"
            )
        )

        let beatTitle = nextBeat.map { clean($0.label, fallback: "the next story turn") } ?? "the next story turn"
        let beatDetail = nextBeat.flatMap { clean($0.summary ?? "", fallback: "") }
            ?? "Turn the character pressure into a visible choice or reversal."
        let beatMove = ScreenplayFeatureWorkflowMove(
            id: "next-beat",
            title: "Pay off \(beatTitle)",
            detail: beatDetail,
            prompt: buildPageWritePrompt(
                projectTitle: "",
                actTitle: actTitle,
                nextSceneTitle: fallbackSceneTitle,
                nextSceneDetail: "Beat target: \(beatTitle). \(beatDetail)",
                structuralObligation: structuralObligation,
                continuityAnchors: continuityAnchors,
                moveTitle: "Write the next beat"
            )
        )

        let turnMove = ScreenplayFeatureWorkflowMove(
            id: "act-turn",
            title: "Sharpen the act turn",
            detail: structuralObligation,
            prompt: buildPageWritePrompt(
                projectTitle: "",
                actTitle: actTitle,
                nextSceneTitle: fallbackSceneTitle,
                nextSceneDetail: fallbackSceneDetail,
                structuralObligation: structuralObligation,
                continuityAnchors: continuityAnchors,
                moveTitle: "Write toward the act turn"
            )
        )

        return [sceneMove, beatMove, turnMove]
    }

    private static func buildPageWritePrompt(
        projectTitle: String,
        actTitle: String,
        nextSceneTitle: String,
        nextSceneDetail: String,
        structuralObligation: String,
        continuityAnchors: [String],
        moveTitle: String
    ) -> String {
        var lines: [String] = [
            "\(moveTitle) as feature-film screenplay pages.",
            "",
            "Write 3-5 pages in Fountain format only. Continue directly from the current draft position; do not summarize, do not ask permission, and do not include notes.",
            "Current act: \(actTitle)",
            "Scene target: \(nextSceneTitle)",
            "Scene pressure: \(nextSceneDetail)",
            "Structural obligation: \(structuralObligation)"
        ]
        let cleanProjectTitle = clean(projectTitle, fallback: "")
        if !cleanProjectTitle.isEmpty {
            lines.insert("Project: \(cleanProjectTitle)", at: 3)
        }
        if !continuityAnchors.isEmpty {
            lines.append("")
            lines.append("Continuity anchors:")
            lines.append(contentsOf: continuityAnchors.map { "- \($0)" })
        }
        lines.append("")
        lines.append("Feature Compass:")
        lines.append("- Silent preflight: lock act, sequence, scene job, protagonist want/need, emotional handoff, open setup, exit turn, and final-image pressure.")
        lines.append("- Scene-to-feature loop: satisfy the local scene objective while changing the whole movie's pressure.")
        lines.append("- Page quality gate: no placeholder scenes, generic banter, prose summary, or invented deus-ex-machina information; use visual action, conflict, subtext, and consequence.")
        lines.append("")
        lines.append("Clementine standard: elite feature screenwriting, playable behavior, sharp dialogue, emotional continuity, visual action, no generic prose.")
        return lines.joined(separator: "\n")
    }

    private static func buildPlanningPrompt(
        actTitle: String,
        nextSceneTitle: String,
        nextSceneDetail: String,
        structuralObligation: String,
        continuityAnchors: [String]
    ) -> String {
        var lines: [String] = [
            "Plan the next three screenplay turns for this feature.",
            "",
            "Current act: \(actTitle)",
            "Next scene: \(nextSceneTitle)",
            "Scene pressure: \(nextSceneDetail)",
            "Structural obligation: \(structuralObligation)",
            "",
            "Give exactly three turns. For each: dramatic purpose, character pressure, page action, and what it sets up or pays off. Do not write screenplay pages yet."
        ]
        if !continuityAnchors.isEmpty {
            lines.append("")
            lines.append("Continuity anchors:")
            lines.append(contentsOf: continuityAnchors.map { "- \($0)" })
        }
        return lines.joined(separator: "\n")
    }

    private static func buildSceneDoctorPrompt(
        actTitle: String,
        nextSceneTitle: String,
        nextSceneDetail: String,
        structuralObligation: String,
        continuityAnchors: [String]
    ) -> String {
        var lines: [String] = [
            "Scene doctor the current feature-film section.",
            "",
            "Current act: \(actTitle)",
            "Active/next scene: \(nextSceneTitle)",
            "Scene pressure: \(nextSceneDetail)",
            "Structural obligation: \(structuralObligation)",
            "",
            "Give concise, specific notes on want, conflict, subtext, act movement, emotional continuity, pacing, and the next page-level fix. Do not write screenplay pages unless asked."
        ]
        if !continuityAnchors.isEmpty {
            lines.append("")
            lines.append("Continuity anchors:")
            lines.append(contentsOf: continuityAnchors.map { "- \($0)" })
        }
        return lines.joined(separator: "\n")
    }

    private static func resolveStructuralObligation(
        currentActTitle: String,
        featureSpine: ScreenplayFeatureSpine,
        nextScene: BackendScreenplayScene?,
        nextBeat: BackendScreenplayBeat?
    ) -> String {
        let beatSummary = clean(nextBeat?.summary ?? "", fallback: "")
        if !beatSummary.isEmpty {
            return "Make the next beat change the story: \(beatSummary)"
        }

        let objective = clean(nextScene?.objective ?? "", fallback: "")
        if !objective.isEmpty {
            return "Play the scene objective on screen: \(objective)"
        }

        let title = currentActTitle.lowercased()
        if title.contains("act i") || title.contains("act 1") || title.contains("one") {
            return "Force the protagonist into a choice that makes Act II unavoidable."
        }
        if title.contains("act ii") || title.contains("act 2") || title.contains("two") {
            return "Escalate the central pressure and turn the midpoint into irreversible fallout."
        }
        if title.contains("act iii") || title.contains("act 3") || title.contains("three") {
            let ending = clean(featureSpine.endingImage, fallback: "")
            if !ending.isEmpty {
                return "Drive the final choice toward the ending image: \(ending)"
            }
            return "Force the final choice and land the emotional resolution."
        }

        let question = clean(featureSpine.centralQuestion, fallback: "")
        if !question.isEmpty {
            return "Keep testing the central question: \(question)"
        }
        return "Clarify what changes next and make the change visible on the page."
    }

    private static func makeContinuityAnchors(
        project: BackendScreenplayProjectSummary?,
        featureSpine: ScreenplayFeatureSpine
    ) -> [String] {
        let logline = clean(project?.logline ?? featureSpine.logline, fallback: "")
        let theme = clean(project?.themeArgument ?? featureSpine.themeArgument, fallback: "")
        let want = clean(project?.protagonistWant ?? featureSpine.protagonistWant, fallback: "")
        let need = clean(project?.protagonistNeed ?? featureSpine.protagonistNeed, fallback: "")
        let opposition = clean(project?.antagonisticForce ?? featureSpine.antagonisticForce, fallback: "")

        var anchors: [String] = []
        if !logline.isEmpty { anchors.append("Logline: \(logline)") }
        if !theme.isEmpty { anchors.append("Theme: \(theme)") }
        if !want.isEmpty { anchors.append("Want: \(want)") }
        if !need.isEmpty { anchors.append("Need: \(need)") }
        if !opposition.isEmpty { anchors.append("Opposition: \(opposition)") }
        return Array(anchors.prefix(5))
    }

    private static func progressLabelForAct(
        act: BackendScreenplayAct,
        currentSceneID: String?,
        sortedActs: [BackendScreenplayAct]
    ) -> String {
        let actIndex = sortedActs.firstIndex(where: { $0.id == act.id }).map { $0 + 1 } ?? 1
        let sceneIDs = act.sceneIds ?? []
        guard !sceneIDs.isEmpty else { return "Act \(actIndex) on deck" }
        if let currentSceneID,
           let sceneIndex = sceneIDs.firstIndex(of: currentSceneID) {
            return "Scene \(sceneIndex + 1)/\(sceneIDs.count)"
        }
        return "\(sceneIDs.count) scene\(sceneIDs.count == 1 ? "" : "s") mapped"
    }

    private static func cursorProgressLabel(currentCursorLine: Int, lineCount: Int) -> String {
        guard lineCount > 0 else { return "No pages yet" }
        let safeLine = max(1, min(currentCursorLine, lineCount))
        return "Line \(safeLine)/\(lineCount)"
    }

    private static func draftProgress(lineCount: Int) -> String {
        guard lineCount > 0 else { return "No draft pages" }
        let estimatedPages = max(1, Int(ceil(Double(lineCount) / 55.0)))
        return "\(estimatedPages) page\(estimatedPages == 1 ? "" : "s") drafted"
    }

    private static func acceptedBatchSummary(
        lastCommittedWrite: ScreenplayCommittedWrite?,
        acceptedPageBatchCount: Int
    ) -> (title: String, detail: String, lineRange: ClosedRange<Int>?) {
        let batchTitle: String
        if acceptedPageBatchCount <= 0 {
            batchTitle = "No accepted batches"
        } else if acceptedPageBatchCount == 1 {
            batchTitle = "1 accepted batch"
        } else {
            batchTitle = "\(acceptedPageBatchCount) accepted batches"
        }

        guard let lastCommittedWrite else {
            return (
                batchTitle,
                acceptedPageBatchCount > 0
                    ? "Open the thread to review accepted page writes."
                    : "Write or accept a page batch and it will stay reviewable here.",
                nil
            )
        }

        let insertedLineCount = lineCount(in: lastCommittedWrite.insertedText)
        let range = max(1, lastCommittedWrite.startLine)...max(max(1, lastCommittedWrite.startLine), lastCommittedWrite.endLine)
        let writeID = lastCommittedWrite.normalizedWriteID
        let suffix = writeID.isEmpty ? "" : " · \(String(writeID.prefix(8)).uppercased())"
        return (
            batchTitle,
            "Latest: L\(range.lowerBound)-L\(range.upperBound), \(insertedLineCount) line\(insertedLineCount == 1 ? "" : "s")\(suffix)",
            range
        )
    }

    private static func inferredActTitle(currentCursorLine: Int, lineCount: Int) -> String {
        guard lineCount > 0 else { return "Act I" }
        let ratio = Double(max(1, currentCursorLine)) / Double(max(1, lineCount))
        if ratio < 0.25 { return "Act I" }
        if ratio < 0.78 { return "Act II" }
        return "Act III"
    }

    private static func sceneTitle(_ scene: BackendScreenplayScene?) -> String {
        guard let scene else { return "the next scene" }
        let slugline = clean(scene.slugline ?? "", fallback: "")
        if !slugline.isEmpty { return slugline }
        return clean(scene.title, fallback: "the next scene")
    }

    private static func sceneDetail(_ scene: BackendScreenplayScene?, fallback: String) -> String {
        guard let scene else {
            return clean(fallback, fallback: "Continue the unfinished page with a concrete emotional turn.")
        }
        let objective = clean(scene.objective ?? "", fallback: "")
        if !objective.isEmpty { return objective }
        let summary = clean(scene.summary ?? "", fallback: "")
        if !summary.isEmpty { return summary }
        return "Make the scene change the story, not just continue the conversation."
    }

    private static func lineCount(in text: String) -> Int {
        let cleanText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanText.isEmpty else { return 0 }
        return cleanText.components(separatedBy: .newlines).count
    }

    private static func clean(_ value: String, fallback: String) -> String {
        let trimmed = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        return trimmed.isEmpty ? fallback : trimmed
    }

    private static func normalizedPrompt(_ value: String) -> String {
        value
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}
