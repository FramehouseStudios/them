import SwiftUI
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
                    .font(.system(size: 13, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.78))
                Text("Keep the next turn of the script visible. Beats can stay loose while you ideate, or link directly to scenes and acts as the outline locks in.")
                    .font(.system(size: 12, weight: .regular, design: .default))
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
                    .font(.system(size: 16, weight: .semibold, design: .default))
                    .foregroundStyle(Color.black.opacity(0.74).opacity(0.86))
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(Color.white.opacity(0.82))
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("No beats yet")
                        .font(.system(size: 16, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.92))
                    Text("Start with a turning point, reveal, reversal, or emotional shift. You can connect it to a scene now or let it stay free until the draft settles.")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Good first beats")
                    .font(.system(size: 10, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.46))
                    .textCase(.uppercase)
                Text("Inciting incident")
                    .font(.system(size: 12, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.80))
                Text("False victory")
                    .font(.system(size: 12, weight: .medium, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.80))
                Text("The choice that changes everything")
                    .font(.system(size: 12, weight: .medium, design: .default))
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

struct ScreenplayStudioBeatMapList<BeatRows: View>: View {
    let isBeatDragActive: Bool
    @Binding var isEndDropTargeted: Bool
    @ViewBuilder let beatRows: () -> BeatRows
    let onDropAtEnd: () -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            beatRows()
            if isBeatDragActive {
                inspectorReorderDropZone(
                    title: "Drop here to move this beat to the end",
                    isTargeted: $isEndDropTargeted,
                    onDrop: onDropAtEnd
                )
            }
        }
    }
}

struct ScreenplayStudioOutlineStorySpine<ActCards: View, LooseScenes: View>: View {
    let isActDragActive: Bool
    let showsLooseScenes: Bool
    @Binding var isActEndDropTargeted: Bool
    @ViewBuilder let actCards: () -> ActCards
    @ViewBuilder let looseScenes: () -> LooseScenes
    let onDropActAtEnd: () -> Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            actCards()
            if isActDragActive {
                inspectorReorderDropZone(
                    title: "Drop here to move this act to the end",
                    isTargeted: $isActEndDropTargeted,
                    onDrop: onDropActAtEnd
                )
            }
            if showsLooseScenes {
                looseScenes()
            }
        }
    }
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
                        .font(.system(size: 12, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.82))
                        .fixedSize(horizontal: false, vertical: true)
                    if !snapshot.nextSceneDetail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Text(snapshot.nextSceneDetail)
                            .font(.system(size: 11, weight: .regular, design: .default))
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
                        .font(.system(size: 11, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.62))
                        .fixedSize(horizontal: false, vertical: true)

                    HStack(spacing: 8) {
                        Button(action: onWriteNextPages) {
                            Label("Write Next Pages", systemImage: "doc.badge.plus")
                                .font(.system(size: 11, weight: .semibold, design: .default))
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .disabled(isWriteDisabled)

                        Button(action: onPlan) {
                            Label("Plan", systemImage: "list.bullet")
                                .font(.system(size: 11, weight: .semibold, design: .default))
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }

                    HStack(spacing: 8) {
                        Button(action: onDoctor) {
                            Label("Doctor", systemImage: "cross.case")
                                .font(.system(size: 11, weight: .semibold, design: .default))
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                        if snapshot.hasAcceptedBatch {
                            Button(action: onReviewBatch) {
                                Label("Review Batch", systemImage: "text.magnifyingglass")
                                    .font(.system(size: 11, weight: .semibold, design: .default))
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }

                        if canPolishLastBatch {
                            Button(action: onPolishLastBatch) {
                                Label("Polish Batch", systemImage: "sparkles")
                                    .font(.system(size: 11, weight: .semibold, design: .default))
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
                    .font(.system(size: 12, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.80))
                    .fixedSize(horizontal: false, vertical: true)
                Text(move.detail)
                    .font(.system(size: 11, weight: .regular, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.56))
                    .lineLimit(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                onWriteMove(move)
            } label: {
                Label("Write", systemImage: "square.and.pencil")
                    .font(.system(size: 11, weight: .semibold, design: .default))
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isWriteDisabled)
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
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(Color.black.opacity(0.74).opacity(0.84))
                .frame(width: 34, height: 34)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color.white.opacity(0.88))
                )

            VStack(alignment: .leading, spacing: 5) {
                Text(beat.label)
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(0.92))
                if let summary = beat.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.system(size: 12, weight: .regular, design: .default))
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
                .font(.system(size: 10, weight: .semibold, design: .default))
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
                    .font(.system(size: 10, weight: .bold, design: .default))
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
                .font(.system(size: 10, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.48))
                .textCase(.uppercase)
            Text(value)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(Color.herText.opacity(0.82))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(Color.white.opacity(0.72)))
    }

    private func provenanceHistoryView(_ history: ScreenplayStudioBeatProvenanceHistoryPresentation) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(history.createdText)
                .font(.system(size: 10, weight: .medium, design: .default))
                .foregroundStyle(Color.herText.opacity(0.52))
            Text(history.refreshedText)
                .font(.system(size: 10, weight: .medium, design: .default))
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
                .font(.system(size: 11, weight: .semibold, design: .default))
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
                            .font(.system(size: 12, weight: .regular, design: .default))
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
                                    .font(.system(size: 11, weight: .regular, design: .default))
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
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundStyle(Color.herText.opacity(0.82))
                            .lineLimit(1)
                        if let objective = scene.objective, !objective.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            Text(objective)
                                .font(.system(size: 11, weight: .regular, design: .default))
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
                            .font(.system(size: 11, weight: .semibold, design: .default))
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
                    .font(.system(size: 12, weight: .regular, design: .default))
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
                        .font(.system(size: 10, weight: .semibold, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.46))
                        .textCase(.uppercase)
                    Text(objective)
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundStyle(Color.herText.opacity(0.76))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            if let summary = scene.summary, !summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(summary)
                    .font(.system(size: 12, weight: .regular, design: .default))
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
                .font(.system(size: 10, weight: .bold, design: .default))
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
                .font(.system(size: 10, weight: .semibold, design: .default))
            Text(title)
                .font(.system(size: 11, weight: .semibold, design: .default))
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
            .font(.system(size: 11, weight: .semibold, design: .default))
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
            .font(.system(size: 10, weight: .semibold, design: .default))
            .foregroundStyle(Color.herText.opacity(0.48))
            .textCase(.uppercase)
        Text(value)
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(Color.herText.opacity(0.82))
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 6)
    .background(Capsule().fill(Color.white.opacity(0.72)))
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
                    .font(.system(size: 11, weight: .semibold, design: .default))
                    .foregroundStyle(Color.herText.opacity(isActive ? 0.92 : 0.78))
                Text(target.subtitle)
                    .font(.system(size: 11, weight: .regular, design: .default))
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
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.90))
                .lineLimit(1)
            Text(subtitle)
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.50))
                .lineLimit(2)
        }
        Spacer(minLength: 8)
        Image(systemName: "chevron.up.chevron.down")
            .font(.system(size: 11, weight: .semibold, design: .default))
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

struct ScreenplayStudioBeatComposer<QuickCapture: View, QuickLinks: View, ScenePicker: View, ActPicker: View>: View {
    @Binding var label: String
    @Binding var summary: String
    let isEditing: Bool
    let isSaving: Bool
    let hasQuickCapture: Bool
    let quickCaptureDetail: String
    let hasQuickLinks: Bool
    @ViewBuilder let quickCapture: () -> QuickCapture
    @ViewBuilder let quickLinks: () -> QuickLinks
    @ViewBuilder let scenePicker: () -> ScenePicker
    @ViewBuilder let actPicker: () -> ActPicker
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

            if hasQuickCapture {
                fieldSection(title: "Quick capture", detail: quickCaptureDetail) {
                    quickCapture()
                }
            }

            if hasQuickLinks {
                fieldSection(title: "Quick links", detail: "Use the page or outline context already in front of you.") {
                    quickLinks()
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
                    scenePicker()
                }
                fieldSection(title: "Act link", detail: "Optional") {
                    actPicker()
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 10) {
                Text(isEditing ? "Refine the beat" : "Capture the next move")
                    .font(.system(size: 16, weight: .semibold, design: .default))
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
                    .font(.system(size: 11, weight: .medium, design: .default))
                    .foregroundStyle(Color.herStudioActiveFill.opacity(0.88))
            }

            Text(
                isEditing
                    ? "Adjust the label, sharpen the summary, or reconnect the beat to a different scene or act."
                    : "Name the beat, describe the turn, then link it to a scene or act if you already know where it belongs."
            )
            .font(.system(size: 12, weight: .regular, design: .default))
            .foregroundStyle(Color.herText.opacity(0.64))
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var saveRow: some View {
        HStack(alignment: .center, spacing: 12) {
            Text("You can save this loose now and connect it more precisely later.")
                .font(.system(size: 11, weight: .regular, design: .default))
                .foregroundStyle(Color.herText.opacity(0.56))
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            Button(action: onSave) {
                Label(
                    isEditing ? "Update Beat" : "Save Beat",
                    systemImage: isEditing ? "checkmark.circle.fill" : "plus.circle.fill"
                )
                .font(.system(size: 14, weight: .semibold, design: .default))
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .disabled((label.cleanStudioField.isEmpty && summary.cleanStudioField.isEmpty) || isSaving)
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
                .font(.system(size: 11, weight: .semibold, design: .default))
                .foregroundStyle(Color.herText.opacity(0.74))
                .textCase(.uppercase)
            Text(detail)
                .font(.system(size: 11, weight: .medium, design: .default))
                .foregroundStyle(Color.herText.opacity(0.42))
        }
    }

    private func textField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .textFieldStyle(.plain)
            .font(.system(size: 15, weight: .medium, design: .default))
            .foregroundStyle(Color.herText.opacity(0.92))
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(fieldBackground)
    }

    private func multilineField(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text, axis: .vertical)
            .textFieldStyle(.plain)
            .lineLimit(4...7)
            .font(.system(size: 15, weight: .regular, design: .default))
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
