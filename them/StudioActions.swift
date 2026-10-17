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

/// A reply may operate only the exact authenticated document that requested it.
/// Compare the bytes, not display-normalized text; no screenplay content is logged.
struct StudioActionDocumentContext {
    let auth: ScreenplayStudioAuthContext
    let projectID: String
    let draft: String
    let isAuthenticated: Bool

    func matches(_ current: StudioActionDocumentContext) -> Bool {
        isAuthenticated && current.isAuthenticated &&
        !auth.userID.isEmpty &&
        ScreenplayStudioAuthContextPolicy.matches(expected: auth, current: current.auth) &&
        projectID == current.projectID && draft.utf8.elementsEqual(current.draft.utf8)
    }

    static func current(bridge: ScreenplayLiveDraftBridge) -> StudioActionDocumentContext {
        let session = BackendAuthClient.currentAuthSessionState()
        return StudioActionDocumentContext(
            auth: ScreenplayStudioAuthContext(userID: session.user?.userId ?? "", sessionIntentGeneration: BackendAuthClient.currentAuthSessionIntentGeneration()),
            projectID: bridge.preferredProjectID, draft: bridge.draftText,
            isAuthenticated: session.isAuthenticated && !session.accessExpired
        )
    }
}

/// The compact form of her last coverage read, sent with every Studio turn so
/// her conversation quotes the read the writer is looking at.
struct StudioCoverageSummary: Codable, Equatable {
    var grade: String
    var verdict: String
    var overall: Double
    var pageCount: Int
    var sceneCount: Int
    var pillars: [String: Double]
    var missing: [String]
    var move: String

    enum CodingKeys: String, CodingKey {
        case grade, verdict, overall, pillars, missing, move
        case pageCount = "page_count"
        case sceneCount = "scene_count"
    }

    init(report: BackendScreenplayCoverageReport) {
        grade = report.grade
        verdict = report.verdict.lowercased()
        overall = report.overall
        pageCount = report.pageCount
        sceneCount = report.sceneCount
        pillars = report.pillars.mapValues(\.score)
        missing = Array(report.missing.prefix(2))
        move = report.move
    }
}

/// Studio state the live-draft bridge does not carry but her turns need: the
/// outline's beat labels (published by the Studio screen whenever the outline
/// changes) and the summary of her last coverage read (set by the view model).
@MainActor
final class StudioOutlineRegistry {
    static let shared = StudioOutlineRegistry()
    var beatLabels: [String] = []
    var coverageSummary: StudioCoverageSummary?

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
    var coverage: StudioCoverageSummary? = nil
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
        case coverage
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
        snapshot.coverage = StudioOutlineRegistry.shared.coverageSummary
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

    /// Preserve the turn's existing anchors and continuity; ordinary turns
    /// without Studio metadata must not acquire a synthetic Studio context.
    static func attaching(
        to metadata: BackendStudioThreadCommitMetadata?,
        snapshot: @autoclosure () -> StudioCapabilitiesSnapshot
    ) -> BackendStudioThreadCommitMetadata? {
        guard var metadata else { return nil }
        metadata.studioCapabilitiesJSON = snapshot().json()
        return metadata
    }
}

extension Notification.Name {
    /// Posted once per validated Studio action; the Studio screen performs it.
    static let themStudioActionRequested = Notification.Name("io.them.them.studioActionRequested")
}

enum StudioActionDispatcher {
    static let userInfoKey = "action"

    /// Resolve visibility when the response arrives, dispatch its validated
    /// actions, then pass the unchanged response to the existing voice path.
    static func handlingResponse(
        bridge: ScreenplayLiveDraftBridge? = nil,
        studioOpen: @escaping () -> Bool,
        openStudio: @escaping () -> Void,
        center: NotificationCenter = .default,
        isCurrent: @escaping () -> Bool = { true },
        onResponse: @escaping (BackendTalkResponseMetadata) -> Void
    ) -> (BackendTalkResponseMetadata) -> Void {
        let expectedDocument = bridge.map { StudioActionDocumentContext.current(bridge: $0) }
        var didDispatch = false
        return { metadata in
            if !didDispatch {
                didDispatch = true
                dispatch(metadata.studioActions, studioOpen: studioOpen(), openStudio: openStudio, center: center, isCurrent: {
                    guard isCurrent() else { return false }
                    guard let bridge, let expectedDocument else { return true }
                    return expectedDocument.matches(.current(bridge: bridge))
                }, isReady: studioOpen)
            }
            onResponse(metadata)
        }
    }

    /// Hands each action to the Studio screen. When the Studio is not open yet,
    /// opens it first and lets the screen mount before the actions arrive.
    @discardableResult
    static func dispatch(
        _ actions: [BackendStudioAction],
        studioOpen: Bool,
        openStudio: () -> Void,
        center: NotificationCenter = .default,
        mountDelay: TimeInterval = 0.6,
        isCurrent: @escaping () -> Bool = { true },
        isReady: @escaping () -> Bool = { true }
    ) -> Int {
        var seen: Set<BackendStudioAction> = []
        let supported = actions.filter { action in
            var identity = action
            identity.source = nil
            return action.isSupported && seen.insert(identity).inserted
        }.prefix(4)
        guard !supported.isEmpty, isCurrent() else { return 0 }
        let post = {
            for action in supported {
                guard isCurrent(), isReady() else { return }
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
