import SwiftUI
import ScreenplayStudio

extension ScreenplayStudioScreen {
    @MainActor
    func handleBridgeStudioAction(_ request: ScreenplayStudioActionRequest) async {
        switch request.action {
        case .saveDraft:
            await vm.manualSaveDraft()
        case .saveRevisionSnapshot:
            await vm.createRevisionSnapshot()
        case .undoLastPageWrite:
            if let committedWrite = liveDraftBridge.lastCommittedWrite {
                undoLastCommittedWrite(committedWrite)
            } else {
                vm.infoText = "There isn't a recent page write to undo."
            }
        case .moveCurrentSceneAfterScene:
            await moveCurrentSceneAfterRequestedScene(request)
        case .moveSelectionAfterScene:
            await moveSelectionAfterRequestedScene(request)
        case .splitSelectionIntoNewScene:
            await splitSelectionIntoNewScene(request)
        case .promoteSelectionToBeat:
            await promoteSelectionIntoBeat(request)
        case .makeBeatFromSelection:
            handleSelectionQuickBeatCapture()
        case .updateSelectedBeatFromSelection:
            handleSelectedBeatQuickUpdate()
        case .deleteCurrentBeat:
            await deleteCurrentBeat(request)
        case .duplicateCurrentScene:
            await duplicateCurrentScene(request)
        case .promoteParagraphToDialogue:
            await promoteParagraphToDialogue(request)
        case .demoteCurrentBeat:
            await demoteCurrentBeat(request)
        case .acceptFocusedRewrite:
            acceptFocusedRewrite(request)
        case .mergeCurrentSceneForward:
            await mergeCurrentSceneForward(request)
        }
        if liveDraftBridge.pendingStudioAction?.id == request.id {
            liveDraftBridge.pendingStudioAction = nil
        }
    }

    func moveSelectionAfterRequestedScene(_ request: ScreenplayStudioActionRequest) async {
        guard let selection = liveDraftBridge.selectedEditorSnapshot() else {
            vm.infoText = "Select the block you want to move first."
            return
        }

        let targetScene = resolvedTargetScene(for: request)
        guard let targetScene else {
            vm.infoText = "I couldn't find the destination scene for that move."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        let selectionStart = max(0, selection.startLine - 1)
        let selectionEnd = min(lines.count, selection.endLine)
        guard selectionStart < selectionEnd else {
            vm.infoText = "I couldn't resolve that selected block on the page."
            return
        }
        guard let targetRange = draftSceneLineRange(for: targetScene, in: lines) else {
            vm.infoText = "I couldn't resolve the destination scene on the page."
            return
        }
        let selectionRange = selectionStart..<selectionEnd
        guard !selectionRange.overlaps(targetRange) else {
            vm.infoText = "Choose a destination scene outside the selected block so I don't collapse the page order."
            return
        }

        var nextLines = lines
        let movedBlock = Array(nextLines[selectionRange])
        nextLines.removeSubrange(selectionRange)

        var insertionIndex = targetRange.upperBound
        if selectionRange.lowerBound < targetRange.lowerBound {
            insertionIndex -= selectionRange.count
        }
        insertionIndex = max(0, min(insertionIndex, nextLines.count))
        nextLines.insert(contentsOf: movedBlock, at: insertionIndex)

        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Moved the selected block after \(targetScene.shortLabel).",
            jumpStartLine: insertionIndex + 1,
            jumpEndLine: insertionIndex + movedBlock.count
        )
    }

    func moveCurrentSceneAfterRequestedScene(_ request: ScreenplayStudioActionRequest) async {
        guard let currentScene = liveDraftBridge.currentSceneSnapshot() else {
            vm.infoText = "I couldn't find the current scene to move."
            return
        }

        let targetScene: ScreenplayDraftSceneSnapshot?
        if let ordinal = request.intValue, ordinal > 0 {
            targetScene = liveDraftBridge.sceneSnapshotForOrdinal(ordinal)
        } else if let label = request.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty {
            targetScene = liveDraftBridge.sceneSnapshotMatching(label)
        } else {
            targetScene = nil
        }

        guard let targetScene else {
            vm.infoText = "I couldn't find the scene to move this after."
            return
        }
        guard currentScene.id != targetScene.id else {
            vm.infoText = "That scene is already in place."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard
            let currentRange = draftSceneLineRange(for: currentScene, in: lines),
            let targetRange = draftSceneLineRange(for: targetScene, in: lines)
        else {
            vm.infoText = "I couldn't resolve the scene ranges on the page."
            return
        }

        var nextLines = lines
        let movedBlock = Array(nextLines[currentRange])
        nextLines.removeSubrange(currentRange)

        var insertionIndex = targetRange.upperBound
        if currentRange.lowerBound < targetRange.lowerBound {
            insertionIndex -= currentRange.count
        }
        insertionIndex = max(0, min(insertionIndex, nextLines.count))
        nextLines.insert(contentsOf: movedBlock, at: insertionIndex)

        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Moved \(currentScene.shortLabel) after \(targetScene.shortLabel).",
            jumpStartLine: insertionIndex + 1,
            jumpEndLine: insertionIndex + movedBlock.count
        )

        guard
            let currentBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id),
            let targetBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: targetScene.id),
            let movingSceneID = currentBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            let targetSceneID = targetBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            !movingSceneID.isEmpty,
            !targetSceneID.isEmpty
        else {
            return
        }

        let reorderedScenes = reorderedOutlineScenes(
            movingSceneID: movingSceneID,
            targetSceneID: targetSceneID,
            scenes: vm.outline.scenes
        )
        guard !reorderedScenes.isEmpty else { return }
        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: reorderedScenes.count,
            beatCount: vm.outline.beats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: reorderedScenes),
            scenes: reorderedScenes,
            beats: vm.outline.beats
        )
        await vm.pushOutlineSnapshot()
        vm.infoText = "Moved \(currentScene.shortLabel) after \(targetScene.shortLabel) and updated the outline order."
    }

    func splitSelectionIntoNewScene(_ request: ScreenplayStudioActionRequest) async {
        guard let selection = liveDraftBridge.selectedEditorSnapshot() else {
            vm.infoText = "Select the block you want to split first."
            return
        }

        let insertionIndex = max(0, selection.startLine - 1)
        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        let headingSeed = request.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let heading = normalizedSceneInsertSlugline(
            headingSeed.isEmpty ? suggestedSceneNavigatorSlugline() : headingSeed
        )
        guard !heading.isEmpty else {
            vm.infoText = "I couldn't build a new scene heading for that split."
            return
        }

        var nextLines = lines
        var insertionLines: [String] = []
        if insertionIndex > 0,
           !lines[insertionIndex - 1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            insertionLines.append("")
        }
        insertionLines.append(heading)
        nextLines.insert(contentsOf: insertionLines, at: min(insertionIndex, nextLines.count))
        let headingLine = insertionIndex + insertionLines.count

        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Split the selected block into a new scene: \(compactSceneNavigatorLabel(heading)).",
            jumpStartLine: headingLine,
            jumpEndLine: headingLine
        )

        guard vm.selectedProject != nil else { return }
        let error = await vm.addSceneFromNavigator(slugline: heading)
        if let error, !error.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            vm.infoText = "Split the page into \(compactSceneNavigatorLabel(heading)), but the outline sync failed: \(error)"
        } else {
            vm.infoText = "Split the page into \(compactSceneNavigatorLabel(heading)) and added the new scene to the outline."
        }
    }

    func promoteSelectionIntoBeat(_ request: ScreenplayStudioActionRequest) async {
        guard let project = vm.selectedProject else {
            vm.infoText = "Select a Studio project before promoting a beat."
            return
        }
        guard let selection = liveDraftBridge.selectedEditorSnapshot() else {
            vm.infoText = "Select the block you want to promote into a beat first."
            return
        }

        let currentScene = liveDraftBridge.currentSceneSnapshot()
        let binding = currentScene.flatMap { liveDraftBridge.projectBindingSnapshot(forDraftSceneID: $0.id) }
        let summary = selection.trimmedText
        let label = BeatQuickCaptureSeedPlanner.makeLabel(
            from: summary,
            sceneLabel: selection.sceneLabel ?? currentScene?.shortLabel
        )
        let result: BackendReadResult<BackendScreenplayBeatMutationResponse>
        do {
            result = try await BackendMemoryAPI.shared.upsertScreenplayBeat(
                projectId: project.id,
                beat: BackendScreenplayBeatDraft(
                    label: label,
                    summary: String(summary.prefix(280)),
                    sceneId: binding?.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                        ? binding?.outlineSceneID
                        : nil,
                    actId: nil
                ),
                title: project.title
            )
        } catch {
            vm.errorText = error.localizedDescription
            vm.infoText = "I couldn't promote that selection into a beat."
            return
        }

        vm.adoptCanonicalOutlineState(
            result.payload.outlineRevision,
            outline: result.payload.outline,
            project: result.payload.project,
            projectId: project.id
        )
        await vm.reapplyLatestQueuedOutlineSnapshotIfNeeded(projectId: project.id)
        let scenePhrase = binding?.outlineSceneTitle?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? binding?.outlineSceneTitle ?? ""
            : (selection.sceneLabel ?? currentScene?.shortLabel ?? "")
        vm.infoText = scenePhrase.isEmpty
            ? "Promoted the selected block into beat \(label)."
            : "Promoted the selected block into beat \(label) in \(scenePhrase)."
    }

    func deleteCurrentBeat(_ request: ScreenplayStudioActionRequest) async {
        guard let resolved = resolvedBeatContext() else {
            vm.infoText = "I couldn't resolve which beat to delete from the current scene."
            return
        }

        let filteredBeats = vm.outline.beats.filter { $0.id != resolved.beat.id }
        let filteredScenes = vm.outline.scenes.enumerated().map { index, scene in
            let beatIDs = (scene.beatIds ?? []).filter { $0 != resolved.beat.id }
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: beatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }

        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: filteredScenes.count,
            beatCount: filteredBeats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: filteredScenes),
            scenes: filteredScenes,
            beats: filteredBeats
        )
        await vm.pushOutlineSnapshot()
        vm.refreshLiveDraftBridgeContext()
        showBeatsInspectorForStructuralAction()
        vm.infoText = "Deleted beat \(resolved.beat.label)."
    }

    func duplicateCurrentScene(_ request: ScreenplayStudioActionRequest) async {
        guard let currentScene = liveDraftBridge.currentSceneSnapshot() else {
            vm.infoText = "I couldn't find the current scene to duplicate."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard let currentRange = draftSceneLineRange(for: currentScene, in: lines) else {
            vm.infoText = "I couldn't resolve the current scene on the page."
            return
        }

        let block = Array(lines[currentRange])
        guard !block.isEmpty else {
            vm.infoText = "The current scene is empty, so there's nothing to duplicate yet."
            return
        }

        var insertedBlock: [String] = []
        if let last = block.last, !last.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            insertedBlock.append("")
        }
        insertedBlock.append(contentsOf: block)

        var nextLines = lines
        nextLines.insert(contentsOf: insertedBlock, at: currentRange.upperBound)
        let duplicatedStartLine = currentRange.upperBound + insertedBlock.count - block.count + 1
        let duplicatedEndLine = duplicatedStartLine + block.count - 1
        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Duplicated \(currentScene.shortLabel).",
            jumpStartLine: duplicatedStartLine,
            jumpEndLine: duplicatedEndLine
        )

        guard
            let binding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id),
            let outlineSceneID = binding.outlineSceneID,
            let sourceIndex = vm.outline.scenes.firstIndex(where: { $0.id == outlineSceneID })
        else {
            return
        }

        let sourceScene = vm.outline.scenes[sourceIndex]
        let cloneID = "scene-\(UUID().uuidString.lowercased())"
        let cloneTitle = sourceScene.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "\(currentScene.shortLabel) Copy"
            : "\(sourceScene.title) Copy"
        let cloneScene = BackendScreenplayScene(
            id: cloneID,
            slugline: sourceScene.slugline,
            title: cloneTitle,
            objective: sourceScene.objective,
            summary: sourceScene.summary,
            actId: sourceScene.actId,
            order: sourceIndex + 1,
            status: sourceScene.status,
            beatIds: [],
            createdAt: Date().timeIntervalSince1970 * 1000,
            updatedAt: Date().timeIntervalSince1970 * 1000
        )

        var clonedScenes = vm.outline.scenes
        clonedScenes.insert(cloneScene, at: sourceIndex + 1)
        let reindexedScenes = clonedScenes.enumerated().map { index, scene in
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

        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: reindexedScenes.count,
            beatCount: vm.outline.beatCount,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: reindexedScenes),
            scenes: reindexedScenes,
            beats: vm.outline.beats
        )
        await vm.pushOutlineSnapshot()
        vm.refreshLiveDraftBridgeContext()
        vm.infoText = "Duplicated \(currentScene.shortLabel) and added a matching outline scene."
    }

    func promoteParagraphToDialogue(_ request: ScreenplayStudioActionRequest) async {
        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard !lines.isEmpty else {
            vm.infoText = "There isn't enough draft text on the page to promote yet."
            return
        }

        let startLine = max(1, request.intValue ?? liveDraftBridge.selectedEditorSnapshot()?.startLine ?? liveDraftBridge.currentCursorLine)
        let endLine = max(startLine, request.secondaryIntValue ?? liveDraftBridge.selectedEditorSnapshot()?.endLine ?? startLine)
        let startIndex = max(0, startLine - 1)
        let endIndex = min(lines.count, endLine)
        guard startIndex < endIndex else {
            vm.infoText = "I couldn't resolve that paragraph on the page."
            return
        }

        let selectionRange = startIndex..<endIndex
        let extractedDialogue = lines[selectionRange]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !extractedDialogue.isEmpty else {
            vm.infoText = "That paragraph is empty, so there isn't anything to promote into dialogue."
            return
        }

        let previousParagraph = liveDraftBridge.structuredDraft.paragraphs.first(where: { $0.line == startLine - 1 })
        let cue = preferredDialogueCue(beforeLine: startLine)
        let needsCue = previousParagraph?.element != .character

        var replacement: [String] = []
        if startIndex > 0, !lines[startIndex - 1].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            replacement.append("")
        }
        if needsCue {
            replacement.append(cue)
        }
        replacement.append(contentsOf: extractedDialogue)
        if endIndex < lines.count, !lines[endIndex].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            replacement.append("")
        }

        var nextLines = lines
        nextLines.replaceSubrange(selectionRange, with: replacement)
        let jumpStartLine = startIndex + (needsCue ? 2 : 1)
        let jumpEndLine = max(jumpStartLine, jumpStartLine + extractedDialogue.count - 1)
        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Promoted that paragraph into dialogue for \(cue).",
            jumpStartLine: jumpStartLine,
            jumpEndLine: jumpEndLine
        )
        liveDraftBridge.setActiveScreenplayElement(.dialogue)
    }

    func demoteCurrentBeat(_ request: ScreenplayStudioActionRequest) async {
        guard let resolved = resolvedBeatContext() else {
            vm.infoText = "I couldn't resolve which beat to demote from the current scene."
            return
        }

        let parentScene = vm.outline.scenes.first(where: { $0.id == resolved.sceneID })
        let updatedBeats = vm.outline.beats.enumerated().map { index, beat in
            guard beat.id == resolved.beat.id else { return beat }
            return BackendScreenplayBeat(
                id: beat.id,
                label: beat.label,
                summary: beat.summary,
                sceneId: nil,
                actId: beat.actId ?? parentScene?.actId,
                order: beat.order ?? index,
                status: beat.status,
                createdAt: beat.createdAt,
                updatedAt: Date().timeIntervalSince1970 * 1000
            )
        }
        let updatedScenes = vm.outline.scenes.enumerated().map { index, scene in
            let beatIDs = (scene.beatIds ?? []).filter { $0 != resolved.beat.id }
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: beatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }

        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: updatedScenes.count,
            beatCount: updatedBeats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: updatedScenes),
            scenes: updatedScenes,
            beats: updatedBeats
        )
        await vm.pushOutlineSnapshot()
        vm.refreshLiveDraftBridgeContext()
        showBeatsInspectorForStructuralAction()
        vm.infoText = "Demoted beat \(resolved.beat.label) out of the scene and kept it in the outline."
    }

    func mergeCurrentSceneForward(_ request: ScreenplayStudioActionRequest) async {
        let currentScene = request.intValue.flatMap { _ in liveDraftBridge.currentSceneSnapshot() } ?? liveDraftBridge.currentSceneSnapshot()
        guard let currentScene else {
            vm.infoText = "I couldn't find the current scene to merge."
            return
        }
        guard let nextScene = liveDraftBridge.nextSceneSnapshot(after: currentScene) else {
            vm.infoText = "There isn't a following scene to merge into this one."
            return
        }

        let lines = vm.fountainDraft.components(separatedBy: .newlines)
        guard
            let currentRange = draftSceneLineRange(for: currentScene, in: lines),
            let nextRange = draftSceneLineRange(for: nextScene, in: lines)
        else {
            vm.infoText = "I couldn't resolve those scenes on the page."
            return
        }

        var currentBlock = Array(lines[currentRange])
        var nextBlock = Array(lines[nextRange])
        if !nextBlock.isEmpty {
            nextBlock.removeFirst()
        }
        while let first = nextBlock.first, first.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            nextBlock.removeFirst()
        }
        while let last = currentBlock.last, last.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            currentBlock.removeLast()
        }
        if !currentBlock.isEmpty, !nextBlock.isEmpty {
            currentBlock.append("")
        }
        currentBlock.append(contentsOf: nextBlock)

        var nextLines = lines
        nextLines.replaceSubrange(currentRange.lowerBound..<nextRange.upperBound, with: currentBlock)
        applyStructuralDraftMutation(
            nextLines.joined(separator: "\n"),
            infoText: "Merged \(currentScene.shortLabel) with \(nextScene.shortLabel).",
            jumpStartLine: currentScene.line,
            jumpEndLine: currentScene.line + currentBlock.count - 1
        )

        guard
            let currentBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id),
            let nextBinding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: nextScene.id),
            let currentOutlineID = currentBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            let nextOutlineID = nextBinding.outlineSceneID?.trimmingCharacters(in: .whitespacesAndNewlines),
            !currentOutlineID.isEmpty,
            !nextOutlineID.isEmpty
        else {
            return
        }

        let mergedBeats = vm.outline.beats.enumerated().map { index, beat in
            BackendScreenplayBeat(
                id: beat.id,
                label: beat.label,
                summary: beat.summary,
                sceneId: (beat.sceneId ?? "") == nextOutlineID ? currentOutlineID : beat.sceneId,
                actId: beat.actId,
                order: beat.order ?? index,
                status: beat.status,
                createdAt: beat.createdAt,
                updatedAt: beat.updatedAt
            )
        }
        let mergedScenesSource = vm.outline.scenes.filter { $0.id != nextOutlineID }
        let mergedScenes = mergedScenesSource.enumerated().map { index, scene in
            let mergedBeatIDs = mergedBeats
                .filter { ($0.sceneId ?? "") == scene.id }
                .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
                .map(\.id)
            return BackendScreenplayScene(
                id: scene.id,
                slugline: scene.slugline,
                title: scene.title,
                objective: scene.objective,
                summary: scene.summary,
                actId: scene.actId,
                order: index,
                status: scene.status,
                beatIds: mergedBeatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        vm.outline = BackendScreenplayOutline(
            updatedAt: Date().timeIntervalSince1970 * 1000,
            actCount: vm.outline.actCount,
            sceneCount: mergedScenes.count,
            beatCount: mergedBeats.count,
            acts: rebuiltOutlineActs(from: vm.outline.acts, scenes: mergedScenes),
            scenes: mergedScenes,
            beats: mergedBeats
        )
        await vm.pushOutlineSnapshot()
        vm.infoText = "Merged \(currentScene.shortLabel) with \(nextScene.shortLabel) and updated the outline."
    }

    func applyStructuralDraftMutation(
        _ nextDraft: String,
        infoText: String,
        jumpStartLine: Int,
        jumpEndLine: Int
    ) {
        vm.errorText = ""
        vm.fountainDraft = nextDraft
        vm.noteManualDraftEdit()
        liveDraftBridge.jumpToLine(max(1, jumpStartLine))
        liveDraftBridge.highlightLineRange(startLine: max(1, jumpStartLine), endLine: max(jumpStartLine, jumpEndLine))
        liveDraftBridge.requestEditorFocus()
        vm.infoText = infoText
    }

    func resolvedTargetScene(for request: ScreenplayStudioActionRequest) -> ScreenplayDraftSceneSnapshot? {
        if let ordinal = request.intValue, ordinal > 0 {
            return liveDraftBridge.sceneSnapshotForOrdinal(ordinal)
        }
        if let label = request.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines),
           !label.isEmpty {
            return liveDraftBridge.sceneSnapshotMatching(label)
        }
        return nil
    }

    func preferredDialogueCue(beforeLine line: Int) -> String {
        let paragraphs = liveDraftBridge.structuredDraft.paragraphs.sorted { lhs, rhs in
            lhs.line < rhs.line
        }
        if let paragraph = paragraphs.last(where: { $0.line < line && $0.element == .character }) {
            let cue = paragraph.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !cue.isEmpty {
                return cue.uppercased()
            }
        }
        if let scene = liveDraftBridge.currentSceneSnapshot(),
           let cue = scene.characterCues.last,
           !cue.isEmpty {
            return cue.uppercased()
        }
        return "VOICE"
    }

    func resolvedBeatContext() -> (beat: BackendScreenplayBeat, sceneID: String)? {
        guard let currentScene = liveDraftBridge.currentSceneSnapshot(),
              let binding = liveDraftBridge.projectBindingSnapshot(forDraftSceneID: currentScene.id) else {
            return nil
        }
        let candidateIDs = Set(binding.outlineBeatIDs)
        let candidateBeats = vm.outline.beats.filter { candidateIDs.contains($0.id) }
        guard !candidateBeats.isEmpty else { return nil }
        if candidateBeats.count == 1, let beat = candidateBeats.first {
            return (beat, binding.outlineSceneID ?? "")
        }

        let contextText = [
            liveDraftBridge.selectedEditorSnapshot()?.trimmedText ?? "",
            currentScene.shortLabel,
            currentScene.slugline
        ]
        .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        .joined(separator: " ")
        let contextTokens = normalizedBeatMatchTokens(contextText)

        let scored = candidateBeats.map { beat -> (BackendScreenplayBeat, Int) in
            let beatTokens = normalizedBeatMatchTokens([beat.label, beat.summary ?? ""].joined(separator: " "))
            return (beat, beatTokens.intersection(contextTokens).count)
        }
        let sorted = scored.sorted { lhs, rhs in
            if lhs.1 == rhs.1 {
                return lhs.0.label < rhs.0.label
            }
            return lhs.1 > rhs.1
        }
        guard let best = sorted.first, best.1 > 0 else { return nil }
        return (best.0, binding.outlineSceneID ?? "")
    }

    func normalizedBeatMatchTokens(_ raw: String) -> Set<String> {
        let normalized = raw
            .lowercased()
            .replacingOccurrences(of: #"[^\p{L}\p{N}\s]"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return [] }
        return Set(normalized.split(separator: " ").map(String.init).filter { $0.count > 2 })
    }

    func draftSceneLineRange(
        for scene: ScreenplayDraftSceneSnapshot,
        in lines: [String]
    ) -> Range<Int>? {
        let startIndex = max(0, scene.line - 1)
        let endIndex = min(lines.count, scene.endLine)
        guard startIndex < endIndex else { return nil }
        return startIndex..<endIndex
    }

    func reorderedOutlineScenes(
        movingSceneID: String,
        targetSceneID: String,
        scenes: [BackendScreenplayScene]
    ) -> [BackendScreenplayScene] {
        guard
            let movingIndex = scenes.firstIndex(where: { $0.id == movingSceneID }),
            let targetIndex = scenes.firstIndex(where: { $0.id == targetSceneID })
        else {
            return []
        }
        var reordered = scenes
        let movingScene = reordered.remove(at: movingIndex)
        let adjustedTargetIndex = movingIndex < targetIndex ? targetIndex - 1 : targetIndex
        let targetActID = reordered[adjustedTargetIndex].actId
        let moved = BackendScreenplayScene(
            id: movingScene.id,
            slugline: movingScene.slugline,
            title: movingScene.title,
            objective: movingScene.objective,
            summary: movingScene.summary,
            actId: targetActID,
            order: movingScene.order,
            status: movingScene.status,
            beatIds: movingScene.beatIds,
            createdAt: movingScene.createdAt,
            updatedAt: movingScene.updatedAt
        )
        reordered.insert(moved, at: min(adjustedTargetIndex + 1, reordered.count))
        return reordered.enumerated().map { index, scene in
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
    }

    func rebuiltOutlineActs(
        from acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene]
    ) -> [BackendScreenplayAct] {
        acts.enumerated().map { index, act in
            let sceneIDs = InspectorOrderSupport.sceneIDs(for: act.id, scenes: scenes)
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

}
