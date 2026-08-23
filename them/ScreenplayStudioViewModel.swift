import SwiftUI
import ScreenplayStudio
import Combine


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
            baseVersionId: String
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
        }

        init(entry: ScreenplayDraftSaveOutboxEntry) {
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
                lastError: ""
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
                baseVersionId: serverVersionId.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }
    }

    private struct CharacterTraitsRefreshResult {
        let traits: BackendCharacterTraitsResponse
        let archetypes: BackendCharacterArchetypesResponse?
    }

    struct LocalDraftRecoveryCandidate: Equatable {
        let projectId: String
        let draft: String
        let baseVersionId: String
        let savedAt: TimeInterval
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
    @Published var selectedProjectID: String = ""
    @Published var selectedProject: BackendScreenplayProjectSummary?
    @Published var outline: BackendScreenplayOutline = .empty
    @Published var pendingScreenplayQuestion: BackendPendingScreenplayQuestion?

    @Published var craftFrameworks: [ScreenplayCraftFrameworkReference] = []
    @Published var selectedCraftFrameworkID: String = ""
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
        if !paginationPages.isEmpty {
            return paginationPages.count
        }
        let cleanDraft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanDraft.isEmpty else { return 0 }
        let lineCount = max(1, fountainDraft.components(separatedBy: .newlines).count)
        return max(1, Int(ceil(Double(lineCount) / 55.0)))
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

    @Published var fountainDraft: String = ""
    @Published var latestVersionID: String = ""
    @Published var studioWriteAnchors: [BackendScreenplayWriteAnchor] = []
    @Published var screenplayBindings: [BackendScreenplayBindingRecord] = []
    @Published var autosaveEnabled: Bool = true
    @Published var autosaveStatusText: String = "Ready"
    @Published var hasUnsavedDraftChanges: Bool = false
    @Published var isStreamingDraftPreviewActive: Bool = false
    @Published var isManualDraftEditing: Bool = false
    @Published var paginationPages: [BackendScreenplayPaginationPage] = []
    @Published var isPaginationRefreshing: Bool = false
    @Published var paginationErrorText: String = ""
    @Published var linesPerPage: Int = 55
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

    private var draftDebounceCancellable: AnyCancellable?
    private var bridgePreferredVersionCancellable: AnyCancellable?
    private var isHydratingDraft = false
    private var lastSavedDraftFingerprint = ""
    private var lastRevisionBaseDraft = ""
    private var loadedDraftProjectID: String = ""
    private var lastManualDraftEditAt: Date = .distantPast
    private var lastSeenScreenplayStateVersion = ""
    private var isCrossDeviceRefreshInFlight = false
    private var isDraftSaveInFlight = false
    private var pendingDraftSaveRequest: DraftSaveRequest?
    private var shouldQueuePendingDraftSaveAfterFailure = false
    private let localDraftRecoveryStore = ScreenplayLocalDraftRecoveryStore()
    private let draftSaveOutbox = ScreenplayDraftSaveOutbox.shared
    private let craftClient = BackendClient()
    private let projectSelectionAPI = BackendMemoryAPI()
    private var clientTokenOwnedProjectIDs: Set<String> = []

    init() {
        fountainDraft = ScreenplayLiveDraftBridge.shared.draftText
        draftDebounceCancellable = $fountainDraft
            .removeDuplicates()
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
        Task { [weak self] in
            guard let self else { return }
            await self.draftSaveOutbox.startNetworkMonitoring()
            await self.refreshDraftSaveOutboxStatus()
        }
    }

    deinit {
        draftDebounceCancellable?.cancel()
        bridgePreferredVersionCancellable?.cancel()
    }

    func load() async {
        guard !IOThemRuntime.isRunningTests else {
            didLoadScreenplayProjectsFromBackend = false
            projects = []
            selectedProjectID = ""
            selectedProject = nil
            outline = .empty
            clearFeatureSpineFields()
            syncLiveDraftBridgeProjectContext(clearWhenEmpty: true)
            return
        }
        isLoading = true
        defer { isLoading = false }
        errorText = ""
        infoText = ""
        do {
            let result = try await BackendMemoryAPI.shared.fetchScreenplayProjects(
                limit: 24,
                includeVersions: false,
                includeDrafts: false
            )
            didLoadScreenplayProjectsFromBackend = true
            lastSeenScreenplayStateVersion = result.payload.stateVersion?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            projects = result.payload.screenplayProjects
            let bridgePreferredProjectID = ScreenplayLiveDraftBridge.shared.preferredProjectID
            selectedProjectID = ScreenplayProjectSelectionRestorePolicy.selectedProjectId(
                activeProjectId: result.payload.screenplayActiveProjectId,
                preferredProjectId: bridgePreferredProjectID,
                projects: projects
            )
            await loadSelectedProjectOutline()
            await refreshPendingScreenplayQuestion()
            await resumeQueuedDraftSavesIfNeeded()
        } catch {
            didLoadScreenplayProjectsFromBackend = false
            errorText = error.localizedDescription
            selectedProject = nil
            pendingScreenplayQuestion = nil
            outline = .empty
            clearFeatureSpineFields()
            syncLiveDraftBridgeProjectContext(clearWhenEmpty: true)
        }
    }

    func refresh() async {
        await load()
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

    func selectProject(_ projectID: String) async {
        selectedProjectID = projectID
        clearTransientProjectStateForSelectionChange(to: projectID)
        resetCraftReportForProjectChange()
        await loadSelectedProjectOutline()
        await persistActiveProjectSelection(projectID)
        await refreshPendingScreenplayQuestion()
    }

    func refreshPendingScreenplayQuestion() async {
        guard !IOThemRuntime.isRunningTests else { return }
        let selectedID = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !selectedID.isEmpty else {
            pendingScreenplayQuestion = nil
            return
        }
        do {
            let session = try await BackendMemoryAPI.shared.bootstrapSession(force: true)
            let pending = session.pendingScreenplayQuestion
            let pendingProjectID = pending?.projectId.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let queuedQuestionIDs = await OfflineTalkOutbox.shared
                .pendingScreenplayQuestionResolutionIDs()
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
        let clean = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        applyServerDraft(clean, versionId: latestVersionID, allowOverwriteDirtyLocalDraft: true)
    }

    @discardableResult
    func adoptCommittedPageWriteIfNeeded(_ committedWrite: ScreenplayCommittedWrite) -> Bool {
        guard committedWrite.isAuthoritativeWrite else { return false }
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
        if fountainDraft != committedDraft {
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
        Task {
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
        let normalizedCommittedDraft = committedDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedLocalDraft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedLocalDraft.isEmpty else { return false }
        let committedFingerprint = fingerprint(for: normalizedCommittedDraft)

        latestVersionID = cleanVersionID
        loadedDraftProjectID = cleanProjectID
        lastSavedDraftFingerprint = committedFingerprint
        lastRevisionBaseDraft = normalizedCommittedDraft
        hasUnsavedDraftChanges = fingerprint(for: normalizedLocalDraft) != committedFingerprint
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
        lastManualDraftEditAt = Date()
        let normalized = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        hasUnsavedDraftChanges = fingerprint(for: normalized) != lastSavedDraftFingerprint
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

    func createProject() async {
        let title = newProjectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else {
            errorText = "Enter a project title first."
            return
        }
        let seededDraft = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayProject(
                title: title,
                phase: "scene_draft"
            )
            if let project = result.payload.project {
                upsertProject(project)
                selectedProjectID = project.id
                selectedProject = project
                if !seededDraft.isEmpty {
                    let versionResult = try await BackendMemoryAPI.shared.upsertScreenplayProjectVersion(
                        projectId: project.id,
                        draft: seededDraft,
                        title: project.title,
                        phase: project.lastPhase ?? "scene_draft",
                        notes: "Initial Studio draft",
                        source: "studio_initial_seed",
                        baseVersionId: "",
                        conflictStrategy: "reject_if_stale"
                    )
                    if let nextProject = versionResult.payload.project {
                        upsertProject(nextProject)
                        selectedProject = nextProject
                        selectedProjectID = nextProject.id
                    }
                    let nextVersionId = (versionResult.payload.versionId ?? versionResult.payload.version?.id ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    if !nextVersionId.isEmpty {
                        latestVersionID = nextVersionId
                    }
                    lastSavedDraftFingerprint = fingerprint(for: seededDraft)
                    lastRevisionBaseDraft = seededDraft
                    hasUnsavedDraftChanges = false
                    autosaveStatusText = "Saved now"
                }
            }
            newProjectTitle = ""
            infoText = seededDraft.isEmpty
                ? "Project saved."
                : "Project created with the live Studio draft."
            await loadSelectedProjectOutline()
        } catch {
            errorText = error.localizedDescription
        }
    }

    func pushOutlineSnapshot() async {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }
        isSaving = true
        defer { isSaving = false }
        errorText = ""
        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayOutline(
                projectId: project.id,
                acts: outline.acts,
                scenes: outline.scenes,
                beats: outline.beats,
                merge: true,
                title: project.title
            )
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            }
            infoText = "Outline synced."
        } catch {
            errorText = error.localizedDescription
        }
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
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            }
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
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            }
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
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            }
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
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            }
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
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return
        }

        isSaving = true
        defer { isSaving = false }
        errorText = ""

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

        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayOutline(
                projectId: project.id,
                acts: outline.acts,
                scenes: updatedScenes,
                beats: updatedBeats,
                merge: false,
                title: project.title,
                phase: project.lastPhase
            )
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            } else {
                outline = BackendScreenplayOutline(
                    updatedAt: Date().timeIntervalSince1970 * 1000,
                    actCount: outline.acts.count,
                    sceneCount: updatedScenes.count,
                    beatCount: updatedBeats.count,
                    acts: outline.acts,
                    scenes: updatedScenes,
                    beats: updatedBeats
                )
            }
            if editingBeatID == beat.id {
                cancelEditingBeat()
            }
            infoText = "Beat removed."
        } catch {
            errorText = error.localizedDescription
        }
    }

    private func persistOutlineMutation(
        acts: [BackendScreenplayAct],
        scenes: [BackendScreenplayScene],
        beats: [BackendScreenplayBeat],
        successMessage: String
    ) async -> Bool {
        guard let project = selectedProject else {
            errorText = "Select a project first."
            return false
        }

        isSaving = true
        defer { isSaving = false }
        errorText = ""

        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayOutline(
                projectId: project.id,
                acts: acts,
                scenes: scenes,
                beats: beats,
                merge: false,
                title: project.title,
                phase: project.lastPhase
            )
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            } else {
                outline = BackendScreenplayOutline(
                    updatedAt: Date().timeIntervalSince1970 * 1000,
                    actCount: acts.count,
                    sceneCount: scenes.count,
                    beatCount: beats.count,
                    acts: acts,
                    scenes: scenes,
                    beats: beats
                )
            }
            infoText = successMessage
            return true
        } catch {
            errorText = error.localizedDescription
            return false
        }
    }

    private func rebuiltActsForOutline(from acts: [BackendScreenplayAct], scenes: [BackendScreenplayScene]) -> [BackendScreenplayAct] {
        acts.enumerated().map { index, act in
            let sceneIDs = scenes
                .filter { ($0.actId ?? "") == act.id }
                .sorted { ($0.order ?? Int.max) < ($1.order ?? Int.max) }
                .map(\.id)
            return BackendScreenplayAct(
                id: act.id,
                title: act.title,
                summary: act.summary,
                order: index,
                sceneIds: sceneIDs,
                createdAt: act.createdAt,
                updatedAt: act.updatedAt
            )
        }
    }

    func moveBeat(_ beat: BackendScreenplayBeat, direction: InspectorReorderDirection) async {
        let orderedBeats = outline.beats.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder == rhsOrder { return $0.label < $1.label }
            return lhsOrder < rhsOrder
        }
        guard let sourceIndex = orderedBeats.firstIndex(where: { $0.id == beat.id }) else { return }
        let targetIndex = direction == .up ? sourceIndex - 1 : sourceIndex + 1
        guard orderedBeats.indices.contains(targetIndex) else { return }
        await moveBeat(id: beat.id, before: orderedBeats[targetIndex].id)
    }

    func moveBeat(id beatID: String, before targetBeatID: String?) async {
        let orderedBeats = outline.beats.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder == rhsOrder { return $0.label < $1.label }
            return lhsOrder < rhsOrder
        }
        guard let sourceIndex = orderedBeats.firstIndex(where: { $0.id == beatID }) else { return }

        var reorderedBeats = orderedBeats
        let movingBeat = reorderedBeats.remove(at: sourceIndex)
        let destinationIndex: Int
        if let targetBeatID,
           let targetIndex = reorderedBeats.firstIndex(where: { $0.id == targetBeatID }) {
            destinationIndex = targetIndex
        } else {
            destinationIndex = reorderedBeats.count
        }
        reorderedBeats.insert(movingBeat, at: min(max(0, destinationIndex), reorderedBeats.count))

        let reindexedBeats = reorderedBeats.enumerated().map { index, item in
            BackendScreenplayBeat(
                id: item.id,
                label: item.label,
                summary: item.summary,
                sceneId: item.sceneId,
                actId: item.actId,
                order: index,
                status: item.status,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            )
        }
        let beatOrderByID = Dictionary(reindexedBeats.map { ($0.id, $0.order ?? Int.max) }, uniquingKeysWith: { first, _ in first })
        let updatedScenes = outline.scenes.map { scene in
            let sortedBeatIDs = (scene.beatIds ?? []).sorted { lhs, rhs in
                (beatOrderByID[lhs] ?? Int.max) < (beatOrderByID[rhs] ?? Int.max)
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
                beatIds: sortedBeatIDs,
                createdAt: scene.createdAt,
                updatedAt: scene.updatedAt
            )
        }
        let updatedActs = rebuiltActsForOutline(from: outline.acts, scenes: updatedScenes)
        _ = await persistOutlineMutation(
            acts: updatedActs,
            scenes: updatedScenes,
            beats: reindexedBeats,
            successMessage: "Reordered beats."
        )
    }

    func moveAct(_ act: BackendScreenplayAct, direction: InspectorReorderDirection) async {
        let orderedActs = outline.acts.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder == rhsOrder { return $0.title < $1.title }
            return lhsOrder < rhsOrder
        }
        guard let sourceIndex = orderedActs.firstIndex(where: { $0.id == act.id }) else { return }
        let targetIndex = direction == .up ? sourceIndex - 1 : sourceIndex + 1
        guard orderedActs.indices.contains(targetIndex) else { return }
        await moveAct(id: act.id, before: orderedActs[targetIndex].id)
    }

    func moveAct(id actID: String, before targetActID: String?) async {
        let orderedActs = outline.acts.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder == rhsOrder { return $0.title < $1.title }
            return lhsOrder < rhsOrder
        }
        guard let sourceIndex = orderedActs.firstIndex(where: { $0.id == actID }) else { return }

        var reorderedActs = orderedActs
        let movingAct = reorderedActs.remove(at: sourceIndex)
        let destinationIndex: Int
        if let targetActID,
           let targetIndex = reorderedActs.firstIndex(where: { $0.id == targetActID }) {
            destinationIndex = targetIndex
        } else {
            destinationIndex = reorderedActs.count
        }
        reorderedActs.insert(movingAct, at: min(max(0, destinationIndex), reorderedActs.count))

        let reindexedActs = reorderedActs.enumerated().map { index, item in
            BackendScreenplayAct(
                id: item.id,
                title: item.title,
                summary: item.summary,
                order: index,
                sceneIds: outline.scenes
                    .filter { ($0.actId ?? "") == item.id }
                    .sorted { ($0.order ?? Int.max) < ($1.order ?? Int.max) }
                    .map(\.id),
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            )
        }
        _ = await persistOutlineMutation(
            acts: reindexedActs,
            scenes: outline.scenes,
            beats: outline.beats,
            successMessage: "Reordered outline sections."
        )
    }

    func moveScene(_ scene: BackendScreenplayScene, direction: InspectorReorderDirection) async {
        let orderedScenes = outline.scenes.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder == rhsOrder { return $0.title < $1.title }
            return lhsOrder < rhsOrder
        }
        let normalizedActID = (scene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let groupScenes = orderedScenes.filter {
            ($0.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines) == normalizedActID
        }
        guard let sourceGroupIndex = groupScenes.firstIndex(where: { $0.id == scene.id }) else { return }
        let targetGroupIndex = direction == .up ? sourceGroupIndex - 1 : sourceGroupIndex + 1
        guard groupScenes.indices.contains(targetGroupIndex) else { return }
        await moveScene(id: scene.id, before: groupScenes[targetGroupIndex].id, targetActID: normalizedActID)
    }

    func moveScene(id sceneID: String, before targetSceneID: String?, targetActID: String?) async {
        let orderedScenes = outline.scenes.sorted {
            let lhsOrder = $0.order ?? Int.max
            let rhsOrder = $1.order ?? Int.max
            if lhsOrder == rhsOrder { return $0.title < $1.title }
            return lhsOrder < rhsOrder
        }
        guard let sourceIndex = orderedScenes.firstIndex(where: { $0.id == sceneID }) else { return }

        var reorderedScenes = orderedScenes
        let movingScene = reorderedScenes.remove(at: sourceIndex)
        let resolvedTargetActID = normalizedOrNil(targetActID ?? "")
            ?? targetSceneID.flatMap { targetID in
                reorderedScenes
                    .first(where: { $0.id == targetID })?
                    .actId
                    .flatMap { self.normalizedOrNil($0) }
            }
            ?? normalizedOrNil(movingScene.actId ?? "")

        let movedScene = BackendScreenplayScene(
            id: movingScene.id,
            slugline: movingScene.slugline,
            title: movingScene.title,
            objective: movingScene.objective,
            summary: movingScene.summary,
            actId: resolvedTargetActID,
            order: movingScene.order,
            status: movingScene.status,
            beatIds: movingScene.beatIds,
            createdAt: movingScene.createdAt,
            updatedAt: movingScene.updatedAt
        )

        let destinationIndex: Int
        if let targetSceneID,
           let targetIndex = reorderedScenes.firstIndex(where: { $0.id == targetSceneID }) {
            destinationIndex = targetIndex
        } else {
            destinationIndex = insertionIndexForSceneGroup(
                actID: resolvedTargetActID,
                in: reorderedScenes
            )
        }
        reorderedScenes.insert(movedScene, at: min(max(0, destinationIndex), reorderedScenes.count))

        let reindexedScenes = reorderedScenes.enumerated().map { index, item in
            BackendScreenplayScene(
                id: item.id,
                slugline: item.slugline,
                title: item.title,
                objective: item.objective,
                summary: item.summary,
                actId: item.actId,
                order: index,
                status: item.status,
                beatIds: item.beatIds,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt
            )
        }
        let updatedBeats = outline.beats.map { beat in
            guard beat.sceneId == movedScene.id else { return beat }
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
        let updatedActs = rebuiltActsForOutline(from: outline.acts, scenes: reindexedScenes)
        _ = await persistOutlineMutation(
            acts: updatedActs,
            scenes: reindexedScenes,
            beats: updatedBeats,
            successMessage: "Reordered scenes in the outline."
        )
    }

    private func insertionIndexForSceneGroup(
        actID: String?,
        in scenes: [BackendScreenplayScene]
    ) -> Int {
        if let actID {
            if let lastSceneIndex = scenes.lastIndex(where: { normalizedOrNil($0.actId ?? "") == actID }) {
                return lastSceneIndex + 1
            }
            let orderedActs = outline.acts.sorted {
                let lhsOrder = $0.order ?? Int.max
                let rhsOrder = $1.order ?? Int.max
                if lhsOrder == rhsOrder { return $0.title < $1.title }
                return lhsOrder < rhsOrder
            }
            let targetActIndex = orderedActs.firstIndex(where: { $0.id == actID }) ?? orderedActs.count
            for (index, scene) in scenes.enumerated() {
                guard let sceneActID = normalizedOrNil(scene.actId ?? "") else { continue }
                let sceneActIndex = orderedActs.firstIndex(where: { $0.id == sceneActID }) ?? orderedActs.count
                if sceneActIndex > targetActIndex {
                    return index
                }
            }
            return scenes.count
        }

        if let lastLooseIndex = scenes.lastIndex(where: { normalizedOrNil($0.actId ?? "") == nil }) {
            return lastLooseIndex + 1
        }
        return scenes.count
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
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            }
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
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            }
            infoText = "Promoted \(beat.label) into the goal for \(scene.slugline?.isEmpty == false ? scene.slugline! : scene.title)."
        } catch {
            errorText = error.localizedDescription
        }
    }

    @discardableResult
    func applyDevelopmentReplyToOutline(prompt: String, reply: String) async -> Bool {
        guard let project = selectedProject else {
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

        isSaving = true
        defer { isSaving = false }
        errorText = ""

        do {
            let result = try await BackendMemoryAPI.shared.upsertScreenplayOutline(
                projectId: project.id,
                acts: mergedActsResult.acts,
                scenes: outline.scenes,
                beats: mergedBeats,
                merge: true,
                title: project.title
            )
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            if let nextOutline = result.payload.outline {
                outline = nextOutline
            } else {
                outline = BackendScreenplayOutline(
                    updatedAt: Date().timeIntervalSince1970 * 1000,
                    actCount: mergedActsResult.acts.count,
                    sceneCount: outline.scenes.count,
                    beatCount: mergedBeats.count,
                    acts: mergedActsResult.acts,
                    scenes: outline.scenes,
                    beats: mergedBeats
                )
            }

            var parts: [String] = []
            if addedActCount > 0 {
                parts.append("\(addedActCount) act\(addedActCount == 1 ? "" : "s")")
            }
            if addedBeatCount > 0 {
                parts.append("\(addedBeatCount) beat\(addedBeatCount == 1 ? "" : "s")")
            }
            infoText = "Applied to Outline: " + parts.joined(separator: " and ") + "."
            return true
        } catch {
            errorText = error.localizedDescription
            return false
        }
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
        await saveCurrentDraft(source: "studio_manual")
    }

    #if DEBUG
    func runQueuedSaveNetworkFaultUITest(marker: String, offlineBaseURL: String) async {
        let cleanMarker = marker.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanMarker.isEmpty, selectedProject != nil else { return }
        autosaveEnabled = false
        if !fountainDraft.contains(cleanMarker) {
            let separator = fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? ""
                : "\n\n"
            fountainDraft += separator + cleanMarker
            noteManualDraftEdit()
        }
        UserDefaults.standard.set(offlineBaseURL, forKey: "backend_base_url")
        UserDefaults.standard.synchronize()
        await manualSaveDraft()
    }
    #endif

    func createRevisionSnapshot() async {
        let label = snapshotLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = label.isEmpty ? "Snapshot" : label
        await saveCurrentDraft(source: "studio_snapshot", notes: note)
        snapshotLabel = ""
    }

    func loadSnapshot(_ version: BackendScreenplayVersion) {
        let snapshotDraft = (version.draft ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !snapshotDraft.isEmpty else {
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

    func refreshPagination(source: String = "Draft") async {
        await recomputePagination(for: fountainDraft, source: source)
    }

    func refreshRevisionColor(source: String = "Revision color") async {
        await recomputeRevision(for: fountainDraft, source: source)
    }

    func resetCraftReportForProjectChange(clearFrameworks: Bool = false) {
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
        if clearFrameworks {
            craftFrameworks = []
            selectedCraftFrameworkID = ""
        }
    }

    func noteCraftFrameworkSelectionChanged() {
        let cleanSelected = selectedCraftFrameworkID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let report = craftReport, !cleanSelected.isEmpty, report.framework.id != cleanSelected else { return }
        craftReport = nil
        craftInfoText = "Analyze with the selected framework to update the beat sheet."
    }

    func loadCraftReport(force: Bool = false) async {
        guard !isCraftLoading else { return }
        guard let project = selectedProject else {
            craftReport = nil
            craftErrorText = ""
            craftInfoText = "Select a screenplay project to see craft analysis."
            return
        }
        if !force, craftReport?.projectId == project.id {
            return
        }

        isCraftLoading = true
        defer { isCraftLoading = false }
        craftErrorText = ""
        let source = force ? "Manual check" : "Craft rail"
        let hadExistingReport = craftReport != nil
        do {
            let report = try await StudioCraftResilience.run(source: source) {
                try await ensureCraftFrameworksLoaded()
                return try await craftClient.fetchCraftReport(
                    projectId: project.id,
                    versionId: activeCraftVersionID
                )
            }
            craftReport = report
            if selectedCraftFrameworkID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                selectedCraftFrameworkID = report.framework.id
            }
            await loadAcceptedCraftTwists(projectId: project.id, source: "Craft report")
            craftInfoText = report.generatedAt.map { "Craft report updated at \($0)." } ?? "Craft report loaded."
        } catch BackendError.http(let status, _) where status == 404 {
            craftReport = nil
            craftInfoText = "No craft report exists for this screenplay version yet."
        } catch {
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

        isCraftAnalyzing = true
        defer { isCraftAnalyzing = false }
        craftErrorText = ""
        do {
            try await ensureCraftFrameworksLoaded()
            let report = try await craftClient.analyzeCraft(
                projectId: project.id,
                versionId: activeCraftVersionID,
                frameworkId: normalizedOrNil(selectedCraftFrameworkID),
                screenplay: craftAnalysisScreenplay(for: project)
            )
            craftReport = report
            selectedCraftFrameworkID = report.framework.id
            await loadAcceptedCraftTwists(projectId: project.id, source: "Craft report")
            craftInfoText = report.generatedAt.map { "Craft report updated at \($0)." } ?? "Craft analysis complete."
        } catch {
            craftErrorText = StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "craft analysis"
            )
        }
    }

    func createCraftTurnOverride(_ override: ScreenplayCraftTurnOverrideMutation) async {
        guard !isCraftOverrideSaving else { return }

        isCraftOverrideSaving = true
        defer { isCraftOverrideSaving = false }
        craftErrorText = ""
        do {
            let stored = try await craftClient.recordCraftTurnOverride(override)
            craftInfoText = "Override saved for \(stored.turnId). Run Analyze to rebuild craft coverage."
        } catch {
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
        guard !IOThemRuntime.isRunningTests || allowDuringTests else {
            return
        }

        let refreshTask: Task<CharacterTraitsRefreshResult, Error>
        let refreshID: UUID
        if let activeTask = characterTraitsRefreshTask,
           let activeID = characterTraitsRefreshID {
            refreshTask = activeTask
            refreshID = activeID
        } else {
            let bridge = ScreenplayLiveDraftBridge.shared
            let projectID = bridge.preferredProjectID
            let projectTitle = bridge.projectBinding.projectTitle
            refreshID = UUID()
            refreshTask = Task<CharacterTraitsRefreshResult, Error> {
                var response = try await StudioCraftResilience.run(source: source) {
                    try await self.craftClient.fetchMemoryCharacterTraits(
                        projectID: projectID,
                        projectTitle: projectTitle
                    )
                }
                if ScreenplayCharacterTraitsRefreshPolicy.shouldFallbackToUserLibrary(
                    response: response,
                    projectID: projectID,
                    projectTitle: projectTitle
                ) {
                    response = try await StudioCraftResilience.run(source: source) {
                        try await self.craftClient.fetchMemoryCharacterTraits()
                    }
                }
                let archetypes = try? await StudioCraftResilience.run(source: source, operation: {
                    try await self.craftClient.fetchMemoryCharacterArchetypes()
                })
                return CharacterTraitsRefreshResult(
                    traits: response,
                    archetypes: archetypes
                )
            }
            characterTraitsRefreshTask = refreshTask
            characterTraitsRefreshID = refreshID
            isCharacterTraitsLoading = true
        }

        defer {
            if characterTraitsRefreshID == refreshID {
                characterTraitsRefreshTask = nil
                characterTraitsRefreshID = nil
                isCharacterTraitsLoading = false
            }
        }
        do {
            let result = try await refreshTask.value
            characterTraits = result.traits
            ScreenplayLiveDraftBridge.shared.updateCharacterVoiceMemories(from: result.traits)
            characterArchetypes = result.archetypes
            characterTraitsErrorText = ""
            characterTraitsInfoText = source
        } catch {
            characterTraitsErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "character memory"
            )
            characterTraitsInfoText = StudioCraftResilience.backgroundStatus(
                subject: "character memory",
                hasExistingContent: characterTraits != nil
            )
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
        do {
            let response = try await StudioCraftResilience.run(source: source) {
                try await craftClient.fetchAcceptedCraftTwists(projectId: projectId)
            }
            guard selectedProject?.id == projectId else { return }
            acceptedCraftTwists = response.entries
            acceptedCraftTwistErrorText = ""
            acceptedCraftTwistInfoText = source
        } catch {
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
            acceptedCraftTwistInfoText = "Dismissed \(card.label)."
        } catch {
            acceptedCraftTwists.removeAll { $0.twist.id == card.id }
            acceptedCraftTwistErrorText = StudioCraftResilience.presentedError(
                error,
                source: "Manual check",
                subject: "this reversal"
            )
            acceptedCraftTwistInfoText = "Dismissed locally."
        }
    }

    private struct CraftTwistContext {
        let frameworkId: String
        let beatId: String
        let beatLabel: String
        let sceneSummary: String?
    }

    private func preferredCraftTwistContext() -> CraftTwistContext {
        let selectedFramework = normalizedOrNil(selectedCraftFrameworkID) ?? craftReport?.framework.id ?? "save-the-cat"
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
            selectedCraftFrameworkID = craftFrameworks.first?.id ?? ""
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
        let wordCount = fountainDraft
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .count
        let wordEstimate = max(1, Int((Double(wordCount) / 180.0).rounded()))
        return max(max(1, paginationPages.count), wordEstimate)
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
        guard didLoadScreenplayProjectsFromBackend,
              !isCrossDeviceRefreshInFlight,
              !isLoading,
              !isSaving,
              !isStreamingDraftPreviewActive else {
            return
        }
        isCrossDeviceRefreshInFlight = true
        defer { isCrossDeviceRefreshInFlight = false }

        do {
            let result = try await BackendMemoryAPI.shared.fetchScreenplayProjects(
                limit: 24,
                includeVersions: false,
                includeDrafts: false
            )
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
            await refreshPendingScreenplayQuestion()
        } catch {
            // Background continuity refreshes stay quiet; explicit refresh still reports errors.
        }
    }

    private func loadSelectedProjectOutline(
        reportErrors: Bool = true,
        remoteRefresh: Bool = false
    ) async {
        let id = selectedProjectID.trimmingCharacters(in: .whitespacesAndNewlines)
        clearTransientProjectStateForSelectionChange(to: id)
        guard !id.isEmpty else {
            selectedProject = nil
            outline = .empty
            reconcileSceneSessionState(with: outline)
            resetCraftReportForProjectChange()
            applyServerDraft("", versionId: "", allowOverwriteDirtyLocalDraft: true)
            collaborators = []
            approvedEmails = []
            comments = []
            recoveryCandidate = nil
            conflictState = nil
            clearFeatureSpineFields()
            syncLiveDraftBridgeProjectContext(clearWhenEmpty: true)
            return
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
            if let project = detailResult.payload.project {
                selectedProject = project
                selectedProjectID = project.id
                upsertProject(project)
                hydrateDraft(from: project)
                hydrateCollaboration(from: project)
            } else if let project = outlineResult?.payload.project {
                selectedProject = project
                selectedProjectID = project.id
                upsertProject(project)
                hydrateDraft(from: project)
                hydrateCollaboration(from: project)
            } else {
                selectedProject = projects.first(where: { $0.id == id })
            }
            outline = outlineResult?.payload.outline ?? detailResult.payload.project?.outline ?? .empty
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
        } catch {
            clearTransientProjectStateForSelectionChange(to: id)
            selectedProject = projects.first(where: { $0.id == id })
            outline = .empty
            reconcileSceneSessionState(with: outline)
            if reportErrors {
                errorText = error.localizedDescription
            }
            if selectedProject == nil {
                clearFeatureSpineFields()
            }
            syncLiveDraftBridgeProjectContext()
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

    private func hydrateDraft(from project: BackendScreenplayProjectSummary) {
        let selectedVersion = ScreenplayProjectDraftRestorePolicy.preferredVersion(in: project)
        let nextDraft = (selectedVersion?.draft ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
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

    private func applyServerDraft(
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
            evaluateLocalDraftRecovery(
                projectId: selectedProjectID,
                serverDraft: draft
            )
            return
        }

        isHydratingDraft = true
        fountainDraft = draft
        latestVersionID = versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        isHydratingDraft = false
        loadedDraftProjectID = normalizedProjectID
        isManualDraftEditing = false
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

    private func handleDraftDebouncedChange(_ draft: String) async {
        guard !isHydratingDraft else { return }
        let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let currentFingerprint = fingerprint(for: normalized)
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
        await recomputeRevision(for: draft, source: "Draft")
        Task { await self.refreshFormatLint(source: "Draft") }

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
                .trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    func refreshDraftSaveOutboxStatus() async {
        let ownerUserId = BackendAuthClient.currentAuthSessionState().user?.userId
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let snapshot = await draftSaveOutbox.snapshot(ownerUserId: ownerUserId)
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
        guard !projectId.isEmpty else {
            await refreshDraftSaveOutboxStatus()
            return
        }
        let ownerUserId = BackendAuthClient.currentAuthSessionState().user?.userId
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        isDraftSaveInFlight = true
        defer { isDraftSaveInFlight = false }
        var completedCount = 0
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
            let didSave = await performDraftSave(DraftSaveRequest(entry: entry))
            guard didSave else { break }
            completedCount += 1
        }
        await refreshDraftSaveOutboxStatus()
    }

    func reconnectAndResumeQueuedDraftSaves() async {
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
                errorText = "Your draft is preserved locally, but its retry could not be queued: \(error.localizedDescription)"
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
            let didSave = await performDraftSave(activeRequest)
            guard didSave else {
                let queuedRequest = pendingDraftSaveRequest
                pendingDraftSaveRequest = nil
                if shouldQueuePendingDraftSaveAfterFailure,
                   let queuedRequest {
                    do {
                        try await draftSaveOutbox.enqueue(queuedRequest.outboxEntry)
                    } catch {
                        errorText = "Your newest local draft is preserved, but its retry could not be queued: \(error.localizedDescription)"
                    }
                }
                return
            }
            if let queuedRequest = pendingDraftSaveRequest {
                if ScreenplayDraftSaveCoalescingPolicy.shouldCoalesce(
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
                    nextRequest = queuedRequest.rebased(on: latestVersionID)
                }
                continue
            }

            let currentDraft = fountainDraft
            guard ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
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

    private func performDraftSave(_ request: DraftSaveRequest) async -> Bool {
        let normalized = request.draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            autosaveStatusText = "Draft empty"
            return false
        }

        #if DEBUG
        if IOThemRuntime.isRunningUITests,
           request.source == "studio_conflict_resolve",
           ProcessInfo.processInfo.arguments.contains("--ui-conflict-save-success") {
            latestVersionID = "ui-local-version"
            lastSavedDraftFingerprint = fingerprint(for: normalized)
            lastRevisionBaseDraft = normalized
            hasUnsavedDraftChanges = false
            isManualDraftEditing = false
            lastManualDraftEditAt = .distantPast
            loadedDraftProjectID = request.projectId
            autosaveStatusText = "Autosaved"
            errorText = ""
            infoText = "Local draft saved."
            clearLocalDraftRecovery(projectId: request.projectId)
            return true
        }
        #endif

        shouldQueuePendingDraftSaveAfterFailure = false
        do {
            try await draftSaveOutbox.enqueue(request.outboxEntry)
            try await draftSaveOutbox.markInflight(id: request.id)
        } catch {
            hasUnsavedDraftChanges = true
            persistRecoveryForUnconfirmedSave(
                projectId: request.projectId,
                draft: fountainDraft,
                baseVersionId: request.baseVersionId
            )
            autosaveStatusText = "Saved locally"
            infoText = "Your draft is preserved on this device."
            errorText = "The local save queue could not be secured: \(error.localizedDescription)"
            return false
        }

        isSaving = true
        defer { isSaving = false }
        do {
            let ownerHeaders = projectOwnerHeaderOptions(forProjectID: request.projectId)
            let baseVersionId = request.baseVersionId
            let result: BackendReadResult<BackendScreenplayVersionMutationResponse>
            do {
                result = try await BackendMemoryAPI.shared.upsertScreenplayProjectVersion(
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
                    includeUserIdentity: ownerHeaders.includeUserIdentity,
                    includeAuthToken: ownerHeaders.includeAuthToken,
                    clientTokenOverride: ownerHeaders.clientTokenOverride
                )
            } catch BackendMemoryAPIError.server(let status, _)
                        where ownerHeaders.usesDebugClientTokenOwner && status == 404 {
                result = try await BackendMemoryAPI.shared.upsertScreenplayProjectVersion(
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
                    clientRequestId: request.id
                )
            }
            let conflictDetected = (result.payload.conflict ?? false)
                || (result.payload.status?.localizedCaseInsensitiveContains("conflict") ?? false)
            if conflictDetected {
                let baseVersionId = (result.payload.baseVersionId ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let serverVersionId = (result.payload.serverVersionId ?? "")
                    .trimmingCharacters(in: .whitespacesAndNewlines)
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
                try? await draftSaveOutbox.removeAll(
                    projectId: request.projectId,
                    ownerUserId: request.ownerUserId
                )
                return false
            }
            conflictState = nil
            if let nextProject = result.payload.project {
                upsertProject(nextProject)
                selectedProject = nextProject
                selectedProjectID = nextProject.id
            }
            let nextVersionId = (result.payload.versionId ?? result.payload.version?.id ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard !nextVersionId.isEmpty else {
                throw BackendMemoryAPIError.invalidResponse
            }
            try? await draftSaveOutbox.markSucceeded(
                id: request.id,
                serverVersionId: nextVersionId
            )
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
            lastSavedDraftFingerprint = fingerprint(for: normalized)
            lastRevisionBaseDraft = normalized
            hasUnsavedDraftChanges = ScreenplayDraftSaveCompletionPolicy.hasUnsavedChanges(
                currentDraft: fountainDraft,
                savedDraft: request.draft
            )
            if !hasUnsavedDraftChanges {
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
            }
            persistLocalDraftRecovery(
                projectId: request.projectId,
                draft: fountainDraft,
                baseVersionId: latestVersionID,
                dirty: hasUnsavedDraftChanges
            )
            await recomputeRevision(for: fountainDraft, source: request.source)
            if !errorText.isEmpty {
                errorText = ""
            }
            return true
        } catch {
            hasUnsavedDraftChanges = true
            persistRecoveryForUnconfirmedSave(
                projectId: request.projectId,
                draft: fountainDraft,
                baseVersionId: request.baseVersionId
            )
            if ScreenplayDraftSaveRetryPolicy.shouldRetry(error) {
                shouldQueuePendingDraftSaveAfterFailure = true
                try? await draftSaveOutbox.markRetryable(
                    id: request.id,
                    error: error.localizedDescription
                )
                autosaveStatusText = "Queued locally - reconnecting"
                infoText = "Your draft is safe on this device and will save when the connection returns."
                errorText = ""
            } else {
                try? await draftSaveOutbox.markParked(
                    id: request.id,
                    error: error.localizedDescription
                )
                autosaveStatusText = ScreenplayDraftSaveRecoveryPresentationPolicy.failureStatus(source: request.source)
                infoText = ScreenplayDraftSaveRecoveryPresentationPolicy.recoveryInfo(source: request.source)
                errorText = ScreenplayDraftSaveRecoveryPresentationPolicy.failureError(
                    source: request.source,
                    underlying: error.localizedDescription
                )
            }
            await refreshDraftSaveOutboxStatus()
            return false
        }
    }

    private func recomputePagination(for draft: String, source: String) async {
        let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            paginationPages = []
            paginationErrorText = ""
            return
        }

        isPaginationRefreshing = true
        defer { isPaginationRefreshing = false }
        do {
            let result = try await StudioCraftResilience.run(source: source) {
                try await BackendMemoryAPI.shared.paginateScreenplayDraft(
                    draft: draft,
                    title: selectedProject?.title ?? "",
                    phase: selectedProject?.lastPhase ?? "scene_draft",
                    linesPerPage: linesPerPage
                )
            }
            guard normalized == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            paginationPages = result.payload.pages
            paginationErrorText = ""
        } catch {
            paginationErrorText = StudioCraftResilience.presentedError(
                error,
                source: source,
                subject: "page layout"
            )
        }
    }

    private func recomputeRevision(for draft: String, source: String) async {
        let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            revisionSummary = nil
            revisionRanges = []
            revisionErrorText = ""
            return
        }

        isRevisionRefreshing = true
        defer { isRevisionRefreshing = false }
        do {
            let result = try await StudioCraftResilience.run(source: source) {
                try await BackendMemoryAPI.shared.fetchScreenplayRevisionColors(
                    baseDraft: lastRevisionBaseDraft,
                    draft: draft,
                    revisionColor: revisionColor
                )
            }
            guard normalized == fountainDraft.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
            revisionSummary = result.payload.summary
            revisionRanges = result.payload.ranges
            revisionErrorText = ""
        } catch {
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

    private func syncLiveDraftBridgeProjectContext(clearWhenEmpty: Bool = false) {
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
            savedAt: snapshot.savedAt
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
            projectId: normalizedProjectId,
            draft: draft,
            baseVersionId: baseVersionId,
            dirty: dirty,
            savedAt: savedAt
        )
        if !dirty {
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
            savedAt: savedAt
        )
        if surfaceCandidate {
            recoveryCandidate = candidate
        }
        return candidate
    }

    private func clearLocalDraftRecovery(projectId: String) {
        let normalizedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProjectId.isEmpty else { return }
        localDraftRecoveryStore.clear(projectId: normalizedProjectId)
        if recoveryCandidate?.projectId == normalizedProjectId {
            recoveryCandidate = nil
        }
    }

    private func draftRecoveryPayloads() -> [String: [String: Any]] {
        localDraftRecoveryStore.payloads()
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
