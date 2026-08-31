import SwiftUI
import ScreenplayStudio
import UniformTypeIdentifiers

struct ScreenplayStudioBeatsInspectorLayout<BeatMap: View, Composer: View>: View {
    let beatCount: Int
    let linkedSceneCount: Int
    let linkedActCount: Int
    let hasBeats: Bool
    @ViewBuilder let beatMap: () -> BeatMap
    @ViewBuilder let composer: () -> Composer

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Shape the story in bigger moves.")
                    .font(IOThemTypography.UI.calloutMedium)
                    .foregroundStyle(Color.herText.opacity(0.78))
                Text("Keep the next turn of the script visible. Beats can stay loose while you ideate, or link directly to scenes and acts as the outline locks in.")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.64))
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                directionOneMiniStat("Beats", value: "\(beatCount)")
                directionOneMiniStat("Scenes linked", value: "\(linkedSceneCount)")
                directionOneMiniStat("Acts linked", value: "\(linkedActCount)")
            }

            inspectorSubsectionLabel("Beat map")

            if hasBeats {
                beatMap()
            } else {
                emptyState
            }

            Divider().overlay(Color.herShellStroke.opacity(0.24))
            inspectorSubsectionLabel("Add beat")
            composer()
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "flag.slash")
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.black.opacity(0.74).opacity(0.86))
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white.opacity(0.82))
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("No beats yet")
                        .font(IOThemTypography.UI.sectionTitle)
                        .foregroundStyle(Color.herText.opacity(0.92))
                    Text("Start with a turning point, reveal, reversal, or emotional shift. You can connect it to a scene now or let it stay free until the draft settles.")
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Good first beats")
                    .font(IOThemTypography.UI.micro)
                    .foregroundStyle(Color.herText.opacity(0.46))
                    .textCase(.uppercase)
                Text("Inciting incident")
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(Color.herText.opacity(0.80))
                Text("False victory")
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(Color.herText.opacity(0.80))
                Text("The choice that changes everything")
                    .font(IOThemTypography.UI.captionMedium)
                    .foregroundStyle(Color.herText.opacity(0.80))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white.opacity(0.42))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.20), lineWidth: 1)
        )
    }
}

struct ScreenplayStudioOutlineInspectorLayout<Compass: View, StorySpine: View, FocusedScene: View>: View {
    let actCount: Int
    let sceneCount: Int
    let beatCount: Int
    let hasOutline: Bool
    let hasFocusedScene: Bool
    @ViewBuilder let compass: () -> Compass
    @ViewBuilder let storySpine: () -> StorySpine
    @ViewBuilder let focusedScene: () -> FocusedScene

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            inspectorPanelLead(
                title: "Track the spine of the movie.",
                detail: "Keep acts, scenes, and loose structure visible while the page evolves. The rail should tell you what the story is doing at a glance."
            )

            HStack(spacing: 10) {
                directionOneMiniStat("Acts", value: "\(actCount)")
                directionOneMiniStat("Scenes", value: "\(sceneCount)")
                directionOneMiniStat("Beats", value: "\(beatCount)")
            }

            compass()
            inspectorSubsectionLabel("Story spine")

            if hasOutline {
                storySpine()
            } else {
                inspectorMessageCard(
                    icon: "list.bullet.rectangle",
                    title: "No outline yet",
                    detail: "Add scenes from the page or capture beats first. Acts and grouped scenes will start filling in here as the draft takes shape."
                )
            }

            if hasFocusedScene {
                inspectorSubsectionLabel("Focused scene")
                focusedScene()
            }
        }
    }
}

struct ScreenplayStudioInspectorMoveAvailability: Equatable {
    let canMoveUp: Bool
    let canMoveDown: Bool

    static func position(_ index: Int, count: Int) -> ScreenplayStudioInspectorMoveAvailability {
        guard index >= 0, index < count else {
            return ScreenplayStudioInspectorMoveAvailability(canMoveUp: false, canMoveDown: false)
        }
        return ScreenplayStudioInspectorMoveAvailability(
            canMoveUp: index > 0,
            canMoveDown: index < count - 1
        )
    }
}

enum ScreenplayStudioInspectorAnchor {
    static func beat(_ id: String) -> String {
        "inspector-beat-\(id)"
    }

    static func act(_ id: String) -> String {
        "inspector-act-\(id)"
    }

    static func scene(_ id: String) -> String {
        "inspector-scene-\(id)"
    }
}

struct ScreenplayStudioBeatCardPresentation: Identifiable {
    var id: String { beat.id }

    let beat: BackendScreenplayBeat
    let index: Int
    let sceneLabel: String?
    let provenance: BeatProvenanceSource
    let provenanceHistory: ScreenplayStudioBeatProvenanceHistoryPresentation?
    let isSelected: Bool
    let isSettled: Bool
    let canMoveUp: Bool
    let canMoveDown: Bool
    let linkButtonTitle: String
    let canRefreshFromSelection: Bool
    let canRefreshFromScene: Bool
}

struct ScreenplayStudioBeatCardActions {
    let onSelect: (BackendScreenplayBeat) -> Void
    let onBeginDrag: (BackendScreenplayBeat) -> Void
    let onDropBefore: (BackendScreenplayBeat) -> Bool
    let onMove: (BackendScreenplayBeat, InspectorReorderDirection) -> Void
    let onEdit: (BackendScreenplayBeat) -> Void
    let onDelete: (BackendScreenplayBeat) -> Void
    let onLinkScene: (BackendScreenplayBeat) -> Void
    let onPromoteToSceneGoal: (BackendScreenplayBeat) -> Void
    let onRefreshFromSelection: (BackendScreenplayBeat) -> Void
    let onRefreshFromScene: (BackendScreenplayBeat) -> Void
    let onDropAtEnd: () -> Bool
}

struct ScreenplayStudioBeatMapList: View {
    let cards: [ScreenplayStudioBeatCardPresentation]
    let isBeatDragActive: Bool
    @Binding var dropTargetID: String
    @Binding var isEndDropTargeted: Bool
    let actions: ScreenplayStudioBeatCardActions

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(cards) { card in
                ScreenplayStudioBeatInspectorCard(
                    beat: card.beat,
                    index: card.index,
                    sceneLabel: card.sceneLabel,
                    provenance: card.provenance,
                    provenanceHistory: card.provenanceHistory,
                    isSelected: card.isSelected,
                    isSettled: card.isSettled,
                    isDropTargeted: inspectorDropTargetBinding(for: card.id, target: $dropTargetID),
                    canMoveUp: card.canMoveUp,
                    canMoveDown: card.canMoveDown,
                    linkButtonTitle: card.linkButtonTitle,
                    canRefreshFromSelection: card.canRefreshFromSelection,
                    canRefreshFromScene: card.canRefreshFromScene,
                    onSelect: { actions.onSelect(card.beat) },
                    onBeginDrag: { actions.onBeginDrag(card.beat) },
                    onDrop: { actions.onDropBefore(card.beat) },
                    onMoveUp: { actions.onMove(card.beat, .up) },
                    onMoveDown: { actions.onMove(card.beat, .down) },
                    onEdit: { actions.onEdit(card.beat) },
                    onDelete: { actions.onDelete(card.beat) },
                    onLinkScene: { actions.onLinkScene(card.beat) },
                    onPromoteToSceneGoal: { actions.onPromoteToSceneGoal(card.beat) },
                    onRefreshFromSelection: { actions.onRefreshFromSelection(card.beat) },
                    onRefreshFromScene: { actions.onRefreshFromScene(card.beat) }
                )
            }
            if isBeatDragActive {
                inspectorReorderDropZone(
                    title: "Drop here to move this beat to the end",
                    isTargeted: $isEndDropTargeted,
                    onDrop: actions.onDropAtEnd
                )
            }
        }
    }
}

struct ScreenplayStudioOutlineActSection: Identifiable {
    var id: String { act.id }

    let act: BackendScreenplayAct
    let scenes: [BackendScreenplayScene]
}

struct ScreenplayStudioOutlineRowsPresentation {
    let actSections: [ScreenplayStudioOutlineActSection]
    let looseScenes: [BackendScreenplayScene]
}

enum ScreenplayStudioOutlinePresentationPlanner {
    static func make(
        acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene]
    ) -> ScreenplayStudioOutlineRowsPresentation {
        let orderedActs = InspectorOrderSupport.sortedActs(acts)
        let sections = orderedActs.map { act in
            ScreenplayStudioOutlineActSection(
                act: act,
                scenes: InspectorOrderSupport.sortedScenes(
                    scenes.filter {
                        InspectorOrderSupport.normalizedID($0.actId) ==
                            InspectorOrderSupport.normalizedID(act.id)
                    }
                )
            )
        }
        let looseScenes = InspectorOrderSupport.sortedScenes(
            scenes.filter { InspectorOrderSupport.normalizedID($0.actId) == nil }
        )
        return ScreenplayStudioOutlineRowsPresentation(
            actSections: sections,
            looseScenes: looseScenes
        )
    }
}

struct ScreenplayStudioOutlineStorySpineActions {
    let onMoveAct: (BackendScreenplayAct, InspectorReorderDirection) -> Void
    let onBeginActDrag: (BackendScreenplayAct) -> Void
    let onDropActBefore: (BackendScreenplayAct) -> Bool
    let onDropActAtEnd: () -> Bool
    let onSelectScene: (BackendScreenplayScene) -> Void
    let onMoveScene: (BackendScreenplayScene, InspectorReorderDirection) -> Void
    let onBeginSceneDrag: (BackendScreenplayScene) -> Void
    let onDropSceneBefore: (BackendScreenplayScene) -> Bool
    let onDropSceneAtEndOfAct: (BackendScreenplayAct) -> Bool
    let onDropSceneAtEndOfLoose: () -> Bool
}

struct ScreenplayStudioOutlineStorySpine: View {
    let acts: [BackendScreenplayAct]
    let scenes: [BackendScreenplayScene]
    let isActDragActive: Bool
    let isSceneDragActive: Bool
    let settledAnchorID: String?
    let isSceneActive: (BackendScreenplayScene) -> Bool
    @Binding var actDropTargetID: String
    @Binding var sceneDropTargetID: String
    @Binding var sceneGroupDropTargetID: String
    @Binding var isActEndDropTargeted: Bool
    let actions: ScreenplayStudioOutlineStorySpineActions

    var body: some View {
        let presentation = ScreenplayStudioOutlinePresentationPlanner.make(acts: acts, scenes: scenes)
        VStack(alignment: .leading, spacing: 12) {
            ForEach(Array(presentation.actSections.enumerated()), id: \.element.id) { index, section in
                actCard(
                    section,
                    availability: .position(index, count: presentation.actSections.count)
                )
            }
            if isActDragActive {
                inspectorReorderDropZone(
                    title: "Drop here to move this act to the end",
                    isTargeted: $isActEndDropTargeted,
                    onDrop: actions.onDropActAtEnd
                )
            }
            if !presentation.looseScenes.isEmpty || isSceneDragActive {
                looseScenesCard(presentation.looseScenes)
            }
        }
    }

    private func actCard(
        _ section: ScreenplayStudioOutlineActSection,
        availability: ScreenplayStudioInspectorMoveAvailability
    ) -> some View {
        ScreenplayStudioOutlineActCard(
            act: section.act,
            sceneCount: section.scenes.count,
            isSceneDragActive: isSceneDragActive,
            isSettled: settledAnchorID == ScreenplayStudioInspectorAnchor.act(section.id),
            isDropTargeted: inspectorDropTargetBinding(for: section.id, target: $actDropTargetID),
            isSceneGroupDropTargeted: inspectorDropTargetBinding(for: section.id, target: $sceneGroupDropTargetID),
            canMoveUp: availability.canMoveUp,
            canMoveDown: availability.canMoveDown,
            sceneRows: {
                ForEach(Array(section.scenes.enumerated()), id: \.element.id) { index, scene in
                    sceneRow(
                        scene,
                        availability: .position(index, count: section.scenes.count)
                    )
                }
            },
            onMoveUp: { actions.onMoveAct(section.act, .up) },
            onMoveDown: { actions.onMoveAct(section.act, .down) },
            onBeginDrag: { actions.onBeginActDrag(section.act) },
            onDrop: { actions.onDropActBefore(section.act) },
            onSceneGroupDrop: { actions.onDropSceneAtEndOfAct(section.act) }
        )
    }

    private func looseScenesCard(_ looseScenes: [BackendScreenplayScene]) -> some View {
        ScreenplayStudioOutlineLooseScenesCard(
            sceneCount: looseScenes.count,
            isSceneDragActive: isSceneDragActive,
            isDropTargeted: inspectorDropTargetBinding(for: "loose-scenes", target: $sceneGroupDropTargetID),
            sceneRows: {
                ForEach(Array(looseScenes.enumerated()), id: \.element.id) { index, scene in
                    sceneRow(
                        scene,
                        availability: .position(index, count: looseScenes.count)
                    )
                }
            },
            onDrop: actions.onDropSceneAtEndOfLoose
        )
    }

    private func sceneRow(
        _ scene: BackendScreenplayScene,
        availability: ScreenplayStudioInspectorMoveAvailability
    ) -> some View {
        ScreenplayStudioOutlineSceneRow(
            scene: scene,
            isActive: isSceneActive(scene),
            isSettled: settledAnchorID == ScreenplayStudioInspectorAnchor.scene(scene.id),
            isDropTargeted: inspectorDropTargetBinding(for: scene.id, target: $sceneDropTargetID),
            canMoveUp: availability.canMoveUp,
            canMoveDown: availability.canMoveDown,
            onSelect: { actions.onSelectScene(scene) },
            onMoveUp: { actions.onMoveScene(scene, .up) },
            onMoveDown: { actions.onMoveScene(scene, .down) },
            onBeginDrag: { actions.onBeginSceneDrag(scene) },
            onDrop: { actions.onDropSceneBefore(scene) }
        )
    }
}

private func inspectorDropTargetBinding(for id: String, target: Binding<String>) -> Binding<Bool> {
    Binding(
        get: { target.wrappedValue == id },
        set: { isTargeted in
            if isTargeted {
                target.wrappedValue = id
            } else if target.wrappedValue == id {
                target.wrappedValue = ""
            }
        }
    )
}

struct ScreenplayStudioFeatureCompassCard: View {
    let snapshot: ScreenplayFeatureWorkflowSnapshot
    let acceptedPageBatchCount: Int
    let isWriteDisabled: Bool
    let canPolishLastBatch: Bool
    let onWriteNextPages: () -> Void
    let onPlan: () -> Void
    let onDoctor: () -> Void
    let onReviewBatch: () -> Void
    let onPolishLastBatch: () -> Void
    let onWriteMove: (ScreenplayFeatureWorkflowMove) -> Void

    var body: some View {
        intelligenceCollectionCard(title: "Feature Compass", icon: "map") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    directionOneMiniStat("Act", value: snapshot.currentActTitle)
                    directionOneMiniStat("Progress", value: snapshot.actProgressLabel)
                }

                HStack(spacing: 8) {
                    directionOneMiniStat("Draft", value: snapshot.draftProgressLabel)
                    directionOneMiniStat("Batches", value: "\(acceptedPageBatchCount)")
                }

                VStack(alignment: .leading, spacing: 5) {
                    Text(snapshot.structuralObligation)
                        .font(IOThemTypography.UI.captionStrong)
                        .foregroundStyle(Color.herText.opacity(0.82))
                        .fixedSize(horizontal: false, vertical: true)
                    if !snapshot.nextSceneDetail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(snapshot.nextSceneDetail)
                            .font(IOThemTypography.UI.labelRegular)
                            .foregroundStyle(Color.herText.opacity(0.58))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(10)
                .background(Color.white.opacity(0.22))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 8) {
                    inspectorSubsectionLabel("Next three turns")
                    ForEach(snapshot.nextMoves) { move in
                        moveRow(move)
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    inspectorSubsectionLabel("Accepted page batch")
                    Text(snapshot.acceptedBatchDetail)
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 8) {
                        Button(action: onWriteNextPages) {
                            Label("Write Next Pages", systemImage: "doc.badge.plus")
                                .font(IOThemTypography.UI.label)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(isWriteDisabled)

                        Button(action: onPlan) {
                            Label("Plan", systemImage: "list.bullet")
                                .font(IOThemTypography.UI.label)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }

                    HStack(spacing: 8) {
                        Button(action: onDoctor) {
                            Label("Doctor", systemImage: "cross.case")
                                .font(IOThemTypography.UI.label)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                        if snapshot.hasAcceptedBatch {
                            Button(action: onReviewBatch) {
                                Label("Review Batch", systemImage: "text.magnifyingglass")
                                    .font(IOThemTypography.UI.label)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }

                        if canPolishLastBatch {
                            Button(action: onPolishLastBatch) {
                                Label("Polish Batch", systemImage: "sparkles")
                                    .font(IOThemTypography.UI.label)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .disabled(isWriteDisabled)
                        }
                    }
                }
            }
        }
    }

    private func moveRow(_ move: ScreenplayFeatureWorkflowMove) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(move.title)
                    .font(IOThemTypography.UI.captionStrong)
                    .foregroundStyle(Color.herText.opacity(0.80))
                    .fixedSize(horizontal: false, vertical: true)
                Text(move.detail)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(0.56))
                    .lineLimit(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                onWriteMove(move)
            } label: {
                Label("Write", systemImage: "square.and.pencil")
                    .font(IOThemTypography.UI.label)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isWriteDisabled)
            .accessibilityLabel("Write \(move.title)")
            .accessibilityHint("Sends this story move to the screenplay page.")
            .accessibilityIdentifier("studio.feature-compass.move.\(move.id).write")
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.18))
        )
    }
}

struct ScreenplayStudioBeatProvenanceHistoryPresentation {
    let createdText: String
    let refreshedText: String
    let accessibilityLabel: String
}

struct ScreenplayStudioBeatInspectorCard: View {
    let beat: BackendScreenplayBeat
    let index: Int
    let sceneLabel: String?
    let provenance: BeatProvenanceSource
    let provenanceHistory: ScreenplayStudioBeatProvenanceHistoryPresentation?
    let isSelected: Bool
    let isSettled: Bool
    @Binding var isDropTargeted: Bool
    let canMoveUp: Bool
    let canMoveDown: Bool
    let linkButtonTitle: String
    let canRefreshFromSelection: Bool
    let canRefreshFromScene: Bool
    let onSelect: () -> Void
    let onBeginDrag: () -> Void
    let onDrop: () -> Bool
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onEdit: () -> Void
    let onDelete: () -> Void
    let onLinkScene: () -> Void
    let onPromoteToSceneGoal: () -> Void
    let onRefreshFromSelection: () -> Void
    let onRefreshFromScene: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            insertionMarker
                .padding(.horizontal, 6)

            VStack(alignment: .leading, spacing: 10) {
                header
                metadata

                if let provenanceHistory {
                    provenanceHistoryView(provenanceHistory)
                }

                HStack(spacing: 8) {
                    actionButton("Edit", systemImage: "pencil", action: onEdit)
                    actionButton("Delete", systemImage: "trash", role: .destructive, action: onDelete)
                }

                HStack(spacing: 8) {
                    actionButton(linkButtonTitle, systemImage: "link", action: onLinkScene)
                    actionButton("Scene Goal", systemImage: "target", action: onPromoteToSceneGoal)
                }

                if canRefreshFromSelection || canRefreshFromScene {
                    HStack(spacing: 8) {
                        if canRefreshFromSelection {
                            actionButton(
                                "Refresh from Selection",
                                systemImage: "text.badge.arrow.up",
                                action: onRefreshFromSelection
                            )
                        }
                        if canRefreshFromScene {
                            actionButton(
                                "Refresh from Scene",
                                systemImage: "arrow.clockwise.circle",
                                action: onRefreshFromScene
                            )
                        }
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(isSelected ? Color.white.opacity(0.52) : Color.white.opacity(0.34))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(cardStrokeColor, lineWidth: cardStrokeWidth)
            )
            .shadow(
                color: isSettled ? Color.herStudioActiveStroke.opacity(0.20) : .clear,
                radius: isSettled ? 12 : 0,
                y: isSettled ? 6 : 0
            )
            .scaleEffect(isSettled ? 1.01 : 1.0)
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .id("inspector-beat-\(beat.id)")
            .onTapGesture(perform: onSelect)
            .onDrag {
                onBeginDrag()
                return NSItemProvider(object: NSString(string: beat.id))
            }
            .onDrop(of: [UTType.plainText.identifier], isTargeted: $isDropTargeted) { _ in
                onDrop()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(String(format: "%02d", index))
                .font(IOThemTypography.UI.monoLabelStrong)
                .foregroundStyle(Color.black.opacity(0.74).opacity(0.84))
                .frame(width: 34, height: 34)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.white.opacity(0.88))
                )

            VStack(alignment: .leading, spacing: 5) {
                Text(beat.label)
                    .font(IOThemTypography.UI.bodyStrong)
                    .foregroundStyle(Color.herText.opacity(0.92))
                if let summary = beat.summary, !summary.isEmpty {
                    Text(summary)
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.70))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            reorderMenu(
                title: "Reorder beat",
                moveUpDisabled: !canMoveUp,
                moveDownDisabled: !canMoveDown,
                moveUp: onMoveUp,
                moveDown: onMoveDown
            )
        }
    }

    private var metadata: some View {
        HStack(spacing: 8) {
            provenanceChip
            if let sceneLabel, !sceneLabel.isEmpty {
                metaChip(title: "Scene", value: sceneLabel)
            } else if let sceneID = beat.sceneId?.trimmingCharacters(in: .whitespacesAndNewlines), !sceneID.isEmpty {
                metaChip(title: "Scene", value: sceneID)
            }
            if let actID = beat.actId?.trimmingCharacters(in: .whitespacesAndNewlines), !actID.isEmpty {
                metaChip(title: "Act", value: actID)
            }
            Spacer(minLength: 0)
        }
    }

    private var provenanceChip: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(provenance.tint)
                .frame(width: 6, height: 6)
            Text(provenance.compactTitle)
                .font(IOThemTypography.UI.micro)
                .foregroundStyle(provenance.tint)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(provenance.tint.opacity(0.10)))
        .overlay(Capsule().stroke(provenance.tint.opacity(0.20), lineWidth: 1))
    }

    private var insertionMarker: some View {
        HStack(spacing: 8) {
            Capsule()
                .fill(Color.herStudioActiveStroke.opacity(isDropTargeted ? 0.92 : 0.0))
                .frame(width: 28, height: isDropTargeted ? 5 : 2)
            Rectangle()
                .fill(Color.herStudioActiveStroke.opacity(isDropTargeted ? 0.68 : 0.0))
                .frame(height: isDropTargeted ? 2 : 1)
                .frame(maxWidth: .infinity)
            if isDropTargeted {
                Image(systemName: "arrow.down")
                    .font(IOThemTypography.UI.microBold)
                    .foregroundStyle(Color.herStudioActiveStroke.opacity(0.82))
                    .transition(.opacity.combined(with: .scale))
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.spring(response: 0.18, dampingFraction: 0.88), value: isDropTargeted)
        .accessibilityHidden(true)
    }

    private var cardStrokeColor: Color {
        if isSettled {
            return Color.herStudioActiveStroke.opacity(0.80)
        }
        if isDropTargeted {
            return Color.herStudioActiveStroke.opacity(0.76)
        }
        return isSelected
            ? Color.herStudioActiveStroke.opacity(0.36)
            : Color.herShellStroke.opacity(0.18)
    }

    private var cardStrokeWidth: CGFloat {
        isSettled ? 1.6 : (isDropTargeted ? 1.4 : 1)
    }

    private func metaChip(title: String, value: String) -> some View {
        HStack(spacing: 6) {
            Text(title)
                .font(IOThemTypography.UI.micro)
                .foregroundStyle(Color.herText.opacity(0.48))
                .textCase(.uppercase)
            Text(value)
                .font(IOThemTypography.UI.monoLabel)
                .foregroundStyle(Color.herText.opacity(0.82))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(Color.white.opacity(0.72)))
    }

    private func provenanceHistoryView(_ history: ScreenplayStudioBeatProvenanceHistoryPresentation) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(history.createdText)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.52))
            Text(history.refreshedText)
                .font(IOThemTypography.UI.microMedium)
                .foregroundStyle(Color.herText.opacity(0.52))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(history.accessibilityLabel)
    }

    private func actionButton(
        _ title: String,
        systemImage: String,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Label(title, systemImage: systemImage)
                .font(IOThemTypography.UI.label)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 10)
                .padding(.vertical, 9)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.white.opacity(0.72))
                )
        }
        .buttonStyle(.plain)
    }
}

struct ScreenplayStudioOutlineActCard<SceneRows: View>: View {
    let act: BackendScreenplayAct
    let sceneCount: Int
    let isSceneDragActive: Bool
    let isSettled: Bool
    @Binding var isDropTargeted: Bool
    @Binding var isSceneGroupDropTargeted: Bool
    let canMoveUp: Bool
    let canMoveDown: Bool
    @ViewBuilder let sceneRows: () -> SceneRows
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onBeginDrag: () -> Void
    let onDrop: () -> Bool
    let onSceneGroupDrop: () -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            insertionMarker(isVisible: isDropTargeted)
                .padding(.horizontal, 6)

            intelligenceCollectionCard(title: act.title, icon: "square.split.2x1") {
                HStack(spacing: 8) {
                    metaChip(title: "Order", value: "\((act.order ?? 0) + 1)")
                    Spacer(minLength: 0)
                    reorderMenu(
                        title: "Reorder act",
                        moveUpDisabled: !canMoveUp,
                        moveDownDisabled: !canMoveDown,
                        moveUp: onMoveUp,
                        moveDown: onMoveDown
                    )
                }

                if sceneCount == 0 {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("No scenes grouped into this act yet.")
                            .font(IOThemTypography.UI.caption)
                            .foregroundStyle(Color.herText.opacity(0.58))
                        if isSceneDragActive {
                            sceneGroupDropZone(title: "Drop here to move this scene into \(act.title)")
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            metaChip(title: "Scenes", value: "\(sceneCount)")
                            if let summary = act.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Text(summary)
                                    .font(IOThemTypography.UI.labelRegular)
                                    .foregroundStyle(Color.herText.opacity(0.52))
                                    .lineLimit(1)
                            }
                        }

                        sceneRows()

                        if isSceneDragActive {
                            sceneGroupDropZone(title: "Drop here to move this scene to the end of \(act.title)")
                        }
                    }
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(actStrokeColor, lineWidth: isSettled ? 1.6 : 1.4)
            )
            .shadow(
                color: isSettled ? Color.herStudioActiveStroke.opacity(0.18) : .clear,
                radius: isSettled ? 12 : 0,
                y: isSettled ? 6 : 0
            )
            .scaleEffect(isSettled ? 1.008 : 1.0)
            .id("inspector-act-\(act.id)")
            .onDrag {
                onBeginDrag()
                return NSItemProvider(object: NSString(string: act.id))
            }
            .onDrop(of: [UTType.plainText.identifier], isTargeted: $isDropTargeted) { _ in
                onDrop()
            }
        }
    }

    private var actStrokeColor: Color {
        if isSettled {
            return Color.herStudioActiveStroke.opacity(0.82)
        }
        return isDropTargeted ? Color.herStudioActiveStroke.opacity(0.72) : .clear
    }

    private func sceneGroupDropZone(title: String) -> some View {
        inspectorReorderDropZone(
            title: title,
            isTargeted: $isSceneGroupDropTargeted,
            onDrop: onSceneGroupDrop
        )
    }
}

struct ScreenplayStudioOutlineSceneRow: View {
    let scene: BackendScreenplayScene
    let isActive: Bool
    let isSettled: Bool
    @Binding var isDropTargeted: Bool
    let canMoveUp: Bool
    let canMoveDown: Bool
    let onSelect: () -> Void
    let onMoveUp: () -> Void
    let onMoveDown: () -> Void
    let onBeginDrag: () -> Void
    let onDrop: () -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            insertionMarker(isVisible: isDropTargeted)
                .padding(.horizontal, 4)

            Button(action: onSelect) {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title)
                            .font(IOThemTypography.UI.captionStrong)
                            .foregroundStyle(Color.herText.opacity(0.82))
                            .lineLimit(1)
                        if let objective = scene.objective, !objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(objective)
                                .font(IOThemTypography.UI.labelRegular)
                                .foregroundStyle(Color.herText.opacity(0.54))
                                .lineLimit(2)
                        }
                    }

                    Spacer(minLength: 10)

                    HStack(spacing: 8) {
                        reorderMenu(
                            title: "Reorder scene",
                            moveUpDisabled: !canMoveUp,
                            moveDownDisabled: !canMoveDown,
                            moveUp: onMoveUp,
                            moveDown: onMoveDown
                        )

                        Image(systemName: "arrow.up.left.and.arrow.down.right")
                            .font(IOThemTypography.UI.label)
                            .foregroundStyle(Color.herText.opacity(0.38))
                    }
                }
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(isActive ? Color.herStudioActiveFill.opacity(0.80) : Color.white.opacity(0.70))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .stroke(sceneStrokeColor, lineWidth: sceneStrokeWidth)
                )
                .shadow(
                    color: isSettled ? Color.herStudioActiveStroke.opacity(0.16) : .clear,
                    radius: isSettled ? 10 : 0,
                    y: isSettled ? 4 : 0
                )
                .scaleEffect(isSettled ? 1.008 : 1.0)
            }
            .buttonStyle(.plain)
            .id("inspector-scene-\(scene.id)")
            .onDrag {
                onBeginDrag()
                return NSItemProvider(object: NSString(string: scene.id))
            }
            .onDrop(of: [UTType.plainText.identifier], isTargeted: $isDropTargeted) { _ in
                onDrop()
            }
        }
    }

    private var sceneStrokeColor: Color {
        if isSettled {
            return Color.herStudioActiveStroke.opacity(0.82)
        }
        if isDropTargeted {
            return Color.herStudioActiveStroke.opacity(0.72)
        }
        return isActive ? Color.herStudioActiveStroke.opacity(0.34) : .clear
    }

    private var sceneStrokeWidth: CGFloat {
        isSettled ? 1.6 : (isDropTargeted ? 1.4 : 1.0)
    }
}

struct ScreenplayStudioOutlineLooseScenesCard<SceneRows: View>: View {
    let sceneCount: Int
    let isSceneDragActive: Bool
    @Binding var isDropTargeted: Bool
    @ViewBuilder let sceneRows: () -> SceneRows
    let onDrop: () -> Bool

    var body: some View {
        intelligenceCollectionCard(title: "Loose scenes", icon: "rectangle.stack.badge.plus") {
            if sceneCount > 0 {
                Text("These scenes are on the board, but they still need an act home.")
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.58))
                VStack(alignment: .leading, spacing: 8) {
                    sceneRows()
                    if isSceneDragActive {
                        inspectorReorderDropZone(
                            title: "Drop here to keep this scene loose at the end",
                            isTargeted: $isDropTargeted,
                            onDrop: onDrop
                        )
                    }
                }
            } else if isSceneDragActive {
                inspectorReorderDropZone(
                    title: "Drop here to keep this scene loose",
                    isTargeted: $isDropTargeted,
                    onDrop: onDrop
                )
            }
        }
    }
}

struct ScreenplayStudioOutlineFocusedSceneCard: View {
    let scene: BackendScreenplayScene

    var body: some View {
        intelligenceCollectionCard(
            title: scene.slugline?.isEmpty == false ? scene.slugline! : scene.title,
            icon: "scope"
        ) {
            if let objective = scene.objective, !objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Objective")
                        .font(IOThemTypography.UI.micro)
                        .foregroundStyle(Color.herText.opacity(0.46))
                        .textCase(.uppercase)
                    Text(objective)
                        .font(IOThemTypography.UI.caption)
                        .foregroundStyle(Color.herText.opacity(0.76))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let summary = scene.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(summary)
                    .font(IOThemTypography.UI.caption)
                    .foregroundStyle(Color.herText.opacity(0.62))
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: 8) {
                metaChip(title: "Act", value: (scene.actId ?? "Loose"))
                metaChip(title: "Beats", value: "\((scene.beatIds ?? []).count)")
            }
        }
    }
}

private func insertionMarker(isVisible: Bool) -> some View {
    HStack(spacing: 8) {
        Capsule()
            .fill(Color.herStudioActiveStroke.opacity(isVisible ? 0.92 : 0.0))
            .frame(width: 28, height: isVisible ? 5 : 2)
        Rectangle()
            .fill(Color.herStudioActiveStroke.opacity(isVisible ? 0.68 : 0.0))
            .frame(height: isVisible ? 2 : 1)
            .frame(maxWidth: .infinity)
        if isVisible {
            Image(systemName: "arrow.down")
                .font(IOThemTypography.UI.microBold)
                .foregroundStyle(Color.herStudioActiveStroke.opacity(0.82))
                .transition(.opacity.combined(with: .scale))
        }
    }
    .frame(maxWidth: .infinity)
    .animation(.spring(response: 0.18, dampingFraction: 0.88), value: isVisible)
    .accessibilityHidden(true)
}

private func inspectorReorderDropZone(
    title: String,
    isTargeted: Binding<Bool>,
    onDrop: @escaping () -> Bool
) -> some View {
    HStack(spacing: 10) {
        Capsule()
            .fill((isTargeted.wrappedValue ? Color.herStudioActiveStroke : Color.herShellStroke).opacity(isTargeted.wrappedValue ? 0.82 : 0.22))
            .frame(height: isTargeted.wrappedValue ? 3 : 1.5)
        HStack(spacing: 6) {
            Image(systemName: "arrow.down.to.line.compact")
                .font(IOThemTypography.UI.micro)
            Text(title)
                .font(IOThemTypography.UI.label)
                .lineLimit(1)
        }
        .foregroundStyle((isTargeted.wrappedValue ? Color.herStudioActiveStroke : Color.herText).opacity(isTargeted.wrappedValue ? 0.88 : 0.56))
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(
            Capsule()
                .fill(isTargeted.wrappedValue ? Color.herStudioActiveFill.opacity(0.28) : Color.white.opacity(0.52))
        )
        Capsule()
            .fill((isTargeted.wrappedValue ? Color.herStudioActiveStroke : Color.herShellStroke).opacity(isTargeted.wrappedValue ? 0.82 : 0.22))
            .frame(height: isTargeted.wrappedValue ? 3 : 1.5)
    }
    .frame(height: 36)
    .contentShape(Rectangle())
    .animation(.easeOut(duration: 0.16), value: isTargeted.wrappedValue)
    .onDrop(of: [UTType.plainText.identifier], isTargeted: isTargeted) { _ in
        onDrop()
    }
}

private func reorderMenu(
    title: String,
    moveUpDisabled: Bool,
    moveDownDisabled: Bool,
    moveUp: @escaping () -> Void,
    moveDown: @escaping () -> Void
) -> some View {
    Menu {
        Button("Move Up", action: moveUp)
            .disabled(moveUpDisabled)
        Button("Move Down", action: moveDown)
            .disabled(moveDownDisabled)
    } label: {
        Image(systemName: "line.3.horizontal")
            .font(IOThemTypography.UI.label)
            .foregroundStyle(Color.herText.opacity(0.42))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(Color.white.opacity(0.74))
            )
    }
    .help(title)
    .menuStyle(.borderlessButton)
}

private func metaChip(title: String, value: String) -> some View {
    HStack(spacing: 6) {
        Text(title)
            .font(IOThemTypography.UI.micro)
            .foregroundStyle(Color.herText.opacity(0.48))
            .textCase(.uppercase)
        Text(value)
            .font(IOThemTypography.UI.monoLabel)
            .foregroundStyle(Color.herText.opacity(0.82))
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Capsule().fill(Color.white.opacity(0.72)))
}

struct ScreenplayStudioBeatQuickCaptureRow: View {
    let showsSelectionCapture: Bool
    let showsSceneCapture: Bool
    let showsSelectedBeatUpdate: Bool
    let createsImmediately: Bool
    let updatesSelectedBeatImmediately: Bool
    let selectedBeatUpdateSubtitle: String
    let onCaptureSelection: () -> Void
    let onCaptureScene: () -> Void
    let onUpdateSelectedBeat: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            if showsSelectionCapture {
                quickCaptureButton(
                    title: createsImmediately ? "Make from Selection" : "Use Selection",
                    subtitle: "Pull the current highlighted block into a beat.",
                    systemImage: "text.badge.plus",
                    shortcutHint: "⌥⌘B",
                    action: onCaptureSelection
                )
            }
            if showsSceneCapture {
                quickCaptureButton(
                    title: createsImmediately ? "Make from Scene" : "Use Scene",
                    subtitle: "Turn the active page scene into the next beat shell.",
                    systemImage: "sparkles.rectangle.stack",
                    action: onCaptureScene
                )
            }
            if showsSelectedBeatUpdate {
                quickCaptureButton(
                    title: updatesSelectedBeatImmediately ? "Update Selected Beat" : "Use for Selected Beat",
                    subtitle: selectedBeatUpdateSubtitle,
                    systemImage: "arrow.triangle.merge",
                    shortcutHint: "⌥⌘U",
                    action: onUpdateSelectedBeat
                )
            }
        }
    }

    private func quickCaptureButton(
        title: String,
        subtitle: String,
        systemImage: String,
        shortcutHint: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: systemImage)
                    .font(IOThemTypography.UI.calloutStrong)
                    .foregroundStyle(Color.herStudioActiveStroke.opacity(0.82))
                    .frame(width: 28, height: 28)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.white.opacity(0.84))
                    )

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(title)
                            .font(IOThemTypography.UI.captionStrong)
                            .foregroundStyle(Color.herText.opacity(0.88))
                        if let shortcutHint, !shortcutHint.isEmpty {
                            Text(shortcutHint)
                                .font(IOThemTypography.UI.monoMicro)
                                .foregroundStyle(Color.herText.opacity(0.46))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Capsule().fill(Color.white.opacity(0.74)))
                        }
                    }
                    Text(subtitle)
                        .font(IOThemTypography.UI.labelRegular)
                        .foregroundStyle(Color.herText.opacity(0.58))
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white.opacity(0.80))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.herShellStroke.opacity(0.16), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

struct ScreenplayStudioBeatQuickLinks: View {
    let targets: [BeatQuickLinkTarget]
    let selectedSceneID: String?
    let selectedActID: String?
    let onSelect: (BeatQuickLinkTarget) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(targets) { target in
                    quickLinkButton(target)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func quickLinkButton(_ target: BeatQuickLinkTarget) -> some View {
        let isActive = selectedSceneID == target.sceneID && selectedActID == target.actID
            || (target.sceneID.isEmpty && target.actID.isEmpty && selectedSceneID == nil && selectedActID == nil)
        return Button {
            onSelect(target)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                Text(target.title)
                    .font(IOThemTypography.UI.label)
                    .foregroundStyle(Color.herText.opacity(isActive ? 0.92 : 0.78))
                Text(target.subtitle)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(Color.herText.opacity(isActive ? 0.64 : 0.50))
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(isActive ? Color.herStudioActiveFill.opacity(0.90) : Color.white.opacity(0.76))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(
                        isActive ? Color.herStudioActiveStroke.opacity(0.70) : Color.herShellStroke.opacity(0.18),
                        lineWidth: 1
                    )
            )
        }
        .buttonStyle(.plain)
    }
}

struct ScreenplayStudioBeatScenePicker: View {
    let selectedScene: BackendScreenplayScene?
    let currentScene: BackendScreenplayScene?
    let availableScenes: [BackendScreenplayScene]
    let onSelect: (BackendScreenplayScene?) -> Void

    var body: some View {
        Menu {
            Button("No scene link") {
                onSelect(nil)
            }
            if let currentScene {
                Divider()
                Button("Current scene: \(title(for: currentScene))") {
                    onSelect(currentScene)
                }
            }
            if !availableScenes.isEmpty {
                Divider()
                ForEach(availableScenes, id: \.id) { scene in
                    Button {
                        onSelect(scene)
                    } label: {
                        HStack {
                            Text(title(for: scene))
                            if selectedScene?.id == scene.id {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }
        } label: {
            composerPickerButton(
                title: selectedScene.map { title(for: $0) } ?? "Choose scene",
                subtitle: selectedScene == nil
                    ? "Keep it loose or connect it to the current scene."
                    : "Linked to this scene."
            )
        }
        .menuStyle(.borderlessButton)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func title(for scene: BackendScreenplayScene) -> String {
        scene.slugline?.isEmpty == false ? scene.slugline! : scene.title
    }
}

struct ScreenplayStudioBeatActPicker: View {
    let selectedAct: BackendScreenplayAct?
    let acts: [BackendScreenplayAct]
    let onSelect: (BackendScreenplayAct?) -> Void

    var body: some View {
        Menu {
            Button("No act link") {
                onSelect(nil)
            }
            if !acts.isEmpty {
                Divider()
                ForEach(acts, id: \.id) { act in
                    Button {
                        onSelect(act)
                    } label: {
                        HStack {
                            Text(act.title)
                            if selectedAct?.id == act.id {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }
        } label: {
            composerPickerButton(
                title: selectedAct?.title ?? "Choose act",
                subtitle: selectedAct == nil
                    ? "Optional story-placement cue."
                    : "Acts help sort beats before the page settles."
            )
        }
        .menuStyle(.borderlessButton)
        .fixedSize(horizontal: false, vertical: true)
    }
}

private func composerPickerButton(title: String, subtitle: String) -> some View {
    HStack(spacing: 10) {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(IOThemTypography.UI.prominentCallout)
                .foregroundStyle(Color.herText.opacity(0.90))
                .lineLimit(1)
            Text(subtitle)
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.50))
                .lineLimit(2)
        }
        Spacer(minLength: 8)
        Image(systemName: "chevron.up.chevron.down")
            .font(IOThemTypography.UI.label)
            .foregroundStyle(Color.herText.opacity(0.42))
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color.white.opacity(0.94))
    )
    .overlay(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .stroke(Color.herShellStroke.opacity(0.16), lineWidth: 1)
    )
}

struct ScreenplayStudioBeatComposer: View {
    @Binding var label: String
    @Binding var summary: String
    let isEditing: Bool
    let isSaving: Bool
    let showsSelectionCapture: Bool
    let showsSceneCapture: Bool
    let showsSelectedBeatUpdate: Bool
    let createsImmediately: Bool
    let updatesSelectedBeatImmediately: Bool
    let selectedBeatUpdateSubtitle: String
    let quickLinkTargets: [BeatQuickLinkTarget]
    let selectedScene: BackendScreenplayScene?
    let currentScene: BackendScreenplayScene?
    let availableScenes: [BackendScreenplayScene]
    let selectedAct: BackendScreenplayAct?
    let acts: [BackendScreenplayAct]
    let onCaptureSelection: () -> Void
    let onCaptureScene: () -> Void
    let onUpdateSelectedBeat: () -> Void
    let onSelectQuickLink: (BeatQuickLinkTarget) -> Void
    let onSelectScene: (BackendScreenplayScene?) -> Void
    let onSelectAct: (BackendScreenplayAct?) -> Void
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            fieldSection(
                title: "Beat label",
                detail: "A short, memorable story turn."
            ) {
                textField("Ex: The lie gets exposed", text: $label)
            }

            if showsSelectionCapture || showsSceneCapture {
                fieldSection(title: "Quick capture", detail: quickCaptureDetail) {
                    ScreenplayStudioBeatQuickCaptureRow(
                        showsSelectionCapture: showsSelectionCapture,
                        showsSceneCapture: showsSceneCapture,
                        showsSelectedBeatUpdate: showsSelectedBeatUpdate,
                        createsImmediately: createsImmediately,
                        updatesSelectedBeatImmediately: updatesSelectedBeatImmediately,
                        selectedBeatUpdateSubtitle: selectedBeatUpdateSubtitle,
                        onCaptureSelection: onCaptureSelection,
                        onCaptureScene: onCaptureScene,
                        onUpdateSelectedBeat: onUpdateSelectedBeat
                    )
                }
            }

            if !quickLinkTargets.isEmpty {
                fieldSection(title: "Quick links", detail: "Use the page or outline context already in front of you.") {
                    ScreenplayStudioBeatQuickLinks(
                        targets: quickLinkTargets,
                        selectedSceneID: selectedScene?.id,
                        selectedActID: selectedAct?.id,
                        onSelect: onSelectQuickLink
                    )
                }
            }

            fieldSection(
                title: "Beat summary",
                detail: "What changes here, and why does it matter?"
            ) {
                multilineField("Summarize the shift, reveal, or conflict.", text: $summary)
            }

            HStack(alignment: .top, spacing: 10) {
                fieldSection(title: "Scene link", detail: "Optional") {
                    ScreenplayStudioBeatScenePicker(
                        selectedScene: selectedScene,
                        currentScene: currentScene,
                        availableScenes: availableScenes,
                        onSelect: onSelectScene
                    )
                }
                fieldSection(title: "Act link", detail: "Optional") {
                    ScreenplayStudioBeatActPicker(
                        selectedAct: selectedAct,
                        acts: acts,
                        onSelect: onSelectAct
                    )
                }
            }

            saveRow
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color.white.opacity(0.50))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.herShellStroke.opacity(0.18), lineWidth: 1)
        )
    }

    private var quickCaptureDetail: String {
        createsImmediately
            ? "Make a beat in one tap from what is already active."
            : "Use page context to load the composer without losing your draft."
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 10) {
                Text(isEditing ? "Refine the beat" : "Capture the next move")
                    .font(IOThemTypography.UI.sectionTitle)
                    .foregroundStyle(Color.herText.opacity(0.92))

                Spacer(minLength: 0)

                if isEditing {
                    Button("Cancel", action: onCancel)
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
            }

            if isEditing {
                Text("You’re editing an existing beat. Save will update it in place.")
                    .font(IOThemTypography.UI.labelMedium)
                    .foregroundStyle(Color.herStudioActiveFill.opacity(0.88))
            }

            Text(
                isEditing
                    ? "Adjust the label, sharpen the summary, or reconnect the beat to a different scene or act."
                    : "Name the beat, describe the turn, then link it to a scene or act if you already know where it belongs."
            )
            .font(IOThemTypography.UI.caption)
            .foregroundStyle(Color.herText.opacity(0.64))
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var saveRow: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("You can save this loose now and connect it more precisely later.")
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(Color.herText.opacity(0.56))
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            Button(action: onSave) {
                Label(
                    isEditing ? "Update Beat" : "Save Beat",
                    systemImage: isEditing ? "checkmark.circle.fill" : "plus.circle.fill"
                )
                .font(IOThemTypography.UI.prominentCallout)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .disabled((label.cleanStudioField.isEmpty && summary.cleanStudioField.isEmpty) || isSaving)
            .accessibilityHint(isEditing ? "Updates this beat in place." : "Adds this beat to the story map.")
            .accessibilityIdentifier("studio.beats.save")
        }
    }

    private func fieldSection<Content: View>(
        title: String,
        detail: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            fieldLabel(title, detail: detail)
            content()
        }
    }

    private func fieldLabel(_ title: String, detail: String) -> some View {
        HStack(spacing: 6) {
            Text(title)
                .font(IOThemTypography.UI.label)
                .foregroundStyle(Color.herText.opacity(0.74))
                .textCase(.uppercase)
            Text(detail)
                .font(IOThemTypography.UI.labelMedium)
                .foregroundStyle(Color.herText.opacity(0.42))
        }
    }

    private func textField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .textFieldStyle(.plain)
            .font(IOThemTypography.UI.bodyMedium)
            .foregroundStyle(Color.herText.opacity(0.92))
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(fieldBackground)
    }

    private func multilineField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(4...7)
            .font(IOThemTypography.UI.body)
            .foregroundStyle(Color.herText.opacity(0.92))
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: 108, alignment: .topLeading)
            .background(fieldBackground)
    }

    private var fieldBackground: some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(Color.white.opacity(0.94))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Color.herShellStroke.opacity(0.16), lineWidth: 1)
            )
    }
}

private extension String {
    var cleanStudioField: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
