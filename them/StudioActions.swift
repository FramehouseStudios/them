import Foundation

/// A Studio action Clementine committed to in a reply, validated by the
/// backend against what the app offered on that turn (`x-studio-actions`).
struct BackendStudioAction: Codable, Equatable, Hashable {
    let type: String
    var tab: String?
    var section: String?
    var color: String?
    var scope: String?
    var scene: String?
    var beat: String?
    var source: String?

    static let supportedTypes: Set<String> = [
        "open_tab", "open_draft_tools", "open_sidebar", "save_draft", "save_revision",
        "start_rewrite", "choose_beat", "jump_to_scene", "undo_last_page_write",
    ]

    var isSupported: Bool { Self.supportedTypes.contains(type) }
}

enum StudioActionParser {
    /// Decodes the percent-encoded JSON array the backend puts on the header.
    static func parse(headerValue: String?) -> [BackendStudioAction] {
        guard let raw = headerValue?.removingPercentEncoding?.trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty,
              let data = raw.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([BackendStudioAction].self, from: data) else {
            return []
        }
        return decoded.filter(\.isSupported)
    }
}

/// The outline's beat labels, published by the Studio screen whenever the
/// outline changes, so the capabilities snapshot can offer them to her even
/// though the live-draft bridge does not carry the outline.
@MainActor
final class StudioOutlineRegistry {
    static let shared = StudioOutlineRegistry()
    var beatLabels: [String] = []

    func update(beats: [BackendScreenplayBeat]) {
        beatLabels = beats
            .map { $0.label.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

/// What the Studio offers right now, sent with every talk turn so the backend
/// can let her operate only what exists.
struct StudioCapabilitiesSnapshot: Codable, Equatable {
    var tabs: [String] = ScreenplayStudioScreen.DirectionOneRightPanelTab.allCases.map(\.rawValue)
    var draftToolsSections: [String] = ScreenplayStudioScreen.DraftToolsSection.allCases.map(\.rawValue)
    var sidebarSections: [String] = ScreenplayStudioScreen.SidebarSection.allCases.map(\.rawValue)
    var revisionColors: [String] = ["white", "blue", "pink", "yellow", "green", "goldenrod", "buff", "salmon", "cherry"]
    var sceneLabels: [String] = []
    var beatLabels: [String] = []
    var currentTab: String = ""
    var hasProject: Bool = false
    var hasDraft: Bool = false
    var studioOpen: Bool = false

    enum CodingKeys: String, CodingKey {
        case tabs
        case draftToolsSections = "draft_tools_sections"
        case sidebarSections = "sidebar_sections"
        case revisionColors = "revision_colors"
        case sceneLabels = "scene_labels"
        case beatLabels = "beat_labels"
        case currentTab = "current_tab"
        case hasProject = "has_project"
        case hasDraft = "has_draft"
        case studioOpen = "studio_open"
    }

    static func current(bridge: ScreenplayLiveDraftBridge, studioOpen: Bool, currentTab: String = "") -> StudioCapabilitiesSnapshot {
        let draft = bridge.draftText.trimmingCharacters(in: .whitespacesAndNewlines)
        let labels = bridge.structuredDraft.scenes
            .map { $0.slugline.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var snapshot = StudioCapabilitiesSnapshot()
        snapshot.sceneLabels = Array(labels.prefix(40))
        snapshot.beatLabels = Array(StudioOutlineRegistry.shared.beatLabels.prefix(40))
        snapshot.currentTab = currentTab
        snapshot.hasProject = !bridge.preferredProjectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        snapshot.hasDraft = !draft.isEmpty
        snapshot.studioOpen = studioOpen
        return snapshot
    }

    func json() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(self), let text = String(data: data, encoding: .utf8) else { return "" }
        return text
    }
}

extension Notification.Name {
    /// Posted once per validated Studio action; the Studio screen performs it.
    static let themStudioActionRequested = Notification.Name("io.them.them.studioActionRequested")
}

enum StudioActionDispatcher {
    static let userInfoKey = "action"

    /// Hands each action to the Studio screen. When the Studio is not open yet,
    /// opens it first and lets the screen mount before the actions arrive.
    @discardableResult
    static func dispatch(
        _ actions: [BackendStudioAction],
        studioOpen: Bool,
        openStudio: () -> Void,
        center: NotificationCenter = .default,
        mountDelay: TimeInterval = 0.6
    ) -> Int {
        let supported = actions.filter(\.isSupported)
        guard !supported.isEmpty else { return 0 }
        let post = {
            for action in supported {
                center.post(name: .themStudioActionRequested, object: nil, userInfo: [userInfoKey: action])
            }
        }
        if studioOpen {
            post()
        } else {
            openStudio()
            DispatchQueue.main.asyncAfter(deadline: .now() + mountDelay, execute: post)
        }
        return supported.count
    }

    static func action(from notification: Notification) -> BackendStudioAction? {
        notification.userInfo?[userInfoKey] as? BackendStudioAction
    }
}
