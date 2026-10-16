// Studio actions Clementine commits to by voice (open a tab, mark a revision, start a rewrite…), plus a status chip moved out verbatim.
import Foundation
import SwiftUI
import Combine
import ScreenplayStudio

extension ScreenplayStudioScreen {
    func screenplayPageStatusChip(
        title: String,
        systemImage: String,
        tint: Color,
        fill: Color,
        stroke: Color
    ) -> some View {
        HStack(spacing: 6) {
            Image(systemName: systemImage)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .foregroundStyle(tint)
            Text(title)
                .font(.system(size: 10, weight: .semibold, design: .default))
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(fill)
        .overlay(
            Capsule()
                .stroke(stroke, lineWidth: 1)
        )
        .clipShape(Capsule())
    }
}

extension ScreenplayStudioScreen {
    func handleStudioActionNotification(_ notification: Notification) {
        guard let action = StudioActionDispatcher.action(from: notification) else { return }
        performStudioAction(action)
    }

    /// Performs one validated action with the same controls the writer has in
    /// the tabs. Every branch leaves a visible trace in the Studio info line.
    func performStudioAction(_ action: BackendStudioAction) {
        switch action.type {
        case "open_tab":
            guard let tab = DirectionOneRightPanelTab(rawValue: action.tab ?? "") else { return }
            revealInspector(tab)
            vm.infoText = "Opened \(tab.title)."
        case "open_draft_tools":
            guard let section = DraftToolsSection(rawValue: action.section ?? "") else { return }
            revealInspector(.draft)
            selectedDraftToolsSection = section
            vm.infoText = "Opened \(section.rawValue.capitalized) in Draft tools."
        case "open_sidebar":
            guard let section = SidebarSection(rawValue: action.section ?? "") else { return }
            withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
                isDirectionOneSidebarVisible = true
                selectedSidebarSection = section
            }
            vm.infoText = "Opened \(section.title)."
        case "save_draft":
            triggerStudioManualSave(revealSavedTab: true)
        case "save_revision":
            let color = (action.color ?? "blue").lowercased()
            vm.revisionColor = color
            revealInspector(.draft)
            selectedDraftToolsSection = .revisions
            triggerStudioManualSave(revealSavedTab: false)
            Task { await vm.refreshDraftInsights(source: "Voice") }
            vm.infoText = "Revision marked \(color) and saved."
        case "start_rewrite":
            let scope = action.scope ?? "scene"
            let target = action.scene.map { " \"\($0)\"" } ?? ""
            let prompt = "Rewrite this \(scope)\(target) with sharper intention and obstacle. Keep the story facts and character voices."
            submitStudioPromptText(
                prompt,
                displayText: "Rewrite \(scope)\(target)",
                source: .typed,
                routingMode: .automatic,
                intent: .rewrite,
                successMessage: "Rewrite started.",
                clearSeedOnSuccess: false,
                sendingSuggestionID: nil
            )
        case "choose_beat":
            revealInspector(.beats)
            let wanted = (action.beat ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if !wanted.isEmpty,
               let beat = vm.outline.beats.first(where: { $0.label.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == wanted }) {
                selectedBeatInspectorID = beat.id
                vm.infoText = "\(beat.label) is selected. Tell her what to change."
            } else {
                vm.infoText = "Which beat do you want to change?"
            }
        case "jump_to_scene":
            guard let label = action.scene, let scene = liveDraftBridge.sceneSnapshotMatching(label) else { return }
            liveDraftBridge.jumpToLine(scene.line)
            liveDraftBridge.highlightLineRange(startLine: scene.line, endLine: scene.endLine)
            vm.infoText = "Jumped to \(scene.shortLabel.isEmpty ? scene.slugline : scene.shortLabel)."
        case "undo_last_page_write":
            guard liveDraftBridge.lastCommittedWrite != nil else {
                vm.infoText = "There isn't a recent page write to undo yet."
                return
            }
            liveDraftBridge.requestStudioAction(.undoLastPageWrite)
            vm.infoText = "Undoing the most recent page write."
        default:
            break
        }
    }

    private func revealInspector(_ tab: DirectionOneRightPanelTab) {
        withAnimation(.spring(response: 0.28, dampingFraction: 0.84)) {
            if !isDirectionOneRightRailExpanded {
                toggleDirectionOneRightRailVisibility()
            }
            directionOneRightPanelTab = tab
        }
    }
}
