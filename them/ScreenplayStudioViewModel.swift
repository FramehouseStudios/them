import SwiftUI
import ScreenplayStudio
import Combine

nonisolated struct ScreenplayCraftCoverageSnapshot: Equatable {
    let draft: String
    let frameworkId: String?

    init(draft: String, frameworkId: String?) {
        self.draft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanFrameworkId = frameworkId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.frameworkId = cleanFrameworkId.isEmpty ? nil : cleanFrameworkId
    }

    func matches(draft: String, frameworkId: String?) -> Bool {
        self == ScreenplayCraftCoverageSnapshot(draft: draft, frameworkId: frameworkId)
    }
}


#if DEBUG || os(macOS)
struct StudioDebugVoiceRenderStatusSnapshot: Decodable {
    let renderRequestID: String?
    let renderServerFirstDeltaMs: Int?
    let renderServerTotalMs: Int?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case renderRequestID
        case renderServerFirstDeltaMs
        case renderServerTotalMs
        case status
    }
}
#endif

enum StudioMoveDirection {
    case up
    case down
    case left
    case right
}

enum InspectorReorderDirection {
    case up
    case down
}

enum InspectorAutoScrollDirection {
    case up
    case down
}

struct InspectorAutoScrollRequest {
    let anchorID: String
    let anchor: UnitPoint
    let direction: InspectorAutoScrollDirection
}

struct StudioInspectorWorkspaceState: Codable {
    let rightPanelTabRaw: String
    let selectedInspectorSectionRaw: String
    let selectedBeatID: String
    let beatOrderIDs: [String]
    let highlightedSceneInspectorKey: String
    let editingBeatID: String
    let beatLabel: String
    let beatSummary: String
    let beatSceneID: String
    let beatActID: String
    let beatDraftProvenanceRaw: String
}

enum BeatProvenanceSource: String, Codable, Equatable {
    case selection
    case currentScene = "current_scene"
    case manual

    var title: String {
        switch self {
        case .selection:
            return "Selection"
        case .currentScene:
            return "Current Scene"
        case .manual:
            return "Manual"
        }

    }

    var compactTitle: String {
        switch self {
        case .selection:
            return "From Selection"
        case .currentScene:
            return "From Scene"
        case .manual:
            return "Manual"
        }
    }

    var tint: Color {
        switch self {
        case .selection:
            return Color.blue.opacity(0.78)
        case .currentScene:
            return Color.orange.opacity(0.82)
        case .manual:
            return Color.herText.opacity(0.68)
        }
    }
}

struct BeatProvenanceHistoryEntry: Codable, Equatable {
    let createdFromRaw: String
    let createdAt: TimeInterval
    let lastRefreshedFromRaw: String
    let lastRefreshedAt: TimeInterval

    var createdFrom: BeatProvenanceSource {
        BeatProvenanceSource(rawValue: createdFromRaw) ?? .manual
    }

    var lastRefreshedFrom: BeatProvenanceSource {
        BeatProvenanceSource(rawValue: lastRefreshedFromRaw) ?? createdFrom
    }
}

struct BeatQuickCaptureSeed {
    let label: String
    let summary: String
    let sceneID: String
    let actID: String
    let infoText: String
    let provenance: BeatProvenanceSource
}

struct BeatQuickLinkTarget: Identifiable, Equatable {
    let id: String
    let title: String
    let subtitle: String
    let sceneID: String
    let actID: String
}

enum BeatQuickCaptureSeedPlanner {
    static func makeSelectionSeed(
        selection: ScreenplayEditorSelectionSnapshot,
        linkedScene: BackendScreenplayScene?
    ) -> BeatQuickCaptureSeed? {
        guard selection.hasSelection else { return nil }
        let summary = selection.trimmedText
        guard !summary.isEmpty else { return nil }
        let sceneLabel = selection.sceneLabel
            ?? linkedScene.map { compactBeatSceneLabel($0.slugline?.isEmpty == false ? $0.slugline! : $0.title) }
        return BeatQuickCaptureSeed(
            label: makeLabel(from: summary, sceneLabel: sceneLabel),
            summary: String(summary.prefix(280)),
            sceneID: linkedScene?.id ?? "",
            actID: (linkedScene?.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            infoText: "Created a beat from the selected block.",
            provenance: .selection
        )
    }

    static func makeCurrentSceneSeed(scene: BackendScreenplayScene) -> BeatQuickCaptureSeed {
        let sceneLabel = compactBeatSceneLabel(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title)
        let summarySource = [
            scene.objective?.trimmingCharacters(in: .whitespacesAndNewlines),
            scene.summary?.trimmingCharacters(in: .whitespacesAndNewlines),
            scene.slugline?.trimmingCharacters(in: .whitespacesAndNewlines),
            scene.title.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
            .compactMap { $0 }
            .first(where: { !$0.isEmpty }) ?? "The next turn inside \(sceneLabel)."
        return BeatQuickCaptureSeed(
            label: makeLabel(from: summarySource, sceneLabel: sceneLabel),
            summary: String(summarySource.prefix(280)),
            sceneID: scene.id,
            actID: (scene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
            infoText: "Created a beat from \(sceneLabel).",
            provenance: .currentScene
        )
    }

    static func makeLabel(from text: String, sceneLabel: String?) -> String {
        let normalized = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        if !normalized.isEmpty {
            let words = normalized.split(separator: " ")
            let prefix = words.prefix(6).joined(separator: " ")
            let clean = prefix.trimmingCharacters(in: .whitespacesAndNewlines)
            if !clean.isEmpty {
                return String(clean.prefix(72))
            }
        }
        let fallback = (sceneLabel ?? "Story beat")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return fallback.isEmpty ? "Story beat" : "Beat: \(fallback)"
    }
}

struct BeatQuickCaptureDraftState: Equatable {
    let editingBeatID: String
    let label: String
    let summary: String
    let sceneID: String
    let actID: String

    var cleanEditingBeatID: String {
        editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var hasNoActiveDraft: Bool {
        cleanEditingBeatID.isEmpty &&
            label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            sceneID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
            actID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

enum BeatQuickCaptureActionPlanner {
    static func selectedBeat(
        selectedBeatID: String,
        editingBeatID: String,
        beats: [BackendScreenplayBeat]
    ) -> BackendScreenplayBeat? {
        let selectedID = selectedBeatID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !selectedID.isEmpty,
           let selected = beats.first(where: { $0.id == selectedID }) {
            return selected
        }
        let editingID = editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !editingID.isEmpty else { return nil }
        return beats.first(where: { $0.id == editingID })
    }

    static func updateSubtitle(for beat: BackendScreenplayBeat?) -> String {
        let fallback = "Refresh the selected beat from the active page block."
        guard let beat else { return fallback }
        let label = beat.label.trimmingCharacters(in: .whitespacesAndNewlines)
        return label.isEmpty ? fallback : "Refresh \(label) from the active page block."
    }

    static func canCreateImmediately(draft: BeatQuickCaptureDraftState) -> Bool {
        draft.hasNoActiveDraft
    }

    static func canUpdateImmediately(
        beatID: String,
        draft: BeatQuickCaptureDraftState
    ) -> Bool {
        if draft.cleanEditingBeatID == beatID { return true }
        return draft.hasNoActiveDraft
    }
}

struct BeatQuickCaptureOutlineMutation {
    let beat: BackendScreenplayBeat
    let outline: BackendScreenplayOutline
}

enum BeatQuickCaptureMutationPlanner {
    static func appending(
        seed: BeatQuickCaptureSeed,
        to outline: BackendScreenplayOutline,
        beatID: String,
        timestamp: TimeInterval
    ) -> BeatQuickCaptureOutlineMutation {
        let orderedBeats = sortedBeats(outline.beats)
        let sceneID = cleanID(seed.sceneID)
        let actID = cleanID(seed.actID)
        let beat = BackendScreenplayBeat(
            id: beatID,
            label: seed.label,
            summary: seed.summary,
            sceneId: sceneID.isEmpty ? nil : sceneID,
            actId: actID.isEmpty ? nil : actID,
            order: orderedBeats.count,
            status: "open",
            createdAt: timestamp,
            updatedAt: timestamp
        )
        let beats = orderedBeats + [beat]
        let scenes = relinkedScenes(
            outline.scenes,
            beatID: beat.id,
            targetSceneID: sceneID
        )
        return BeatQuickCaptureOutlineMutation(
            beat: beat,
            outline: rebuiltOutline(
                from: outline,
                scenes: scenes,
                beats: beats,
                actCount: outline.acts.count,
                timestamp: timestamp
            )
        )
    }

    static func updating(
        beatID: String,
        from seed: BeatQuickCaptureSeed,
        in outline: BackendScreenplayOutline,
        timestamp: TimeInterval
    ) -> BeatQuickCaptureOutlineMutation? {
        let orderedBeats = sortedBeats(outline.beats)
        guard let existingBeat = orderedBeats.first(where: { $0.id == beatID }) else {
            return nil
        }

        let seedSceneID = cleanID(seed.sceneID)
        let seedActID = cleanID(seed.actID)
        let label = existingBeat.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? seed.label
            : existingBeat.label
        let beat = BackendScreenplayBeat(
            id: existingBeat.id,
            label: label,
            summary: seed.summary,
            sceneId: seedSceneID.isEmpty ? existingBeat.sceneId : seedSceneID,
            actId: seedActID.isEmpty ? existingBeat.actId : seedActID,
            order: existingBeat.order,
            status: existingBeat.status,
            createdAt: existingBeat.createdAt,
            updatedAt: timestamp
        )
        let beats = orderedBeats.map { $0.id == beat.id ? beat : $0 }
        let targetSceneID = cleanID(beat.sceneId ?? "")
        let scenes = relinkedScenes(
            outline.scenes,
            beatID: beat.id,
            targetSceneID: targetSceneID
        )
        return BeatQuickCaptureOutlineMutation(
            beat: beat,
            outline: rebuiltOutline(
                from: outline,
                scenes: scenes,
                beats: beats,
                actCount: outline.actCount,
                timestamp: timestamp
            )
        )
    }

    private static func sortedBeats(_ beats: [BackendScreenplayBeat]) -> [BackendScreenplayBeat] {
        beats.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder == rhsOrder { return $0.label < $1.label }
            return lhsOrder < rhsOrder
        }
    }

    private static func relinkedScenes(
        _ scenes: [BackendScreenplayScene],
        beatID: String,
        targetSceneID: String
    ) -> [BackendScreenplayScene] {
        scenes.map { scene in
            var beatIDs = scene.beatIds ?? []
            if !targetSceneID.isEmpty, scene.id == targetSceneID {
                if !beatIDs.contains(beatID) {
                    beatIDs.append(beatID)
                }
            } else {
                beatIDs.removeAll { $0 == beatID }
            }
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: scene.order,
                status: scene.status,
                beatIds: beatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
    }

    private static func rebuiltOutline(
        from outline: BackendScreenplayOutline,
        scenes: [BackendScreenplayScene],
        beats: [BackendScreenplayBeat],
        actCount: Int?,
        timestamp: TimeInterval
    ) -> BackendScreenplayOutline {
        BackendScreenplayOutline(
            updatedAt: timestamp,
            actCount: actCount,
            sceneCount: scenes.count,
            beatCount: beats.count,
            acts: rebuiltActs(outline.acts, scenes: scenes),
            scenes: scenes,
            beats: beats
        )
    }

    private static func rebuiltActs(
        _ acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene]
    ) -> [BackendScreenplayAct] {
        acts.enumerated().map { index, act in
            let sceneIDs = scenes
                .filter { ($0.actId ?? "") == act.id }
                .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
                .map(\.id)
            return BackendScreenplayAct(
                id: act.id,
                title: act.title,
                summary: act.summary,
                order: act.order ?? index,
                sceneIds: sceneIDs,
                createdAt: act.createdAt,
                updatedAt: act.updatedAt
            )
        }
    }

    private static func cleanID(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

enum InspectorOrderDestination {
    case oneStep(InspectorReorderDirection)
    case beginning
    case end
    case before(String)
}

struct BeatOrderMutation {
    let beats: [BackendScreenplayBeat]
    let scenes: [BackendScreenplayScene]
}

enum BeatOrderMutationPlanner {
    static func moving(
        beatID: String,
        to destination: InspectorOrderDestination,
        in outline: BackendScreenplayOutline
    ) -> BeatOrderMutation? {
        var beats = InspectorOrderSupport.sortedBeats(outline.beats)
        guard let sourceIndex = beats.firstIndex(where: { $0.id == beatID }) else { return nil }

        switch destination {
        case .oneStep(let direction):
            let destinationIndex = direction == .up ? sourceIndex - 1 : sourceIndex + 1
            guard beats.indices.contains(destinationIndex) else { return nil }
            beats.swapAt(sourceIndex, destinationIndex)
        case .beginning:
            let movingBeat = beats.remove(at: sourceIndex)
            beats.insert(movingBeat, at: 0)
        case .end:
            let movingBeat = beats.remove(at: sourceIndex)
            beats.append(movingBeat)
        case .before(let targetBeatID):
            guard targetBeatID != beatID else { return nil }
            let movingBeat = beats.remove(at: sourceIndex)
            let destinationIndex = beats.firstIndex(where: { $0.id == targetBeatID }) ?? beats.count
            beats.insert(movingBeat, at: destinationIndex)
        }
        return mutation(beats: beats, scenes: outline.scenes)
    }

    static func restoring(
        orderedIDs: [String],
        in outline: BackendScreenplayOutline
    ) -> BeatOrderMutation? {
        let cleanedIDs = orderedIDs
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !cleanedIDs.isEmpty else { return nil }

        let currentBeats = outline.beats
        let currentIDs = currentBeats.map(\.id)
        guard Set(currentIDs) == Set(cleanedIDs),
              currentIDs.count == cleanedIDs.count else { return nil }
        let alreadyRestored = currentIDs == cleanedIDs && currentBeats.enumerated().allSatisfy {
            $0.element.order == $0.offset
        }
        guard !alreadyRestored else { return nil }

        let beatsByID = Dictionary(
            currentBeats.map { ($0.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        let beats = cleanedIDs.compactMap { beatsByID[$0] }
        guard beats.count == currentBeats.count else { return nil }
        return mutation(beats: beats, scenes: outline.scenes)
    }

    private static func mutation(
        beats: [BackendScreenplayBeat],
        scenes: [BackendScreenplayScene]
    ) -> BeatOrderMutation {
        let reindexedBeats = beats.enumerated().map { index, beat in
            BackendScreenplayBeat(
                id: beat.id,
                label: beat.label,
                summary: beat.summary,
                sceneId: beat.sceneId,
                actId: beat.actId,
                order: index,
                status: beat.status,
                createdAt: beat.createdAt,
                updatedAt: beat.updatedAt
            )
        }
        let beatOrderByID = Dictionary(
            reindexedBeats.map { ($0.id, $0.order ?? Int.max) },
            uniquingKeysWith: { first, _ in first }
        )
        let reorderedScenes = scenes.map { scene in
            let beatIDs = (scene.beatIds ?? [])
                .enumerated()
                .sorted { lhs, rhs in
                    let lhsOrder = beatOrderByID[lhs.element] ?? Int.max
                    let rhsOrder = beatOrderByID[rhs.element] ?? Int.max
                    if lhsOrder == rhsOrder { return lhs.offset < rhs.offset }
                    return lhsOrder < rhsOrder
                }
                .map(\.element)
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: scene.order,
                status: scene.status,
                beatIds: beatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        return BeatOrderMutation(beats: reindexedBeats, scenes: reorderedScenes)
    }
}

struct ActOrderMutation {
    let acts: [BackendScreenplayAct]
}

enum ActOrderMutationPlanner {
    static func moving(
        actID: String,
        to destination: InspectorOrderDestination,
        in outline: BackendScreenplayOutline
    ) -> ActOrderMutation? {
        var acts = InspectorOrderSupport.sortedActs(outline.acts)
        guard let sourceIndex = acts.firstIndex(where: { $0.id == actID }) else { return nil }

        switch destination {
        case .oneStep(let direction):
            let destinationIndex = direction == .up ? sourceIndex - 1 : sourceIndex + 1
            guard acts.indices.contains(destinationIndex) else { return nil }
            acts.swapAt(sourceIndex, destinationIndex)
        case .beginning:
            let movingAct = acts.remove(at: sourceIndex)
            acts.insert(movingAct, at: 0)
        case .end:
            let movingAct = acts.remove(at: sourceIndex)
            acts.append(movingAct)
        case .before(let targetActID):
            guard targetActID != actID,
                  let targetIndex = acts.firstIndex(where: { $0.id == targetActID }) else {
                return nil
            }
            let movingAct = acts.remove(at: sourceIndex)
            let adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
            acts.insert(movingAct, at: adjustedTargetIndex)
        }

        let reindexedActs = acts.enumerated().map { index, act in
            BackendScreenplayAct(
                id: act.id,
                title: act.title,
                summary: act.summary,
                order: index,
                sceneIds: InspectorOrderSupport.sceneIDs(for: act.id, scenes: outline.scenes),
                createdAt: act.createdAt,
                updatedAt: act.updatedAt
            )
        }
        return ActOrderMutation(acts: reindexedActs)
    }
}

enum SceneOrderDestination {
    case oneStep(InspectorReorderDirection)
    case before(sceneID: String, targetActID: String?)
    case end(targetActID: String?)
}

struct SceneOrderMutation {
    let acts: [BackendScreenplayAct]
    let scenes: [BackendScreenplayScene]
    let beats: [BackendScreenplayBeat]
}

enum SceneOrderMutationPlanner {
    static func moving(
        sceneID: String,
        to destination: SceneOrderDestination,
        in outline: BackendScreenplayOutline
    ) -> SceneOrderMutation? {
        var scenes = InspectorOrderSupport.sortedScenes(outline.scenes)
        guard let sourceIndex = scenes.firstIndex(where: { $0.id == sceneID }) else { return nil }
        let sourceScene = scenes[sourceIndex]
        let resolvedTargetActID: String?

        switch destination {
        case .oneStep(let direction):
            resolvedTargetActID = InspectorOrderSupport.normalizedID(sourceScene.actId)
            let groupIndices = scenes.indices.filter {
                InspectorOrderSupport.normalizedID(scenes[$0].actId) == resolvedTargetActID
            }
            guard let sourceGroupIndex = groupIndices.firstIndex(of: sourceIndex) else { return nil }
            let destinationGroupIndex = direction == .up ? sourceGroupIndex - 1 : sourceGroupIndex + 1
            guard groupIndices.indices.contains(destinationGroupIndex) else { return nil }
            scenes[sourceIndex] = copiedScene(sourceScene, actID: resolvedTargetActID)
            scenes.swapAt(sourceIndex, groupIndices[destinationGroupIndex])

        case .before(let targetSceneID, let targetActID):
            guard targetSceneID != sceneID,
                  let originalTargetIndex = scenes.firstIndex(where: { $0.id == targetSceneID }) else {
                return nil
            }
            let targetSceneActID = InspectorOrderSupport.normalizedID(scenes[originalTargetIndex].actId)
            let requestedTargetActID = InspectorOrderSupport.normalizedID(targetActID)
            guard requestedTargetActID == nil || requestedTargetActID == targetSceneActID,
                  InspectorOrderSupport.containsAct(targetSceneActID, in: outline.acts) else {
                return nil
            }
            resolvedTargetActID = targetSceneActID
            let movingScene = scenes.remove(at: sourceIndex)
            guard let targetIndex = scenes.firstIndex(where: { $0.id == targetSceneID }) else { return nil }
            scenes.insert(copiedScene(movingScene, actID: resolvedTargetActID), at: targetIndex)

        case .end(let targetActID):
            resolvedTargetActID = InspectorOrderSupport.normalizedID(targetActID)
            guard InspectorOrderSupport.containsAct(resolvedTargetActID, in: outline.acts) else {
                return nil
            }
            let movingScene = scenes.remove(at: sourceIndex)
            let destinationIndex = insertionIndex(
                forActID: resolvedTargetActID,
                in: scenes,
                acts: outline.acts
            )
            scenes.insert(copiedScene(movingScene, actID: resolvedTargetActID), at: destinationIndex)
        }

        let reindexedScenes = scenes.enumerated().map { index, scene in
            BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: scene.beatIds,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        let updatedBeats = outline.beats.map { beat in
            guard beat.sceneId == sceneID else { return beat }
            return BackendScreenplayBeat(
                id: beat.id,
                label: beat.label,
                summary: beat.summary,
                sceneId: beat.sceneId,
                actId: resolvedTargetActID,
                order: beat.order,
                status: beat.status,
                createdAt: beat.createdAt,
                updatedAt: beat.updatedAt
            )
        }
        return SceneOrderMutation(
            acts: InspectorOrderSupport.rebuiltActs(outline.acts, scenes: reindexedScenes),
            scenes: reindexedScenes,
            beats: updatedBeats
        )
    }

    private static func copiedScene(
        _ scene: BackendScreenplayScene,
        actID: String?
    ) -> BackendScreenplayScene {
        BackendScreenplayScene(
            id: scene.id,
            slugline: scene.slugline,
            title: scene.title,
            objective: scene.objective,
            summary: scene.summary,
            actId: actID,
            order: scene.order,
            status: scene.status,
            beatIds: scene.beatIds,
            createdAt: scene.createdAt,
            updatedAt: scene.updatedAt
        )
    }

    private static func insertionIndex(
        forActID actID: String?,
        in scenes: [BackendScreenplayScene],
        acts: [BackendScreenplayAct]
    ) -> Int {
        if let actID {
            if let lastSceneIndex = scenes.lastIndex(where: {
                InspectorOrderSupport.normalizedID($0.actId) == actID
            }) {
                return lastSceneIndex + 1
            }
            let orderedActs = InspectorOrderSupport.sortedActs(acts)
            let targetActIndex = orderedActs.firstIndex(where: { $0.id == actID }) ?? orderedActs.count
            for (index, scene) in scenes.enumerated() {
                guard let sceneActID = InspectorOrderSupport.normalizedID(scene.actId) else { continue }
                let sceneActIndex = orderedActs.firstIndex(where: { $0.id == sceneActID }) ?? orderedActs.count
                if sceneActIndex > targetActIndex {
                    return index
                }
            }
            return scenes.count
        }

        if let lastLooseIndex = scenes.lastIndex(where: {
            InspectorOrderSupport.normalizedID($0.actId) == nil
        }) {
            return lastLooseIndex + 1
        }
        return scenes.count
    }
}

enum InspectorOrderSupport {
    static func sortedActs(_ acts: [BackendScreenplayAct]) -> [BackendScreenplayAct] {
        acts.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
            if $0.title != $1.title { return $0.title < $1.title }
            return $0.id < $1.id
        }
    }

    static func sortedScenes(_ scenes: [BackendScreenplayScene]) -> [BackendScreenplayScene] {
        scenes.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
            if $0.title != $1.title { return $0.title < $1.title }
            return $0.id < $1.id
        }
    }

    static func sortedBeats(_ beats: [BackendScreenplayBeat]) -> [BackendScreenplayBeat] {
        beats.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
            if $0.label != $1.label { return $0.label < $1.label }
            return $0.id < $1.id
        }
    }

    static func sceneIDs(
        for actID: String,
        scenes: [BackendScreenplayScene]
    ) -> [String] {
        sortedScenes(scenes.filter { normalizedID($0.actId) == actID }).map(\.id)
    }

    static func rebuiltActs(
        _ acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene]
    ) -> [BackendScreenplayAct] {
        sortedActs(acts).enumerated().map { index, act in
            BackendScreenplayAct(
                id: act.id,
                title: act.title,
                summary: act.summary,
                order: index,
                sceneIds: sceneIDs(for: act.id, scenes: scenes),
                createdAt: act.createdAt,
                updatedAt: act.updatedAt
            )
        }
    }

    static func normalizedID(_ value: String?) -> String? {
        let clean = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }

    static func containsAct(_ actID: String?, in acts: [BackendScreenplayAct]) -> Bool {
        guard let actID else { return true }
        return acts.contains { normalizedID($0.id) == actID }
    }
}

enum BeatQuickLinkTargetPlanner {
    static func makeTargets(
        pageScene: BackendScreenplayScene?,
        focusedScene: BackendScreenplayScene?,
        acts: [BackendScreenplayAct]
    ) -> [BeatQuickLinkTarget] {
        var targets = [
            BeatQuickLinkTarget(
                id: "loose",
                title: "Keep Loose",
                subtitle: "Clear scene and act links",
                sceneID: "",
                actID: ""
            )
        ]
        var seenIDs = Set(targets.map(\.id))

        appendTargets(
            for: pageScene,
            sceneTitle: "Current Page",
            actTitle: "Current Act",
            acts: acts,
            targets: &targets,
            seenIDs: &seenIDs
        )
        appendTargets(
            for: focusedScene,
            sceneTitle: "Focused Scene",
            actTitle: "Focused Act",
            acts: acts,
            targets: &targets,
            seenIDs: &seenIDs
        )
        return targets
    }

    private static func appendTargets(
        for scene: BackendScreenplayScene?,
        sceneTitle: String,
        actTitle: String,
        acts: [BackendScreenplayAct],
        targets: inout [BeatQuickLinkTarget],
        seenIDs: inout Set<String>
    ) {
        guard let scene else { return }
        let actID = (scene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        append(
            BeatQuickLinkTarget(
                id: "scene:\(scene.id)",
                title: sceneTitle,
                subtitle: compactBeatSceneLabel(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title),
                sceneID: scene.id,
                actID: actID
            ),
            targets: &targets,
            seenIDs: &seenIDs
        )

        guard !actID.isEmpty, let act = acts.first(where: { $0.id == actID }) else { return }
        append(
            BeatQuickLinkTarget(
                id: "act:\(act.id)",
                title: actTitle,
                subtitle: act.title,
                sceneID: "",
                actID: act.id
            ),
            targets: &targets,
            seenIDs: &seenIDs
        )
    }

    private static func append(
        _ target: BeatQuickLinkTarget,
        targets: inout [BeatQuickLinkTarget],
        seenIDs: inout Set<String>
    ) {
        guard seenIDs.insert(target.id).inserted else { return }
        targets.append(target)
    }
}

private func compactBeatSceneLabel(_ heading: String) -> String {
    let cleaned = heading.replacingOccurrences(of: "  ", with: " ")
    guard cleaned.count > 28 else { return cleaned }
    let index = cleaned.index(cleaned.startIndex, offsetBy: 28)
    return String(cleaned[..<index]).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
}

#if DEBUG || os(macOS)
enum StudioDebugInspectorInteractionAction: String {
    case makeBeatFromSelection = "make_beat_from_selection"
    case makeBeatFromCurrentScene = "make_beat_from_current_scene"
    case updateSelectedBeatFromSelection = "update_selected_beat_from_selection"
    case previewSelectedBeatDropBefore = "preview_selected_beat_drop_before"
    case previewSelectedBeatDropToEnd = "preview_selected_beat_drop_to_end"
    case clearBeatDragPreview = "clear_beat_drag_preview"
    case selectBeat = "select_beat"
    case moveSelectedBeatToTop = "move_selected_beat_to_top"
    case moveSelectedBeatToEnd = "move_selected_beat_to_end"
    case seedBeatDraft = "seed_beat_draft"
    case restoreWorkspace = "restore_workspace"
    case refreshCollaboration = "refresh_collaboration"
    case approveCollaborator = "approve_collaborator"
    case addComment = "add_comment"
    case resolveFirstComment = "resolve_first_comment"
    case unresolveFirstComment = "unresolve_first_comment"
    case deleteFirstComment = "delete_first_comment"
    case keepLocalConflict = "keep_local_conflict"
    case loadServerConflict = "load_server_conflict"
}

enum StudioDebugPageWriteToastMode: String {
    case expanded
    case collapsed
    case dismiss
    case undo
    case more
    case escape
    case returnKey = "return"
}

enum StudioDebugPageWriteToastInteractionAction: String {
    case undo
    case more
    case escape
    case returnKey = "return"
}

enum StudioDebugShortcutAction: String {
    case optionCommandB = "option_command_b"
    case optionCommandU = "option_command_u"
}

#if os(macOS)
private let studioDebugMirroredPreferencesDomain = "io.them.them" as CFString
private let studioDebugLoadProjectRequestFilename = "them_studio_debug_load_project_request.json"
let studioScreenDebugLoadProjectRequestURLs: [URL] = {
    let fileManager = FileManager.default
    let hardcodedURL = URL(fileURLWithPath: "/tmp").appendingPathComponent(studioDebugLoadProjectRequestFilename)
    let temporaryURL = fileManager.temporaryDirectory.appendingPathComponent(studioDebugLoadProjectRequestFilename)
    let homeTemporaryURL = fileManager.homeDirectoryForCurrentUser
        .appendingPathComponent("tmp")
        .appendingPathComponent(studioDebugLoadProjectRequestFilename)
    var seen: Set<String> = []
    return [hardcodedURL, temporaryURL, homeTemporaryURL].filter { url in
        seen.insert(url.path).inserted
    }
}()
private let studioDebugLoadProjectRequestURL = studioScreenDebugLoadProjectRequestURLs[0]
let studioScreenDebugManualEditRequestURL = URL(fileURLWithPath: "/tmp/them_studio_debug_manual_edit_request.json")
let studioScreenDebugAutosaveToggleRequestURL = URL(fileURLWithPath: "/tmp/them_studio_debug_autosave_toggle_request.json")
let studioScreenDebugSaveRequestURL = URL(fileURLWithPath: "/tmp/them_studio_debug_save_request.json")

struct StudioScreenDebugLoadProjectRequest: Decodable {
    let token: Int
    let projectID: String
    let versionID: String
}

struct StudioDebugManualEditRequest: Decodable {
    let token: Int
    let text: String
}

struct StudioDebugAutosaveToggleRequest: Decodable {
    let token: Int
    let enabled: Bool
}

struct StudioDebugSaveRequest: Decodable {
    let token: Int
}

private func studioDebugMirroredDomains() -> [String] {
    var domains: [String] = []
    if let bundleID = Bundle.main.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines),
       !bundleID.isEmpty {
        domains.append(bundleID)
    }

    let fallbackDomain = String(studioDebugMirroredPreferencesDomain)
    if !domains.contains(fallbackDomain) {
        domains.append(fallbackDomain)
    }
    return domains
}

private func studioDebugMirroredSuiteDefaults(for domain: String) -> UserDefaults? {
    if let bundleID = Bundle.main.bundleIdentifier?.trimmingCharacters(in: .whitespacesAndNewlines),
       domain == bundleID {
        return nil
    }
    return UserDefaults(suiteName: domain)
}

private func studioDebugMirroredPlistURLs(for domain: String) -> [URL] {
    let libraryURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library")
    let filename = domain.hasSuffix(".plist") ? domain : "\(domain).plist"
    return [
        libraryURL
            .appendingPathComponent("Containers")
            .appendingPathComponent(domain)
            .appendingPathComponent("Data/Library/Preferences")
            .appendingPathComponent(filename),
        libraryURL
            .appendingPathComponent("Preferences")
            .appendingPathComponent(filename),
    ]
}

enum StudioDebugMirroredPreferenceSnapshot {
    private static let refreshInterval: TimeInterval = 0.35
    private static var cachedAt: TimeInterval = 0
    private static var cachedPlistValues: [String: [Any]] = [:]

    static func invalidate() {
        cachedAt = 0
        cachedPlistValues = [:]
    }

    static func plistValues(forKey key: String) -> [Any] {
        let now = Date().timeIntervalSinceReferenceDate
        if cachedAt == 0 || now - cachedAt > refreshInterval {
            cachedAt = now
            cachedPlistValues = buildPlistValues()
        }
        return cachedPlistValues[key] ?? []
    }

    private static func buildPlistValues() -> [String: [Any]] {
        var values: [String: [Any]] = [:]
        var seenFingerprints: [String: Set<String>] = [:]

        func append(_ value: Any, forKey key: String) {
            let fingerprint = "\(type(of: value))::\(String(describing: value))"
            var seen = seenFingerprints[key] ?? []
            guard seen.insert(fingerprint).inserted else { return }
            seenFingerprints[key] = seen
            values[key, default: []].append(value)
        }

        for domain in studioDebugMirroredDomains() {
            for url in studioDebugMirroredPlistURLs(for: domain) {
                guard let dictionary = NSDictionary(contentsOf: url) else { continue }
                for (rawKey, value) in dictionary {
                    guard let key = rawKey as? String else { continue }
                    append(value, forKey: key)
                }
            }
        }

        return values
    }
}

private func mirrorStudioDebugPreferenceValue(_ value: Any, forKey key: String, domain: String) {
    for url in studioDebugMirroredPlistURLs(for: domain) {
        let directoryURL = url.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
        let dictionary = (NSMutableDictionary(contentsOf: url) ?? NSMutableDictionary())
        dictionary[key] = value
        dictionary.write(to: url, atomically: true)
    }
}

func writeMirroredStudioDebugPreferenceInt(_ value: Int, forKey key: String) {
    #if DEBUG
    StudioDebugPreferenceFileBridge.write(value, forKey: key)
    #endif
    UserDefaults.standard.set(value, forKey: key)
    for domain in studioDebugMirroredDomains() {
        if let suite = studioDebugMirroredSuiteDefaults(for: domain) {
            suite.set(value, forKey: key)
            suite.synchronize()
        }
        let domainRef = domain as CFString
        CFPreferencesSetAppValue(key as CFString, NSNumber(value: value), domainRef)
        CFPreferencesAppSynchronize(domainRef)
        mirrorStudioDebugPreferenceValue(NSNumber(value: value), forKey: key, domain: domain)
    }
    UserDefaults.standard.synchronize()
    StudioDebugMirroredPreferenceSnapshot.invalidate()
}

func writeMirroredStudioDebugPreferenceString(_ value: String, forKey key: String) {
    #if DEBUG
    StudioDebugPreferenceFileBridge.write(value, forKey: key)
    #endif
    UserDefaults.standard.set(value, forKey: key)
    for domain in studioDebugMirroredDomains() {
        if let suite = studioDebugMirroredSuiteDefaults(for: domain) {
            suite.set(value, forKey: key)
            suite.synchronize()
        }
        let domainRef = domain as CFString
        CFPreferencesSetAppValue(key as CFString, value as CFString, domainRef)
        CFPreferencesAppSynchronize(domainRef)
        mirrorStudioDebugPreferenceValue(value as NSString, forKey: key, domain: domain)
    }
    UserDefaults.standard.synchronize()
    StudioDebugMirroredPreferenceSnapshot.invalidate()
}

private func studioDebugMirroredPreferenceValues(forKey key: String) -> [Any] {
    #if DEBUG
    if let fileValue = StudioDebugPreferenceFileBridge.value(forKey: key) {
        return [fileValue]
    }
    #endif
    var values: [Any] = []
    var seenFingerprints: Set<String> = []

    func append(_ value: Any?) {
        guard let value else { return }
        let fingerprint = "\(type(of: value))::\(String(describing: value))"
        guard seenFingerprints.insert(fingerprint).inserted else { return }
        values.append(value)
    }

    for value in StudioDebugMirroredPreferenceSnapshot.plistValues(forKey: key) {
        append(value)
    }

    for domain in studioDebugMirroredDomains() {
        if let suite = studioDebugMirroredSuiteDefaults(for: domain) {
            suite.synchronize()
            append(suite.object(forKey: key))
        }
        let domainRef = domain as CFString
        CFPreferencesAppSynchronize(domainRef)
        append(CFPreferencesCopyAppValue(key as CFString, domainRef))
    }
    UserDefaults.standard.synchronize()
    append(UserDefaults.standard.object(forKey: key))
    return values
}

func readMirroredStudioDebugPreferenceInt(_ key: String, fallback: Int = 0) -> Int {
    var best: Int?
    for value in studioDebugMirroredPreferenceValues(forKey: key) {
        let parsed: Int?
        if let number = value as? NSNumber {
            parsed = number.intValue
        } else if let string = value as? String {
            parsed = Int(string.trimmingCharacters(in: .whitespacesAndNewlines))
        } else {
            parsed = nil
        }
        if let parsed {
            best = max(best ?? parsed, parsed)
        }
    }
    return best ?? fallback
}

func readMirroredStudioDebugPreferenceString(_ key: String, fallback: String = "") -> String {
    for value in studioDebugMirroredPreferenceValues(forKey: key) {
        if let string = value as? String {
            return string
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
    }
    return fallback
}

func readMirroredStudioDebugPreferenceBool(_ key: String, fallback: Bool = false) -> Bool {
    for value in studioDebugMirroredPreferenceValues(forKey: key) {
        if let bool = value as? Bool {
            return bool
        }
        if let number = value as? NSNumber {
            return number.boolValue
        }
        if let string = value as? String {
            let normalized = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if ["1", "true", "yes"].contains(normalized) { return true }
            if ["0", "false", "no"].contains(normalized) { return false }
        }
    }
    return fallback
}
#else
func writeMirroredStudioDebugPreferenceInt(_ value: Int, forKey key: String) {
    UserDefaults.standard.set(value, forKey: key)
}

func writeMirroredStudioDebugPreferenceString(_ value: String, forKey key: String) {
    UserDefaults.standard.set(value, forKey: key)
}

func readMirroredStudioDebugPreferenceInt(_ key: String, fallback: Int = 0) -> Int {
    if let number = UserDefaults.standard.object(forKey: key) as? NSNumber {
        return number.intValue
    }
    if let string = UserDefaults.standard.string(forKey: key),
       let parsed = Int(string.trimmingCharacters(in: .whitespacesAndNewlines)) {
        return parsed
    }
    return fallback
}

func readMirroredStudioDebugPreferenceString(_ key: String, fallback: String = "") -> String {
    if let string = UserDefaults.standard.string(forKey: key) {
        return string
    }
    if let number = UserDefaults.standard.object(forKey: key) as? NSNumber {
        return number.stringValue
    }
    return fallback
}

func readMirroredStudioDebugPreferenceBool(_ key: String, fallback: Bool = false) -> Bool {
    if let bool = UserDefaults.standard.object(forKey: key) as? Bool {
        return bool
    }
    if let number = UserDefaults.standard.object(forKey: key) as? NSNumber {
        return number.boolValue
    }
    if let string = UserDefaults.standard.string(forKey: key) {
        let normalized = string.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["1", "true", "yes"].contains(normalized) { return true }
        if ["0", "false", "no"].contains(normalized) { return false }
    }
    return fallback
}
#endif
#endif

private func studioDebugJSONSafeValue(_ value: Any) -> Any {
    let mirror = Mirror(reflecting: value)
    if mirror.displayStyle == .optional {
        guard let child = mirror.children.first else { return NSNull() }
        return studioDebugJSONSafeValue(child.value)
    }
    if value is NSNull { return value }
    if let string = value as? String { return string }
    if let bool = value as? Bool { return bool }
    if let int = value as? Int { return int }
    if let double = value as? Double { return double.isFinite ? double : 0 }
    if let float = value as? Float { return float.isFinite ? Double(float) : 0 }
    if let number = value as? NSNumber { return number }
    if let array = value as? [Any] {
        return array.map(studioDebugJSONSafeValue)
    }
    if let dictionary = value as? [String: Any] {
        return dictionary.mapValues(studioDebugJSONSafeValue)
    }
    return String(describing: value)
}

func studioDebugJSONString(from payload: [String: Any]) -> String {
    let safePayload = payload.mapValues(studioDebugJSONSafeValue)
    guard JSONSerialization.isValidJSONObject(safePayload),
          let data = try? JSONSerialization.data(withJSONObject: safePayload, options: [.sortedKeys]),
          let encoded = String(data: data, encoding: .utf8) else {
        return "{}"
    }
    return encoded
}

struct StudioMoveCommandModifier: ViewModifier {
    let handler: (StudioMoveDirection) -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        #if os(macOS)
        content.onMoveCommand { direction in
            switch direction {
            case .up:
                handler(.up)
            case .down:
                handler(.down)
            case .left:
                handler(.left)
            case .right:
                handler(.right)
            default:
                break
            }
        }
        #else
        content
        #endif
    }
}

struct StudioExitCommandModifier: ViewModifier {
    let handler: () -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        #if os(macOS)
        content.onExitCommand(perform: handler)
        #else
        content
        #endif
    }
}

extension View {
    func studioMoveCommand(_ handler: @escaping (StudioMoveDirection) -> Void) -> some View {
        modifier(StudioMoveCommandModifier(handler: handler))
    }

    func studioExitCommand(_ handler: @escaping () -> Void) -> some View {
        modifier(StudioExitCommandModifier(handler: handler))
    }
}

@MainActor
final class ScreenplayStudioViewModel: ObservableObject {
    private struct DraftSaveRequest {
        let id: String
        let projectId: String
        let ownerUserId: String
        let draft: String
        let title: String
        let phase: String
        let source: String
        let notes: String
        let studioWriteAnchors: [BackendScreenplayWriteAnchor]
        let screenplayBindings: [BackendScreenplayBindingRecord]
        let baseVersionId: String
        let authContext: ScreenplayStudioAuthContext
        let deliveryOrigin: ScreenplayDraftSaveOrigin?

        init(
            id: String,
            projectId: String,
            ownerUserId: String,
            draft: String,
            title: String,
            phase: String,
            source: String,
            notes: String,
            studioWriteAnchors: [BackendScreenplayWriteAnchor],
            screenplayBindings: [BackendScreenplayBindingRecord],
            baseVersionId: String,
            authContext: ScreenplayStudioAuthContext,
            deliveryOrigin: ScreenplayDraftSaveOrigin? = nil
        ) {
            self.id = id
            self.projectId = projectId
            self.ownerUserId = ownerUserId
            self.draft = draft
            self.title = title
            self.phase = phase
            self.source = source
            self.notes = notes
            self.studioWriteAnchors = studioWriteAnchors
            self.screenplayBindings = screenplayBindings
            self.baseVersionId = baseVersionId
            self.authContext = authContext
            self.deliveryOrigin = deliveryOrigin
        }

        init(entry: ScreenplayDraftSaveOutboxEntry, authContext: ScreenplayStudioAuthContext) {
            id = entry.id
            projectId = entry.projectId
            ownerUserId = entry.ownerUserId
            draft = entry.draft
            title = entry.title
            phase = entry.phase
            source = entry.source
            notes = entry.notes
            studioWriteAnchors = entry.studioWriteAnchors
            screenplayBindings = entry.screenplayBindings
            baseVersionId = entry.baseVersionId
            self.authContext = authContext
            deliveryOrigin = entry.deliveryOrigin
        }

        var outboxEntry: ScreenplayDraftSaveOutboxEntry {
            let now = Date().timeIntervalSince1970
            return ScreenplayDraftSaveOutboxEntry(
                id: id,
                projectId: projectId,
                ownerUserId: ownerUserId,
                draft: draft,
                title: title,
                phase: phase,
                notes: notes,
                source: source,
                studioWriteAnchors: studioWriteAnchors,
                screenplayBindings: screenplayBindings,
                baseVersionId: baseVersionId,
                createdAt: now,
                updatedAt: now,
                status: .pending,
                retries: 0,
                nextAttemptAt: now,
                lastError: "",
                deliveryOrigin: deliveryOrigin
            )
        }

        func rebased(on serverVersionId: String) -> DraftSaveRequest {
            DraftSaveRequest(
                id: id,
                projectId: projectId,
                ownerUserId: ownerUserId,
                draft: draft,
                title: title,
                phase: phase,
                source: source,
                notes: notes,
                studioWriteAnchors: studioWriteAnchors,
                screenplayBindings: screenplayBindings,
                baseVersionId: serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines),
                authContext: authContext,
                deliveryOrigin: deliveryOrigin
            )
        }
    }

    private struct DraftSaveCompletion {
        let versionID: String
        let mayContinueEditing: Bool
    }

    private enum EmptyBaseDraftSavePreflightResult {
        case notRequired
        case versionlessProject
        case canonicalVersion(BackendScreenplayVersion, URL?)
    }

    private struct CharacterTraitsRefreshResult {
        let traits: BackendCharacterTraitsResponse
        let archetypes: BackendCharacterArchetypesResponse?
        let scope: ScreenplayCharacterVoiceMemoryRequestScope
    }

    private struct CanonicalOutlineCollections {
        let acts: [BackendScreenplayAct]
        let scenes: [BackendScreenplayScene]
        let beats: [BackendScreenplayBeat]
    }

    private struct OutlineMutationValidationError: LocalizedError {
        let message: String

        var errorDescription: String? { message }
    }

    struct LocalDraftRecoveryCandidate: Equatable {
        let projectId: String
        let draft: String
        let baseVersionId: String
        let savedAt: TimeInterval
        let isPreservedConflict: Bool
    }

    struct SaveConflictState: Equatable {
        let projectId: String
        let baseVersionId: String
        let serverVersionId: String
        let serverDraft: String
        let serverDraftExcerpt: String
        let serverUpdatedAt: TimeInterval
    }

    @Published var isLoading: Bool = false
    @Published var isSaving: Bool = false
    @Published var errorText: String = ""
    @Published var infoText: String = ""

    @Published var projects: [BackendScreenplayProjectSummary] = []
    @Published var selectedProjectID: String = "" {
        didSet { if oldValue != selectedProjectID { invalidateCoverageIfContextChanged() } }
    }
    @Published var selectedProject: BackendScreenplayProjectSummary?
    @Published var outline: BackendScreenplayOutline = .empty
    @Published var outlineRevision: Int = 0
    @Published var pendingScreenplayQuestion: BackendPendingScreenplayQuestion?

    @Published var craftFrameworks: [ScreenplayCraftFrameworkReference] = []
    @Published private(set) var selectedCraftFrameworkID: String = ""
    private var craftFrameworkWasExplicitlySelected = false
    private var activeCraftReportRequestID: UUID?
    private var activeCraftAnalysisRequestID: UUID?
    private var activeCraftOverrideRequestID: UUID?
    @Published var craftReport: ScreenplayCraftReport?
    @Published var isCraftLoading: Bool = false
    @Published var isCraftAnalyzing: Bool = false
    @Published var isCraftOverrideSaving: Bool = false
    @Published var craftErrorText: String = ""
    @Published var craftInfoText: String = ""
    @Published var formatLintReport: ScreenplayFormatLintReport?
    @Published var isFormatLinting: Bool = false
    @Published var formatLintErrorText: String = ""
    @Published var formatLintSourceText: String = ""
    @Published var coverageSimulationReport: ScreenplayCraftCoverageSimulationReport?
    @Published var isCoverageSimulating: Bool = false
    @Published var coverageSimulationErrorText: String = ""
    @Published var coverageSimulationSourceText: String = ""
    private var coverageSimulationSnapshot: ScreenplayCraftCoverageSnapshot?
    @Published var craftLogline: ScreenplayCraftLoglineDistillResponse?
    @Published var craftLoglineDrift: ScreenplayCraftLoglineDriftResponse?
    @Published var craftLoglineHistory: [ScreenplayCraftLoglineEntry] = []
    @Published var isCraftLoglineLoading: Bool = false
    @Published var craftLoglineErrorText: String = ""
    @Published var craftLoglineInfoText: String = ""
    @Published var blockSignal: BackendBlockSignalResponse?
    @Published var blockSignalHistory: BackendBlockSignalHistoryResponse?
    @Published var isBlockSignalLoading: Bool = false
    @Published var blockSignalErrorText: String = ""
    @Published var blockSignalInfoText: String = ""
    @Published var characterTraits: BackendCharacterTraitsResponse?
    @Published var characterArchetypes: BackendCharacterArchetypesResponse?
    @Published var isCharacterTraitsLoading: Bool = false
    @Published var characterTraitsErrorText: String = ""
    @Published var characterTraitsInfoText: String = ""
    private var characterTraitsRefreshTask: Task<CharacterTraitsRefreshResult, Error>?
    private var characterTraitsRefreshID: UUID?
    private var characterTraitsRefreshScope: ScreenplayCharacterVoiceMemoryRequestScope?
    @Published var craftTwists: ScreenplayCraftTwistSuggestResponse?
    @Published var isCraftTwistLoading: Bool = false
    @Published var craftTwistErrorText: String = ""
    @Published var craftTwistInfoText: String = ""
    @Published var craftTwistBeatLabel: String = ""
    @Published var acceptedCraftTwists: [ScreenplayCraftAcceptedTwistEntry] = []
    @Published var isAcceptedCraftTwistMutating: Bool = false
    @Published var acceptedCraftTwistErrorText: String = ""
    @Published var acceptedCraftTwistInfoText: String = ""
    @Published var screenplayExportFormats: [BackendScreenplayExportFormat] = []
    @Published var isScreenplayExportFormatsLoading: Bool = false
    @Published var screenplayExportFormatsErrorText: String = ""
    private var didLoadScreenplayProjectsFromBackend: Bool = false

    var formatLintCards: [ScreenplayFormatLintCard] {
        ScreenplayFormatLintCard.cards(from: formatLintReport, linesPerPage: linesPerPage)
    }

    var canSimulateCraftCoverage: Bool {
        !fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isCoverageSimulating
    }

    var isCoverageSimulationCurrent: Bool {
        guard coverageSimulationReport != nil, let coverageSimulationSnapshot else { return true }
        return coverageSimulationSnapshot.matches(
            draft: fountainDraft,
            frameworkId: selectedCraftFrameworkID
        )
    }

    var screenplayExportMenuItems: [ScreenplayExportMenuItem] {
        ScreenplayExportFormatMenu.items(
            from: screenplayExportFormats,
            localPDFSupported: Self.localPDFExportSupported
        )
    }

    var screenplayExportPDFUnavailableText: String {
        ScreenplayExportFormatMenu.pdfUnavailableText(
            from: screenplayExportFormats,
            localPDFSupported: Self.localPDFExportSupported
        )
    }

    var estimatedFeaturePageCount: Int {
        localPaginationPages.count
    }

    private var pageLayoutCache = ScreenplayPageLayout.Cache()
    var localPaginationPages: [ScreenplayPageLayout.Page] {
        pageLayoutCache.pages(for: fountainDraft, linesPerPage: linesPerPage)
    }

    var featureProgressionGuide: ScreenplayFeatureProgressionGuide {
        ScreenplayFeatureProgressionGuide.guide(
            actPosition: featureActPosition,
            currentPage: estimatedFeaturePageCount,
            targetPages: ScreenplayFeatureProgressionGuide.defaultTargetPages
        )
    }

    var featureUnresolvedSetups: [String] {
        Self.unresolvedSetups(from: featureUnresolvedSetupsText)
    }

    #if os(macOS)
    private static let localPDFExportSupported = true
    #else
    private static let localPDFExportSupported = false
    #endif
    private static let outlineMutationRetryBackoff: [TimeInterval] = [2, 5, 15, 60, 300]

    @Published var newProjectTitle: String = ""
    @Published var featureLogline: String = ""
    @Published var featureThemeArgument: String = ""
    @Published var featureCentralQuestion: String = ""
    @Published var featureProtagonistWant: String = ""
    @Published var featureProtagonistNeed: String = ""
    @Published var featureAntagonisticForce: String = ""
    @Published var featureActPosition: String = ""
    @Published var featureEndingImage: String = ""
    @Published var featureUnresolvedSetupsText: String = ""
    @Published var newSceneSlugline: String = ""
    @Published var newSceneTitle: String = ""
    @Published var newSceneObjective: String = ""
    @Published var newSceneSummary: String = ""
    @Published var newSceneActID: String = ""
    @Published var editingSceneID: String = ""
    @Published var editingSceneTitle: String = ""
    @Published var editingSceneObjective: String = ""
    @Published var editingSceneSummary: String = ""

    @Published var newBeatLabel: String = ""
    @Published var newBeatSummary: String = ""
    @Published var newBeatSceneID: String = ""
    @Published var newBeatActID: String = ""
    @Published var editingBeatID: String = ""

    @Published var fountainDraft: String = "" {
        didSet {
            if !fountainDraft.contains(where: { !$0.isWhitespace }) {
                invalidateCoverage()
            } else if let active = activeCoverageContext, !active.draft.utf8.elementsEqual(fountainDraft.utf8) {
                activeCoverageRequestID = nil
                activeCoverageContext = nil
                if isCoverageRefreshing { isCoverageRefreshing = false }
            }
        }
    }
    @Published var latestVersionID: String = ""
    @Published var studioWriteAnchors: [BackendScreenplayWriteAnchor] = []
    @Published var screenplayBindings: [BackendScreenplayBindingRecord] = []
    @Published var autosaveEnabled: Bool = true
    @Published var autosaveStatusText: String = "Ready"
    @Published var hasUnsavedDraftChanges: Bool = false
    @Published var isStreamingDraftPreviewActive: Bool = false
    @Published var isManualDraftEditing: Bool = false
    @Published var paginationPages: [BackendScreenplayPaginationPage] = []
    @Published var isPagesOverviewPresented: Bool = false
    @Published private var publishedCoverageReport: BackendScreenplayCoverageReport?
    var coverageReport: BackendScreenplayCoverageReport? {
        guard publishedCoverageContext?.hasSameOwner(as: currentCoverageContext()) == true,
              fountainDraft.contains(where: { !$0.isWhitespace }) else { return nil }
        return publishedCoverageReport
    }
    private var publishedCoverageContext: ScreenplayCoverageContext?
    var isCoverageReadCurrent: Bool {
        coverageReport == nil || publishedCoverageContext == currentCoverageContext()
    }
    private var lastAutomaticCoverageAttempt: (context: ScreenplayCoverageContext, shape: ScreenplayCoverageRefreshPolicy.Shape)?
    private var publishedCoverageRequestID: UUID?
    private var activeCoverageRequestID: UUID?
    private var activeCoverageContext: ScreenplayCoverageContext?
    private var coverageErrorContext: ScreenplayCoverageContext?
    private var coverageIdentityCancellable: AnyCancellable?
    private let coverageAuthContextProvider: (() -> ScreenplayStudioAuthContext)?
    @Published var isCoverageRefreshing: Bool = false
    @Published var coverageErrorText: String = ""
    @Published var isPaginationRefreshing: Bool = false
    @Published var paginationErrorText: String = ""
    private var activePaginationRequestID: UUID?
    @Published var linesPerPage: Int = ScreenplayPageLayout.defaultLinesPerPage
    @Published var revisionColor: String = "blue"
    @Published var revisionSummary: BackendScreenplayRevisionSummary?
    @Published var revisionRanges: [BackendScreenplayRevisionRange] = []
    @Published var isRevisionRefreshing: Bool = false
    @Published var revisionErrorText: String = ""

    @Published var collaborators: [BackendScreenplayCollaborator] = []
    @Published var approvedEmails: [String] = []
    @Published var isCollaborationRefreshing: Bool = false
    @Published var collaborationErrorText: String = ""
    @Published var collaboratorEmail: String = ""
    @Published var collaboratorNote: String = ""
    @Published var collaboratorInvitedBy: String = ""

    @Published var comments: [BackendScreenplayComment] = []
    @Published var commentText: String = ""
    @Published var commentAuthorEmail: String = ""
    @Published var commentAuthorName: String = ""
    @Published var commentActorEmail: String = ""
    @Published var commentAnchorLine: String = ""
    @Published var commentType: String = "text"
    @Published var commentVoiceURL: String = ""
    @Published var commentVoiceTranscript: String = ""
    @Published var commentVoiceDurationMs: String = ""
    @Published var commentReplyToID: String = ""
    @Published var commentEditID: String = ""
    @Published var showResolvedComments: Bool = true
    @Published var snapshotLabel: String = ""
    @Published var recoveryCandidate: LocalDraftRecoveryCandidate?
    @Published var conflictState: SaveConflictState?
    @Published var queuedDraftSaveCount: Int = 0
    @Published var parkedDraftSaveCount: Int = 0
    @Published private var pendingInitialProject: ScreenplayDraftSaveOutboxEntry?
    var hasPendingInitialProject: Bool {
        guard let entry = pendingInitialProject, let metadata = entry.initialization else { return false }
        return !entry.ownerUserId.isEmpty && entry.ownerUserId == currentStudioAuthContext().userID
            && metadata.documentID == ScreenplayLiveDraftBridge.shared.draftOrigin.documentID
            && (metadata.sourceProjectID == selectedProjectID || entry.projectId == selectedProjectID)
            && OfflineTalkRecoveryScope.sameBackend(metadata.backendURL, BackendAuthClient.resolvedBackendBaseURL())
    }
    @Published var queuedOutlineMutationCount: Int = 0
    @Published var parkedOutlineMutationCount: Int = 0
    @Published private(set) var isOutlineMutationDrainInFlight: Bool = false

    private var draftDebounceCancellable: AnyCancellable?
    private var bridgePreferredVersionCancellable: AnyCancellable?
    private var bridgeInitialProjectCancellable: AnyCancellable?
    private var isHydratingDraft = false
    /// True while the editor mirrors another device's live typing. Autosave
    /// waits for that device's version announcement instead of racing it.
    private(set) var isFollowingRemoteLiveDraft = false
    private var remoteLiveDraftStatusText = "Live from another device"
    private var remoteLiveDraftFollowFallbackTask: Task<Void, Never>?
    private var lastSavedDraftFingerprint = ""
    private var lastRevisionBaseDraft = ""
    private var loadedDraftProjectID: String = ""
    private var lastManualDraftEditAt: Date = .distantPast
    private var lastSeenScreenplayStateVersion = ""
    private var outlineRevisionProjectID = ""
    private var isCrossDeviceRefreshInFlight = false
    private var isDraftSaveInFlight = false
    private var outlineMutationRetryTask: Task<Void, Never>?
    private var outlineMutationDrainCoordinator = ScreenplayOutlineMutationDrainCoordinator()
    private var outlineMutationTerminalAcceptance: [String: Bool] = [:]
    private var outlineMutationAwaitedIDs: Set<String> = []
    private var latestOptimisticOutlineMutationByProject: [String: ScreenplayOutlineMutationOutboxEntry] = [:]
    private var pendingDraftSaveRequest: DraftSaveRequest?
    private var shouldQueuePendingDraftSaveAfterFailure = false
    private let localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore
    private let draftSaveOutbox: ScreenplayDraftSaveOutbox
    private let outlineMutationOutbox = ScreenplayOutlineMutationOutbox.shared
    private let craftClient: BackendClient
    private let projectSelectionAPI = BackendMemoryAPI()
    private let draftSaveAPI: BackendMemoryAPI
    private let liveReplyOutbox: OfflineTalkOutbox
    private var clientTokenOwnedProjectIDs: Set<String> = []
    private var activeLoadRequestID: UUID?

    convenience init(coverageAuthContextProvider: (() -> ScreenplayStudioAuthContext)? = nil) {
        self.init(localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore(),
                  coverageAuthContextProvider: coverageAuthContextProvider)
    }

    init(localDraftRecoveryStore: ScreenplayLocalDraftRecoveryStore,
         draftSaveOutbox: ScreenplayDraftSaveOutbox = .shared,
         craftClient: BackendClient = BackendClient(),
         coverageAuthContextProvider: (() -> ScreenplayStudioAuthContext)? = nil,
         draftSaveAPI: BackendMemoryAPI = .shared,
         liveReplyOutbox: OfflineTalkOutbox = .shared) {
        self.localDraftRecoveryStore = localDraftRecoveryStore
        self.draftSaveOutbox = draftSaveOutbox
        self.craftClient = craftClient
        self.draftSaveAPI = draftSaveAPI
        self.liveReplyOutbox = liveReplyOutbox
        self.coverageAuthContextProvider = coverageAuthContextProvider
        fountainDraft = ScreenplayLiveDraftBridge.shared.draftText
        coverageIdentityCancellable = NotificationCenter.default.publisher(for: .themBackendIdentityPartitionChanged)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.invalidateCoverageIfContextChanged() }
        draftDebounceCancellable = $fountainDraft
            .map(ScreenplayDraftTextObservation.init)
            .removeDuplicates()
            .map(\.text)
            .debounce(for: .milliseconds(900), scheduler: RunLoop.main)
            .sink { [weak self] draft in
                guard let self else { return }
                Task { await self.handleDraftDebouncedChange(draft) }
            }
        bridgePreferredVersionCancellable = ScreenplayLiveDraftBridge.shared.$preferredVersionID
            .removeDuplicates()
            .sink { [weak self] versionID in
                Task { @MainActor [weak self] in
                    self?.adoptSavedPageWriteVersionFromBridgeIfNeeded(versionID)
                }
            }
        bridgeInitialProjectCancellable = ScreenplayLiveDraftBridge.shared.$initialProjectReceipt
            .sink { [weak self] receipt in
                guard !IOThemRuntime.isRunningTests || IOThemRuntime.isRunningUITests, let receipt else { return }
                Task { @MainActor [weak self] in _ = self?.adoptInitialProjectReceipt(receipt) }
            }
        Task { [weak self] in
            guard let self else { return }
            await self.draftSaveOutbox.startNetworkMonitoring()
            await self.outlineMutationOutbox.startNetworkMonitoring()
            await self.refreshDraftSaveOutboxStatus()
            await self.refreshOutlineMutationOutboxStatus()
        }
        ScreenplayLiveDraftSyncService.shared.attach(to: self)
    }

    deinit {
        coverageIdentityCancellable?.cancel()
        draftDebounceCancellable?.cancel()
        bridgePreferredVersionCancellable?.cancel()
        bridgeInitialProjectCancellable?.cancel()
        outlineMutationRetryTask?.cancel()
    }

    func load() async {
        guard !IOThemRuntime.isRunningTests else {
            didLoadScreenplayProjectsFromBackend = false
            projects = []
            selectedProjectID = ""
            selectedProject = nil
            outline = .empty
            outlineRevision = 0
            outlineRevisionProjectID = ""
            clearFeatureSpineFields()
            syncLiveDraftBridgeProjectContext(clearWhenEmpty: true)
            return
        }
        let requestID = UUID()
        let authContext = currentStudioAuthContext()
        let selectedProjectIDAtStart = selectedProjectID
        activeLoadRequestID = requestID
        isLoading = true
        defer {
            if activeLoadRequestID == requestID {
                activeLoadRequestID = nil
                isLoading = false
            }
        }
        errorText = ""
        infoText = ""
        let result: BackendReadResult<BackendScreenplayProjectsResponse>
        do {
            result = try await BackendMemoryAPI.shared.fetchScreenplayProjects(
                limit: 24,
                includeVersions: false,
                includeDrafts: false
            )
        } catch {
            guard authContextIsCurrent(authContext),
                  activeLoadRequestID == requestID,
                  ScreenplayProjectLoadApplicationPolicy.shouldApply(
                      selectedProjectIDAtStart: selectedProjectIDAtStart,
                      currentSelectedProjectID: selectedProjectID
                  ) else {
                return
            }
            didLoadScreenplayProjectsFromBackend = false
            errorText = error.localizedDescription
            selectedProject = nil
            pendingScreenplayQuestion = nil
            outline = .empty
            outlineRevision = 0
            outlineRevisionProjectID = ""
            clearFeatureSpineFields()
            syncLiveDraftBridgeProjectContext(clearWhenEmpty: true)
            return
        }
        guard authContextIsCurrent(authContext),
              activeLoadRequestID == requestID,
              ScreenplayProjectLoadApplicationPolicy.shouldApply(
                  selectedProjectIDAtStart: selectedProjectIDAtStart,
                  currentSelectedProjectID: selectedProjectID
              ) else {
            return
        }
        didLoadScreenplayProjectsFromBackend = true
        lastSeenScreenplayStateVersion = result.payload.stateVersion?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        projects = result.payload.screenplayProjects
        // A committed first save can appear as the server's active project
        // before its receipt reaches this device. It is not permission to
        // hydrate over the newer, still-unbound local page on relaunch.
        let bridge = ScreenplayLiveDraftBridge.shared
        if let documentID = bridge.draftOrigin.documentID {
            do {
                let pending = try await draftSaveOutbox.pendingInitialProject(ownerUserID: authContext.userID,
                    backendURL: BackendAuthClient.resolvedBackendBaseURL(), documentID: documentID,
                    sourceProjectID: bridge.preferredProjectID)
                guard authContextIsCurrent(authContext), activeLoadRequestID == requestID,
                      selectedProjectID == selectedProjectIDAtStart else { return }
                if pending != nil {
                    infoText = "Your local page is kept while its first save reconnects."
                    return
                }
            } catch {
                guard authContextIsCurrent(authContext), activeLoadRequestID == requestID else { return }
                errorText = "Project setup recovery could not be read. Your local page is kept: \(error.localizedDescription)"
                return
            }
        }
        let bridgePreferredProjectID = ScreenplayLiveDraftBridge.shared.preferredProjectID
        selectedProjectID = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
            activeProjectId: result.payload.screenplayActiveProjectId,
            preferredProjectId: bridgePreferredProjectID,
            projects: projects
        )
        guard await restorePendingDraftSaveBeforeProjectHydration() else { return }
        await loadSelectedProjectOutline()
        guard authContextIsCurrent(authContext) else { return }
        await refreshPendingScreenplayQuestion()
        guard authContextIsCurrent(authContext) else { return }
        await resumeQueuedDraftSavesIfNeeded()
    }

    func refresh() async {
        await load()
    }

    private func restorePendingDraftSaveBeforeProjectHydration() async -> Bool {
        let projectID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let context = currentStudioAuthContext()
        let documentID = ScreenplayLiveDraftBridge.shared.draftOrigin.documentID
        guard !projectID.isEmpty else { return true }
        let pendingEntry: ScreenplayDraftSaveOutboxEntry?
        do {
            pendingEntry = try await draftSaveOutbox.pendingEntry(projectId: projectID, ownerUserId: context.userID)
        } catch {
            guard authContextIsCurrent(context), selectedProjectID == projectID,
                  ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == documentID,
                  ScreenplayLiveDraftSyncService.shared.ownsEditor(self) else { return false }
            autosaveStatusText = ScreenplayDraftSaveRecoveryPresentationPolicy.unreadableQueueStatus
            errorText = ScreenplayDraftSaveRecoveryPresentationPolicy.unreadableQueueError
            return false
        }
        guard authContextIsCurrent(context), selectedProjectID == projectID,
              ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == documentID,
              ScreenplayLiveDraftSyncService.shared.ownsEditor(self) else { return false }
        if errorText == ScreenplayDraftSaveRecoveryPresentationPolicy.unreadableQueueError { errorText = "" }
        guard let entry = pendingEntry,
              ScreenplayQueuedDraftHydrationPolicy.shouldRestoreBeforeServerHydration(
                expectedAuthContext: context, currentAuthContext: currentStudioAuthContext(),
                selectedProjectID: selectedProjectID, queuedProjectID: entry.projectId, queuedDraft: entry.draft,
                hasUnsavedChanges: hasUnsavedDraftChanges, isManualEditing: isManualDraftEditing
              ) else { return true }
        isHydratingDraft = true
        fountainDraft = entry.draft
        isHydratingDraft = false
        loadedDraftProjectID = projectID
        if !entry.baseVersionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { latestVersionID = entry.baseVersionId }
        adoptLoadedDraftIntoBridge(owner: context)
        isManualDraftEditing = true
        lastManualDraftEditAt = Date()
        hasUnsavedDraftChanges = true
        autosaveStatusText = "Queued locally - reconnecting"
        infoText = "Restored your local screenplay save and reconnecting."
        persistLocalDraftRecovery(projectId: projectID, draft: entry.draft, baseVersionId: entry.baseVersionId, dirty: true)
        return true
    }

    func refreshSelectedProjectForDebug() async {
        await loadSelectedProjectOutline()
    }

    func markManualEditHydrateProtectedForDebugIfNeeded() {
        guard isManualDraftEditing || hasUnsavedDraftChanges else { return }
        autosaveStatusText = "Unsaved changes"
        infoText = "Kept your manual edits on the page. Save when you're ready."
    }

    func refreshLiveDraftBridgeContext() {
        syncLiveDraftBridgeProjectContext()
    }

    var debugLoadedDraftProjectID: String {
        loadedDraftProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    #if DEBUG
    var debugDidLoadScreenplayProjectsFromBackend: Bool {
        didLoadScreenplayProjectsFromBackend
    }

    var debugIsCrossDeviceRefreshInFlight: Bool {
        isCrossDeviceRefreshInFlight
    }

    var debugIsDraftSaveInFlight: Bool {
        isDraftSaveInFlight
    }
    var debugAfterDraftSaveClaim: (() -> Void)?
    #endif

    func selectProject(_ projectID: String) async {
        selectedProjectID = projectID
        clearTransientProjectStateForSelectionChange(to: projectID)
        resetCraftReportForProjectChange()
        await loadSelectedProjectOutline()
        guard selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) ==
                projectID.trimmingCharacters(in: .whitespacesAndNewlines) else {
            return
        }
        await persistActiveProjectSelection(projectID)
        await refreshPendingScreenplayQuestion()
    }

    func refreshPendingScreenplayQuestion() async {
        guard !IOThemRuntime.isRunningTests else { return }
        #if DEBUG
        // The launch fixture owns its question until the UI test resolves it.
        // Outbox notifications must not replace it with an unrelated session.
        if IOThemRuntime.isRunningUITests,
           ProcessInfo.processInfo.arguments.contains("--ui-show-pending-screenplay-question") { return }
        #endif
        let owner = currentStudioAuthContext()
        let selectedID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !selectedID.isEmpty else {
            pendingScreenplayQuestion = nil
            return
        }
        do {
            let session = try await BackendMemoryAPI.shared.bootstrapSession(force: true)
            guard authContextIsCurrent(owner), selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == selectedID else { return }
            let pending = session.pendingScreenplayQuestion
            let pendingProjectID = pending?.projectId.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let queuedQuestionIDs = await OfflineTalkOutbox.shared
                .pendingScreenplayQuestionResolutionIDs()
            guard authContextIsCurrent(owner), selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == selectedID else { return }
            let isQueuedForResolution = pending.map { queuedQuestionIDs.contains($0.id) } ?? false
            pendingScreenplayQuestion = pendingProjectID == selectedID && !isQueuedForResolution
                ? pending
                : nil
        } catch {
            // Keep the last restored question visible during a transient reconnect.
        }
    }

    func dismissPendingScreenplayQuestion(id: String) {
        guard pendingScreenplayQuestion?.id == id else { return }
        pendingScreenplayQuestion = nil
    }

    func replaceDraftFromVoiceBridgeIfNeeded(_ draft: String, draftOriginProjectID: String) {
        guard ScreenplayBridgeDraftAdoptionPolicy.shouldAdoptLiveBridgeDraft(
            selectedProjectId: selectedProjectID,
            currentDraft: fountainDraft,
            bridgeDraft: draft,
            draftOriginProjectId: draftOriginProjectID
        ) else {
            return
        }
        applyServerDraft(draft, versionId: latestVersionID, allowOverwriteDirtyLocalDraft: true)
    }

    /// Live typing from another device of the same account. Replaces the
    /// page text without touching the saved fingerprint: the text is not a
    /// saved version yet, so "unsaved" stays honest until `adoptRemoteLiveVersion`.
    @discardableResult
    func applyRemoteLiveDraft(_ text: String, projectID: String, sourceDeviceID: String) -> Bool {
        guard ScreenplayProjectScopedState.matches(projectID, selectedProjectId: selectedProjectID) else {
            return false
        }
        isFollowingRemoteLiveDraft = true
        isManualDraftEditing = false
        lastManualDraftEditAt = .distantPast
        if !sourceDeviceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            remoteLiveDraftStatusText = "Live from \(LiveDraftDeviceIdentity.displayLabel(for: sourceDeviceID))"
        }
        scheduleRemoteLiveDraftFollowFallback()
        guard fountainDraft != text else { return true }
        isHydratingDraft = true
        fountainDraft = text
        isHydratingDraft = false
        hasUnsavedDraftChanges = fingerprint(for: text) != lastSavedDraftFingerprint
        conflictState = nil
        autosaveStatusText = remoteLiveDraftStatusText
        return true
    }

    /// Preserve a dirty local draft independently before live sync replaces
    /// it with a remote snapshot that has no shared base or cannot merge.
    func preserveLocalDraftForLiveSyncRecovery(_ text: String, projectID: String) {
        guard ScreenplayProjectScopedState.matches(projectID, selectedProjectId: selectedProjectID) else {
            return
        }
        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanProjectID.isEmpty,
              !normalizedText.isEmpty,
              fingerprint(for: text) != lastSavedDraftFingerprint else { return }

        let savedAt = Date().timeIntervalSince1970
        let ownerUserID = currentStudioAuthContext().userID
        localDraftRecoveryStore.savePreservedConflict(
            ownerUserId: ownerUserID,
            projectId: cleanProjectID,
            draft: text,
            baseVersionId: latestVersionID,
            savedAt: savedAt
        )
        recoveryCandidate = LocalDraftRecoveryCandidate(
            projectId: cleanProjectID,
            draft: text,
            baseVersionId: latestVersionID,
            savedAt: savedAt,
            isPreservedConflict: true
        )
        autosaveStatusText = "Local draft protected"
        infoText = "Your unsaved local draft is preserved while live sync loads the other device's text. Recover it or keep the server draft."
    }

    /// The typing device normally announces its saved version within a couple
    /// of seconds. If that never comes (it went offline, its save failed), this
    /// device must not sit on unsaved words forever: resume the normal
    /// autosave path, where a stale base is handled by the conflict flow.
    private func scheduleRemoteLiveDraftFollowFallback() {
        remoteLiveDraftFollowFallbackTask?.cancel()
        remoteLiveDraftFollowFallbackTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(LiveDraftSyncPolicy.followFallbackInterval * 1_000_000_000))
            guard let self, !Task.isCancelled, self.isFollowingRemoteLiveDraft else { return }
            self.isFollowingRemoteLiveDraft = false
            self.remoteLiveDraftFollowFallbackTask = nil
            await self.handleDraftDebouncedChange(self.fountainDraft)
        }
    }

    private func stopFollowingRemoteLiveDraft() {
        isFollowingRemoteLiveDraft = false
        remoteLiveDraftFollowFallbackTask?.cancel()
        remoteLiveDraftFollowFallbackTask = nil
    }

    /// The device that typed the current text saved it as `versionID`. Adopt
    /// that id as our base so the next local edit does not conflict, and mark
    /// the page saved without issuing a duplicate save.
    func adoptRemoteLiveVersion(_ versionID: String, projectID: String, draftChecksum: String) {
        let cleanVersionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanVersionID.isEmpty,
              ScreenplayProjectScopedState.matches(projectID, selectedProjectId: selectedProjectID),
              LiveDraftText.checksum(fountainDraft) == draftChecksum else {
            return
        }
        latestVersionID = cleanVersionID
        lastSavedDraftFingerprint = fingerprint(for: fountainDraft)
        lastRevisionBaseDraft = fountainDraft
        hasUnsavedDraftChanges = false
        stopFollowingRemoteLiveDraft()
        isManualDraftEditing = false
        conflictState = nil
        autosaveStatusText = "Saved"
        if !selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            let ownerUserID = currentStudioAuthContext().userID
            localDraftRecoveryStore.clearOrdinaryDraft(
                ownerUserId: ownerUserID,
                projectId: selectedProjectID
            )
            evaluateLocalDraftRecovery(
                projectId: selectedProjectID,
                serverDraft: fountainDraft
            )
        }
        syncLiveDraftBridgeProjectContext()
    }

    @discardableResult
    func adoptCommittedPageWriteIfNeeded(_ committedWrite: ScreenplayCommittedWrite) -> Bool {
        guard committedWrite.isAuthoritativeWrite,
              authContextIsCurrent(committedWrite.authContext),
              ScreenplayLiveDraftSyncService.shared.ownsEditor(self) else { return false }
        let bridge = ScreenplayLiveDraftBridge.shared
        let committedProjectID = ScreenplayLiveDraftBridge.resolvedCommittedWriteProjectID(
            committedWrite,
            preferredProjectID: bridge.preferredProjectID,
            bindingProjectID: bridge.projectBinding.projectID
        )
        guard ScreenplayCommittedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: selectedProjectID,
            committedProjectID: committedProjectID,
            currentDraft: fountainDraft,
            previousDraft: committedWrite.previousDraft,
            committedDraft: committedWrite.committedDraft
        ) else {
            return false
        }

        let committedDraft = committedWrite.committedDraft
        if !fountainDraft.utf8.elementsEqual(committedDraft.utf8) {
            fountainDraft = committedDraft
        }
        isManualDraftEditing = false
        lastManualDraftEditAt = .distantPast
        hasUnsavedDraftChanges = fingerprint(for: committedDraft) != lastSavedDraftFingerprint
        guard hasUnsavedDraftChanges else { return true }

        autosaveStatusText = "Saving Clementine’s page..."
        persistLocalDraftRecovery(
            projectId: selectedProjectID,
            draft: committedDraft,
            baseVersionId: latestVersionID,
            dirty: true
        )
        let saveIntent = resolvedDraftSaveIntent(for: committedDraft)
        let saveProjectID = selectedProjectID
        let saveDocumentID = bridge.draftOrigin.documentID
        Task {
            guard authContextIsCurrent(committedWrite.authContext),
                  ScreenplayLiveDraftSyncService.shared.ownsEditor(self),
                  selectedProjectID == saveProjectID, bridge.draftOrigin.documentID == saveDocumentID else { return }
            await saveCurrentDraft(
                source: saveIntent.source,
                notes: saveIntent.notes,
                draftOverride: committedDraft
            )
        }
        return true
    }

    @discardableResult
    func adoptSavedPageWriteVersionIfNeeded(
        projectID: String,
        versionID: String,
        committedDraft: String
    ) -> Bool {
        guard ScreenplayBridgeVersionAdoptionPolicy.shouldAdoptCommittedPageWriteBase(
            selectedProjectId: selectedProjectID,
            preferredProjectId: projectID,
            currentVersionId: latestVersionID,
            preferredVersionId: versionID,
            committedDraft: committedDraft
        ) else {
            return false
        }

        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedLocalDraft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedLocalDraft.isEmpty else { return false }
        let committedFingerprint = fingerprint(for: committedDraft)

        latestVersionID = cleanVersionID
        loadedDraftProjectID = cleanProjectID
        lastSavedDraftFingerprint = committedFingerprint
        lastRevisionBaseDraft = committedDraft
        hasUnsavedDraftChanges = fingerprint(for: fountainDraft) != committedFingerprint
        if hasUnsavedDraftChanges {
            autosaveStatusText = "Unsaved changes"
        } else {
            isManualDraftEditing = false
            lastManualDraftEditAt = .distantPast
            autosaveStatusText = "Saved to Studio project"
        }
        persistLocalDraftRecovery(
            projectId: cleanProjectID,
            draft: fountainDraft,
            baseVersionId: cleanVersionID,
            dirty: hasUnsavedDraftChanges
        )
        syncLiveDraftBridgeProjectContext()
        if hasUnsavedDraftChanges {
            scheduleProgrammaticDraftAutosaveIfNeeded(source: "studio_autosave")
        }
        return true
    }

    private func adoptSavedPageWriteVersionFromBridgeIfNeeded(_ versionID: String) {
        guard !IOThemRuntime.isRunningTests else { return }
        let bridge = ScreenplayLiveDraftBridge.shared
        guard let committedWrite = bridge.lastCommittedWrite,
              committedWrite.isAuthoritativeWrite else {
            return
        }
        let writeProjectID = ScreenplayLiveDraftBridge.resolvedCommittedWriteProjectID(
            committedWrite,
            preferredProjectID: bridge.preferredProjectID,
            bindingProjectID: bridge.projectBinding.projectID
        )
        adoptSavedPageWriteVersionIfNeeded(
            projectID: writeProjectID,
            versionID: versionID,
            committedDraft: committedWrite.committedDraft
        )
    }

    func noteManualDraftEdit() {
        guard !isHydratingDraft else { return }
        isManualDraftEditing = true
        stopFollowingRemoteLiveDraft()
        lastManualDraftEditAt = Date()
        let normalized = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        hasUnsavedDraftChanges = fingerprint(for: fountainDraft) != lastSavedDraftFingerprint
        if !normalized.isEmpty {
            persistLocalDraftRecovery(
                projectId: selectedProjectID,
                draft: fountainDraft,
                baseVersionId: latestVersionID,
                dirty: hasUnsavedDraftChanges
            )
        }
        if !isStreamingDraftPreviewActive {
            autosaveStatusText = hasUnsavedDraftChanges ? "Unsaved changes" : "Editing draft"
        }
    }

    func setStreamingDraftPreviewActive(_ isActive: Bool) {
        isStreamingDraftPreviewActive = isActive
        if isActive {
            autosaveStatusText = "Receiving live draft..."
        } else if autosaveStatusText == "Receiving live draft..." {
            autosaveStatusText = hasUnsavedDraftChanges ? "Unsaved changes" : "Ready"
        }
    }

    private var initialProjectContext: StudioActionDocumentContext {
        let state = BackendAuthClient.currentAuthSessionState()
        return .init(auth: currentStudioAuthContext(), projectID: selectedProjectID, draft: fountainDraft,
                     isAuthenticated: state.isAuthenticated && !state.accessExpired)
    }

    @discardableResult
    func adoptInitialProjectReceipt(_ receipt: ScreenplayInitialProjectReceipt) -> Bool {
        guard let metadata = receipt.entry.initialization,
              ScreenplayStudioAuthContextPolicy.matches(expected: receipt.owner.ownerContext, current: currentStudioAuthContext()),
              OfflineTalkRecoveryScope.sameBackend(metadata.backendURL, BackendAuthClient.resolvedBackendBaseURL()),
              ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == metadata.documentID,
              (selectedProjectID == metadata.sourceProjectID || selectedProjectID == receipt.project.id),
              fountainDraft.utf8.elementsEqual(receipt.localDraft.utf8) else { return false }
        let dirty = !fountainDraft.utf8.elementsEqual(receipt.entry.draft.utf8)
        localDraftRecoveryStore.save(ownerUserId: receipt.owner.userID, projectId: receipt.project.id,
            draft: fountainDraft, baseVersionId: receipt.versionID, dirty: dirty)
        clearTransientProjectStateForSelectionChange(to: receipt.project.id)
        upsertProject(receipt.project)
        selectedProject = receipt.project
        selectedProjectID = receipt.project.id
        loadedDraftProjectID = receipt.project.id
        latestVersionID = receipt.versionID
        lastSavedDraftFingerprint = fingerprint(for: receipt.entry.draft)
        lastRevisionBaseDraft = receipt.entry.draft
        hasUnsavedDraftChanges = dirty
        isManualDraftEditing = dirty
        autosaveStatusText = dirty ? "Unsaved changes" : "Saved now"
        infoText = dirty ? "Project recovered. Your newer local edits are kept; Save now to sync them." : "Project and first draft saved."
        return true
    }

    private func finishInitialProject(_ entry: ScreenplayDraftSaveOutboxEntry,
                                      initiating: StudioActionDocumentContext,
                                      owner: BackendAuthRequestIdentity) async throws -> Bool {
        guard initiating.matches(initialProjectContext), let metadata = entry.initialization,
              ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == metadata.documentID,
              (initiating.projectID == metadata.sourceProjectID || initiating.projectID == entry.projectId) else { return false }
        let receipt = try await ScreenplayInitialProjectCreation.save(entry, owner: owner,
            localDraft: initiating.draft, outbox: draftSaveOutbox, api: draftSaveAPI, liveReplyOutbox: liveReplyOutbox)
        guard initiating.matches(initialProjectContext) else { return false }
        let bridge = ScreenplayLiveDraftBridge.shared
        guard bridge.adoptInitialProjectReceipt(receipt, initiating: initiating),
              adoptInitialProjectReceipt(receipt) else { return false }
        try await draftSaveOutbox.finishInitialProjectBinding(id: entry.id, versionID: receipt.versionID, owner: owner)
        return true
    }

    func createProject() async {
        guard !isSaving else { return }
        let title = newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { errorText = "Enter a project title first."; return }
        let initiating = initialProjectContext
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        let backendURL = BackendAuthClient.resolvedBackendBaseURL()
        let scope = OfflineTalkRecoveryScope(identity: owner, backendURL: backendURL)
        let seededDraft = fountainDraft
        isSaving = true
        defer { if scope.isCurrent { isSaving = false } }
        errorText = ""
        do {
            if seededDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                // Intentional blank/title setup is not a failed first-draft fallback.
                let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(title: title,
                    phase: "scene_draft", initiatingIdentity: owner)
                guard initiating.matches(initialProjectContext), newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines) == title,
                      scope.isCurrent, let project = result.payload.project else { return }
                upsertProject(project); selectedProjectID = project.id; selectedProject = project
                infoText = "Project created. The empty page is kept locally."
            } else {
                let bridge = ScreenplayLiveDraftBridge.shared
                guard initiating.matches(initialProjectContext), bridge.preferredProjectID == selectedProjectID else {
                    throw BackendMemoryAPIError.server(status: 409, message: "The selected page changed. Your words are kept.")
                }
                bridge.draftText = seededDraft
                let documentID = try bridge.initialProjectDocumentID(owner: owner)
                let entry = try await draftSaveOutbox.prepareInitialProject(ownerUserID: owner.userID, backendURL: backendURL,
                    documentID: documentID, sourceProjectID: selectedProjectID, draft: seededDraft, title: title,
                    phase: "scene_draft", source: "studio_initial_seed", explicitTitle: true)
                guard initiating.matches(initialProjectContext), scope.isCurrent else { return }
                guard try await finishInitialProject(entry, initiating: initiating, owner: owner) else { return }
            }
            if scope.isCurrent, newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines) == title { newProjectTitle = "" }
            await loadSelectedProjectOutline()
        } catch {
            guard scope.isCurrent else { return }
            errorText = error.localizedDescription
        }
    }
    func pushOutlineSnapshot() async {
        _ = await persistOutlineMutation(
            acts: outline.acts,
            scenes: outline.scenes,
            beats: outline.beats,
            successMessage: "Outline synced.",
            source: "studio_outline_sync"
        )
    }

    func addScene() async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let slugline = newSceneSlugline.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = newSceneTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let objective = newSceneObjective.trimmingCharacters(in: .whitespacesAndNewlines)
        let summary = newSceneSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        if slugline.isEmpty && title.isEmpty && objective.isEmpty && summary.isEmpty {
            errorText = "Add at least a slugline, title, objective, or summary."
            return
        }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let draft = BackendScreenplaySceneDraft(
                slugline: slugline,
                title: title,
                objective: objective,
                summary: summary,
                actId: normalizedOrNil(newSceneActID)
            )
            let result = try await BackendMemoryAPI.shared.upsertScreenplayScene(
                projectId: project.id,
                scene: draft,
                title: project.title
            )
            adoptCanonicalOutlineState(
                result.payload.outlineRevision,
                outline: result.payload.outline,
                project: result.payload.project,
                projectId: project.id
            )
            await reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
            newSceneSlugline = ""
            newSceneTitle = ""
            newSceneObjective = ""
            newSceneSummary = ""
            newSceneActID = ""
            infoText = "Scene saved."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func addSceneFromNavigator(slugline rawSlugline: String) async -> String? {
        guard let project = selectedProject else { return nil }
        let slugline = rawSlugline.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !slugline.isEmpty else { return "Add a slugline first." }

        isSaving = true
        defer { isSaving = false }
        errorText = ""

        do {
            let draft = BackendScreenplaySceneDraft(
                slugline: slugline,
                title: "",
                objective: "",
                summary: "",
                actId: nil
            )
            let result = try await BackendMemoryAPI.shared.upsertScreenplayScene(
                projectId: project.id,
                scene: draft,
                title: project.title
            )
            adoptCanonicalOutlineState(
                result.payload.outlineRevision,
                outline: result.payload.outline,
                project: result.payload.project,
                projectId: project.id
            )
            await reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
            if let scene = result.payload.scene ??
                result.payload.outline?.scenes.last(where: { ($0.slugline ?? "").caseInsensitiveCompare(slugline) == .orderedSame }) {
                beginEditingScene(scene)
            }
            infoText = "Scene added to outline."
            return nil
        } catch {
            errorText = error.localizedDescription
            return error.localizedDescription
        }
    }

    func beginEditingScene(_ scene: BackendScreenplayScene) {
        editingSceneID = scene.id
        editingSceneTitle = scene.title.trimmingCharacters(in: .whitespacesAndNewlines)
        editingSceneObjective = (scene.objective ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        editingSceneSummary = (scene.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func cancelEditingScene() {
        editingSceneID = ""
        editingSceneTitle = ""
        editingSceneObjective = ""
        editingSceneSummary = ""
    }

    func saveEditingScene() async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let sceneId = editingSceneID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sceneId.isEmpty else {
            errorText = "Select a scene to edit."
            return
        }
        guard let existingScene = outline.scenes.first(where: { $0.id == sceneId }) else {
            errorText = "That scene is no longer available."
            cancelEditingScene()
            return
        }

        isSaving = true
        defer { isSaving = false }
        errorText = ""

        do {
            let draft = BackendScreenplaySceneDraft(
                id: existingScene.id,
                slugline: (existingScene.slugline ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                title: editingSceneTitle,
                objective: editingSceneObjective,
                summary: editingSceneSummary,
                actId: existingScene.actId,
                order: existingScene.order,
                status: existingScene.status,
                beatIds: existingScene.beatIds ?? []
            )
            let result = try await BackendMemoryAPI.shared.upsertScreenplayScene(
                projectId: project.id,
                scene: draft,
                title: project.title
            )
            adoptCanonicalOutlineState(
                result.payload.outlineRevision,
                outline: result.payload.outline,
                project: result.payload.project,
                projectId: project.id
            )
            await reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
            infoText = "Scene details saved."
            cancelEditingScene()
        } catch {
            errorText = error.localizedDescription
        }
    }

    func addBeat() async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let editingID = editingBeatID.trimmingCharacters(in: .whitespacesAndNewlines)
        let existingBeat = outline.beats.first(where: { $0.id == editingID })
        let label = newBeatLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let summary = newBeatSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        if label.isEmpty && summary.isEmpty {
            errorText = "Add at least a beat label or summary."
            return
        }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let draft = BackendScreenplayBeatDraft(
                id: existingBeat?.id,
                label: label,
                summary: summary,
                sceneId: normalizedOrNil(newBeatSceneID),
                actId: normalizedOrNil(newBeatActID),
                order: existingBeat?.order,
                status: existingBeat?.status
            )
            let result = try await BackendMemoryAPI.shared.upsertScreenplayBeat(
                projectId: project.id,
                beat: draft,
                title: project.title
            )
            adoptCanonicalOutlineState(
                result.payload.outlineRevision,
                outline: result.payload.outline,
                project: result.payload.project,
                projectId: project.id
            )
            await reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
            newBeatLabel = ""
            newBeatSummary = ""
            newBeatSceneID = ""
            newBeatActID = ""
            editingBeatID = ""
            infoText = existingBeat == nil ? "Beat saved." : "Beat updated."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func beginEditingBeat(_ beat: BackendScreenplayBeat) {
        editingBeatID = beat.id
        newBeatLabel = beat.label.trimmingCharacters(in: .whitespacesAndNewlines)
        newBeatSummary = (beat.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        newBeatSceneID = (beat.sceneId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        newBeatActID = (beat.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func cancelEditingBeat() {
        editingBeatID = ""
        newBeatLabel = ""
        newBeatSummary = ""
        newBeatSceneID = ""
        newBeatActID = ""
    }

    func deleteBeat(_ beat: BackendScreenplayBeat) async {
        guard selectedProject != nil else {
            errorText = "Select a project first."
            return
        }

        let updatedScenes = outline.scenes.map { scene in
            let filteredBeatIDs = (scene.beatIds ?? []).filter { $0 != beat.id }
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: scene.order,
                status: scene.status,
                beatIds: filteredBeatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        let updatedBeats = outline.beats.filter { $0.id != beat.id }

        let accepted = await persistOutlineMutation(
            acts: outline.acts,
            scenes: updatedScenes,
            beats: updatedBeats,
            successMessage: "Beat removed.",
            source: "studio_delete_beat"
        )
        if accepted {
            if editingBeatID == beat.id {
                cancelEditingBeat()
            }
        }
    }

    @discardableResult
    func persistOutlineMutation(
        acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene],
        beats: [BackendScreenplayBeat],
        successMessage: String,
        source: String
    ) async -> Bool {
        guard let project = selectedProject,
              project.id == selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) else {
            errorText = "Select a project first."
            return false
        }

        let ownerUserId = outlineMutationOwnerPartitionID(forProjectID: project.id)
        let visibleOutlineBeforeQueueRestore = outline
        if let latestQueuedEntry = await restoreLatestQueuedOutlineSnapshot(
            projectId: project.id,
            ownerUserId: ownerUserId
        ) {
            let visibleWasLatestQueuedSnapshot = visibleOutlineBeforeQueueRestore.acts == latestQueuedEntry.acts &&
                visibleOutlineBeforeQueueRestore.scenes == latestQueuedEntry.scenes &&
                visibleOutlineBeforeQueueRestore.beats == latestQueuedEntry.beats
            let requestedSnapshotIsLatestQueuedSnapshot = acts == latestQueuedEntry.acts &&
                scenes == latestQueuedEntry.scenes &&
                beats == latestQueuedEntry.beats
            guard visibleWasLatestQueuedSnapshot || requestedSnapshotIsLatestQueuedSnapshot else {
                errorText = "A newer outline change was restored from the local queue. Review it, then apply this edit again."
                infoText = "Your queued outline was preserved without being overwritten."
                return false
            }
        }
        let existingQueue = await outlineMutationOutbox.snapshot(
            ownerUserId: ownerUserId,
            projectId: project.id
        )
        guard existingQueue.parkedCount == 0 else {
            parkedOutlineMutationCount = existingQueue.parkedCount
            queuedOutlineMutationCount = existingQueue.activeCount
            errorText = "Resolve the parked outline change before adding another mutation."
            infoText = "Your current outline remains open without overwriting the parked change."
            return false
        }
        let entryID = UUID().uuidString.lowercased()
        let now = Date().timeIntervalSince1970
        let rawEntry = ScreenplayOutlineMutationOutboxEntry(
            id: entryID,
            projectId: project.id,
            ownerUserId: ownerUserId,
            expectedOutlineRevision: max(0, outlineRevision),
            acts: acts,
            scenes: scenes,
            beats: beats,
            source: source,
            createdAt: now,
            updatedAt: now,
            status: .pending,
            retries: 0,
            nextAttemptAt: now,
            lastError: ""
        )

        let entry: ScreenplayOutlineMutationOutboxEntry
        do {
            let canonical = try canonicalizedOutlineCollections(
                acts: acts,
                scenes: scenes,
                beats: beats
            )
            entry = ScreenplayOutlineMutationOutboxEntry(
                id: rawEntry.id,
                projectId: rawEntry.projectId,
                ownerUserId: rawEntry.ownerUserId,
                expectedOutlineRevision: rawEntry.expectedOutlineRevision,
                acts: canonical.acts,
                scenes: canonical.scenes,
                beats: canonical.beats,
                source: rawEntry.source,
                createdAt: rawEntry.createdAt,
                updatedAt: rawEntry.updatedAt,
                status: rawEntry.status,
                retries: rawEntry.retries,
                nextAttemptAt: rawEntry.nextAttemptAt,
                lastError: rawEntry.lastError
            )
        } catch {
            do {
                let cleanError = error.localizedDescription
                    .replacingOccurrences(of: "\n", with: " ")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                try await outlineMutationOutbox.enqueue(
                    ScreenplayOutlineMutationOutboxEntry(
                        id: rawEntry.id,
                        projectId: rawEntry.projectId,
                        ownerUserId: rawEntry.ownerUserId,
                        expectedOutlineRevision: rawEntry.expectedOutlineRevision,
                        acts: rawEntry.acts,
                        scenes: rawEntry.scenes,
                        beats: rawEntry.beats,
                        source: rawEntry.source,
                        createdAt: rawEntry.createdAt,
                        updatedAt: Date().timeIntervalSince1970,
                        status: .parked,
                        retries: 0,
                        nextAttemptAt: 0,
                        lastError: String(cleanError.prefix(280)),
                        parkedReason: .invalidLocalIntent
                    )
                )
            } catch {
                errorText = "The outline change is invalid and could not be parked safely: \(error.localizedDescription)"
                await refreshOutlineMutationOutboxStatus()
                return false
            }
            errorText = error.localizedDescription
            infoText = "This outline change needs attention before it can sync."
            await refreshOutlineMutationOutboxStatus()
            return false
        }

        outlineMutationAwaitedIDs.insert(entry.id)
        do {
            try await outlineMutationOutbox.enqueue(entry)
        } catch {
            outlineMutationAwaitedIDs.remove(entry.id)
            errorText = "The outline change could not be saved locally: \(error.localizedDescription)"
            await refreshOutlineMutationOutboxStatus()
            return false
        }

        latestOptimisticOutlineMutationByProject[entry.projectId] = entry
        applyOptimisticOutlineMutation(entry)
        errorText = ""
        infoText = successMessage
        await refreshOutlineMutationOutboxStatus()
        await resumeQueuedOutlineMutationsIfNeeded()

        if let accepted = outlineMutationTerminalAcceptance.removeValue(forKey: entry.id) {
            outlineMutationAwaitedIDs.remove(entry.id)
            return accepted
        }
        do {
            let accepted = try await outlineMutationOutbox.status(id: entry.id) != .parked
            outlineMutationAwaitedIDs.remove(entry.id)
            return accepted
        } catch {
            outlineMutationAwaitedIDs.remove(entry.id)
            errorText = "The outline was saved locally, but its queue status could not be read: \(error.localizedDescription)"
            return false
        }
    }

    func refreshOutlineMutationOutboxStatus() async {
        let projectId = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let snapshot = await outlineMutationOutbox.snapshot(
            ownerUserId: outlineMutationOwnerPartitionID(forProjectID: projectId),
            projectId: projectId.isEmpty ? nil : projectId
        )
        queuedOutlineMutationCount = snapshot.activeCount
        parkedOutlineMutationCount = snapshot.parkedCount
    }

    func reconnectAndResumeQueuedOutlineMutations() async {
        await refreshOutlineMutationOutboxStatus()
        await resumeQueuedOutlineMutationsIfNeeded()
    }

    func resumeQueuedOutlineMutationsIfNeeded(force: Bool = false) async {
        guard outlineMutationDrainCoordinator.begin(force: force) else { return }
        isOutlineMutationDrainInFlight = true
        let projectId = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        defer {
            let followUp = outlineMutationDrainCoordinator.finish(
                drainedProjectID: projectId,
                selectedProjectID: selectedProjectID
            )
            isOutlineMutationDrainInFlight = outlineMutationDrainCoordinator.isInFlight
            if followUp.shouldRun {
                Task { @MainActor [weak self] in
                    await self?.resumeQueuedOutlineMutationsIfNeeded(force: followUp.force)
                }
            }
        }
        guard !projectId.isEmpty else {
            await refreshOutlineMutationOutboxStatus()
            return
        }
        let ownerUserId = outlineMutationOwnerPartitionID(forProjectID: projectId)

        do {
            _ = try await outlineMutationOutbox.recoverOrphanedInflight(
                projectId: projectId,
                ownerUserId: ownerUserId,
                error: "Recovering an interrupted outline request before retry."
            )
        } catch {
            errorText = "The local outline queue could not recover an interrupted request: \(error.localizedDescription)"
            infoText = "The same request remains queued and will retry without changing its request ID."
            scheduleOutlineMutationRetry(after: 1)
            await refreshOutlineMutationOutboxStatus()
            return
        }

        _ = await restoreLatestQueuedOutlineSnapshot(
            projectId: projectId,
            ownerUserId: ownerUserId
        )

        var completedCount = 0
        while completedCount < 8 {
            let entry: ScreenplayOutlineMutationOutboxEntry?
            do {
                entry = try await outlineMutationOutbox.beginNext(
                    projectId: projectId,
                    ownerUserId: ownerUserId,
                    force: force && completedCount == 0
                )
            } catch {
                errorText = "The local outline queue could not be read: \(error.localizedDescription)"
                scheduleOutlineMutationRetry(after: 1)
                break
            }
            guard let entry else {
                do {
                    if let head = try await outlineMutationOutbox.headEntry(
                        projectId: projectId,
                        ownerUserId: ownerUserId
                    ), head.status == .pending {
                        let remainingDelay = max(
                            0.1,
                            head.nextAttemptAt - Date().timeIntervalSince1970
                        )
                        scheduleOutlineMutationRetry(after: remainingDelay)
                    }
                } catch {
                    errorText = "The outline retry deadline could not be read: \(error.localizedDescription)"
                }
                break
            }

            applyOptimisticOutlineMutation(
                latestOptimisticOutlineMutationByProject[projectId] ?? entry
            )
            let shouldContinue = await performOutlineMutation(entry)
            if shouldContinue,
               let optimistic = latestOptimisticOutlineMutationByProject[projectId] {
                applyOptimisticOutlineMutation(optimistic)
            }
            guard shouldContinue else { break }
            completedCount += 1
        }
        if completedCount >= 8 {
            do {
                if let head = try await outlineMutationOutbox.headEntry(
                    projectId: projectId,
                    ownerUserId: ownerUserId
                ), head.status == .pending {
                    scheduleOutlineMutationRetry(
                        after: max(0.1, head.nextAttemptAt - Date().timeIntervalSince1970)
                    )
                }
            } catch {
                errorText = "The next outline queue item could not be scheduled: \(error.localizedDescription)"
            }
        }
        await refreshOutlineMutationOutboxStatus()
    }

    @discardableResult
    private func restoreLatestQueuedOutlineSnapshot(
        projectId: String,
        ownerUserId: String
    ) async -> ScreenplayOutlineMutationOutboxEntry? {
        do {
            guard let entry = try await outlineMutationOutbox.latestActiveEntry(
                projectId: projectId,
                ownerUserId: ownerUserId
            ) else {
                latestOptimisticOutlineMutationByProject.removeValue(forKey: projectId)
                return nil
            }
            latestOptimisticOutlineMutationByProject[projectId] = entry
            applyOptimisticOutlineMutation(entry)
            return entry
        } catch {
            errorText = "The latest queued outline could not be restored: \(error.localizedDescription)"
            return nil
        }
    }

    func reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: String) async {
        let normalizedProjectID = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectID.isEmpty else { return }
        _ = await restoreLatestQueuedOutlineSnapshot(
            projectId: normalizedProjectID,
            ownerUserId: outlineMutationOwnerPartitionID(forProjectID: normalizedProjectID)
        )
    }

    private func performOutlineMutation(_ entry: ScreenplayOutlineMutationOutboxEntry) async -> Bool {
        isSaving = true
        defer { isSaving = false }
        var didAttemptAuthRefresh = false

        while true {
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: entry.projectId)
            do {
                let result = try await BackendMemoryAPI.shared.upsertScreenplayOutline(
                    projectId: entry.projectId,
                    acts: entry.acts,
                    scenes: entry.scenes,
                    beats: entry.beats,
                    expectedOutlineRevision: entry.expectedOutlineRevision,
                    clientRequestId: entry.id,
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
                let response = result.payload
                guard let committedRevision = ScreenplayOutlineMutationAcknowledgement
                    .committedRevision(response: response, entry: entry) else {
                    throw BackendMemoryAPIError.invalidResponse
                }

                adoptCanonicalOutlineMutationResponse(response, projectId: entry.projectId)
                do {
                    try await outlineMutationOutbox.markSucceeded(
                        id: entry.id,
                        committedRevision: committedRevision
                    )
                } catch {
                    errorText = "The outline was accepted, but its local queue acknowledgement could not be saved: \(error.localizedDescription)"
                    infoText = "The same request remains queued and will replay safely without changing its request ID."
                    scheduleOutlineMutationRetry(after: 1)
                    await refreshOutlineMutationOutboxStatus()
                    return false
                }
                recordOutlineMutationTerminalAcceptance(true, for: entry.id)
                if latestOptimisticOutlineMutationByProject[entry.projectId]?.id == entry.id {
                    latestOptimisticOutlineMutationByProject.removeValue(forKey: entry.projectId)
                }
                errorText = ""
                return true
            } catch let error as BackendScreenplayOutlineMutationHTTPError {
                if error.statusCode == 401, !didAttemptAuthRefresh {
                    didAttemptAuthRefresh = true
                    do {
                        let refreshed = try await BackendAuthClient.refreshAuthSession(force: true)
                        if refreshed.isAuthenticated {
                            continue
                        }
                    } catch {
                        // The original 401 is the durable mutation outcome that must be parked.
                    }
                }
                return await handleOutlineMutationHTTPError(error, entry: entry)
            } catch {
                return await handleOutlineMutationTransportError(error, entry: entry)
            }
        }
    }

    private func handleOutlineMutationHTTPError(
        _ error: BackendScreenplayOutlineMutationHTTPError,
        entry: ScreenplayOutlineMutationOutboxEntry
    ) async -> Bool {
        if let response = error.response {
            adoptCanonicalOutlineMutationResponse(response, projectId: entry.projectId)
        }
        let responseCode = [error.response?.status, error.response?.error]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")

        if error.statusCode == 425 {
            let retryAfter = TimeInterval(max(0, error.retryAfterMs ?? 1_000)) / 1_000
            return await markOutlineMutationRetryable(
                entry,
                error: error.localizedDescription,
                retryAfter: retryAfter
            )
        }
        if error.statusCode == 409,
           responseCode.contains("replayed_superseded") || responseCode.contains("replayed-superseded") {
            let currentRevision = max(
                0,
                error.response?.outlineRevision ?? error.response?.outline?.revision ?? outlineRevision
            )
            latestOptimisticOutlineMutationByProject.removeValue(forKey: entry.projectId)
            do {
                try await outlineMutationOutbox.markSuperseded(
                    id: entry.id,
                    currentRevision: currentRevision,
                    error: error.localizedDescription
                )
            } catch {
                errorText = "The superseded outline change could not be acknowledged locally: \(error.localizedDescription)"
                infoText = "The same request remains queued and will replay safely without changing its request ID."
                scheduleOutlineMutationRetry(after: 1)
                return false
            }
            recordOutlineMutationTerminalAcceptance(false, for: entry.id)
            errorText = "This outline change was already saved, then superseded by a newer revision."
            infoText = "Showing the newest server outline; the superseded change was not reapplied."
            await refreshOutlineMutationOutboxStatus()
            return false
        }
        if error.statusCode == 408 || error.statusCode == 429 || (500...599).contains(error.statusCode) {
            let retryAfter = error.retryAfterMs.map { TimeInterval(max(0, $0)) / 1_000 }
            return await markOutlineMutationRetryable(
                entry,
                error: error.localizedDescription,
                retryAfter: retryAfter
            )
        }

        let message: String
        let parkedReason: ScreenplayOutlineMutationParkedReason
        if error.statusCode == 401 {
            message = "Your sign-in could not be refreshed. The outline change is parked safely."
            parkedReason = .authenticationRequired
        } else if error.statusCode == 409 && responseCode.contains("stale") {
            message = "The outline changed elsewhere. Your local change is parked for review."
            parkedReason = .staleRevision
        } else if error.statusCode == 409 && responseCode.contains("request_id_reused") {
            message = "The outline request ID was reused with different content. The change is parked."
            parkedReason = .requestIDReused
        } else if error.statusCode == 409 && responseCode.contains("revision_exhausted") {
            message = "The outline revision limit was reached. This change needs support before it can sync."
            parkedReason = .revisionExhausted
        } else if error.statusCode == 413 {
            message = "This outline is too large to sync. The change is parked for review."
            parkedReason = .payloadTooLarge
        } else {
            message = "The backend rejected this outline change. It is parked safely for review."
            parkedReason = .permanentRejection
        }
        return await parkOutlineMutation(
            entry,
            error: error.localizedDescription,
            reason: parkedReason,
            message: message
        )
    }

    private func handleOutlineMutationTransportError(
        _ error: Error,
        entry: ScreenplayOutlineMutationOutboxEntry
    ) async -> Bool {
        let shouldRetry: Bool
        if error is URLError || error is DecodingError {
            shouldRetry = true
        } else if let apiError = error as? BackendMemoryAPIError {
            switch apiError {
            case .invalidResponse:
                shouldRetry = true
            case .invalidBaseURL:
                shouldRetry = false
            case .server(let status, _):
                shouldRetry = status == 408 || status == 425 || status == 429 || (500...599).contains(status)
            }
        } else {
            shouldRetry = false
        }

        if shouldRetry {
            return await markOutlineMutationRetryable(
                entry,
                error: error.localizedDescription,
                retryAfter: nil
            )
        }
        return await parkOutlineMutation(
            entry,
            error: error.localizedDescription,
            reason: .permanentRejection,
            message: "This outline change could not be sent and is parked safely for review."
        )
    }

    private func markOutlineMutationRetryable(
        _ entry: ScreenplayOutlineMutationOutboxEntry,
        error: String,
        retryAfter: TimeInterval?
    ) async -> Bool {
        do {
            try await outlineMutationOutbox.markRetryable(
                id: entry.id,
                error: error,
                retryAfter: retryAfter
            )
            let status = try await outlineMutationOutbox.status(id: entry.id)
            await refreshOutlineMutationOutboxStatus()
            if status == .parked {
                latestOptimisticOutlineMutationByProject.removeValue(forKey: entry.projectId)
                recordOutlineMutationTerminalAcceptance(false, for: entry.id)
                errorText = "Outline sync stopped after repeated failures. The change is parked safely."
                infoText = "Review the parked outline change after reconnecting."
                return false
            }

            let backoff = Self.outlineMutationRetryBackoff[
                min(entry.retries, Self.outlineMutationRetryBackoff.count - 1)
            ]
            scheduleOutlineMutationRetry(after: max(backoff, retryAfter ?? 0))
            errorText = ""
            infoText = "Your outline change is saved locally and will retry automatically."
            return false
        } catch {
            errorText = "The outline retry could not be secured locally: \(error.localizedDescription)"
            infoText = "The original request remains durable and will be recovered with the same request ID."
            scheduleOutlineMutationRetry(after: 1)
            return false
        }
    }

    private func parkOutlineMutation(
        _ entry: ScreenplayOutlineMutationOutboxEntry,
        error: String,
        reason: ScreenplayOutlineMutationParkedReason,
        message: String
    ) async -> Bool {
        // A terminal response may include a newer canonical outline. Never let the
        // rejected optimistic snapshot cover it while local terminal-state persistence recovers.
        latestOptimisticOutlineMutationByProject.removeValue(forKey: entry.projectId)
        do {
            try await outlineMutationOutbox.markParked(
                id: entry.id,
                error: error,
                reason: reason
            )
        } catch {
            errorText = "The rejected outline change could not be parked locally: \(error.localizedDescription)"
            infoText = "The original request remains durable; its terminal state will be recovered locally."
            scheduleOutlineMutationRetry(after: 1)
            return false
        }
        recordOutlineMutationTerminalAcceptance(false, for: entry.id)
        errorText = message
        infoText = "The canonical server outline is still open."
        await refreshOutlineMutationOutboxStatus()
        return false
    }

    private func scheduleOutlineMutationRetry(after delay: TimeInterval) {
        outlineMutationRetryTask?.cancel()
        let boundedDelay = min(1_800, max(0.1, delay + 0.05))
        outlineMutationRetryTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(boundedDelay * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            await self.resumeQueuedOutlineMutationsIfNeeded()
        }
    }

    private func recordOutlineMutationTerminalAcceptance(_ accepted: Bool, for id: String) {
        guard outlineMutationAwaitedIDs.contains(id) else { return }
        outlineMutationTerminalAcceptance[id] = accepted
    }

    private func applyOptimisticOutlineMutation(_ entry: ScreenplayOutlineMutationOutboxEntry) {
        guard selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == entry.projectId else { return }
        outline = BackendScreenplayOutline(
            revision: entry.expectedOutlineRevision,
            updatedAt: Date().timeIntervalSince1970 * 1_000,
            actCount: entry.acts.count,
            sceneCount: entry.scenes.count,
            beatCount: entry.beats.count,
            acts: entry.acts,
            scenes: entry.scenes,
            beats: entry.beats
        )
        reconcileSceneSessionState(with: outline)
        syncLiveDraftBridgeProjectContext()
    }

    private func adoptCanonicalOutlineMutationResponse(
        _ response: BackendScreenplayOutlineMutationResponse,
        projectId: String
    ) {
        guard response.projectId == nil || response.projectId == projectId else { return }
        adoptCanonicalOutlineState(
            response.outlineRevision ?? response.committedRevision,
            outline: response.outline,
            project: response.project,
            projectId: projectId
        )
    }

    @discardableResult
    func adoptCanonicalOutlineState(
        _ responseRevision: Int?,
        outline responseOutline: BackendScreenplayOutline?,
        project responseProject: BackendScreenplayProjectSummary?,
        projectId: String
    ) -> Bool {
        let normalizedProjectID = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        if let responseProject, responseProject.id != normalizedProjectID {
            return false
        }
        let canonicalRevision = [responseRevision, responseOutline?.revision, responseProject?.outlineRevision]
            .compactMap { $0 }
            .first(where: { $0 >= 0 })
        let isSelectedProject = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == normalizedProjectID
        if isSelectedProject,
           outlineRevisionProjectID == normalizedProjectID,
           let canonicalRevision,
           canonicalRevision < outlineRevision {
            return false
        }
        if isSelectedProject, responseOutline != nil, canonicalRevision == nil, outlineRevision > 0 {
            return false
        }

        if let project = responseProject {
            upsertProject(project)
            if isSelectedProject {
                selectedProject = project
            }
        }
        guard isSelectedProject else { return true }
        if let nextOutline = responseOutline {
            outline = nextOutline
            reconcileSceneSessionState(with: nextOutline)
        }
        adoptOutlineMutationRevision(
            canonicalRevision,
            outline: responseOutline,
            project: responseProject,
            projectId: normalizedProjectID
        )
        syncLiveDraftBridgeProjectContext()
        return true
    }

    func adoptOutlineMutationRevision(
        _ responseRevision: Int?,
        outline responseOutline: BackendScreenplayOutline?,
        project responseProject: BackendScreenplayProjectSummary?,
        projectId: String? = nil
    ) {
        let resolvedProjectID = (projectId ?? responseProject?.id ?? selectedProjectID)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if resolvedProjectID != outlineRevisionProjectID {
            outlineRevisionProjectID = resolvedProjectID
            outlineRevision = 0
        }
        let revision = [responseRevision, responseOutline?.revision, responseProject?.outlineRevision]
            .compactMap { $0 }
            .first(where: { $0 >= 0 })
        if let revision {
            outlineRevision = max(outlineRevision, revision)
        }
    }

    private func outlineMutationOwnerPartitionID(forProjectID projectID: String) -> String {
        let ownerHeaders = projectOwnerHeaderOptions(forProjectID: projectID)
        if ownerHeaders.usesDebugClientTokenOwner {
            let clientToken = (ownerHeaders.clientTokenOverride ?? BackendAuthClient.sharedClientToken() ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return ScreenplayOutlineMutationOwnerPartition.client(
                token: clientToken,
                fallbackProjectId: projectID
            )
        }
        return ScreenplayOutlineMutationOwnerPartition.user(
            BackendAuthClient.currentAuthSessionState().user?.userId
                ?? BackendAuthClient.sharedUserID()
        )
    }

    private func canonicalizedOutlineCollections(
        acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene],
        beats: [BackendScreenplayBeat]
    ) throws -> CanonicalOutlineCollections {
        let actIDs = try stableOutlineEntityIDs(acts.map(\.id), entityName: "act")
        let sceneIDs = try stableOutlineEntityIDs(scenes.map(\.id), entityName: "scene")
        _ = try stableOutlineEntityIDs(beats.map(\.id), entityName: "beat")

        var sceneActByID: [String: String] = [:]
        for scene in scenes {
            if let actId = try stableOutlineReference(scene.actId, field: "scene.actId") {
                guard actIDs.contains(actId) else {
                    throw OutlineMutationValidationError(
                        message: "Scene \(scene.id) references an act that is no longer in this outline."
                    )
                }
                sceneActByID[scene.id] = actId
            }
        }

        var beatSceneByID: [String: String] = [:]
        for beat in beats {
            let sceneId = try stableOutlineReference(beat.sceneId, field: "beat.sceneId")
            let actId = try stableOutlineReference(beat.actId, field: "beat.actId")
            if let sceneId {
                guard sceneIDs.contains(sceneId) else {
                    throw OutlineMutationValidationError(
                        message: "Beat \(beat.id) references a scene that is no longer in this outline."
                    )
                }
                beatSceneByID[beat.id] = sceneId
            }
            if let actId {
                guard actIDs.contains(actId) else {
                    throw OutlineMutationValidationError(
                        message: "Beat \(beat.id) references an act that is no longer in this outline."
                    )
                }
            }
            if let sceneId,
               let actId,
               let sceneActId = sceneActByID[sceneId],
               sceneActId != actId {
                throw OutlineMutationValidationError(
                    message: "Beat \(beat.id) and its scene reference different acts."
                )
            }
        }

        let canonicalActs = acts.map { act in
            BackendScreenplayAct(
                id: act.id,
                title: act.title,
                summary: act.summary,
                order: act.order,
                sceneIds: scenes.compactMap { sceneActByID[$0.id] == act.id ? $0.id : nil },
                createdAt: act.createdAt,
                updatedAt: act.updatedAt
            )
        }
        let canonicalScenes = scenes.map { scene in
            BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: scene.order,
                status: scene.status,
                beatIds: beats.compactMap { beatSceneByID[$0.id] == scene.id ? $0.id : nil },
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        return CanonicalOutlineCollections(acts: canonicalActs, scenes: canonicalScenes, beats: beats)
    }

    private func stableOutlineEntityIDs(
        _ ids: [String],
        entityName: String
    ) throws -> Set<String> {
        var result = Set<String>()
        for id in ids {
            guard isStableOutlineIdentifier(id) else {
                throw OutlineMutationValidationError(
                    message: "Every outline \(entityName) needs a stable ID of 64 characters or fewer."
                )
            }
            guard result.insert(id).inserted else {
                throw OutlineMutationValidationError(
                    message: "Outline \(entityName) IDs must be unique."
                )
            }
        }
        return result
    }

    private func stableOutlineReference(_ value: String?, field: String) throws -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard isStableOutlineIdentifier(value) else {
            throw OutlineMutationValidationError(
                message: "The \(field) reference is not a stable outline ID."
            )
        }
        return value
    }

    private func isStableOutlineIdentifier(_ value: String) -> Bool {
        let normalizedWhitespace = value
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
        return !value.isEmpty && value.count <= 64 && normalizedWhitespace == value
    }

    func moveBeat(_ beat: BackendScreenplayBeat, direction: InspectorReorderDirection) async {
        guard let mutation = BeatOrderMutationPlanner.moving(
            beatID: beat.id,
            to: .oneStep(direction),
            in: outline
        ) else { return }
        await persistBeatOrderMutation(mutation)
    }

    func moveBeat(id beatID: String, before targetBeatID: String?) async {
        let destination = targetBeatID.map(InspectorOrderDestination.before) ?? .end
        guard let mutation = BeatOrderMutationPlanner.moving(
            beatID: beatID,
            to: destination,
            in: outline
        ) else { return }
        await persistBeatOrderMutation(mutation)
    }

    private func persistBeatOrderMutation(_ mutation: BeatOrderMutation) async {
        let updatedActs = InspectorOrderSupport.rebuiltActs(outline.acts, scenes: mutation.scenes)
        _ = await persistOutlineMutation(
            acts: updatedActs,
            scenes: mutation.scenes,
            beats: mutation.beats,
            successMessage: "Reordered beats.",
            source: "studio_reorder_beats"
        )
    }

    func moveAct(_ act: BackendScreenplayAct, direction: InspectorReorderDirection) async {
        guard let mutation = ActOrderMutationPlanner.moving(
            actID: act.id,
            to: .oneStep(direction),
            in: outline
        ) else { return }
        await persistActOrderMutation(mutation)
    }

    func moveAct(id actID: String, before targetActID: String?) async {
        let destination = targetActID.map(InspectorOrderDestination.before) ?? .end
        guard let mutation = ActOrderMutationPlanner.moving(
            actID: actID,
            to: destination,
            in: outline
        ) else { return }
        await persistActOrderMutation(mutation)
    }

    private func persistActOrderMutation(_ mutation: ActOrderMutation) async {
        _ = await persistOutlineMutation(
            acts: mutation.acts,
            scenes: outline.scenes,
            beats: outline.beats,
            successMessage: "Reordered outline sections.",
            source: "studio_reorder_acts"
        )
    }

    func moveScene(_ scene: BackendScreenplayScene, direction: InspectorReorderDirection) async {
        guard let mutation = SceneOrderMutationPlanner.moving(
            sceneID: scene.id,
            to: .oneStep(direction),
            in: outline
        ) else { return }
        await persistSceneOrderMutation(mutation)
    }

    func moveScene(id sceneID: String, before targetSceneID: String?, targetActID: String?) async {
        let destination: SceneOrderDestination
        if let targetSceneID {
            destination = .before(sceneID: targetSceneID, targetActID: targetActID)
        } else {
            destination = .end(targetActID: targetActID)
        }
        guard let mutation = SceneOrderMutationPlanner.moving(
            sceneID: sceneID,
            to: destination,
            in: outline
        ) else { return }
        await persistSceneOrderMutation(mutation)
    }

    private func persistSceneOrderMutation(_ mutation: SceneOrderMutation) async {
        _ = await persistOutlineMutation(
            acts: mutation.acts,
            scenes: mutation.scenes,
            beats: mutation.beats,
            successMessage: "Reordered scenes in the outline.",
            source: "studio_reorder_scenes"
        )
    }

    func linkBeat(_ beat: BackendScreenplayBeat, to scene: BackendScreenplayScene) async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }

        isSaving = true
        defer { isSaving = false }
        errorText = ""

        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayBeat(
                projectId: project.id,
                beat: BackendScreenplayBeatDraft(
                    id: beat.id,
                    label: beat.label,
                    summary: beat.summary ?? "",
                    sceneId: scene.id,
                    actId: scene.actId ?? beat.actId,
                    order: beat.order,
                    status: beat.status
                ),
                title: project.title,
                phase: project.lastPhase
            )
            adoptCanonicalOutlineState(
                result.payload.outlineRevision,
                outline: result.payload.outline,
                project: result.payload.project,
                projectId: project.id
            )
            await reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
            if editingBeatID == beat.id {
                newBeatSceneID = scene.id
                newBeatActID = (scene.actId ?? beat.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            }
            infoText = "Linked \(beat.label) to \(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title)."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func promoteBeatToSceneGoal(_ beat: BackendScreenplayBeat, scene: BackendScreenplayScene) async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }

        let nextObjectiveSource = (beat.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? beat.label
            : beat.summary ?? beat.label
        let nextObjective = nextObjectiveSource.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !nextObjective.isEmpty else {
            errorText = "That beat needs a label or summary before it can become a scene goal."
            return
        }

        isSaving = true
        defer { isSaving = false }
        errorText = ""

        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayScene(
                projectId: project.id,
                scene: BackendScreenplaySceneDraft(
                    id: scene.id,
                    slugline: (scene.slugline ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                    title: scene.title,
                    objective: nextObjective,
                    summary: (scene.summary ?? "").trimmingCharacters(in: .whitespacesAndNewlines),
                    actId: scene.actId,
                    order: scene.order,
                    status: scene.status,
                    beatIds: scene.beatIds ?? []
                ),
                title: project.title,
                phase: project.lastPhase
            )
            adoptCanonicalOutlineState(
                result.payload.outlineRevision,
                outline: result.payload.outline,
                project: result.payload.project,
                projectId: project.id
            )
            await reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
            infoText = "Promoted \(beat.label) into the goal for \(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title)."
        } catch {
            errorText = error.localizedDescription
        }
    }

    @discardableResult
    func applyDevelopmentReplyToOutline(prompt: String, reply: String) async -> Bool {
        guard selectedProject != nil else {
            errorText = "Select a project first."
            return false
        }

        let parsed = Self.parseDevelopmentOutline(prompt: prompt, reply: reply)
        guard !parsed.actTitles.isEmpty || !parsed.beats.isEmpty else {
            errorText = "Ask io.them for a beat sheet or outline, then try Apply to Outline again."
            return false
        }

        let mergedActsResult = Self.mergeImportedActs(
            existing: outline.acts,
            parsedActTitles: parsed.actTitles,
            parsedBeatCount: parsed.beats.count
        )
        let mergedBeats = Self.mergeImportedBeats(
            existing: outline.beats,
            parsedBeats: parsed.beats,
            actIdByTitle: mergedActsResult.actIdByTitle
        )

        let addedActCount = max(0, mergedActsResult.acts.count - outline.acts.count)
        let addedBeatCount = max(0, mergedBeats.count - outline.beats.count)
        guard addedActCount > 0 || addedBeatCount > 0 else {
            infoText = "Outline already reflects that development note."
            return false
        }

        var parts: [String] = []
        if addedActCount > 0 {
            parts.append("\(addedActCount) act\(addedActCount == 1 ? "" : "s")")
        }
        if addedBeatCount > 0 {
            parts.append("\(addedBeatCount) beat\(addedBeatCount == 1 ? "" : "s")")
        }
        return await persistOutlineMutation(
            acts: mergedActsResult.acts,
            scenes: outline.scenes,
            beats: mergedBeats,
            successMessage: "Applied to Outline: " + parts.joined(separator: " and ") + ".",
            source: "studio_development_import"
        )
    }

    private struct ParsedDevelopmentOutline {
        struct BeatDraft {
            let label: String
            let summary: String
            let actTitle: String?
        }

        let actTitles: [String]
        let beats: [BeatDraft]
    }

    private struct MergedActsResult {
        let acts: [BackendScreenplayAct]
        let actIdByTitle: [String: String]
    }

    private static func parseDevelopmentOutline(prompt: String, reply: String) -> ParsedDevelopmentOutline {
        let cleanReply = normalizedOutlineImportText(reply)
        guard !cleanReply.isEmpty else {
            return ParsedDevelopmentOutline(actTitles: [], beats: [])
        }

        let promptHint = prompt.lowercased()
        let rawLines = cleanReply
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var actTitles: [String] = []
        var parsedBeats: [ParsedDevelopmentOutline.BeatDraft] = []
        var currentActTitle: String? = nil
        var isInsideBeatsSection = false

        for rawLine in rawLines {
            if let actTitle = normalizedActTitle(from: rawLine) {
                currentActTitle = actTitle
                if !actTitles.contains(actTitle) {
                    actTitles.append(actTitle)
                }
                continue
            }

            if isOutlineSectionHeader(rawLine) {
                isInsideBeatsSection = true
                continue
            }

            let stripped = strippedOutlineListPrefix(rawLine)
            guard !stripped.isEmpty else { continue }

            let isStructuredBeat = isInsideBeatsSection
                || rawLine != stripped
                || stripped.contains(":")
            guard isStructuredBeat else { continue }
            guard !isLikelyStandaloneHeading(stripped) else { continue }

            let labelSummary = beatLabelAndSummary(for: stripped, index: parsedBeats.count)
            parsedBeats.append(
                ParsedDevelopmentOutline.BeatDraft(
                    label: labelSummary.label,
                    summary: labelSummary.summary,
                    actTitle: currentActTitle
                )
            )
        }

        if parsedBeats.isEmpty {
            let fallbackSentences = developmentImportSentences(from: cleanReply)
            let wantsOutlineShape = promptHint.contains("outline")
                || promptHint.contains("beat sheet")
                || promptHint.contains("beat-sheet")
                || promptHint.contains("story beats")
                || promptHint.contains("synopsis")
            let limitedSentences = Array(fallbackSentences.prefix(wantsOutlineShape ? 5 : 4))
            parsedBeats = limitedSentences.enumerated().map { index, sentence in
                ParsedDevelopmentOutline.BeatDraft(
                    label: fallbackBeatLabel(index: index, total: limitedSentences.count),
                    summary: sentence,
                    actTitle: defaultActTitle(for: index, total: limitedSentences.count)
                )
            }
        }

        if actTitles.isEmpty, parsedBeats.count >= 4 {
            actTitles = ["Act I", "Act II", "Act III"]
            parsedBeats = parsedBeats.enumerated().map { index, beat in
                ParsedDevelopmentOutline.BeatDraft(
                    label: beat.label,
                    summary: beat.summary,
                    actTitle: beat.actTitle ?? defaultActTitle(for: index, total: parsedBeats.count)
                )
            }
        }

        return ParsedDevelopmentOutline(
            actTitles: actTitles,
            beats: parsedBeats
        )
    }

    private static func mergeImportedActs(
        existing: [BackendScreenplayAct],
        parsedActTitles: [String],
        parsedBeatCount: Int
    ) -> MergedActsResult {
        var acts = existing
        let desiredTitles = parsedActTitles.isEmpty && parsedBeatCount >= 4
            ? ["Act I", "Act II", "Act III"]
            : parsedActTitles

        var actIdByTitle = Dictionary(
            acts.map {
                (normalizedOutlineKey($0.title), $0.id)
            },
            uniquingKeysWith: { first, _ in first }
        )

        for (index, title) in desiredTitles.enumerated() {
            let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let key = normalizedOutlineKey(cleanTitle)
            guard !cleanTitle.isEmpty, actIdByTitle[key] == nil else { continue }
            let nextAct = BackendScreenplayAct(
                id: "act-\(UUID().uuidString.lowercased())",
                title: cleanTitle,
                summary: nil,
                order: (acts.last?.order ?? (acts.count - 1)) + max(1, index + 1),
                sceneIds: nil,
                createdAt: nil,
                updatedAt: nil
            )
            acts.append(nextAct)
            actIdByTitle[key] = nextAct.id
        }

        return MergedActsResult(acts: acts, actIdByTitle: actIdByTitle)
    }

    private static func mergeImportedBeats(
        existing: [BackendScreenplayBeat],
        parsedBeats: [ParsedDevelopmentOutline.BeatDraft],
        actIdByTitle: [String: String]
    ) -> [BackendScreenplayBeat] {
        var beats = existing
        var seenKeys = Set(existing.map {
            normalizedOutlineKey($0.label) + "|" + normalizedOutlineKey($0.summary ?? "")
        })
        var nextOrder = (existing.compactMap(\.order).max() ?? (existing.count - 1)) + 1

        for beat in parsedBeats {
            let label = beat.label.trimmingCharacters(in: .whitespacesAndNewlines)
            let summary = beat.summary.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !label.isEmpty || !summary.isEmpty else { continue }

            let key = normalizedOutlineKey(label) + "|" + normalizedOutlineKey(summary)
            guard !seenKeys.contains(key) else { continue }

            let actId = beat.actTitle.flatMap { actIdByTitle[normalizedOutlineKey($0)] }
            beats.append(
                BackendScreenplayBeat(
                    id: "beat-\(UUID().uuidString.lowercased())",
                    label: label.isEmpty ? "Beat \(nextOrder + 1)" : label,
                    summary: summary.isEmpty ? nil : summary,
                    sceneId: nil,
                    actId: actId,
                    order: nextOrder,
                    status: nil,
                    createdAt: nil,
                    updatedAt: nil
                )
            )
            seenKeys.insert(key)
            nextOrder += 1
        }

        return beats
    }

    private static func normalizedOutlineImportText(_ text: String) -> String {
        text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizedOutlineKey(_ text: String) -> String {
        text
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func normalizedActTitle(from line: String) -> String? {
        let lower = line.lowercased()
        let mapping: [(String, String)] = [
            ("act i", "Act I"),
            ("act 1", "Act I"),
            ("act one", "Act I"),
            ("act ii", "Act II"),
            ("act 2", "Act II"),
            ("act two", "Act II"),
            ("act iii", "Act III"),
            ("act 3", "Act III"),
            ("act three", "Act III")
        ]
        return mapping.first(where: { lower.hasPrefix($0.0) })?.1
    }

    private static func isOutlineSectionHeader(_ line: String) -> Bool {
        let clean = normalizedOutlineKey(line)
        return clean == "beats"
            || clean == "beat sheet"
            || clean == "outline"
            || clean == "story beats"
            || clean == "story spine"
    }

    private static func strippedOutlineListPrefix(_ line: String) -> String {
        line
            .replacingOccurrences(of: #"^\s*(?:[-*•]+|\d+[.)])\s*"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func isLikelyStandaloneHeading(_ line: String) -> Bool {
        let clean = normalizedOutlineKey(line)
        guard !clean.isEmpty else { return true }
        let headingSignals = [
            "story engine",
            "synopsis",
            "theme",
            "hook",
            "premise",
            "why it works",
            "development moves"
        ]
        if headingSignals.contains(clean) {
            return true
        }
        return clean.split(separator: " ").count <= 2 && !line.contains(":")
    }

    private static func beatLabelAndSummary(for line: String, index: Int) -> (label: String, summary: String) {
        let clean = line.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = clean.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        if parts.count == 2 {
            let candidateLabel = parts[0].trimmingCharacters(in: .whitespacesAndNewlines)
            let candidateSummary = parts[1].trimmingCharacters(in: .whitespacesAndNewlines)
            if candidateLabel.split(separator: " ").count <= 5 && !candidateSummary.isEmpty {
                return (titleCaseLabel(candidateLabel), candidateSummary)
            }
        }
        return (fallbackBeatLabel(index: index, total: 6), clean)
    }

    private static func developmentImportSentences(from text: String) -> [String] {
        let sanitized = text
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: #"(?i)\b(story engine|synopsis|development moves|beats|outline):"#, with: "", options: .regularExpression)
        let pieces = sanitized.components(separatedBy: .punctuationCharacters)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { $0.split(separator: " ").count >= 4 }
        return pieces
    }

    private static func fallbackBeatLabel(index: Int, total: Int) -> String {
        let defaultLabels = total >= 5
            ? ["Setup", "Complication", "Pressure", "Break", "Aftermath"]
            : ["Setup", "Pressure", "Turn", "Aftermath"]
        if index < defaultLabels.count {
            return defaultLabels[index]
        }
        return "Beat \(index + 1)"
    }

    private static func defaultActTitle(for index: Int, total: Int) -> String? {
        guard total >= 4 else { return nil }
        if index <= 1 { return "Act I" }
        if index >= total - 1 { return "Act III" }
        return "Act II"
    }

    private static func titleCaseLabel(_ text: String) -> String {
        text
            .split(separator: " ")
            .map { part in
                let lower = part.lowercased()
                return lower.prefix(1).uppercased() + lower.dropFirst()
            }
            .joined(separator: " ")
    }

    func refreshCollaborationData(source: String = "Background") async {
        let id = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        guard !isCollaborationRefreshing else { return }

        isCollaborationRefreshing = true
        defer { isCollaborationRefreshing = false }
        collaborationErrorText = ""
        do {
            try await loadCollaborators(projectId: id)
            try await loadComments(projectId: id)
        } catch {
            collaborationErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "collaboration"
            )
        }
    }

    func approveCollaborator() async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let email = collaboratorEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            errorText = "Enter a collaborator email."
            return
        }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: project.id)
            let result: BackendReadResult<BackendScreenplayCollaboratorsResponse>
            do {
                result = try await projectSelectionAPI.upsertScreenplayCollaborator(
                    projectId: project.id,
                    email: email,
                    action: "approve",
                    note: collaboratorNote,
                    invitedBy: collaboratorInvitedBy,
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                result = try await projectSelectionAPI.upsertScreenplayCollaborator(
                    projectId: project.id,
                    email: email,
                    action: "approve",
                    note: collaboratorNote,
                    invitedBy: collaboratorInvitedBy
                )
            }
            applyCollaboratorsPayload(result.payload)
            collaboratorEmail = ""
            collaboratorNote = ""
            collaboratorInvitedBy = ""
            infoText = "Collaborator approved."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func revokeCollaborator(email: String) async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: project.id)
            let result: BackendReadResult<BackendScreenplayCollaboratorsResponse>
            do {
                result = try await projectSelectionAPI.upsertScreenplayCollaborator(
                    projectId: project.id,
                    email: normalizedEmail,
                    action: "revoke",
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                result = try await projectSelectionAPI.upsertScreenplayCollaborator(
                    projectId: project.id,
                    email: normalizedEmail,
                    action: "revoke"
                )
            }
            applyCollaboratorsPayload(result.payload)
            infoText = "Collaborator removed."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func addComment() async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let text = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
        let voiceURL = commentVoiceURL.trimmingCharacters(in: .whitespacesAndNewlines)
        let voiceTranscript = commentVoiceTranscript.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !voiceURL.isEmpty || !voiceTranscript.isEmpty else {
            errorText = "Add comment text or voice note details."
            return
        }
        let anchorLine = Int(commentAnchorLine.trimmingCharacters(in: .whitespacesAndNewlines))
        let durationMs = Int(commentVoiceDurationMs.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        let authorEmail = resolvedCommentAuthorEmail()
        let actorEmail = resolvedCommentActorEmail()

        if !approvedEmails.isEmpty && authorEmail.isEmpty {
            errorText = "Use an approved author email for comments."
            return
        }

        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: project.id)
            let result: BackendReadResult<BackendScreenplayCommentsResponse>
            do {
                result = try await projectSelectionAPI.upsertScreenplayComment(
                    projectId: project.id,
                    text: text,
                    authorEmail: authorEmail,
                    authorName: commentAuthorName,
                    anchorLine: anchorLine,
                    versionId: latestVersionID,
                    voiceURL: voiceURL,
                    voiceTranscript: voiceTranscript,
                    voiceDurationMs: durationMs,
                    type: normalizedCommentType(),
                    action: commentEditID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "create" : "update",
                    commentId: commentEditID,
                    parentCommentId: commentReplyToID,
                    actorEmail: actorEmail,
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                result = try await projectSelectionAPI.upsertScreenplayComment(
                    projectId: project.id,
                    text: text,
                    authorEmail: authorEmail,
                    authorName: commentAuthorName,
                    anchorLine: anchorLine,
                    versionId: latestVersionID,
                    voiceURL: voiceURL,
                    voiceTranscript: voiceTranscript,
                    voiceDurationMs: durationMs,
                    type: normalizedCommentType(),
                    action: commentEditID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "create" : "update",
                    commentId: commentEditID,
                    parentCommentId: commentReplyToID,
                    actorEmail: actorEmail
                )
            }
            applyCommentsPayload(result.payload)
            clearCommentComposer()
            infoText = "Comment saved."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func deleteComment(_ comment: BackendScreenplayComment) async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let id = comment.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let actorEmail = resolvedCommentActorEmail()
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: project.id)
            let result: BackendReadResult<BackendScreenplayCommentsResponse>
            do {
                result = try await projectSelectionAPI.upsertScreenplayComment(
                    projectId: project.id,
                    text: "",
                    authorEmail: comment.authorEmail ?? "",
                    authorName: comment.authorName ?? "",
                    anchorLine: comment.anchorLine,
                    versionId: comment.versionId ?? latestVersionID,
                    voiceURL: "",
                    voiceTranscript: "",
                    voiceDurationMs: 0,
                    type: comment.type ?? "text",
                    action: "delete",
                    commentId: id,
                    parentCommentId: comment.parentCommentId ?? "",
                    actorEmail: actorEmail,
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                result = try await projectSelectionAPI.upsertScreenplayComment(
                    projectId: project.id,
                    text: "",
                    authorEmail: comment.authorEmail ?? "",
                    authorName: comment.authorName ?? "",
                    anchorLine: comment.anchorLine,
                    versionId: comment.versionId ?? latestVersionID,
                    voiceURL: "",
                    voiceTranscript: "",
                    voiceDurationMs: 0,
                    type: comment.type ?? "text",
                    action: "delete",
                    commentId: id,
                    parentCommentId: comment.parentCommentId ?? "",
                    actorEmail: actorEmail
                )
            }
            applyCommentsPayload(result.payload)
            if commentEditID == id {
                clearCommentComposer()
            }
            infoText = "Comment removed."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func setCommentResolved(_ comment: BackendScreenplayComment, resolved: Bool) async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        let id = comment.id.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let actorEmail = resolvedCommentActorEmail()
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: project.id)
            let result: BackendReadResult<BackendScreenplayCommentsResponse>
            do {
                result = try await projectSelectionAPI.upsertScreenplayComment(
                    projectId: project.id,
                    text: "",
                    authorEmail: comment.authorEmail ?? "",
                    authorName: comment.authorName ?? "",
                    anchorLine: comment.anchorLine,
                    versionId: comment.versionId ?? latestVersionID,
                    voiceURL: "",
                    voiceTranscript: "",
                    voiceDurationMs: 0,
                    type: comment.type ?? "text",
                    action: resolved ? "resolve" : "unresolve",
                    commentId: id,
                    parentCommentId: comment.parentCommentId ?? "",
                    actorEmail: actorEmail,
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                result = try await projectSelectionAPI.upsertScreenplayComment(
                    projectId: project.id,
                    text: "",
                    authorEmail: comment.authorEmail ?? "",
                    authorName: comment.authorName ?? "",
                    anchorLine: comment.anchorLine,
                    versionId: comment.versionId ?? latestVersionID,
                    voiceURL: "",
                    voiceTranscript: "",
                    voiceDurationMs: 0,
                    type: comment.type ?? "text",
                    action: resolved ? "resolve" : "unresolve",
                    commentId: id,
                    parentCommentId: comment.parentCommentId ?? "",
                    actorEmail: actorEmail
                )
            }
            applyCommentsPayload(result.payload)
            infoText = resolved ? "Comment resolved." : "Comment reopened."
        } catch {
            errorText = error.localizedDescription
        }
    }

    func startReply(to comment: BackendScreenplayComment) {
        commentEditID = ""
        commentReplyToID = comment.id
        commentType = "text"
        commentText = ""
        let actor = resolvedCommentActorEmail()
        if commentAuthorEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            commentAuthorEmail = actor
        }
        infoText = "Replying to \(comment.id)."
    }

    func startEdit(_ comment: BackendScreenplayComment) {
        commentEditID = comment.id
        commentReplyToID = comment.parentCommentId ?? ""
        commentType = (comment.type ?? "text").lowercased() == "voice" ? "voice" : "text"
        commentText = comment.text ?? ""
        commentAuthorEmail = comment.authorEmail ?? commentAuthorEmail
        commentAuthorName = comment.authorName ?? commentAuthorName
        commentAnchorLine = comment.anchorLine.map(String.init) ?? ""
        commentVoiceURL = comment.voiceUrl ?? ""
        commentVoiceTranscript = comment.voiceTranscript ?? ""
        if let ms = comment.voiceDurationMs, ms > 0 {
            commentVoiceDurationMs = String(ms)
        } else {
            commentVoiceDurationMs = ""
        }
        infoText = "Editing comment \(comment.id)."
    }

    func clearCommentComposer() {
        commentText = ""
        commentAnchorLine = ""
        commentVoiceURL = ""
        commentVoiceTranscript = ""
        commentVoiceDurationMs = ""
        commentType = "text"
        commentReplyToID = ""
        commentEditID = ""
    }

    func preloadVoiceComment(from latestVoiceTurn: String) {
        let cleaned = latestVoiceTurn.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return }
        commentType = "voice"
        if commentVoiceTranscript.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            commentVoiceTranscript = cleaned
        }
        if commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            commentText = "Voice note"
        }
        infoText = "Latest voice turn loaded into voice comment."
    }

    func manualSaveDraft() async {
        let owner = BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: false)
        let scope = OfflineTalkRecoveryScope(identity: owner, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        if !isSaving, let documentID = ScreenplayLiveDraftBridge.shared.draftOrigin.documentID {
            do {
                if let entry = try await draftSaveOutbox.pendingInitialProject(ownerUserID: owner.userID,
                    backendURL: scope.backendURL, documentID: documentID, sourceProjectID: selectedProjectID) {
                    let initiating = initialProjectContext
                    isSaving = true
                    let recovered: Bool
                    do { recovered = try await finishInitialProject(entry, initiating: initiating, owner: owner) }
                    catch { if scope.isCurrent { isSaving = false }; throw error }
                    if scope.isCurrent { isSaving = false }
                    guard recovered, scope.isCurrent else { return }
                }
            } catch {
                if scope.isCurrent { errorText = "Project setup is kept locally: \(error.localizedDescription)" }
                return
            }
        }
        await saveCurrentDraft(source: "studio_manual")
    }

    #if DEBUG
    func applyStructuralUITestDraft(_ draft: String, versionID: String) {
        let normalizedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVersionID = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        isHydratingDraft = true
        fountainDraft = draft
        latestVersionID = normalizedVersionID
        isHydratingDraft = false
        loadedDraftProjectID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        isManualDraftEditing = false
        lastManualDraftEditAt = .distantPast
        lastSavedDraftFingerprint = fingerprint(for: draft)
        lastRevisionBaseDraft = draft
        hasUnsavedDraftChanges = false
        autosaveStatusText = normalizedDraft.isEmpty ? "Ready" : "Loaded latest draft"
        recoveryCandidate = nil
        let projectID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        if !projectID.isEmpty {
            clearLocalDraftRecovery(projectId: projectID)
        }
    }

    @discardableResult
    func runQueuedSaveNetworkFaultUITest(marker: String) async -> Bool {
        let cleanMarker = marker.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanMarker.isEmpty else { return false }
        for _ in 0..<40 where selectedProject?.id != selectedProjectID || loadedDraftProjectID != selectedProjectID
            || isLoading || isDraftSaveInFlight || isSaving {
            guard !Task.isCancelled else { return false }
            try? await Task.sleep(for: .milliseconds(250))
        }
        guard !Task.isCancelled, !selectedProjectID.isEmpty, selectedProject?.id == selectedProjectID,
              loadedDraftProjectID == selectedProjectID, !isLoading, !isDraftSaveInFlight, !isSaving else { return false }
        autosaveEnabled = false
        if !fountainDraft.contains(cleanMarker) {
            let separator = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? ""
                : "\n\n"
            fountainDraft += separator + cleanMarker
            noteManualDraftEdit()
        }
        await manualSaveDraft()
        return true
    }
    #endif

    func createRevisionSnapshot() async {
        let label = snapshotLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = label.isEmpty ? "Snapshot" : label
        await saveCurrentDraft(source: "studio_snapshot", notes: note)
        snapshotLabel = ""
    }

    func loadSnapshot(_ version: BackendScreenplayVersion) {
        let snapshotDraft = version.draft ?? ""
        guard !snapshotDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorText = "Snapshot draft is empty."
            return
        }
        isHydratingDraft = true
        fountainDraft = snapshotDraft
        isHydratingDraft = false
        hasUnsavedDraftChanges = fingerprint(for: snapshotDraft) != lastSavedDraftFingerprint
        autosaveStatusText = "Snapshot loaded (unsaved)"
        infoText = "Snapshot loaded. Save to publish."
        persistLocalDraftRecovery(
            projectId: selectedProjectID,
            draft: snapshotDraft,
            baseVersionId: latestVersionID,
            dirty: hasUnsavedDraftChanges
        )
    }

    func restoreDraftFromRecovery() {
        guard let candidate = recoveryCandidate else { return }
        guard ScreenplayProjectScopedState.matches(candidate.projectId, selectedProjectId: selectedProjectID) else {
            recoveryCandidate = nil
            return
        }
        isHydratingDraft = true
        fountainDraft = candidate.draft
        isHydratingDraft = false
        if !candidate.baseVersionId.isEmpty {
            latestVersionID = candidate.baseVersionId
        }
        if candidate.isPreservedConflict {
            localDraftRecoveryStore.clearPreservedConflict(
                ownerUserId: currentStudioAuthContext().userID,
                projectId: candidate.projectId
            )
        }
        syncLiveDraftBridgeProjectContext()
        hasUnsavedDraftChanges = fingerprint(for: candidate.draft) != lastSavedDraftFingerprint
        autosaveStatusText = "Recovered local draft"
        infoText = "Recovered your local unsaved draft."
        recoveryCandidate = nil
        persistLocalDraftRecovery(
            projectId: candidate.projectId,
            draft: candidate.draft,
            baseVersionId: latestVersionID,
            dirty: hasUnsavedDraftChanges
        )
    }

    func keepServerDraft() {
        guard let projectId = recoveryCandidate?.projectId else { return }
        guard ScreenplayProjectScopedState.matches(projectId, selectedProjectId: selectedProjectID) else {
            recoveryCandidate = nil
            return
        }
        recoveryCandidate = nil
        clearLocalDraftRecovery(projectId: projectId)
        autosaveStatusText = "Using server draft"
        infoText = "Using latest server draft."
    }

    func discardLocalRecoveryCopy() {
        guard let projectId = recoveryCandidate?.projectId else { return }
        guard ScreenplayProjectScopedState.matches(projectId, selectedProjectId: selectedProjectID) else {
            recoveryCandidate = nil
            return
        }
        recoveryCandidate = nil
        clearLocalDraftRecovery(projectId: projectId)
        autosaveStatusText = hasUnsavedDraftChanges ? "Unsaved changes" : "Recovery dismissed"
        infoText = hasUnsavedDraftChanges
            ? "Local recovery copy discarded. The current page is still unsaved."
            : "Local recovery copy discarded."
    }

    func applyServerVersionFromConflict() {
        guard let conflict = conflictState else { return }
        guard ScreenplayProjectScopedState.matches(conflict.projectId, selectedProjectId: selectedProjectID) else {
            conflictState = nil
            return
        }
        if !conflict.serverDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            applyServerDraft(
                conflict.serverDraft,
                versionId: conflict.serverVersionId,
                allowOverwriteDirtyLocalDraft: true
            )
        } else {
            Task { await loadSelectedProjectOutline() }
        }
        clearLocalDraftRecovery(projectId: conflict.projectId)
        conflictState = nil
        errorText = ""
        infoText = "Loaded latest server draft."
    }

    func keepLocalDraftAfterConflict() async {
        guard let conflict = conflictState else { return }
        guard ScreenplayProjectScopedState.matches(conflict.projectId, selectedProjectId: selectedProjectID) else {
            conflictState = nil
            return
        }
        conflictState = nil
        errorText = ""
        await saveCurrentDraft(
            source: "studio_conflict_resolve",
            notes: "Conflict resolved: keep local",
            baseVersionOverride: conflict.serverVersionId
        )
    }

    func clearDraft() {
        fountainDraft = ""
        hasUnsavedDraftChanges = false
        isManualDraftEditing = false
        lastManualDraftEditAt = .distantPast
        autosaveStatusText = "Draft cleared"
        paginationPages = []
        revisionSummary = nil
        revisionRanges = []
        formatLintReport = nil
        formatLintErrorText = ""
        formatLintSourceText = ""
        clearCoverageSimulation()
        conflictState = nil
        if !selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            clearLocalDraftRecovery(projectId: selectedProjectID)
        }
    }

    func normalizeDraftToHollywoodFormat() {
        let cleanDraft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDraft.isEmpty else {
            errorText = "Draft is empty."
            return
        }

        let normalized = FountainFormatter.normalizeHollywoodDraft(cleanDraft)
        guard !normalized.isEmpty else {
            errorText = "Could not normalize this draft."
            return
        }

        if normalized == cleanDraft {
            infoText = "Draft already matches the simple Hollywood format."
            return
        }

        isHydratingDraft = true
        fountainDraft = normalized
        isHydratingDraft = false
        hasUnsavedDraftChanges = fingerprint(for: normalized) != lastSavedDraftFingerprint
        autosaveStatusText = "Normalized format"
        infoText = "Draft normalized to the simple Hollywood format."

        persistLocalDraftRecovery(
            projectId: selectedProjectID,
            draft: normalized,
            baseVersionId: latestVersionID,
            dirty: hasUnsavedDraftChanges
        )
        Task { await refreshDraftInsights() }
        scheduleProgrammaticDraftAutosaveIfNeeded(source: "studio_format_normalize")
    }

    func importExternalDraft(_ importedDraft: String, sourceName: String, appendToExisting: Bool) {
        let cleanImport = importedDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanImport.isEmpty else {
            errorText = "That file did not contain readable screenplay text."
            return
        }

        let normalizedImport = FountainFormatter.normalizeHollywoodDraft(cleanImport)
        let importBlock = normalizedImport.isEmpty ? cleanImport : normalizedImport

        errorText = ""
        conflictState = nil
        let existingDraft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let shouldAppend = appendToExisting && !existingDraft.isEmpty
        let nextDraft = shouldAppend
            ? existingDraft + "\n\n" + importBlock
            : importBlock

        isHydratingDraft = true
        fountainDraft = nextDraft
        isHydratingDraft = false
        hasUnsavedDraftChanges = fingerprint(for: nextDraft) != lastSavedDraftFingerprint
        autosaveStatusText = "Imported draft"
        Task { await refreshCoverage(source: sourceName, speak: true) }
        infoText = shouldAppend
            ? "Imported \(sourceName) and appended it to the current draft. Clear the draft first if you want a clean replacement."
            : "Imported \(sourceName) into the draft."

        persistLocalDraftRecovery(
            projectId: selectedProjectID,
            draft: nextDraft,
            baseVersionId: latestVersionID,
            dirty: hasUnsavedDraftChanges
        )
        Task { await refreshDraftInsights() }
        scheduleProgrammaticDraftAutosaveIfNeeded(source: "studio_import")
    }

    func refreshDraftInsights(source: String = "Draft") async {
        await recomputePagination(for: fountainDraft, source: source)
        await recomputeRevision(for: fountainDraft, source: source)
        await refreshFormatLint(source: source)
    }

    /// Clementine's read of the current draft (grade, verdict, pillars). Runs
    /// after an import and on demand from the Craft tab; `speak` hands the
    /// spoken read to the home voice.
    func refreshCoverage(
        source: String = "Draft", speak: Bool = false, announce: Bool = true,
        request: ((String, String) async throws -> BackendScreenplayCoverageReport)? = nil
    ) async {
        guard !Task.isCancelled else { return }
        let context = currentCoverageContext()
        let document = FountainTitlePageCodec.parse(context.draft)
        let draft = context.draft
        guard !document.scriptPageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            invalidateCoverage()
            return
        }
        let requestID = UUID()
        activeCoverageRequestID = requestID
        activeCoverageContext = context
        coverageErrorContext = nil
        if !coverageErrorText.isEmpty { coverageErrorText = "" }
        let title = document.titlePage?.title ?? selectedProject?.title ?? ""
        if !isCoverageRefreshing { isCoverageRefreshing = true }
        defer {
            if activeCoverageRequestID == requestID {
                activeCoverageRequestID = nil
                activeCoverageContext = nil
                isCoverageRefreshing = false
            }
        }
        do {
            let report: BackendScreenplayCoverageReport
            if let request {
                report = try await request(draft, title)
            } else {
                report = try await BackendMemoryAPI.shared.fetchScreenplayCoverage(
                    draft: draft, title: title
                ).payload
            }
            guard !Task.isCancelled, activeCoverageRequestID == requestID, context == currentCoverageContext() else { return }
            publishedCoverageContext = context
            publishedCoverageRequestID = requestID
            publishedCoverageReport = report
            coverageErrorText = ""
            StudioOutlineRegistry.shared.publishCoverage(report, context: context, requestID: requestID)
            if announce {
                let readLine = "Clementine's read: \(report.grade), \(report.verdict.lowercased())."
                infoText = infoText.isEmpty ? readLine : "\(infoText) \(readLine)"
            }
            if speak {
                ScreenplayCoveragePresentation.requestSpeech(report.spoken)
            }
        } catch {
            guard !Task.isCancelled, activeCoverageRequestID == requestID, context == currentCoverageContext() else { return }
            coverageErrorContext = context
            let presented = StudioCraftResilience.presentedError(error, source: source, subject: "coverage")
            coverageErrorText = presented.isEmpty ? "Clementine could not read the pages right now." : presented
        }
    }

    /// One silent attempt per changed page/scene shape, not one retry per word
    /// after an offline/error response. An explicit Read again always retries.
    func refreshCoverageIfNeeded(
        request: ((String, String) async throws -> BackendScreenplayCoverageReport)? = nil
    ) async {
        guard !Task.isCancelled, !isCoverageRefreshing, !isStreamingDraftPreviewActive else { return }
        let context = currentCoverageContext()
        guard !context.projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let shape = ScreenplayCoverageRefreshPolicy.shape(of: context.draft),
              ScreenplayCoverageRefreshPolicy.shouldRefresh(current: coverageReport, shape: shape) else { return }
        if let last = lastAutomaticCoverageAttempt,
           last.context.hasSameOwner(as: context), last.shape == shape { return }
        lastAutomaticCoverageAttempt = (context, shape)
        await refreshCoverage(source: "Draft", announce: false, request: request)
    }

    private func currentCoverageContext() -> ScreenplayCoverageContext {
        ScreenplayCoverageContext(auth: coverageAuthContextProvider?() ?? currentStudioAuthContext(),
                                  projectID: selectedProjectID, draft: fountainDraft)
    }

    private func invalidateCoverageIfContextChanged() {
        guard activeCoverageContext != nil || publishedCoverageContext != nil || coverageErrorContext != nil else { return }
        let context = currentCoverageContext()
        if let active = activeCoverageContext, active != context {
            activeCoverageRequestID = nil
            activeCoverageContext = nil
            if isCoverageRefreshing { isCoverageRefreshing = false }
        }
        if publishedCoverageContext?.hasSameOwner(as: context) == false ||
            coverageErrorContext?.hasSameOwner(as: context) == false ||
            context.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            invalidateCoverage()
        }
    }

    private func invalidateCoverage() {
        lastAutomaticCoverageAttempt = nil
        activeCoverageRequestID = nil
        activeCoverageContext = nil
        if isCoverageRefreshing { isCoverageRefreshing = false }
        if let publishedCoverageRequestID {
            StudioOutlineRegistry.shared.clearCoverage(requestID: publishedCoverageRequestID)
        }
        publishedCoverageRequestID = nil
        publishedCoverageContext = nil
        if publishedCoverageReport != nil { publishedCoverageReport = nil }
        coverageErrorContext = nil
        if !coverageErrorText.isEmpty { coverageErrorText = "" }
    }

    func refreshPagination(source: String = "Draft") async {
        await recomputePagination(for: fountainDraft, source: source)
    }

    func refreshRevisionColor(source: String = "Revision color") async {
        await recomputeRevision(for: fountainDraft, source: source)
    }

    private func invalidateCraftRequests() {
        activeCraftReportRequestID = nil
        activeCraftAnalysisRequestID = nil
        activeCraftOverrideRequestID = nil
        isCraftLoading = false
        isCraftAnalyzing = false
        isCraftOverrideSaving = false
    }

    func resetCraftReportForProjectChange(clearFrameworks: Bool = false) {
        invalidateCraftRequests()
        craftFrameworkWasExplicitlySelected = false
        selectedCraftFrameworkID = clearFrameworks ? "" : StudioCraftResilience.preferredFrameworkID(
            selected: "", availableIDs: craftFrameworks.map(\.id))
        invalidateCoverage()
        craftReport = nil
        craftErrorText = ""
        craftInfoText = ""
        craftLogline = nil
        craftLoglineDrift = nil
        craftLoglineHistory = []
        craftLoglineErrorText = ""
        craftLoglineInfoText = ""
        craftTwists = nil
        craftTwistErrorText = ""
        craftTwistInfoText = ""
        craftTwistBeatLabel = ""
        acceptedCraftTwists = []
        acceptedCraftTwistErrorText = ""
        acceptedCraftTwistInfoText = ""
        clearCoverageSimulation()
        if clearFrameworks {
            craftFrameworks = []
        }
    }

    func selectCraftFramework(_ frameworkID: String) {
        let cleanFrameworkID = frameworkID.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanFrameworkID != selectedCraftFrameworkID { invalidateCraftRequests() }
        selectedCraftFrameworkID = cleanFrameworkID
        craftFrameworkWasExplicitlySelected = !selectedCraftFrameworkID.isEmpty
        noteCraftFrameworkSelectionChanged()
    }

    func noteCraftFrameworkSelectionChanged() {
        let cleanSelected = selectedCraftFrameworkID.trimmingCharacters(in: .whitespacesAndNewlines)
        if let coverageSimulationSnapshot,
           !coverageSimulationSnapshot.matches(draft: fountainDraft, frameworkId: cleanSelected) {
            clearCoverageSimulation()
        }
        if let report = craftReport, !cleanSelected.isEmpty, report.framework.id != cleanSelected {
            craftReport = nil
            craftInfoText = "Analyze with the selected framework to update the beat sheet."
        }
    }

    func loadCraftReport(force: Bool = false) async {
        guard !isCraftLoading else { return }
        guard let project = selectedProject else {
            craftReport = nil
            craftErrorText = ""
            craftInfoText = "Select a screenplay project to see craft analysis."
            return
        }
        if !force, craftReport?.projectId == project.id, craftReport?.versionId == activeCraftVersionID {
            return
        }
        guard selectedProjectID == project.id else { return }

        let requestID = UUID()
        var contextIsCurrent = makeCraftContextGuard()
        var versionID = activeCraftVersionID
        activeCraftReportRequestID = requestID
        isCraftLoading = true
        defer {
            if activeCraftReportRequestID == requestID {
                activeCraftReportRequestID = nil
                isCraftLoading = false
            }
        }
        craftErrorText = ""
        let source = force ? "Manual check" : "Craft rail"
        let hadExistingReport = craftReport != nil
        do {
            // Framework discovery is public metadata, not a versioned report.
            // Bind the protected read only after startup metadata converges.
            try await ensureCraftFrameworksLoaded()
            guard activeCraftReportRequestID == requestID, selectedProjectID == project.id else { return }
            versionID = activeCraftVersionID
            contextIsCurrent = makeCraftContextGuard()
            let report = try await StudioCraftResilience.run(source: source) {
                guard contextIsCurrent() else { throw CancellationError() }
                return try await craftClient.fetchCraftReport(
                    projectId: project.id,
                    versionId: versionID
                )
            }
            guard contextIsCurrent(), activeCraftReportRequestID == requestID else { return }
            guard report.projectId == project.id, versionID == nil || report.versionId == versionID else {
                craftErrorText = "The saved craft report doesn't match this screenplay version. Run Analyze to refresh it."
                return
            }
            guard !craftFrameworkWasExplicitlySelected || selectedCraftFrameworkID == report.framework.id else {
                craftReport = nil
                craftInfoText = "Analyze with the selected framework to update the beat sheet."
                return
            }
            craftReport = report
            selectedCraftFrameworkID = report.framework.id
            noteCraftFrameworkSelectionChanged()
            await loadAcceptedCraftTwists(projectId: project.id, source: "Craft report")
            guard contextIsCurrent(), activeCraftReportRequestID == requestID,
                  craftReport?.id == report.id, selectedCraftFrameworkID == report.framework.id else { return }
            craftInfoText = report.generatedAt.map { "Craft report updated at \($0)." } ?? "Craft report loaded."
        } catch BackendError.http(let status, _) where status == 404 {
            guard contextIsCurrent(), activeCraftReportRequestID == requestID else { return }
            craftReport = nil
            craftInfoText = "No craft report exists for this screenplay version yet."
        } catch {
            guard contextIsCurrent(), activeCraftReportRequestID == requestID else { return }
            craftErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "craft report"
            )
            craftInfoText = StudioCraftResilience.backgroundStatus(
                subject: "craft report",
                hasExistingContent: hadExistingReport
            )
        }
    }

    func analyzeCraftReport() async {
        guard !isCraftAnalyzing else { return }
        guard let project = selectedProject else {
            craftReport = nil
            craftErrorText = ""
            craftInfoText = "Select a screenplay project before running craft analysis."
            return
        }

        guard selectedProjectID == project.id else { return }
        let contextIsCurrent = makeCraftContextGuard()
        let versionID = activeCraftVersionID
        var requestedFrameworkID = selectedCraftFrameworkID
        let requestID = UUID()
        activeCraftAnalysisRequestID = requestID
        isCraftAnalyzing = true
        defer {
            if activeCraftAnalysisRequestID == requestID {
                activeCraftAnalysisRequestID = nil
                isCraftAnalyzing = false
            }
        }
        craftErrorText = ""
        do {
            try await ensureCraftFrameworksLoaded()
            guard contextIsCurrent(), activeCraftAnalysisRequestID == requestID else { return }
            requestedFrameworkID = selectedCraftFrameworkID
            let report = try await craftClient.analyzeCraft(
                projectId: project.id,
                versionId: versionID,
                frameworkId: normalizedOrNil(selectedCraftFrameworkID),
                screenplay: craftAnalysisScreenplay(for: project)
            )
            guard contextIsCurrent(), activeCraftAnalysisRequestID == requestID,
                  selectedCraftFrameworkID == requestedFrameworkID else { return }
            guard report.projectId == project.id, versionID == nil || report.versionId == versionID,
                  requestedFrameworkID.isEmpty || report.framework.id == requestedFrameworkID else {
                craftErrorText = "The analysis doesn't match the selected screenplay, version or framework. Run Analyze again."
                return
            }
            craftReport = report
            selectedCraftFrameworkID = report.framework.id
            noteCraftFrameworkSelectionChanged()
            await loadAcceptedCraftTwists(projectId: project.id, source: "Craft report")
            guard contextIsCurrent(), activeCraftAnalysisRequestID == requestID,
                  selectedCraftFrameworkID == report.framework.id else { return }
            craftInfoText = report.generatedAt.map { "Craft report updated at \($0)." } ?? "Craft analysis complete."
        } catch {
            guard contextIsCurrent(), activeCraftAnalysisRequestID == requestID,
                  selectedCraftFrameworkID == requestedFrameworkID else { return }
            craftErrorText = StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "craft analysis"
            )
        }
    }

    func createCraftTurnOverride(_ override: ScreenplayCraftTurnOverrideMutation) async {
        guard !isCraftOverrideSaving else { return }
        guard let project = selectedProject else {
            craftErrorText = ""
            craftInfoText = "Select a screenplay project before saving a craft override."
            return
        }
        guard let frameworkId = normalizedOrNil(selectedCraftFrameworkID) ?? craftReport?.framework.id else {
            craftErrorText = ""
            craftInfoText = "Choose a craft framework before saving an override."
            return
        }
        guard selectedProjectID == project.id else { return }
        let contextIsCurrent = makeCraftContextGuard()
        let versionID = activeCraftVersionID

        let requestID = UUID()
        activeCraftOverrideRequestID = requestID
        isCraftOverrideSaving = true
        defer {
            if activeCraftOverrideRequestID == requestID {
                activeCraftOverrideRequestID = nil
                isCraftOverrideSaving = false
            }
        }
        craftErrorText = ""
        do {
            let scopedOverride = override.scoped(
                projectId: project.id,
                versionId: versionID,
                frameworkId: frameworkId
            )
            let stored = try await craftClient.recordCraftTurnOverride(scopedOverride)
            guard contextIsCurrent(), activeCraftOverrideRequestID == requestID,
                  selectedCraftFrameworkID == frameworkId else { return }
            craftInfoText = "Override saved for \(stored.turnId). Run Analyze to rebuild craft coverage."
        } catch {
            guard contextIsCurrent(), activeCraftOverrideRequestID == requestID,
                  selectedCraftFrameworkID == frameworkId else { return }
            craftErrorText = StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "the craft override"
            )
        }
    }

    func refreshFormatLint(source: String = "Draft") async {
        let draft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty else {
            formatLintReport = nil
            formatLintErrorText = ""
            formatLintSourceText = ""
            return
        }
        guard !isFormatLinting else { return }

        isFormatLinting = true
        defer { isFormatLinting = false }
        formatLintErrorText = ""
        do {
            let report = try await StudioCraftResilience.run(source: source) {
                try await craftClient.lintCraftFormat(
                    text: draft,
                    frameworkId: normalizedOrNil(selectedCraftFrameworkID)
                )
            }
            guard draft == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            formatLintReport = report
            formatLintSourceText = source
        } catch BackendError.http(400, _) {
            formatLintReport = nil
            formatLintErrorText = "Draft is empty."
            formatLintSourceText = source
        } catch {
            formatLintReport = nil
            formatLintErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "format checks"
            )
            formatLintSourceText = source
        }
    }

    func refreshCraftCoverage(source: String = "Draft") async {
        let draft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty else {
            clearCoverageSimulation()
            return
        }
        guard !isCoverageSimulating else { return }

        let frameworkId = normalizedOrNil(selectedCraftFrameworkID)
        let pageCount = craftFallbackPageCount
        let projectId = selectedProjectID
        isCoverageSimulating = true
        defer { isCoverageSimulating = false }
        coverageSimulationErrorText = ""

        do {
            let report = try await StudioCraftResilience.run(source: source) {
                try await craftClient.simulateCraftCoverage(
                    text: draft,
                    pageCount: pageCount,
                    frameworkId: frameworkId
                )
            }
            guard projectId == selectedProjectID,
                  draft == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines),
                  frameworkId == normalizedOrNil(selectedCraftFrameworkID) else { return }
            coverageSimulationReport = report
            coverageSimulationSnapshot = ScreenplayCraftCoverageSnapshot(
                draft: draft,
                frameworkId: frameworkId
            )
            coverageSimulationSourceText = source
        } catch BackendError.http(400, _) {
            guard projectId == selectedProjectID,
                  draft == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines),
                  frameworkId == normalizedOrNil(selectedCraftFrameworkID) else { return }
            coverageSimulationReport = nil
            coverageSimulationErrorText = "Draft is empty."
            coverageSimulationSourceText = source
            coverageSimulationSnapshot = ScreenplayCraftCoverageSnapshot(
                draft: draft,
                frameworkId: frameworkId
            )
        } catch {
            guard projectId == selectedProjectID,
                  draft == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines),
                  frameworkId == normalizedOrNil(selectedCraftFrameworkID) else { return }
            coverageSimulationReport = nil
            coverageSimulationErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "reader preview"
            )
            coverageSimulationSourceText = source
            coverageSimulationSnapshot = ScreenplayCraftCoverageSnapshot(
                draft: draft,
                frameworkId: frameworkId
            )
        }
    }

    private func clearCoverageSimulation() {
        coverageSimulationReport = nil
        coverageSimulationErrorText = ""
        coverageSimulationSourceText = ""
        coverageSimulationSnapshot = nil
    }

    func refreshCraftLogline(source: String = "Draft") async {
        guard let project = selectedProject else {
            craftLogline = nil
            craftLoglineDrift = nil
            craftLoglineHistory = []
            craftLoglineErrorText = ""
            craftLoglineInfoText = "Select a screenplay project to track a logline."
            return
        }
        guard !isCraftLoglineLoading else { return }

        let draft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !draft.isEmpty else {
            craftLogline = nil
            craftLoglineDrift = nil
            craftLoglineErrorText = ""
            craftLoglineInfoText = "Draft text is empty."
            await loadCraftLoglineHistoryOnly(projectId: project.id)
            return
        }

        isCraftLoglineLoading = true
        defer { isCraftLoglineLoading = false }
        craftLoglineErrorText = ""
        do {
            let versionId = activeCraftVersionID
            let frameworkId = normalizedOrNil(selectedCraftFrameworkID)
            let response = try await craftClient.distillCraftLogline(
                text: draft,
                projectId: project.id,
                versionId: versionId,
                frameworkId: frameworkId
            )
            let drift = try? await craftClient.fetchCraftLoglineDrift(
                projectId: project.id,
                currentLogline: response.logline
            )
            let history = try? await craftClient.fetchCraftLoglineHistory(projectId: project.id)
            guard selectedProject?.id == project.id else { return }
            guard draft == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            craftLogline = response
            craftLoglineDrift = drift
            craftLoglineHistory = history?.entries ?? craftLoglineHistory
            craftLoglineInfoText = source
        } catch BackendError.http(400, _) {
            craftLogline = nil
            craftLoglineErrorText = "Draft text is required before distilling a logline."
            craftLoglineInfoText = source
        } catch {
            craftLoglineErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "the logline"
            )
            craftLoglineInfoText = source
        }
    }

    private func loadCraftLoglineHistoryOnly(projectId: String) async {
        do {
            let history = try await craftClient.fetchCraftLoglineHistory(projectId: projectId)
            guard selectedProject?.id == projectId else { return }
            craftLoglineHistory = history.entries
        } catch {
            craftLoglineHistory = []
        }
    }

    func refreshBlockSignal(source: String = "io.them") async {
        guard !IOThemRuntime.isRunningTests else { return }
        guard !isBlockSignalLoading else { return }
        isBlockSignalLoading = true
        defer { isBlockSignalLoading = false }
        do {
            let response = try await StudioCraftResilience.run(source: source) {
                try await craftClient.fetchMemoryBlockSignal()
            }
            blockSignal = response
            blockSignalErrorText = ""
            blockSignalInfoText = source
        } catch {
            blockSignalErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "writing momentum"
            )
            blockSignalInfoText = StudioCraftResilience.backgroundStatus(
                subject: "writing momentum",
                hasExistingContent: blockSignal != nil
            )
        }
        if let history = try? await StudioCraftResilience.run(source: source, operation: {
            try await craftClient.fetchMemoryBlockSignalHistory()
        }) {
            blockSignalHistory = history
        }
    }

    func refreshCharacterTraits(
        source: String = "io.them",
        allowDuringTests: Bool = false
    ) async {
        guard !IOThemRuntime.isRunningTests || allowDuringTests else { return }
        let bridge = ScreenplayLiveDraftBridge.shared
        let projectID = ScreenplayCharacterTraitsRefreshPolicy.projectIDForRequest(bridge.committedWriteProjectIDSnapshot()) ?? ""
        let scope = ScreenplayCharacterVoiceMemoryRequestScope(owner: currentStudioAuthContext(), projectID: projectID,
            backendURL: BackendAuthClient.resolvedBackendBaseURL())
        let isCurrent = { scope.matches(owner: self.currentStudioAuthContext(), projectID: bridge.committedWriteProjectIDSnapshot(),
            backendURL: BackendAuthClient.resolvedBackendBaseURL()) }
        let refreshTask: Task<CharacterTraitsRefreshResult, Error>
        let refreshID: UUID
        if let activeTask = characterTraitsRefreshTask, let activeID = characterTraitsRefreshID,
           characterTraitsRefreshScope == scope {
            refreshTask = activeTask; refreshID = activeID
        } else {
            characterTraitsRefreshTask?.cancel()
            refreshID = UUID()
            refreshTask = Task<CharacterTraitsRefreshResult, Error> {
                let response = try await StudioCraftResilience.run(source: source) {
                    guard isCurrent() else { throw CancellationError() }
                    return try await self.craftClient.fetchMemoryCharacterTraits(
                        projectID: projectID.isEmpty ? nil : projectID,
                        expectedScope: scope)
                }
                guard isCurrent() else { throw CancellationError() }
                let archetypes = try? await StudioCraftResilience.run(source: source, operation: {
                    guard isCurrent() else { throw CancellationError() }
                    return try await self.craftClient.fetchMemoryCharacterArchetypes()
                })
                guard isCurrent() else { throw CancellationError() }
                return CharacterTraitsRefreshResult(traits: response, archetypes: archetypes, scope: scope)
            }
            characterTraitsRefreshTask = refreshTask
            characterTraitsRefreshID = refreshID
            characterTraitsRefreshScope = scope
            isCharacterTraitsLoading = true
        }
        defer {
            if characterTraitsRefreshID == refreshID {
                characterTraitsRefreshTask = nil; characterTraitsRefreshID = nil; characterTraitsRefreshScope = nil
                isCharacterTraitsLoading = false
            }
        }
        do {
            let result = try await refreshTask.value
            guard isCurrent(), characterTraitsRefreshID == refreshID else { return }
            characterTraits = result.traits
            bridge.updateCharacterVoiceMemories(from: result.traits, requestScope: result.scope.permitsPage ? result.scope : nil)
            characterArchetypes = result.archetypes
            characterTraitsErrorText = ""
            characterTraitsInfoText = source
        } catch {
            guard isCurrent(), characterTraitsRefreshID == refreshID, !(error is CancellationError) else { return }
            characterTraitsErrorText = StudioCraftResilience.presentedError(error, source: source, subject: "character memory")
            characterTraitsInfoText = StudioCraftResilience.backgroundStatus(subject: "character memory", hasExistingContent: characterTraits != nil)
        }
    }

    func refreshCraftTwists(source: String = "io.them") async {
        guard !IOThemRuntime.isRunningTests else { return }
        guard !isCraftTwistLoading else { return }
        let context = preferredCraftTwistContext()
        isCraftTwistLoading = true
        defer { isCraftTwistLoading = false }
        craftTwistBeatLabel = context.beatLabel
        do {
            let response = try await StudioCraftResilience.run(source: source) {
                try await craftClient.suggestCraftTwists(
                    frameworkId: context.frameworkId,
                    currentBeatId: context.beatId,
                    sceneSummary: context.sceneSummary,
                    count: 3
                )
            }
            craftTwists = response
            craftTwistErrorText = ""
            craftTwistInfoText = source
        } catch {
            craftTwistErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "reversal cards"
            )
            craftTwistInfoText = StudioCraftResilience.backgroundStatus(
                subject: "reversal cards",
                hasExistingContent: craftTwists != nil
            )
        }
    }

    func refreshAcceptedCraftTwists(source: String = "io.them") async {
        guard !IOThemRuntime.isRunningTests else { return }
        guard let project = selectedProject else {
            acceptedCraftTwists = []
            acceptedCraftTwistErrorText = ""
            acceptedCraftTwistInfoText = "Select a screenplay project to track kept reversals."
            return
        }
        await loadAcceptedCraftTwists(projectId: project.id, source: source)
    }

    private func loadAcceptedCraftTwists(projectId: String, source: String) async {
        let contextIsCurrent = makeCraftContextGuard()
        do {
            let response = try await StudioCraftResilience.run(source: source) {
                try await craftClient.fetchAcceptedCraftTwists(projectId: projectId)
            }
            guard contextIsCurrent(), selectedProject?.id == projectId else { return }
            acceptedCraftTwists = response.entries
            acceptedCraftTwistErrorText = ""
            acceptedCraftTwistInfoText = source
        } catch {
            guard contextIsCurrent(), selectedProject?.id == projectId else { return }
            acceptedCraftTwistErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "kept reversals"
            )
            acceptedCraftTwistInfoText = StudioCraftResilience.backgroundStatus(
                subject: "kept reversals",
                hasExistingContent: !acceptedCraftTwists.isEmpty
            )
        }
    }

    func acceptCraftTwist(_ card: ScreenplayCraftTwistCardState) async {
        guard !isAcceptedCraftTwistMutating else { return }
        guard let project = selectedProject else {
            acceptedCraftTwistErrorText = "Select a screenplay project before keeping a reversal."
            return
        }

        isAcceptedCraftTwistMutating = true
        defer { isAcceptedCraftTwistMutating = false }
        acceptedCraftTwistErrorText = ""
        let context = preferredCraftTwistContext()
        do {
            let response = try await craftClient.recordAcceptedCraftTwist(
                projectId: project.id,
                versionId: activeCraftVersionID,
                frameworkId: craftTwists?.frameworkId ?? context.frameworkId,
                beatId: craftTwists?.currentBeatId ?? context.beatId,
                twist: card.suggestion,
                sceneId: nil,
                note: nil
            )
            guard selectedProject?.id == project.id else { return }
            acceptedCraftTwists.removeAll { existing in
                existing.twist.id == response.entry.twist.id && (existing.versionId ?? "") == (response.entry.versionId ?? "")
            }
            acceptedCraftTwists.append(response.entry)
            acceptedCraftTwistInfoText = "Kept \(card.label) for future draft context."
        } catch {
            acceptedCraftTwistErrorText = StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "this reversal"
            )
            acceptedCraftTwistInfoText = "Keep action stayed local."
        }
    }

    func dismissCraftTwistSuggestion(_ card: ScreenplayCraftTwistCardState) {
        switch ScreenplayCraftTwistDismissal.resolve(cardID: card.id, response: craftTwists) {
        case .unavailable:
            craftTwistInfoText = "That reversal is no longer available."
        case .alreadyDismissed:
            craftTwistInfoText = "That reversal is already dismissed."
        case .dismissed(let remaining):
            guard let response = craftTwists else { return }
            craftTwists = ScreenplayCraftTwistSuggestResponse(
                schemaVersion: response.schemaVersion,
                frameworkId: response.frameworkId,
                currentBeatId: response.currentBeatId,
                source: response.source,
                twists: remaining
            )
            craftTwistErrorText = ""
            craftTwistInfoText = "Dismissed \(card.label) for this suggestion pass."
        }
    }

    func dismissAcceptedCraftTwist(_ card: ScreenplayCraftTwistCardState) async {
        guard !isAcceptedCraftTwistMutating else { return }
        guard let project = selectedProject else {
            acceptedCraftTwistErrorText = "Select a screenplay project before dismissing a reversal."
            return
        }

        isAcceptedCraftTwistMutating = true
        defer { isAcceptedCraftTwistMutating = false }
        do {
            _ = try await craftClient.deleteAcceptedCraftTwist(
                twistId: card.id,
                projectId: project.id,
                versionId: activeCraftVersionID
            )
            guard selectedProject?.id == project.id else { return }
            acceptedCraftTwists.removeAll { $0.twist.id == card.id }
            acceptedCraftTwistErrorText = ""
            acceptedCraftTwistInfoText = "Unkept \(card.label)."
        } catch {
            acceptedCraftTwistErrorText = StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "this reversal"
            )
            acceptedCraftTwistInfoText = "Could not unkeep this reversal; the kept state is unchanged."
        }
    }

    private struct CraftTwistContext {
        let frameworkId: String
        let beatId: String
        let beatLabel: String
        let sceneSummary: String?
    }

    private func preferredCraftTwistContext() -> CraftTwistContext {
        let selectedFramework = normalizedOrNil(selectedCraftFrameworkID) ?? craftReport?.framework.id ?? StudioCraftResilience.defaultFrameworkID
        if let report = craftReport {
            let unsatisfied = report.majorTurns.first { !$0.isSatisfied }
            let drifting = report.majorTurns.first { abs($0.driftPages ?? 0) >= 4 }
            let midpoint = report.majorTurns.first { $0.turnId.lowercased().contains("midpoint") }
            if let turn = unsatisfied ?? drifting ?? midpoint ?? report.majorTurns.first {
                let sceneSummaryParts: [String?] = [turn.sceneTitle, report.summary]
                let sceneSummary = sceneSummaryParts
                    .compactMap { $0 }
                    .compactMap { normalizedOrNil($0) }
                    .joined(separator: " | ")
                return CraftTwistContext(
                    frameworkId: report.framework.id,
                    beatId: turn.turnId,
                    beatLabel: turn.label,
                    sceneSummary: sceneSummary.isEmpty ? nil : sceneSummary
                )
            }
        }
        let fallback = Self.fallbackTwistBeat(for: selectedFramework)
        return CraftTwistContext(
            frameworkId: selectedFramework,
            beatId: fallback.id,
            beatLabel: fallback.label,
            sceneSummary: normalizedOrNil(fountainDraft).map { String($0.prefix(480)) }
        )
    }

    private static func fallbackTwistBeat(for frameworkId: String) -> (id: String, label: String) {
        switch frameworkId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "three-act": return ("midpoint-twist", "Midpoint Twist")
        case "story-circle": return ("find", "Find")
        case "hero-journey": return ("ordeal", "Ordeal")
        default: return ("midpoint", "Midpoint")
        }
    }

    private var activeCraftVersionID: String? {
        if let direct = normalizedOrNil(latestVersionID) {
            return direct
        }
        if let active = normalizedOrNil(selectedProject?.activeVersionId ?? "") {
            return active
        }
        return normalizedOrNil(selectedProject?.lastVersionId ?? "")
    }

    private func ensureCraftFrameworksLoaded() async throws {
        if craftFrameworks.isEmpty {
            let response = try await craftClient.fetchCraftFrameworks()
            craftFrameworks = response.frameworks
        }
        let cleanSelected = selectedCraftFrameworkID.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanSelected.isEmpty || !craftFrameworks.contains(where: { $0.id == cleanSelected }) {
            selectedCraftFrameworkID = StudioCraftResilience.preferredFrameworkID(selected: cleanSelected, availableIDs: craftFrameworks.map(\.id))
            noteCraftFrameworkSelectionChanged()
        }
    }

    private func makeCraftContextGuard() -> () -> Bool {
        let projectID = selectedProjectID
        let versionID = activeCraftVersionID
        let authContext = currentStudioAuthContext()
        return { [weak self] in
            guard let self else { return false }
            return self.selectedProjectID == projectID && self.activeCraftVersionID == versionID &&
                self.authContextIsCurrent(authContext)
        }
    }

    private func craftAnalysisScreenplay(for project: BackendScreenplayProjectSummary) -> ScreenplayCraftAnalysisScreenplay {
        let orderedScenes = outline.scenes.sorted { lhs, rhs in
            let lhsOrder = lhs.order ?? Int.max
            let rhsOrder = rhs.order ?? Int.max
            if lhsOrder == rhsOrder { return lhs.title < rhs.title }
            return lhsOrder < rhsOrder
        }
        let scenes = orderedScenes.map { scene in
            let text = [scene.slugline, scene.title, scene.objective, scene.summary]
                .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: "\n")
            return ScreenplayCraftAnalysisScene(
                id: scene.id,
                title: scene.title,
                pageStart: nil,
                pageEnd: nil,
                text: text.isEmpty ? nil : text
            )
        }
        return ScreenplayCraftAnalysisScreenplay(
            title: project.title,
            pageCount: craftFallbackPageCount,
            text: normalizedOrNil(fountainDraft),
            scenes: scenes
        )
    }

    var craftFallbackPageCount: Int {
        max(1, estimatedFeaturePageCount)
    }

    func makeStudioExportContextGuard() -> () -> Bool {
        let projectID = selectedProjectID
        let context = currentStudioAuthContext()
        let documentID = ScreenplayLiveDraftBridge.shared.draftOrigin.documentID
        let backendURL = BackendAuthClient.resolvedBackendBaseURL()
        return { [weak self] in
            guard let self else { return false }
            return self.selectedProjectID == projectID && self.authContextIsCurrent(context)
                && ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == documentID
                && OfflineTalkRecoveryScope.sameBackend(backendURL, BackendAuthClient.resolvedBackendBaseURL())
        }
    }

    func exportArtifact(format: String) async throws -> BackendScreenplayExportArtifact {
        guard let project = selectedProject else {
            throw BackendMemoryAPIError.server(status: 400, message: "Select a project first.")
        }
        return try await BackendMemoryAPI.shared.exportScreenplayDraft(
            draft: fountainDraft,
            title: project.title,
            phase: project.lastPhase ?? "scene_draft",
            format: format,
            projectId: project.id,
            versionId: latestVersionID.isEmpty ? nil : latestVersionID
        )
    }

    func refreshScreenplayExportFormats(reportErrors: Bool = true) async {
        guard !isScreenplayExportFormatsLoading else { return }
        isScreenplayExportFormatsLoading = true
        defer { isScreenplayExportFormatsLoading = false }
        do {
            let response = try await BackendMemoryAPI.shared.fetchScreenplayExportFormats()
            screenplayExportFormats = response.formats
            screenplayExportFormatsErrorText = ""
        } catch {
            screenplayExportFormats = []
            screenplayExportFormatsErrorText = reportErrors ? error.localizedDescription : ""
        }
    }

    func refreshScreenplayExportFormatsAutomatically() async {
        guard ScreenplayExportFormatRefreshPolicy.shouldAutoRefresh(
            projectListLoadedFromBackend: didLoadScreenplayProjectsFromBackend
        ) else {
            return
        }
        await refreshScreenplayExportFormats(reportErrors: false)
    }

    func refreshCrossDeviceStateIfNeeded() async {
        await resumeQueuedDraftSavesIfNeeded()
        // A transient launch-time project-list failure must not permanently
        // disable the timer that can recover that same list on reconnect.
        guard !isCrossDeviceRefreshInFlight,
              !isLoading,
              !isSaving,
              !isStreamingDraftPreviewActive else {
            return
        }
        isCrossDeviceRefreshInFlight = true
        defer { isCrossDeviceRefreshInFlight = false }
        let authContext = currentStudioAuthContext()

        do {
            let result = try await BackendMemoryAPI.shared.fetchScreenplayProjects(
                limit: 24,
                includeVersions: false,
                includeDrafts: false
            )
            guard authContextIsCurrent(authContext) else { return }
            let incomingStateVersion = result.payload.stateVersion?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let shouldRefresh = CrossDeviceStateVersionPolicy.shouldRefresh(
                knownStateVersion: lastSeenScreenplayStateVersion,
                incomingStateVersion: incomingStateVersion
            )
            if !incomingStateVersion.isEmpty {
                lastSeenScreenplayStateVersion = incomingStateVersion
            }
            guard shouldRefresh else { return }

            let locallySelectedProjectID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
            projects = result.payload.screenplayProjects
            selectedProjectID = locallySelectedProjectID
            guard !locallySelectedProjectID.isEmpty else { return }
            await loadSelectedProjectOutline(reportErrors: false, remoteRefresh: true)
            guard authContextIsCurrent(authContext) else { return }
            await refreshPendingScreenplayQuestion()
        } catch {
            // Background continuity refreshes stay quiet; explicit refresh still reports errors.
        }
    }

    private func loadSelectedProjectOutline(
        reportErrors: Bool = true,
        remoteRefresh: Bool = false
    ) async {
        let authContext = currentStudioAuthContext()
        let id = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let documentID = ScreenplayLiveDraftBridge.shared.draftOrigin.documentID
        clearTransientProjectStateForSelectionChange(to: id)
        guard !id.isEmpty else {
            selectedProject = nil
            outline = .empty
            outlineRevision = 0
            outlineRevisionProjectID = ""
            reconcileSceneSessionState(with: outline)
            resetCraftReportForProjectChange()
            clearBoundDraftForEmptyProjectSelection()
            collaborators = []
            approvedEmails = []
            comments = []
            recoveryCandidate = nil
            conflictState = nil
            clearFeatureSpineFields()
            syncLiveDraftBridgeProjectContext(clearWhenEmpty: true)
            await refreshOutlineMutationOutboxStatus()
            return
        }
        if outlineRevisionProjectID != id {
            outlineRevisionProjectID = id
            outlineRevision = 0
            outline = .empty
        }
        do {
            let versionBeforeRefresh = latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: id)
            let shouldUseClientTokenOwner = ownerHeaders.usesDebugClientTokenOwner
            let detailResult: BackendReadResult<BackendScreenplayProjectResponse>
            var detailLoadedWithClientTokenOwner = false
            do {
                detailResult = try await projectSelectionAPI.fetchScreenplayProject(
                    projectId: id,
                    includeDrafts: true,
                    versionLimit: 24,
                    includeUserIdentity: !shouldUseClientTokenOwner,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
                detailLoadedWithClientTokenOwner = shouldUseClientTokenOwner
            } catch BackendMemoryAPIError.server(let status, _) where shouldUseClientTokenOwner && status == 404 {
                detailResult = try await projectSelectionAPI.fetchScreenplayProject(
                    projectId: id,
                    includeDrafts: true,
                    versionLimit: 24
                )
            }
            guard authContextIsCurrent(authContext),
                  ScreenplayLiveDraftSyncService.shared.ownsEditor(self),
                  ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == documentID,
                  selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == id else {
                return
            }
            updateClientTokenOwnerContext(
                forProjectID: id,
                loadedWithClientTokenOwner: detailLoadedWithClientTokenOwner,
                clientToken: ownerHeaders.clientTokenOverride
            )
            let detailStateVersion = detailResult.payload.stateVersion?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !detailStateVersion.isEmpty {
                lastSeenScreenplayStateVersion = detailStateVersion
            }
            let refreshedOwnerHeaders = projectOwnerHeaderOptions(forProjectID: id)
            let outlineResult = try? await projectSelectionAPI.fetchScreenplayOutline(
                projectId: id,
                includeProject: true,
                includeUserIdentity: refreshedOwnerHeaders.includeUserIdentity,
                includeAuthToken: refreshedOwnerHeaders.includeAuthToken,
                clientTokenOverride: refreshedOwnerHeaders.clientTokenOverride
            )
            guard authContextIsCurrent(authContext),
                  ScreenplayLiveDraftSyncService.shared.ownsEditor(self),
                  ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == documentID,
                  selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == id else {
                return
            }
            if let project = detailResult.payload.project {
                selectedProject = project
                selectedProjectID = project.id
                upsertProject(project)
                guard await hydrateDraftRestoringQueuedSaves(from: project) else { return }
                hydrateCollaboration(from: project)
            } else if let project = outlineResult?.payload.project {
                selectedProject = project
                selectedProjectID = project.id
                upsertProject(project)
                guard await hydrateDraftRestoringQueuedSaves(from: project) else { return }
                hydrateCollaboration(from: project)
            } else {
                selectedProject = projects.first(where: { $0.id == id })
            }
            adoptCanonicalOutlineState(
                outlineResult?.payload.outlineRevision,
                outline: outlineResult?.payload.outline ?? detailResult.payload.project?.outline,
                project: outlineResult?.payload.project ?? detailResult.payload.project,
                projectId: id
            )
            reconcileSceneSessionState(with: outline)
            errorText = ""
            let refreshedVersion = latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
            if remoteRefresh,
               conflictState == nil,
               !refreshedVersion.isEmpty,
               refreshedVersion != versionBeforeRefresh {
                autosaveStatusText = "Synced"
                infoText = "Updated from another device."
            }
            syncLiveDraftBridgeProjectContext()
            Task { [weak self] in
                await self?.refreshCollaborationData()
            }
            await refreshOutlineMutationOutboxStatus()
            await resumeQueuedOutlineMutationsIfNeeded()
        } catch {
            guard authContextIsCurrent(authContext),
                  ScreenplayLiveDraftSyncService.shared.ownsEditor(self),
                  ScreenplayLiveDraftBridge.shared.draftOrigin.documentID == documentID,
                  selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == id else {
                return
            }
            clearTransientProjectStateForSelectionChange(to: id)
            selectedProject = projects.first(where: { $0.id == id })
            reconcileSceneSessionState(with: outline)
            if reportErrors {
                errorText = error.localizedDescription
            }
            if selectedProject == nil {
                clearFeatureSpineFields()
            }
            syncLiveDraftBridgeProjectContext()
            adoptOutlineMutationRevision(
                selectedProject?.outlineRevision,
                outline: selectedProject?.outline,
                project: selectedProject,
                projectId: id
            )
            await refreshOutlineMutationOutboxStatus()
            await resumeQueuedOutlineMutationsIfNeeded()
        }
    }

    private func persistActiveProjectSelection(_ projectID: String) async {
        let normalizedProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectID.isEmpty else { return }
        do {
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: normalizedProjectID)
            let result: BackendReadResult<BackendScreenplayProjectMutationResponse>
            do {
                result = try await projectSelectionAPI.activateScreenplayProject(
                    projectId: normalizedProjectID,
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                result = try await projectSelectionAPI.activateScreenplayProject(projectId: normalizedProjectID)
            }
            if let project = result.payload.project {
                upsertProject(project)
                if selectedProjectID == project.id {
                    selectedProject = project
                }
            }
            if selectedProjectID == normalizedProjectID {
                infoText = "Project ready."
            }
        } catch {
            if selectedProjectID == normalizedProjectID {
                infoText = "Project opened. Restore sync is pending."
            }
        }
    }

    private func normalizedOrNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func unresolvedSetups(from text: String) -> [String] {
        let separators = CharacterSet.newlines.union(CharacterSet(charactersIn: ";"))
        var seen = Set<String>()
        var result: [String] = []
        for raw in text.components(separatedBy: separators) {
            let clean = raw
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            guard !clean.isEmpty else { continue }
            let key = clean.lowercased()
            guard seen.insert(key).inserted else { continue }
            result.append(String(clean.prefix(220)))
            if result.count >= 24 { break }
        }
        return result
    }

    private func hydrateFeatureSpineFields(from project: BackendScreenplayProjectSummary) {
        featureLogline = project.logline ?? ""
        featureThemeArgument = project.themeArgument ?? ""
        featureCentralQuestion = project.centralQuestion ?? ""
        featureProtagonistWant = project.protagonistWant ?? ""
        featureProtagonistNeed = project.protagonistNeed ?? ""
        featureAntagonisticForce = project.antagonisticForce ?? ""
        featureActPosition = project.actPosition ?? ""
        featureEndingImage = project.endingImage ?? ""
        featureUnresolvedSetupsText = (project.unresolvedSetups ?? []).joined(separator: "\n")
    }

    private func clearFeatureSpineFields() {
        featureLogline = ""
        featureThemeArgument = ""
        featureCentralQuestion = ""
        featureProtagonistWant = ""
        featureProtagonistNeed = ""
        featureAntagonisticForce = ""
        featureActPosition = ""
        featureEndingImage = ""
        featureUnresolvedSetupsText = ""
    }

    func saveFeatureSpineMetadata() async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                projectId: project.id,
                title: project.title,
                phase: project.lastPhase ?? "scene_draft",
                tags: project.tags ?? [],
                characters: project.characters ?? [],
                setting: project.setting ?? "",
                tone: project.tone ?? "",
                logline: featureLogline,
                themeArgument: featureThemeArgument,
                centralQuestion: featureCentralQuestion,
                protagonistWant: featureProtagonistWant,
                protagonistNeed: featureProtagonistNeed,
                antagonisticForce: featureAntagonisticForce,
                actPosition: featureActPosition,
                endingImage: featureEndingImage,
                unresolvedSetups: Self.unresolvedSetups(from: featureUnresolvedSetupsText)
            )
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
                hydrateFeatureSpineFields(from: nextProject)
            }
            syncLiveDraftBridgeProjectContext()
            infoText = "Feature spine saved."
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func upsertProject(_ project: BackendScreenplayProjectSummary) {
        if let index = projects.firstIndex(where: { $0.id == project.id }) {
            projects[index] = project
        } else {
            projects.insert(project, at: 0)
        }
        projects.sort { lhs, rhs in
            (lhs.updatedAt ?? 0) > (rhs.updatedAt ?? 0)
        }
        if selectedProjectID == project.id || selectedProject?.id == project.id {
            hydrateFeatureSpineFields(from: project)
        }
    }

    func applyProjectMetadataUpdate(_ project: BackendScreenplayProjectSummary) {
        upsertProject(project)
        if selectedProjectID == project.id {
            selectedProject = project
        }
    }

    private func clearTransientProjectStateForSelectionChange(to projectID: String) {
        if !ScreenplayProjectScopedState.matches(recoveryCandidate?.projectId, selectedProjectId: projectID) {
            recoveryCandidate = nil
        }
        if !ScreenplayProjectScopedState.matches(conflictState?.projectId, selectedProjectId: projectID) {
            conflictState = nil
        }
        if !ScreenplayProjectScopedState.matches(
            pendingScreenplayQuestion?.projectId,
            selectedProjectId: projectID
        ) {
            pendingScreenplayQuestion = nil
        }
    }

    private func reconcileSceneSessionState(with outline: BackendScreenplayOutline) {
        let sceneIDs = Set(outline.scenes.map { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
        let actIDs = Set(outline.acts.map { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
        let beatIDs = Set(outline.beats.map { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })

        if ScreenplaySceneSessionRestorePolicy.shouldClearSelection(editingSceneID, validIDs: sceneIDs) {
            cancelEditingScene()
        }
        if ScreenplaySceneSessionRestorePolicy.shouldClearSelection(newSceneActID, validIDs: actIDs) {
            newSceneActID = ""
        }
        if ScreenplaySceneSessionRestorePolicy.shouldClearSelection(newBeatSceneID, validIDs: sceneIDs) {
            newBeatSceneID = ""
        }
        if ScreenplaySceneSessionRestorePolicy.shouldClearSelection(newBeatActID, validIDs: actIDs) {
            newBeatActID = ""
        }
        if ScreenplaySceneSessionRestorePolicy.shouldClearSelection(editingBeatID, validIDs: beatIDs) {
            cancelEditingBeat()
        }
    }

    @discardableResult
    func hydrateDraftRestoringQueuedSaves(from project: BackendScreenplayProjectSummary) async -> Bool {
        let context = currentStudioAuthContext()
        guard project.id == selectedProjectID else { return false }
        guard await restorePendingDraftSaveBeforeProjectHydration() else { return false }
        guard authContextIsCurrent(context), project.id == selectedProjectID else { return false }
        hydrateDraft(from: project)
        return true
    }

    /// No selection is not an empty saved draft. Keep the unbound writer page;
    /// detach only text actually loaded from a previously selected project.
    func clearBoundDraftForEmptyProjectSelection() {
        guard selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !loadedDraftProjectID.isEmpty else { return }
        applyServerDraft("", versionId: "", allowOverwriteDirtyLocalDraft: true)
    }

    private func hydrateDraft(from project: BackendScreenplayProjectSummary) {
        let selectedVersion = ScreenplayProjectDraftRestorePolicy.preferredVersion(in: project)
        let nextDraft = selectedVersion?.draft ?? ""
        studioWriteAnchors = (selectedVersion?.studioWriteAnchors ?? []).filter { anchor in
            !anchor.writeId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().hasPrefix("binding:")
        }
        screenplayBindings = selectedVersion?.screenplayBindings ?? []
        applyServerDraft(
            nextDraft,
            versionId: selectedVersion?.id ?? "",
            serverUpdatedAt: selectedVersion?.updatedAt ?? selectedVersion?.createdAt ?? 0,
            serverDraftExcerpt: selectedVersion?.draftExcerpt ?? ""
        )
    }

    func applyServerDraft(
        _ draft: String,
        versionId: String,
        allowOverwriteDirtyLocalDraft: Bool = false,
        serverUpdatedAt: TimeInterval = 0,
        serverDraftExcerpt: String = ""
    ) {
        let normalizedProjectID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedLocalDraft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedServerDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedServerVersionID = versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let localEditsNeedProtection = ScreenplayRemoteDraftConflictPolicy.shouldProtectLocalDraft(
            selectedProjectId: normalizedProjectID,
            loadedProjectId: loadedDraftProjectID,
            localDraft: normalizedLocalDraft,
            serverDraft: normalizedServerDraft,
            hasUnsavedChanges: hasUnsavedDraftChanges,
            isManualEditing: isManualDraftEditing,
            secondsSinceManualEdit: Date().timeIntervalSince(lastManualDraftEditAt),
            allowOverwrite: allowOverwriteDirtyLocalDraft
        )

        if localEditsNeedProtection {
            let remoteConflict = ScreenplayRemoteDraftConflictPolicy.shouldSurfaceConflict(
                localEditsProtected: true,
                localVersionId: latestVersionID,
                serverVersionId: normalizedServerVersionID,
                localDraft: normalizedLocalDraft,
                serverDraft: normalizedServerDraft
            )
            if remoteConflict {
                let excerpt = serverDraftExcerpt.trimmingCharacters(in: .whitespacesAndNewlines)
                conflictState = SaveConflictState(
                    projectId: normalizedProjectID,
                    baseVersionId: latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines),
                    serverVersionId: normalizedServerVersionID,
                    serverDraft: draft,
                    serverDraftExcerpt: excerpt.isEmpty ? String(normalizedServerDraft.prefix(240)) : excerpt,
                    serverUpdatedAt: serverUpdatedAt
                )
                autosaveStatusText = "Conflict detected"
                infoText = "Another device updated this draft. Choose keep mine or load server."
                persistRecoveryForUnconfirmedSave(
                    projectId: normalizedProjectID,
                    draft: fountainDraft,
                    baseVersionId: latestVersionID,
                    surfaceCandidate: false
                )
            } else {
                autosaveStatusText = "Unsaved changes"
                if infoText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                    infoText == "Loaded latest draft" ||
                    infoText == "Project ready." {
                    infoText = "Kept your manual edits on the page. Save when you're ready."
                }
                conflictState = nil
            }
            // An unchanged server snapshot is not a recovery decision: these
            // protected edits are already on the page. Keep their durable copy
            // without placing a modal over active writing/inspector controls.
            // Real remote conflicts and fresh-launch recovery remain explicit.
            if remoteConflict {
                evaluateLocalDraftRecovery(projectId: selectedProjectID, serverDraft: draft)
            }
            return
        }

        isHydratingDraft = true
        fountainDraft = draft
        latestVersionID = versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        isHydratingDraft = false
        loadedDraftProjectID = normalizedProjectID
        adoptLoadedDraftIntoBridge(owner: currentStudioAuthContext())
        isManualDraftEditing = false
        stopFollowingRemoteLiveDraft()
        lastManualDraftEditAt = .distantPast
        syncLiveDraftBridgeProjectContext()
        lastSavedDraftFingerprint = fingerprint(for: draft)
        lastRevisionBaseDraft = draft
        hasUnsavedDraftChanges = false
        autosaveStatusText = draft.isEmpty ? "Ready" : "Loaded latest draft"
        conflictState = nil
        evaluateLocalDraftRecovery(
            projectId: selectedProjectID,
            serverDraft: draft
        )
        Task { await refreshDraftInsights() }
    }

    private func scheduleProgrammaticDraftAutosaveIfNeeded(source: String) {
        guard ScreenplayProgrammaticDraftAutosavePolicy.shouldAutosave(
            hasSelectedProject: selectedProject != nil,
            autosaveEnabled: autosaveEnabled,
            hasUnsavedDraftChanges: hasUnsavedDraftChanges,
            isStreamingDraftPreviewActive: isStreamingDraftPreviewActive,
            draft: fountainDraft
        ) else {
            return
        }

        Task { await saveCurrentDraft(source: source) }
    }

    func handleDraftDebouncedChange(_ draft: String) async {
        let projectID = selectedProjectID
        let authContext = currentStudioAuthContext()
        func isCurrentDraft() -> Bool {
            !Task.isCancelled && !isHydratingDraft && selectedProjectID == projectID
                && authContextIsCurrent(authContext) && fountainDraft.utf8.elementsEqual(draft.utf8)
        }
        // Reuse 636ddfc4: a queued callback may start after newer edits,
        // and network waits permit project/session changes. Never let an old
        // snapshot retire or persist the current writer's page.
        guard isCurrentDraft() else { return }
        let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasCoveragePresentation = coverageSimulationReport != nil ||
            !coverageSimulationErrorText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if hasCoveragePresentation,
           coverageSimulationSnapshot?.matches(
               draft: normalized,
               frameworkId: selectedCraftFrameworkID
           ) != true {
            clearCoverageSimulation()
        }
        let currentFingerprint = fingerprint(for: draft)
        hasUnsavedDraftChanges = currentFingerprint != lastSavedDraftFingerprint
        if hasUnsavedDraftChanges && isManualDraftEditing {
            autosaveStatusText = "Unsaved changes"
            if infoText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                infoText == "Project ready." ||
                infoText == "Loaded latest draft" {
                infoText = "Kept your manual edits on the page. Save when you're ready."
            }
        }

        await recomputePagination(for: draft, source: "Draft")
        guard isCurrentDraft() else { return }
        await recomputeRevision(for: draft, source: "Draft")
        guard isCurrentDraft() else { return }
        Task { await self.refreshFormatLint(source: "Draft") }
        Task { await self.refreshCoverageIfNeeded() }

        if isStreamingDraftPreviewActive {
            autosaveStatusText = "Receiving live draft..."
            return
        }

        guard !normalized.isEmpty else {
            autosaveStatusText = "Draft empty"
            if !selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                clearLocalDraftRecovery(projectId: selectedProjectID)
            }
            return
        }
        persistLocalDraftRecovery(
            projectId: selectedProjectID,
            draft: draft,
            baseVersionId: latestVersionID,
            dirty: hasUnsavedDraftChanges
        )
        if selectedProject == nil {
            autosaveStatusText = hasUnsavedDraftChanges ? "Create project to save" : "Live draft"
            return
        }
        guard autosaveEnabled else {
            autosaveStatusText = hasUnsavedDraftChanges ? "Unsaved changes" : "Saved"
            return
        }
        guard hasUnsavedDraftChanges else {
            isManualDraftEditing = false
            autosaveStatusText = "Saved"
            return
        }
        if isFollowingRemoteLiveDraft {
            // The typing device owns this save; we adopt its version id when
            // it announces one (adoptRemoteLiveVersion).
            autosaveStatusText = remoteLiveDraftStatusText
            return
        }
        let saveIntent = resolvedDraftSaveIntent(for: draft)
        await saveCurrentDraft(source: saveIntent.source, notes: saveIntent.notes)
    }

    private func resolvedDraftSaveIntent(for draft: String) -> ScreenplayDraftSaveIntent {
        ScreenplayDraftSaveIntentPolicy.intent(
            draft: draft,
            selectedProjectID: selectedProjectID,
            isManualDraftEditing: isManualDraftEditing,
            committedWrite: ScreenplayLiveDraftBridge.shared.lastCommittedWrite
        )
    }

    private func makeDraftSaveRequest(
        draft: String,
        source: String,
        notes: String,
        baseVersionOverride: String?
    ) -> DraftSaveRequest? {
        guard let project = selectedProject else { return nil }
        let ownerUserId = BackendAuthClient.currentAuthSessionState().user?.userId
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let authContext = currentStudioAuthContext()
        let bridge = ScreenplayLiveDraftBridge.shared
        let origin = selectedProjectID == project.id && loadedDraftProjectID == project.id && ScreenplayLiveDraftSyncService.shared.ownsEditor(self)
            ? ScreenplayDraftSaveOrigin.capture(document: bridge.captureLiveTalkDocument(), projectID: project.id,
                owner: authContext, isActiveEditor: true,
                backendURL: BackendAuthClient.resolvedBackendBaseURL()) : nil
        return DraftSaveRequest(
            id: UUID().uuidString.lowercased(),
            projectId: project.id,
            ownerUserId: ownerUserId,
            draft: draft,
            title: project.title,
            phase: project.lastPhase ?? "scene_draft",
            source: source,
            notes: notes,
            studioWriteAnchors: studioWriteAnchors,
            screenplayBindings: screenplayBindings,
            baseVersionId: (baseVersionOverride ?? latestVersionID)
                .trimmingCharacters(in: .whitespacesAndNewlines),
            authContext: authContext,
            deliveryOrigin: origin
        )
    }

    func refreshDraftSaveOutboxStatus() async {
        let owner = currentStudioAuthContext()
        let ownerUserId = owner.userID
        let bridge = ScreenplayLiveDraftBridge.shared
        let documentID = bridge.draftOrigin.documentID
        let projectID = selectedProjectID
        let backendURL = BackendAuthClient.resolvedBackendBaseURL()
        let snapshot = await draftSaveOutbox.snapshot(ownerUserId: ownerUserId)
        let pending = if let documentID {
            try? await draftSaveOutbox.pendingInitialProject(ownerUserID: ownerUserId, backendURL: backendURL,
                documentID: documentID, sourceProjectID: projectID)
        } else { nil as ScreenplayDraftSaveOutboxEntry? }
        guard authContextIsCurrent(owner),
              OfflineTalkRecoveryScope.sameBackend(backendURL, BackendAuthClient.resolvedBackendBaseURL()),
              documentID == bridge.draftOrigin.documentID, projectID == selectedProjectID else { return }
        pendingInitialProject = pending
        if hasPendingInitialProject, projectID.isEmpty { hasUnsavedDraftChanges = true }
        queuedDraftSaveCount = snapshot.activeCount
        parkedDraftSaveCount = snapshot.parkedCount
        guard !isSaving, conflictState == nil else { return }
        if snapshot.activeCount > 0 {
            autosaveStatusText = snapshot.activeCount == 1
                ? "Queued locally - reconnecting"
                : "\(snapshot.activeCount) saves queued locally"
        } else if snapshot.parkedCount > 0 {
            autosaveStatusText = snapshot.parkedCount == 1
                ? "1 local save needs attention"
                : "\(snapshot.parkedCount) local saves need attention"
        }
    }

    func resumeQueuedDraftSavesIfNeeded(force: Bool = false) async {
        guard !isDraftSaveInFlight,
              !isSaving,
              !isStreamingDraftPreviewActive else {
            return
        }
        let projectId = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !projectId.isEmpty, loadedDraftProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == projectId,
              selectedProject?.id.trimmingCharacters(in: .whitespacesAndNewlines) == projectId else {
            await refreshDraftSaveOutboxStatus()
            return
        }
        let initialContext = currentStudioAuthContext()
        let ownerUserId = initialContext.userID

        isDraftSaveInFlight = true
        var completedCount = 0
        var acknowledged: (DraftSaveRequest, DraftSaveCompletion)?
        var failed: DraftSaveRequest?
        while completedCount < 4 {
            let entry: ScreenplayDraftSaveOutboxEntry?
            do {
                entry = try await draftSaveOutbox.beginNext(
                    projectId: projectId,
                    ownerUserId: ownerUserId,
                    force: force
                )
            } catch {
                errorText = "Your local save queue could not be read: \(error.localizedDescription)"
                break
            }
            guard let entry else { break }
            #if DEBUG
            debugAfterDraftSaveClaim?()
            #endif
            let currentContext = currentStudioAuthContext()
            guard ScreenplayStudioAuthContextPolicy.matches(expected: initialContext, current: currentContext),
                  currentContext.userID == entry.ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines) else {
                do { try await draftSaveOutbox.releaseInflightClaim(entry) }
                catch { errorText = "A local save could not be returned to its queue. Its words remain stored." }
                break
            }
            adoptQueuedDraftIntoUnchangedEditorIfNeeded(entry)
            let request = DraftSaveRequest(entry: entry, authContext: currentContext)
            guard let completion = await performDraftSave(request) else { failed = request; break }
            acknowledged = (request, completion)
            completedCount += 1
        }
        await refreshDraftSaveOutboxStatus()
        var pending = pendingDraftSaveRequest
        pendingDraftSaveRequest = nil
        isDraftSaveInFlight = false
        if let failed, let queued = pending {
            pending = await pendingDraftSaveAfterFailure(queued, after: failed)
        }
        guard let pending else { return }
        // Restore the handoff from original50d04ae using the current immutable
        // owner/document completion contract, never another project's UI base.
        let next = acknowledged.map { request, completion in
            draftSaveFollowingAcknowledgement(pending, saved: request, versionID: completion.versionID)
        } ?? pending
        await dispatchDraftSaveRequest(next)
    }

    private func adoptQueuedDraftIntoUnchangedEditorIfNeeded(_ entry: ScreenplayDraftSaveOutboxEntry) {
        guard ScreenplayQueuedDraftAdoptionPolicy.shouldAdopt(
            selectedProjectID: selectedProjectID, loadedProjectID: loadedDraftProjectID,
            latestVersionID: latestVersionID, queuedProjectID: entry.projectId, queuedBaseVersionID: entry.baseVersionId,
            hasUnsavedChanges: hasUnsavedDraftChanges, isManualEditing: isManualDraftEditing,
            currentDraftFingerprint: fingerprint(for: fountainDraft), lastSavedDraftFingerprint: lastSavedDraftFingerprint
        ), !fountainDraft.utf8.elementsEqual(entry.draft.utf8) else { return }
        isHydratingDraft = true
        fountainDraft = entry.draft
        isHydratingDraft = false
        isManualDraftEditing = true
        lastManualDraftEditAt = Date()
        hasUnsavedDraftChanges = true
        autosaveStatusText = "Queued locally - reconnecting"
        infoText = "Restored your local screenplay save and reconnecting."
        persistLocalDraftRecovery(projectId: entry.projectId, draft: entry.draft, baseVersionId: entry.baseVersionId, dirty: true)
    }

    func reconnectAndResumeQueuedDraftSaves() async {
        await refreshDraftSaveOutboxStatus()
        guard queuedDraftSaveCount > 0 else { return }
        if !didLoadScreenplayProjectsFromBackend {
            guard !isLoading else { return }
            await load()
            return
        }
        await resumeQueuedDraftSavesIfNeeded(force: true)
    }

    private func saveCurrentDraft(
        source: String,
        notes: String = "",
        baseVersionOverride: String? = nil,
        draftOverride: String? = nil
    ) async {
        guard let request = makeDraftSaveRequest(
            draft: draftOverride ?? fountainDraft,
            source: source,
            notes: notes,
            baseVersionOverride: baseVersionOverride
        ) else {
            errorText = "Select a project first."
            return
        }
        await dispatchDraftSaveRequest(request)
    }

    private func dispatchDraftSaveRequest(_ request: DraftSaveRequest) async {
        let bridge = ScreenplayLiveDraftBridge.shared
        let documentID = request.deliveryOrigin?.documentID ?? bridge.draftOrigin.documentID
        func ownsQueuedPublication() -> Bool {
            authContextIsCurrent(request.authContext) && ScreenplayLiveDraftSyncService.shared.ownsEditor(self)
                && selectedProjectID == request.projectId && loadedDraftProjectID == request.projectId
                && bridge.draftOrigin.documentID == documentID
                && (request.deliveryOrigin?.permitsBackend(BackendAuthClient.resolvedBackendBaseURL()) ?? true)
        }
        let normalized = request.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            autosaveStatusText = "Draft empty"
            return
        }

        if !isDraftSaveInFlight,
           (try? await draftSaveOutbox.hasActiveEntries(
               projectId: request.projectId,
               ownerUserId: request.ownerUserId
           )) == true {
            do {
                try await draftSaveOutbox.enqueue(request.outboxEntry)
                guard ownsQueuedPublication() else { return }
                hasUnsavedDraftChanges = true
                persistRecoveryForUnconfirmedSave(
                    projectId: request.projectId,
                    draft: fountainDraft,
                    baseVersionId: request.baseVersionId
                )
                autosaveStatusText = "Queued locally - reconnecting"
                infoText = "Your newest draft is waiting safely behind the earlier save."
                errorText = ""
                await refreshDraftSaveOutboxStatus()
            } catch {
                if ownsQueuedPublication() {
                    errorText = "Your draft is preserved locally, but its retry could not be queued: \(error.localizedDescription)"
                }
            }
            return
        }

        if isDraftSaveInFlight {
            pendingDraftSaveRequest = request
            return
        }

        isDraftSaveInFlight = true
        defer { isDraftSaveInFlight = false }

        var nextRequest: DraftSaveRequest? = request
        while let activeRequest = nextRequest {
            pendingDraftSaveRequest = nil
            let completion = await performDraftSave(activeRequest)
            guard let completion else {
                let queuedRequest = pendingDraftSaveRequest
                pendingDraftSaveRequest = nil
                if let queuedRequest,
                   let continuation = await pendingDraftSaveAfterFailure(queuedRequest, after: activeRequest) {
                    nextRequest = continuation
                    continue
                }
                return
            }
            if let queuedRequest = pendingDraftSaveRequest {
                let sameOwnerProject = activeRequest.projectId == queuedRequest.projectId &&
                    activeRequest.deliveryOrigin == queuedRequest.deliveryOrigin &&
                    ScreenplayStudioAuthContextPolicy.matches(expected: activeRequest.authContext, current: queuedRequest.authContext)
                if sameOwnerProject, ScreenplayDraftSaveCoalescingPolicy.shouldCoalesce(
                    activeDraft: activeRequest.draft,
                    activeSource: activeRequest.source,
                    activeNotes: activeRequest.notes,
                    activeBaseVersionOverride: activeRequest.baseVersionId,
                    pendingDraft: queuedRequest.draft,
                    pendingSource: queuedRequest.source,
                    pendingNotes: queuedRequest.notes,
                    pendingBaseVersionOverride: queuedRequest.baseVersionId
                ) {
                    nextRequest = nil
                } else {
                    nextRequest = draftSaveFollowingAcknowledgement(queuedRequest,
                        saved: activeRequest, versionID: completion.versionID)
                }
                continue
            }

            let currentDraft = fountainDraft
            guard completion.mayContinueEditing, selectedProjectID == activeRequest.projectId,
            ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
                currentDraft: currentDraft,
                savedDraft: activeRequest.draft
            ),
            selectedProject != nil,
            autosaveEnabled,
            !isStreamingDraftPreviewActive else {
                nextRequest = nil
                continue
            }
            let intent = resolvedDraftSaveIntent(for: currentDraft)
            nextRequest = makeDraftSaveRequest(
                draft: currentDraft,
                source: intent.source,
                notes: intent.notes,
                baseVersionOverride: nil
            )
        }
    }

    private func draftSaveFollowingAcknowledgement(_ pending: DraftSaveRequest,
        saved: DraftSaveRequest, versionID: String) -> DraftSaveRequest {
        let follows = pending.source != "studio_conflict_resolve" && pending.projectId == saved.projectId &&
            pending.deliveryOrigin == saved.deliveryOrigin && pending.baseVersionId == saved.baseVersionId &&
            ScreenplayStudioAuthContextPolicy.matches(expected: saved.authContext, current: pending.authContext)
        return follows ? pending.rebased(on: versionID) : pending
    }

    // The same failure retention rules govern manual and background flights.
    private func pendingDraftSaveAfterFailure(_ pending: DraftSaveRequest,
                                              after active: DraftSaveRequest) async -> DraftSaveRequest? {
        if (pending.projectId != active.projectId || pending.deliveryOrigin != active.deliveryOrigin ||
            !ScreenplayStudioAuthContextPolicy.matches(expected: active.authContext, current: pending.authContext)),
           authContextIsCurrent(pending.authContext) { return pending }
        do {
            try await draftSaveOutbox.enqueue(pending.outboxEntry)
            if !shouldQueuePendingDraftSaveAfterFailure {
                try await draftSaveOutbox.markParked(id: pending.id, error: "The earlier save needs review.")
            }
        } catch {
            if selectedProjectID == pending.projectId {
                errorText = "Your newest local draft is preserved, but its retry could not be queued: \(error.localizedDescription)"
            }
        }
        return nil
    }

    private func performDraftSave(_ request: DraftSaveRequest) async -> DraftSaveCompletion? {
        let bridge = ScreenplayLiveDraftBridge.shared
        let documentID = request.deliveryOrigin?.documentID ?? bridge.draftOrigin.documentID
        func ownsCompletion() -> Bool {
            authContextIsCurrent(request.authContext) && ScreenplayLiveDraftSyncService.shared.ownsEditor(self)
                && selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) == request.projectId
                && loadedDraftProjectID == request.projectId && bridge.draftOrigin.documentID == documentID
                && (request.deliveryOrigin?.permitsBackend(BackendAuthClient.resolvedBackendBaseURL()) ?? true)
        }
        func completion(_ versionID: String) -> DraftSaveCompletion {
            .init(versionID: versionID, mayContinueEditing: ownsCompletion())
        }
        let normalized = request.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            if ownsCompletion() { autosaveStatusText = "Draft empty" }
            return nil
        }

        guard authContextIsCurrent(request.authContext) else { return nil }

        #if DEBUG
        if IOThemRuntime.isRunningUITests,
           request.source == "studio_conflict_resolve",
           ProcessInfo.processInfo.arguments.contains("--ui-conflict-save-success") {
            latestVersionID = "ui-local-version"
            lastSavedDraftFingerprint = fingerprint(for: request.draft)
            lastRevisionBaseDraft = request.draft
            hasUnsavedDraftChanges = false
            isManualDraftEditing = false
            lastManualDraftEditAt = .distantPast
            loadedDraftProjectID = request.projectId
            autosaveStatusText = "Autosaved"
            errorText = ""
            infoText = "Local draft saved."
            clearLocalDraftRecovery(projectId: request.projectId)
            return completion("ui-local-version")
        }
        #endif

        shouldQueuePendingDraftSaveAfterFailure = false
        do {
            try await draftSaveOutbox.enqueue(request.outboxEntry)
            try await draftSaveOutbox.markInflight(id: request.id)
        } catch {
            guard ownsCompletion() else { return nil }
            hasUnsavedDraftChanges = true
            persistRecoveryForUnconfirmedSave(
                projectId: request.projectId,
                draft: fountainDraft,
                baseVersionId: request.baseVersionId
            )
            autosaveStatusText = "Saved locally"
            infoText = "Your draft is preserved on this device."
            errorText = "The local save queue could not be secured: \(error.localizedDescription)"
            return nil
        }

        isSaving = true
        defer { isSaving = false }
        do {
            guard authContextIsCurrent(request.authContext) else {
                try? await draftSaveOutbox.markRetryable(
                    id: request.id,
                    error: "Account changed before save confirmation."
                )
                return nil
            }
            if let origin = request.deliveryOrigin {
                let writeURL = await draftSaveAPI.baseURL()
                var readURL = writeURL
                if request.baseVersionId.isEmpty { readURL = await projectSelectionAPI.baseURL() }
                guard origin.permitsBackend(BackendAuthClient.resolvedBackendBaseURL()),
                      origin.permitsBackend(writeURL), origin.permitsBackend(readURL) else {
                    throw BackendMemoryAPIError.server(status: 409, message: "The queued draft belongs to another backend. Its original words are kept for recovery.")
                }
                guard authContextIsCurrent(request.authContext), !Task.isCancelled else {
                    throw BackendMemoryAPIError.server(status: 409, message: "auth_request_superseded")
                }
            }
#if DEBUG
            if IOThemRuntime.isRunningUITests,
               ProcessInfo.processInfo.arguments.contains("--ui-screenplay-save-network-fault") {
                throw URLError(.notConnectedToInternet)
            }
#endif
            switch try await emptyBaseDraftSavePreflight(for: request) {
            case .notRequired, .versionlessProject:
                break
            case .canonicalVersion(let serverVersion, let responseURL):
                guard authContextIsCurrent(request.authContext) else { return nil }
                guard !serverVersion.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    throw BackendMemoryAPIError.invalidResponse
                }
                let serverDraft = serverVersion.draft ?? ""
                if serverDraft.utf8.elementsEqual(request.draft.utf8) {
                    if let evidence = ScreenplayConfirmedDraftSave.readback(entry: request.outboxEntry,
                        version: serverVersion, projectID: request.projectId, responseURL: responseURL,
                        owner: request.authContext, currentOwner: currentStudioAuthContext()) {
                        _ = try await liveReplyOutbox.recordConfirmedPageSave(evidence)
                    }
                    try await draftSaveOutbox.markSucceeded(
                        id: request.id,
                        serverVersionId: serverVersion.id
                    )
                    guard ownsCompletion() else {
                        reconcileAcknowledgedDraftRecovery(request, versionID: serverVersion.id)
                        return completion(serverVersion.id)
                    }
                    latestVersionID = serverVersion.id
                    lastSavedDraftFingerprint = fingerprint(for: request.draft)
                    lastRevisionBaseDraft = request.draft
                    hasUnsavedDraftChanges = ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
                        currentDraft: fountainDraft,
                        savedDraft: request.draft
                    )
                    loadedDraftProjectID = request.projectId
                    autosaveStatusText = hasUnsavedDraftChanges ? "Unsaved changes" : "Saved"
                    infoText = hasUnsavedDraftChanges
                        ? infoText
                        : "Already saved from another device."
                    persistLocalDraftRecovery(
                        projectId: request.projectId,
                        draft: fountainDraft,
                        baseVersionId: serverVersion.id,
                        dirty: hasUnsavedDraftChanges
                    )
                    return completion(serverVersion.id)
                }

                _ = try await draftSaveOutbox.retainConflict(projectId: request.projectId,
                    ownerUserId: request.ownerUserId, deliveryOrigin: request.deliveryOrigin)
                guard ownsCompletion() else { return nil }
                conflictState = SaveConflictState(
                    projectId: request.projectId,
                    baseVersionId: "",
                    serverVersionId: serverVersion.id,
                    serverDraft: serverDraft,
                    serverDraftExcerpt: serverVersion.draftExcerpt ?? String(serverDraft.prefix(240)),
                    serverUpdatedAt: serverVersion.updatedAt ?? serverVersion.createdAt ?? 0
                )
                hasUnsavedDraftChanges = true
                autosaveStatusText = "Conflict detected"
                infoText = "Another device already saved this project. Choose keep mine or load server."
                persistRecoveryForUnconfirmedSave(
                    projectId: request.projectId,
                    draft: fountainDraft,
                    baseVersionId: "",
                    surfaceCandidate: false
                )
                return nil
            }
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: request.projectId)
            let baseVersionId = request.baseVersionId
            let result: BackendReadResult<BackendScreenplayVersionMutationResponse>
            do {
                result = try await draftSaveAPI.upsertScreenplayProjectVersion(
                    projectId: request.projectId,
                    draft: request.draft,
                    title: request.title,
                    phase: request.phase,
                    notes: request.notes,
                    source: request.source,
                    studioWriteAnchors: request.studioWriteAnchors,
                    screenplayBindings: request.screenplayBindings,
                    baseVersionId: baseVersionId,
                    conflictStrategy: "reject_if_stale",
                    clientRequestId: request.id,
                    expectedBackendURL: request.deliveryOrigin?.backendURL,
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _)
                        where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                guard authContextIsCurrent(request.authContext) else { return nil }
                result = try await draftSaveAPI.upsertScreenplayProjectVersion(
                    projectId: request.projectId,
                    draft: request.draft,
                    title: request.title,
                    phase: request.phase,
                    notes: request.notes,
                    source: request.source,
                    studioWriteAnchors: request.studioWriteAnchors,
                    screenplayBindings: request.screenplayBindings,
                    baseVersionId: baseVersionId,
                    conflictStrategy: "reject_if_stale",
                    clientRequestId: request.id,
                    expectedBackendURL: request.deliveryOrigin?.backendURL
                )
            }
            guard authContextIsCurrent(request.authContext) else {
                try? await draftSaveOutbox.markRetryable(
                    id: request.id,
                    error: "Account changed before save confirmation."
                )
                return nil
            }
            let conflictDetected = (result.payload.conflict ?? false)
                || (result.payload.status?.localizedCaseInsensitiveContains("conflict") ?? false)
            if conflictDetected {
                let baseVersionId = (result.payload.baseVersionId ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let serverVersionId = (result.payload.serverVersionId ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                _ = try await draftSaveOutbox.retainConflict(projectId: request.projectId,
                    ownerUserId: request.ownerUserId, deliveryOrigin: request.deliveryOrigin)
                guard ownsCompletion() else { return nil }
                conflictState = SaveConflictState(
                    projectId: request.projectId,
                    baseVersionId: baseVersionId,
                    serverVersionId: serverVersionId,
                    serverDraft: result.payload.serverVersion?.draft ?? "",
                    serverDraftExcerpt: result.payload.serverVersion?.draftExcerpt ?? "",
                    serverUpdatedAt: result.payload.serverVersion?.updatedAt ?? 0
                )
                hasUnsavedDraftChanges = true
                autosaveStatusText = "Conflict detected"
                infoText = "Another collaborator updated this draft. Choose keep mine or load server."
                persistRecoveryForUnconfirmedSave(
                    projectId: request.projectId,
                    draft: fountainDraft,
                    baseVersionId: baseVersionId.isEmpty ? latestVersionID : baseVersionId,
                    surfaceCandidate: false
                )
                return nil
            }
            let nextVersionId = (result.payload.versionId ?? result.payload.version?.id ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !nextVersionId.isEmpty else {
                throw BackendMemoryAPIError.invalidResponse
            }
            guard result.payload.projectId.map({ $0 == request.projectId }) ?? true,
                  result.payload.project.map({ $0.id == request.projectId }) ?? true,
                  result.payload.version.map({ $0.id == nextVersionId && ($0.draft?.utf8.elementsEqual(request.draft.utf8) ?? true) }) ?? true else {
                throw BackendMemoryAPIError.invalidResponse
            }
            if let evidence = ScreenplayConfirmedDraftSave.ordinary(entry: request.outboxEntry,
                version: result.payload.version, versionID: result.payload.versionId,
                projectID: result.payload.projectId, responseURL: result.responseURL,
                owner: request.authContext, currentOwner: currentStudioAuthContext()) {
                _ = try await liveReplyOutbox.recordConfirmedPageSave(evidence)
            }
            try await draftSaveOutbox.markSucceeded(id: request.id, serverVersionId: nextVersionId)
            guard ownsCompletion() else {
                reconcileAcknowledgedDraftRecovery(request, versionID: nextVersionId)
                return completion(nextVersionId)
            }
            conflictState = nil
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
            }
            latestVersionID = nextVersionId
            if let savedAnchors = result.payload.version?.studioWriteAnchors {
                studioWriteAnchors = savedAnchors.filter { anchor in
                    !anchor.writeId.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().hasPrefix("binding:")
                }
            }
            if let savedBindings = result.payload.version?.screenplayBindings {
                screenplayBindings = savedBindings
            }
            syncLiveDraftBridgeProjectContext()
            lastSavedDraftFingerprint = fingerprint(for: request.draft)
            lastRevisionBaseDraft = request.draft
            hasUnsavedDraftChanges = ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
                currentDraft: fountainDraft,
                savedDraft: request.draft
            )
            if !hasUnsavedDraftChanges {
                // The editor shows exactly what was saved, so the checksum the
                // follower compares against its own editor text will match.
                ScreenplayLiveDraftSyncService.shared.announceSavedVersion(
                    projectID: request.projectId,
                    versionID: nextVersionId,
                    draft: fountainDraft
                )
                isManualDraftEditing = false
                lastManualDraftEditAt = .distantPast
            }
            loadedDraftProjectID = request.projectId
            if hasUnsavedDraftChanges {
                autosaveStatusText = "Unsaved changes"
            } else {
                autosaveStatusText = request.source == "studio_manual" ? "Saved now" : "Autosaved"
            }
            if request.source == "studio_manual" && !hasUnsavedDraftChanges {
                infoText = "Draft saved."
            } else if request.source == "studio_snapshot" && !hasUnsavedDraftChanges {
                infoText = "Snapshot saved."
            } else if request.source == "studio_conflict_resolve" && !hasUnsavedDraftChanges {
                infoText = "Local draft saved."
            } else if !hasUnsavedDraftChanges,
                      ScreenplayDraftSaveRecoveryPresentationPolicy.shouldClearInfoAfterSuccessfulSave(infoText) {
                infoText = ""
            }
            if request.source == "studio_snapshot" || request.source == "studio_conflict_resolve" {
                await loadSelectedProjectOutline()
                guard ownsCompletion() else { return completion(nextVersionId) }
            }
            persistLocalDraftRecovery(
                projectId: request.projectId,
                draft: fountainDraft,
                baseVersionId: latestVersionID,
                dirty: hasUnsavedDraftChanges
            )
            await recomputeRevision(for: fountainDraft, source: request.source, api: draftSaveAPI, isCurrent: ownsCompletion)
            guard ownsCompletion() else { return completion(nextVersionId) }
            if !errorText.isEmpty {
                errorText = ""
            }
            return completion(nextVersionId)
        } catch {
            guard authContextIsCurrent(request.authContext) else {
                try? await draftSaveOutbox.markRetryable(
                    id: request.id,
                    error: "Account changed before save confirmation."
                )
                return nil
            }
            let retryable = ScreenplayDraftSaveRetryPolicy.shouldRetry(error)
            shouldQueuePendingDraftSaveAfterFailure = retryable
            if retryable { try? await draftSaveOutbox.markRetryable(id: request.id, error: error.localizedDescription) }
            else { try? await draftSaveOutbox.markParked(id: request.id, error: error.localizedDescription) }
            guard ownsCompletion() else { return nil }
            hasUnsavedDraftChanges = true
            persistRecoveryForUnconfirmedSave(
                projectId: request.projectId,
                draft: fountainDraft,
                baseVersionId: request.baseVersionId
            )
            if retryable {
                autosaveStatusText = "Queued locally - reconnecting"
                infoText = "Your draft is safe on this device and will save when the connection returns."
                errorText = ""
            } else {
                autosaveStatusText = ScreenplayDraftSaveRecoveryPresentationPolicy.failureStatus(source: request.source)
                infoText = ScreenplayDraftSaveRecoveryPresentationPolicy.recoveryInfo(source: request.source)
                errorText = ScreenplayDraftSaveRecoveryPresentationPolicy.failureError(
                    source: request.source,
                    underlying: error.localizedDescription
                )
            }
            await refreshDraftSaveOutboxStatus()
            return nil
        }
    }

    private func reconcileAcknowledgedDraftRecovery(_ request: DraftSaveRequest, versionID: String) {
        let payload = localDraftRecoveryStore.payloads(ownerUserId: request.ownerUserId)[request.projectId]
        guard let keptDraft = payload?["draft"] as? String,
              (payload?["baseVersionId"] as? String ?? "") == request.baseVersionId else { return }
        // A clean older server copy is not a new unsaved edit. Preserve only
        // byte-distinct dirty work; otherwise advance to the acknowledged words.
        let draft = payload?["dirty"] as? Bool == false ? request.draft : keptDraft
        localDraftRecoveryStore.save(ownerUserId: request.ownerUserId, projectId: request.projectId,
            draft: draft, baseVersionId: versionID, dirty: !draft.utf8.elementsEqual(request.draft.utf8))
    }

    private func emptyBaseDraftSavePreflight(
        for request: DraftSaveRequest
    ) async throws -> EmptyBaseDraftSavePreflightResult {
        guard request.baseVersionId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .notRequired
        }
        guard authContextIsCurrent(request.authContext) else {
            throw BackendMemoryAPIError.invalidResponse
        }

        let ownerHeaders = projectOwnerHeaderOptions(forProjectID: request.projectId)
        let detailResult: BackendReadResult<BackendScreenplayProjectResponse>
        do {
            detailResult = try await projectSelectionAPI.fetchScreenplayProject(
                projectId: request.projectId,
                includeDrafts: true,
                versionLimit: 1,
                includeUserIdentity: ownerHeaders.includeUserIdentity,
                includeAuthToken: ownerHeaders.includeAuthToken,
                clientTokenOverride: ownerHeaders.clientTokenOverride
            )
        } catch BackendMemoryAPIError.server(let status, _)
                    where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
            guard authContextIsCurrent(request.authContext) else {
                throw BackendMemoryAPIError.invalidResponse
            }
            detailResult = try await projectSelectionAPI.fetchScreenplayProject(
                projectId: request.projectId,
                includeDrafts: true,
                versionLimit: 1
            )
        }
        guard authContextIsCurrent(request.authContext) else {
            throw BackendMemoryAPIError.invalidResponse
        }
        if let origin = request.deliveryOrigin {
            guard let responseURL = detailResult.responseURL, origin.permitsBackend(responseURL),
                  origin.permitsBackend(BackendAuthClient.resolvedBackendBaseURL()) else {
                throw BackendMemoryAPIError.server(status: 409, message: "The queued draft belongs to another backend. Its original words are kept for recovery.")
            }
        }
        guard let project = detailResult.payload.project, project.id == request.projectId else {
            throw BackendMemoryAPIError.invalidResponse
        }
        guard let version = ScreenplayProjectDraftRestorePolicy.preferredVersion(in: project) else {
            return .versionlessProject
        }
        return .canonicalVersion(version, detailResult.responseURL)
    }

    private func recomputePagination(for draft: String, source: String) async {
        let paginationSource = FountainPaginationSource.make(from: draft)
        guard paginationSource.shouldPaginate else {
            activePaginationRequestID = nil
            isPaginationRefreshing = false
            paginationPages = []
            paginationErrorText = ""
            return
        }

        let requestID = UUID()
        activePaginationRequestID = requestID
        isPaginationRefreshing = true
        defer { if activePaginationRequestID == requestID { isPaginationRefreshing = false } }
        let requestedDensity = linesPerPage
        do {
            let result = try await StudioCraftResilience.run(source: source) {
                try await BackendMemoryAPI.shared.paginateScreenplayDraft(
                    draft: draft,
                    title: selectedProject?.title ?? "",
                    phase: selectedProject?.lastPhase ?? "scene_draft",
                    linesPerPage: requestedDensity
                )
            }
            guard activePaginationRequestID == requestID, draft == fountainDraft, requestedDensity == linesPerPage else { return }
            paginationPages = result.payload.pages
            paginationErrorText = ""
        } catch {
            guard activePaginationRequestID == requestID, draft == fountainDraft, requestedDensity == linesPerPage else { return }
            paginationErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "page layout"
            )
        }
    }

    private func recomputeRevision(for draft: String, source: String, api: BackendMemoryAPI = .shared,
                                   isCurrent: () -> Bool = { true }) async {
        let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            revisionSummary = nil
            revisionRanges = []
            revisionErrorText = ""
            return
        }

        guard isCurrent() else { return }
        isRevisionRefreshing = true
        defer { if isCurrent() { isRevisionRefreshing = false } }
        do {
            let result = try await StudioCraftResilience.run(source: source) {
                try await api.fetchScreenplayRevisionColors(
                    baseDraft: lastRevisionBaseDraft,
                    draft: draft,
                    revisionColor: revisionColor
                )
            }
            guard isCurrent(), normalized == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            revisionSummary = result.payload.summary
            revisionRanges = result.payload.ranges
            revisionErrorText = ""
        } catch {
            guard isCurrent() else { return }
            revisionErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "revision colors"
            )
        }
    }

    private func loadCollaborators(projectId: String) async throws {
        let ownerHeaders = projectOwnerHeaderOptions(forProjectID: projectId)
        let result: BackendReadResult<BackendScreenplayCollaboratorsResponse>
        do {
            result = try await projectSelectionAPI.fetchScreenplayCollaborators(
                projectId: projectId,
                includeUserIdentity: ownerHeaders.includeUserIdentity,
                includeAuthToken: ownerHeaders.includeAuthToken,
                clientTokenOverride: ownerHeaders.clientTokenOverride
            )
        } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
            result = try await projectSelectionAPI.fetchScreenplayCollaborators(projectId: projectId)
        }
        applyCollaboratorsPayload(result.payload)
    }

    private func loadComments(projectId: String) async throws {
        let ownerHeaders = projectOwnerHeaderOptions(forProjectID: projectId)
        let result: BackendReadResult<BackendScreenplayCommentsResponse>
        do {
            result = try await projectSelectionAPI.fetchScreenplayComments(
                projectId: projectId,
                limit: 160,
                actorEmail: resolvedCommentActorEmail(),
                includeUserIdentity: ownerHeaders.includeUserIdentity,
                includeAuthToken: ownerHeaders.includeAuthToken,
                clientTokenOverride: ownerHeaders.clientTokenOverride
            )
        } catch BackendMemoryAPIError.server(let status, _) where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
            result = try await projectSelectionAPI.fetchScreenplayComments(
                projectId: projectId,
                limit: 160,
                actorEmail: resolvedCommentActorEmail()
            )
        }
        applyCommentsPayload(result.payload)
    }

    private func projectOwnerHeaderOptions(
        forProjectID projectID: String
    ) -> (
        includeUserIdentity: Bool,
        includeAuthToken: Bool,
        usesDebugClientTokenOwner: Bool,
        clientTokenOverride: String?
    ) {
        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let liveDraftBridge = ScreenplayLiveDraftBridge.shared
        let debugRequestedProjectID = liveDraftBridge.debugRequestedProjectID
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let matchesPendingDebugRequest = !cleanProjectID.isEmpty
            && !debugRequestedProjectID.isEmpty
            && cleanProjectID == debugRequestedProjectID
        let usesDebugClientTokenOwner = matchesPendingDebugRequest
            || liveDraftBridge.usesDebugClientTokenOwner(forProjectID: cleanProjectID)
            || clientTokenOwnedProjectIDs.contains(cleanProjectID)
        let debugClientTokenOverride = matchesPendingDebugRequest
            ? BackendAuthClient.studioDebugClientTokenOverride()
            : nil
        let clientTokenOverride = (
            debugClientTokenOverride
                ?? liveDraftBridge.debugClientTokenOwnerToken(forProjectID: cleanProjectID)
        )?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (
            includeUserIdentity: !usesDebugClientTokenOwner,
            includeAuthToken: true,
            usesDebugClientTokenOwner: usesDebugClientTokenOwner,
            clientTokenOverride: (clientTokenOverride?.isEmpty ?? true) ? nil : clientTokenOverride
        )
    }

    private func updateClientTokenOwnerContext(
        forProjectID projectID: String,
        loadedWithClientTokenOwner: Bool,
        clientToken: String?
    ) {
        let cleanProjectID = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanProjectID.isEmpty else { return }
        if loadedWithClientTokenOwner {
            clientTokenOwnedProjectIDs.insert(cleanProjectID)
            ScreenplayLiveDraftBridge.shared.rememberDebugClientTokenOwnedProjectID(
                cleanProjectID,
                clientToken: clientToken ?? BackendAuthClient.studioDebugClientTokenOverride()
            )
        }
    }

    private func applyCollaboratorsPayload(_ payload: BackendScreenplayCollaboratorsResponse) {
        if let project = payload.project {
            upsertProject(project)
            selectedProject = project
            selectedProjectID = project.id
            hydrateCollaboration(from: project)
            syncLiveDraftBridgeProjectContext()
        }
        if !payload.collaborators.isEmpty {
            collaborators = payload.collaborators.sorted { lhs, rhs in
                let lhsStatus = lhs.status ?? ""
                let rhsStatus = rhs.status ?? ""
                if lhsStatus != rhsStatus { return lhsStatus < rhsStatus }
                return lhs.email.localizedCaseInsensitiveCompare(rhs.email) == .orderedAscending
            }
        }
        if let emails = payload.approvedEmails {
            approvedEmails = emails
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
                .sorted()
        } else {
            approvedEmails = collaborators
                .filter { ($0.status ?? "").caseInsensitiveCompare("approved") == .orderedSame }
                .map { $0.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
                .sorted()
        }
        if commentAuthorEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            commentAuthorEmail = approvedEmails.first ?? commentAuthorEmail
        }
        if commentActorEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            commentActorEmail = approvedEmails.first ?? commentActorEmail
        }
    }

    private func applyCommentsPayload(_ payload: BackendScreenplayCommentsResponse) {
        if let project = payload.project {
            upsertProject(project)
            selectedProject = project
            selectedProjectID = project.id
            hydrateCollaboration(from: project)
            syncLiveDraftBridgeProjectContext()
        }
        comments = payload.comments.sorted { lhs, rhs in
            let lhsTs = lhs.updatedAt ?? lhs.createdAt ?? 0
            let rhsTs = rhs.updatedAt ?? rhs.createdAt ?? 0
            return lhsTs > rhsTs
        }
    }

    private func adoptLoadedDraftIntoBridge(owner: ScreenplayStudioAuthContext) {
        guard ScreenplayLiveDraftSyncService.shared.ownsEditor(self),
              loadedDraftProjectID == selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
        ScreenplayLiveDraftBridge.shared.adoptLoadedProjectDraft(fountainDraft, projectID: loadedDraftProjectID,
            versionID: latestVersionID, owner: owner)
    }

    @discardableResult
    func mirrorDraftIntoLiveBridgeIfOwned(_ observed: String) -> Bool {
        guard ScreenplayLiveDraftSyncService.shared.ownsEditor(self),
              observed.utf8.elementsEqual(fountainDraft.utf8) else { return false }
        let bridge = ScreenplayLiveDraftBridge.shared
        if !bridge.draftText.utf8.elementsEqual(observed.utf8) { bridge.draftText = observed }
        return true
    }

    private func syncLiveDraftBridgeProjectContext(clearWhenEmpty: Bool = false) {
        guard ScreenplayLiveDraftSyncService.shared.ownsEditor(self) else { return }
        let bridge = ScreenplayLiveDraftBridge.shared
        let projectID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? (selectedProject?.id ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            : selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let versionID = latestVersionID.trimmingCharacters(in: .whitespacesAndNewlines)
        let projectTitle = (selectedProject?.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let phase = (selectedProject?.lastPhase ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let projectCharacters = selectedProject?.characters ?? []
        let featureSpine = ScreenplayFeatureSpine(project: selectedProject)

        if clearWhenEmpty || !projectID.isEmpty {
            bridge.preferredProjectID = projectID
        }
        if clearWhenEmpty || !versionID.isEmpty || !bridge.preferredVersionID.isEmpty {
            bridge.preferredVersionID = versionID
        }
        if clearWhenEmpty || !phase.isEmpty || !bridge.latestPhase.isEmpty {
            bridge.latestPhase = phase
        }
        if clearWhenEmpty || !projectID.isEmpty || !projectTitle.isEmpty || !outline.scenes.isEmpty {
            bridge.bindStructuredDraftToProject(
                projectID: projectID,
                projectTitle: projectTitle,
                versionID: versionID,
                phase: phase,
                outline: outline,
                projectCharacters: projectCharacters,
                featureSpine: featureSpine
            )
        }
    }

    private func hydrateCollaboration(from project: BackendScreenplayProjectSummary) {
        collaborators = (project.collaborators ?? []).sorted { lhs, rhs in
            let lhsStatus = lhs.status ?? ""
            let rhsStatus = rhs.status ?? ""
            if lhsStatus != rhsStatus { return lhsStatus < rhsStatus }
            return lhs.email.localizedCaseInsensitiveCompare(rhs.email) == .orderedAscending
        }
        if let emails = project.approvedEmails, !emails.isEmpty {
            approvedEmails = emails
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
                .sorted()
        } else {
            approvedEmails = collaborators
                .filter { ($0.status ?? "").caseInsensitiveCompare("approved") == .orderedSame }
                .map { $0.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
                .filter { !$0.isEmpty }
                .sorted()
        }
        if commentAuthorEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            commentAuthorEmail = approvedEmails.first ?? commentAuthorEmail
        }
        if commentActorEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            commentActorEmail = approvedEmails.first ?? commentActorEmail
        }
        comments = (project.comments ?? []).sorted { lhs, rhs in
            let lhsTs = lhs.updatedAt ?? lhs.createdAt ?? 0
            let rhsTs = rhs.updatedAt ?? rhs.createdAt ?? 0
            return lhsTs > rhsTs
        }
    }

    private func normalizedCommentType() -> String {
        let kind = commentType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return kind == "voice" ? "voice" : "text"
    }

    private func resolvedCommentAuthorEmail() -> String {
        let explicit = commentAuthorEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !explicit.isEmpty { return explicit }
        return approvedEmails.first ?? ""
    }

    private func resolvedCommentActorEmail() -> String {
        let explicit = commentActorEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !explicit.isEmpty { return explicit }
        let author = resolvedCommentAuthorEmail()
        if !author.isEmpty { return author }
        return approvedEmails.first ?? ""
    }

    private func fingerprint(for value: String) -> String {
        ScreenplayDraftIntegrityFingerprint.value(for: value)
    }

    private func evaluateLocalDraftRecovery(
        projectId: String,
        serverDraft: String
    ) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else {
            recoveryCandidate = nil
            return
        }
        guard let snapshot = localDraftRecoveryStore.recoverySnapshot(
            ownerUserId: currentStudioAuthContext().userID,
            projectId: normalizedProjectId,
            serverDraft: serverDraft,
            fingerprint: { [weak self] value in self?.fingerprint(for: value) ?? value }
        ) else {
            recoveryCandidate = nil
            return
        }
        recoveryCandidate = LocalDraftRecoveryCandidate(
            projectId: snapshot.projectId,
            draft: snapshot.draft,
            baseVersionId: snapshot.baseVersionId,
            savedAt: snapshot.savedAt,
            isPreservedConflict: snapshot.isPreservedConflict
        )
    }

    private func persistLocalDraftRecovery(
        projectId: String,
        draft: String,
        baseVersionId: String,
        dirty: Bool,
        savedAt: TimeInterval = Date().timeIntervalSince1970
    ) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        localDraftRecoveryStore.save(
            ownerUserId: currentStudioAuthContext().userID,
            projectId: normalizedProjectId,
            draft: draft,
            baseVersionId: baseVersionId,
            dirty: dirty,
            savedAt: savedAt
        )
        let hasDifferentPreservedConflict = recoveryCandidate.map {
            $0.projectId == normalizedProjectId &&
                $0.isPreservedConflict &&
                $0.draft != draft
        } ?? false
        if !dirty && !hasDifferentPreservedConflict {
            recoveryCandidate = nil
        }
    }

    @discardableResult
    private func persistRecoveryForUnconfirmedSave(
        projectId: String,
        draft: String,
        baseVersionId: String,
        surfaceCandidate: Bool = true
    ) -> LocalDraftRecoveryCandidate? {
        guard ScreenplayUnconfirmedSaveRecoveryPolicy.shouldPersist(
            projectId: projectId,
            draft: draft
        ) else {
            return nil
        }
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let savedAt = Date().timeIntervalSince1970
        persistLocalDraftRecovery(
            projectId: normalizedProjectId,
            draft: draft,
            baseVersionId: baseVersionId,
            dirty: true,
            savedAt: savedAt
        )
        let candidate = LocalDraftRecoveryCandidate(
            projectId: normalizedProjectId,
            draft: draft,
            baseVersionId: baseVersionId,
            savedAt: savedAt,
            isPreservedConflict: false
        )
        if surfaceCandidate {
            recoveryCandidate = candidate
        }
        return candidate
    }

    private func clearLocalDraftRecovery(projectId: String) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        localDraftRecoveryStore.clear(
            ownerUserId: currentStudioAuthContext().userID,
            projectId: normalizedProjectId
        )
        if recoveryCandidate?.projectId == normalizedProjectId {
            recoveryCandidate = nil
        }
    }

    private func draftRecoveryPayloads() -> [String: [String: Any]] {
        localDraftRecoveryStore.payloads(ownerUserId: currentStudioAuthContext().userID)
    }

    private func currentStudioAuthContext() -> ScreenplayStudioAuthContext {
        .current()
    }

    private func authContextIsCurrent(_ expected: ScreenplayStudioAuthContext) -> Bool {
        ScreenplayStudioAuthContextPolicy.matches(
            expected: expected,
            current: currentStudioAuthContext()
        )
    }
}

extension BackendScreenplayOutline {
    static let empty = BackendScreenplayOutline(
        updatedAt: 0,
        actCount: 0,
        sceneCount: 0,
        beatCount: 0,
        acts: [],
        scenes: [],
        beats: []
    )
}
