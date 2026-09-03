import Combine
import Foundation
import os
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

// T-live-draft-sync — client side of the live typing channel.
//
// Mirrors the Studio editor text into `/screenplay/projects/:id/live/*` as
// UTF-16 ops and applies ops from the user's other devices back into the
// editor, so typing on the Mac shows up on the iPhone while it is typed.
// The authoritative save is untouched: the leader device still autosaves
// through `/version`, then announces the version id so followers adopt it
// without saving a duplicate.
//
// Guiding rule: never lose a writer's words. Concurrent edits that do not
// overlap are merged on both sides; only a genuine overlap falls back to the
// channel's text, and the local recovery store still holds what was typed.

// MARK: - Wire model

nonisolated struct LiveDraftOp: Codable, Equatable, Sendable {
    let start: Int
    let deleteCount: Int
    let insert: String

    enum CodingKeys: String, CodingKey {
        case start
        case deleteCount = "delete_count"
        case insert
    }

    init(start: Int, deleteCount: Int, insert: String) {
        self.start = start
        self.deleteCount = deleteCount
        self.insert = insert
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        start = try container.decode(Int.self, forKey: .start)
        deleteCount = try container.decodeIfPresent(Int.self, forKey: .deleteCount) ?? 0
        insert = try container.decodeIfPresent(String.self, forKey: .insert) ?? ""
    }

    /// Exclusive end of the replaced range in the base text.
    var end: Int { start + deleteCount }
    /// Where the caret sits after this op is applied.
    var caret: Int { start + insert.utf16.count }
    var lengthDelta: Int { insert.utf16.count - deleteCount }
}

/// Text helpers shared with `backend/lib/live_draft_hub.js`. Both sides work
/// in UTF-16 code units (JS strings, Swift `String.utf16`) so an op built on
/// one device applies identically on the other.
nonisolated enum LiveDraftText {
    /// FNV-1a 32-bit over UTF-16 code units, 8 lowercase hex chars.
    static func checksum(_ text: String) -> String {
        var hash: UInt32 = 0x811c_9dc5
        for unit in text.utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 0x0100_0193
        }
        return String(format: "%08x", hash)
    }

    /// Common-prefix / common-suffix diff. Never splits a surrogate pair so
    /// the inserted fragment is always a valid `String`.
    static func diff(from previous: String, to next: String) -> LiveDraftOp? {
        guard previous != next else { return nil }
        let a = Array(previous.utf16)
        let b = Array(next.utf16)
        var prefix = 0
        let maxPrefix = min(a.count, b.count)
        while prefix < maxPrefix, a[prefix] == b[prefix] {
            prefix += 1
        }
        if prefix > 0, UTF16.isLeadSurrogate(a[prefix - 1]) {
            prefix -= 1
        }
        var suffix = 0
        let maxSuffix = maxPrefix - prefix
        while suffix < maxSuffix, a[a.count - 1 - suffix] == b[b.count - 1 - suffix] {
            suffix += 1
        }
        if suffix > 0, UTF16.isTrailSurrogate(a[a.count - suffix]) {
            suffix -= 1
        }
        let insert = String(decoding: b[prefix..<(b.count - suffix)], as: UTF16.self)
        return LiveDraftOp(start: prefix, deleteCount: a.count - prefix - suffix, insert: insert)
    }

    static func apply(_ op: LiveDraftOp, to text: String) -> String? {
        guard op.start >= 0, op.deleteCount >= 0 else { return nil }
        var units = Array(text.utf16)
        guard op.start <= units.count, op.end <= units.count else { return nil }
        units.replaceSubrange(op.start..<op.end, with: Array(op.insert.utf16))
        return String(decoding: units, as: UTF16.self)
    }

    /// Re-applies a local edit on top of text another device produced from
    /// the same base. Returns nil when the two edits overlap — then there is
    /// no honest automatic merge and the caller must pick a side.
    static func rebase(localOp: LiveDraftOp, base: String, remoteText: String) -> String? {
        guard let remoteOp = diff(from: base, to: remoteText) else {
            return apply(localOp, to: remoteText)
        }
        let bothInsertAtSameSpot = localOp.start == remoteOp.start
            && localOp.deleteCount == 0
            && remoteOp.deleteCount == 0
        if localOp.end <= remoteOp.start, !bothInsertAtSameSpot {
            // Local edit sits entirely before the remote one: positions hold.
            return apply(localOp, to: remoteText)
        }
        if localOp.start >= remoteOp.end {
            // Local edit sits after the remote one: shift by the remote delta.
            // Two inserts at the same spot land remote-first, local-second, so
            // both devices see the same order.
            let shifted = LiveDraftOp(
                start: localOp.start + remoteOp.lengthDelta,
                deleteCount: localOp.deleteCount,
                insert: localOp.insert
            )
            return apply(shifted, to: remoteText)
        }
        return nil
    }

    /// 1-based line number containing the given UTF-16 offset.
    static func lineNumber(atUTF16Offset offset: Int, in text: String) -> Int {
        guard offset > 0 else { return 1 }
        var line = 1
        var index = 0
        for unit in text.utf16 {
            if index >= offset { break }
            if unit == 0x0A { line += 1 }
            index += 1
        }
        return line
    }
}

nonisolated struct LiveDraftServerEvent: Equatable, Sendable {
    let name: String
    let data: String
    let id: String?
}

/// Incremental `text/event-stream` parser. Fed raw bytes; emits one event per
/// blank-line-terminated block. Comments (`: ping`) are ignored, `data:`
/// lines are joined with `\n`, CRLF is tolerated.
nonisolated struct LiveDraftSSEParser: Sendable {
    private var lineBuffer: [UInt8] = []
    private var pendingName = ""
    private var pendingData: [String] = []
    private var pendingID: String?

    init() {}

    mutating func feed(_ byte: UInt8) -> LiveDraftServerEvent? {
        if byte == 0x0A {
            let line = String(decoding: lineBuffer, as: UTF8.self)
            lineBuffer.removeAll(keepingCapacity: true)
            return feed(line: line)
        }
        lineBuffer.append(byte)
        return nil
    }

    mutating func feed<S: Sequence>(_ bytes: S) -> [LiveDraftServerEvent] where S.Element == UInt8 {
        var events: [LiveDraftServerEvent] = []
        for byte in bytes {
            if let event = feed(byte) {
                events.append(event)
            }
        }
        return events
    }

    mutating func feed(line rawLine: String) -> LiveDraftServerEvent? {
        let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
        if line.isEmpty {
            return flush()
        }
        if line.hasPrefix(":") {
            return nil
        }
        let field: Substring
        let value: Substring
        if let colon = line.firstIndex(of: ":") {
            field = line[..<colon]
            var rest = line[line.index(after: colon)...]
            if rest.hasPrefix(" ") { rest = rest.dropFirst() }
            value = rest
        } else {
            field = line[...]
            value = ""
        }
        switch field {
        case "event":
            pendingName = String(value)
        case "data":
            pendingData.append(String(value))
        case "id":
            pendingID = String(value)
        default:
            break
        }
        return nil
    }

    private mutating func flush() -> LiveDraftServerEvent? {
        defer {
            pendingName = ""
            pendingData = []
            pendingID = nil
        }
        guard !pendingData.isEmpty else { return nil }
        return LiveDraftServerEvent(
            name: pendingName.isEmpty ? "message" : pendingName,
            data: pendingData.joined(separator: "\n"),
            id: pendingID
        )
    }
}

nonisolated struct LiveDraftHelloPayload: Decodable, Equatable, Sendable {
    let seq: Int
    let checksum: String
    let versionId: String?
    let seeded: Bool?
    let deviceId: String?
    let text: String?

    enum CodingKeys: String, CodingKey {
        case seq, checksum, seeded, text
        case versionId = "version_id"
        case deviceId = "device_id"
    }
}

nonisolated struct LiveDraftOpPayload: Decodable, Equatable, Sendable {
    let seq: Int
    let deviceId: String
    let op: LiveDraftOp
    let checksum: String
    let cursor: Int?

    enum CodingKeys: String, CodingKey {
        case seq, op, checksum, cursor
        case deviceId = "device_id"
    }
}

nonisolated struct LiveDraftSnapshotPayload: Decodable, Equatable, Sendable {
    let seq: Int
    let deviceId: String?
    let text: String
    let checksum: String
    let versionId: String?

    enum CodingKeys: String, CodingKey {
        case seq, text, checksum
        case deviceId = "device_id"
        case versionId = "version_id"
    }
}

nonisolated struct LiveDraftVersionPayload: Decodable, Equatable, Sendable {
    let seq: Int
    let deviceId: String
    let versionId: String
    let checksum: String

    enum CodingKeys: String, CodingKey {
        case seq, checksum
        case deviceId = "device_id"
        case versionId = "version_id"
    }
}

nonisolated struct LiveDraftPresencePayload: Decodable, Equatable, Sendable {
    let devices: [String]
}

nonisolated enum LiveDraftPublishResult: Equatable, Sendable {
    case applied(seq: Int, checksum: String)
    /// Server mirror moved under us; carries the full text for a resync.
    case conflict(seq: Int, checksum: String, text: String)
    case rateLimited
    case rejected(status: Int, reason: String)
}

nonisolated enum LiveDraftTransportError: Error, Equatable, Sendable {
    case invalidResponse
    case http(Int)
    case notConfigured
    /// No bytes (events or `: ping` comments) for `streamIdleTimeout`.
    case idleTimeout
}

nonisolated protocol LiveDraftTransport: Sendable {
    func openStream(projectID: String, deviceID: String, checksum: String) -> AsyncThrowingStream<LiveDraftServerEvent, Error>
    func fetchSnapshot(projectID: String) async throws -> LiveDraftSnapshotPayload
    func postOp(
        projectID: String,
        deviceID: String,
        baseSeq: Int,
        baseChecksum: String,
        op: LiveDraftOp,
        checksum: String,
        cursor: Int?
    ) async throws -> LiveDraftPublishResult
    func postSnapshot(projectID: String, deviceID: String, text: String, versionID: String) async throws -> LiveDraftPublishResult
    func postVersion(projectID: String, deviceID: String, versionID: String, checksum: String) async throws -> LiveDraftPublishResult
}

// MARK: - Policy

nonisolated enum LiveDraftDeviceIdentity {
    static let defaultsKey = "studio_live_draft_device_id_v1"

    static func platformPrefix() -> String {
        #if os(macOS)
        return "mac"
        #elseif os(iOS)
        return "ios"
        #else
        return "apple"
        #endif
    }

    /// Stable per-install id. Lets a device drop the echo of its own ops and
    /// lets the server report presence without exposing anything personal.
    static func current(defaults: UserDefaults = .standard) -> String {
        let existing = (defaults.string(forKey: defaultsKey) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if isValid(existing) { return existing }
        let fresh = "\(platformPrefix())-\(UUID().uuidString.lowercased())"
        defaults.set(fresh, forKey: defaultsKey)
        return fresh
    }

    static func isValid(_ value: String) -> Bool {
        guard !value.isEmpty, value.count <= 96 else { return false }
        return value.allSatisfy { $0.isLetter || $0.isNumber || "._:-".contains($0) }
    }

    /// Writer-facing name for the device an edit came from.
    static func displayLabel(for deviceID: String) -> String {
        let clean = deviceID.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if clean.hasPrefix("mac-") { return "your Mac" }
        if clean.hasPrefix("ios-") { return "your iPhone" }
        return "another device"
    }
}

nonisolated enum LiveDraftSyncPolicy {
    /// Keystrokes inside this window collapse into one op on the wire.
    static let publishCoalesceInterval: TimeInterval = 0.05
    static let publishRetryInterval: TimeInterval = 0.4
    static let reconnectDelays: [TimeInterval] = [1, 2, 4, 8, 15, 30]
    /// The server pings every 15 s; three missed pings means the socket is dead.
    static let streamIdleTimeout: TimeInterval = 45
    /// A project the backend does not know yet (never saved) is re-checked slowly.
    static let projectMissingRetryDelay: TimeInterval = 60
    /// Scroll the follower to the writer's line at most this often.
    static let remoteLineRevealInterval: TimeInterval = 0.4
    /// If the typing device never announces a saved version, the follower
    /// resumes its own autosave after this long so the words are persisted.
    static let followFallbackInterval: TimeInterval = 30

    static func reconnectDelay(attempt: Int) -> TimeInterval {
        guard attempt >= 0 else { return reconnectDelays[0] }
        return reconnectDelays[min(attempt, reconnectDelays.count - 1)]
    }

    static func shouldRun(isEnabled: Bool, isAuthenticated: Bool, projectID: String) -> Bool {
        isEnabled && isAuthenticated && !projectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static let automationOptInEnvironmentKey = "THEM_LIVE_DRAFT_SYNC"

    /// Whether the service runs at all in this process. Off in unit tests and
    /// under UI automation (`--ui-testing`, `--studio-eval`) unless a smoke
    /// opts in with `THEM_LIVE_DRAFT_SYNC=1`, so the required writer-loop gate
    /// measures the writer loop, not this channel's network timing.
    static func isEnabledForProcess(
        arguments: [String],
        environment: [String: String],
        isRunningTests: Bool
    ) -> Bool {
        if isRunningTests { return false }
        let optIn = (environment[automationOptInEnvironmentKey] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if optIn == "1" || optIn.lowercased() == "true" { return true }
        if IOThemRuntime.isStudioAutomationArguments(arguments) || IOThemRuntime.isStudioEvalArguments(arguments) {
            return false
        }
        return true
    }

    enum HelloResolution: Equatable {
        /// Channel and editor already agree.
        case inSync
        /// Channel text is newer; reconcile the editor onto it.
        case adoptRemote
        /// Editor text is at least as fresh; publish it as the channel mirror.
        case pushLocal
    }

    /// Decide who wins when a stream (re)connects.
    ///
    /// - `remoteText == nil` means the server saw our checksum and skipped
    ///   the payload: in sync.
    /// - A freshly seeded channel only knows the last saved version; a
    ///   non-empty editor is at least that fresh, so it becomes the mirror.
    /// - A channel that has not moved since we last agreed (`lastAgreedSeq`)
    ///   cannot be newer than local edits made while offline.
    /// - Otherwise another device typed; the channel is adopted, and
    ///   non-overlapping local edits are rebased onto it.
    static func resolveHello(
        localText: String,
        remoteText: String?,
        remoteSeq: Int,
        remoteSeeded: Bool,
        lastAgreedSeq: Int?
    ) -> HelloResolution {
        guard let remoteText else { return .inSync }
        if remoteText == localText { return .inSync }
        if remoteSeeded, !localText.isEmpty { return .pushLocal }
        if let lastAgreedSeq, lastAgreedSeq == remoteSeq, !localText.isEmpty { return .pushLocal }
        return .adoptRemote
    }
}

enum LiveDraftSyncStatus: Equatable {
    case idle
    case connecting
    case live(peerCount: Int)
    case offline(reason: String)

    var isLive: Bool {
        if case .live = self { return true }
        return false
    }
}

// MARK: - Editor binding

/// What the sync service needs from the Studio editor. `ScreenplayStudioViewModel`
/// conforms below; tests use a fake.
@MainActor
protocol LiveDraftEditorBinding: AnyObject {
    var liveDraftProjectID: String { get }
    var liveDraftText: String { get }
    var liveDraftLatestVersionID: String { get }
    var liveDraftProjectIDPublisher: AnyPublisher<String, Never> { get }
    var liveDraftTextPublisher: AnyPublisher<String, Never> { get }
    @discardableResult
    func applyRemoteLiveDraft(_ text: String, projectID: String, sourceDeviceID: String) -> Bool
    func adoptRemoteLiveVersion(_ versionID: String, projectID: String, draftChecksum: String)
    /// Bring the line another device is typing on into view.
    func revealRemoteEditLine(_ line: Int)
}

extension ScreenplayStudioViewModel: LiveDraftEditorBinding {
    var liveDraftProjectID: String { selectedProjectID }
    var liveDraftText: String { fountainDraft }
    var liveDraftLatestVersionID: String { latestVersionID }
    var liveDraftProjectIDPublisher: AnyPublisher<String, Never> {
        $selectedProjectID.eraseToAnyPublisher()
    }
    var liveDraftTextPublisher: AnyPublisher<String, Never> {
        $fountainDraft.eraseToAnyPublisher()
    }

    func revealRemoteEditLine(_ line: Int) {
        ScreenplayLiveDraftBridge.shared.jumpToLine(line)
    }
}

// MARK: - Service

@MainActor
final class ScreenplayLiveDraftSyncService: ObservableObject {
    static let shared = ScreenplayLiveDraftSyncService()

    @Published private(set) var status: LiveDraftSyncStatus = .idle
    @Published private(set) var peerDeviceIDs: [String] = []

    let deviceID: String
    private let transport: any LiveDraftTransport
    private let isEnabled: Bool
    private let isAuthenticated: () -> Bool
    private let logger = Logger(subsystem: HerLog.subsystem, category: "live-draft")

    private weak var editor: (any LiveDraftEditorBinding)?
    private var cancellables: Set<AnyCancellable> = []
    private var streamTask: Task<Void, Never>?
    private var publishTask: Task<Void, Never>?
    private var resyncTask: Task<Void, Never>?

    private var activeProjectID = ""
    /// Last text the channel and this device agreed on.
    private var mirrorText = ""
    private var mirrorSeq: Int?
    private var mirrorChecksum = ""
    private var isApplyingRemote = false
    private var isPublishInFlight = false
    private var isConnected = false
    private var reconnectAttempt = 0
    private var pendingVersionAnnouncement: (versionID: String, checksum: String)?
    private var lastRemoteLineRevealAt: Date = .distantPast
    private var lastObservedSignedInFlag: Bool?

    init(
        transport: any LiveDraftTransport = LiveDraftBackendTransport(),
        deviceID: String = LiveDraftDeviceIdentity.current(),
        isEnabled: Bool = LiveDraftSyncPolicy.isEnabledForProcess(
            arguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment,
            isRunningTests: IOThemRuntime.isRunningTests
        ),
        isAuthenticated: @escaping () -> Bool = { BackendAuthClient.currentAuthSessionState().isAuthenticated }
    ) {
        self.transport = transport
        self.deviceID = deviceID
        self.isEnabled = isEnabled
        self.isAuthenticated = isAuthenticated
        observeAppState()
    }

    // MARK: Lifecycle

    func attach(to editor: any LiveDraftEditorBinding) {
        guard isEnabled else { return }
        detach()
        self.editor = editor
        editor.liveDraftProjectIDPublisher
            .removeDuplicates()
            .sink { [weak self] projectID in
                Task { @MainActor [weak self] in
                    self?.projectDidChange(projectID)
                }
            }
            .store(in: &cancellables)
        editor.liveDraftTextPublisher
            .removeDuplicates()
            .sink { [weak self] text in
                Task { @MainActor [weak self] in
                    self?.localTextDidChange(text)
                }
            }
            .store(in: &cancellables)
        projectDidChange(editor.liveDraftProjectID)
    }

    func detach() {
        cancellables.removeAll()
        stopStream()
        editor = nil
        activeProjectID = ""
        resetMirror()
        status = .idle
        peerDeviceIDs = []
        observeAppState()
    }

    /// Reconnect immediately (app returned to foreground, auth changed).
    func retryNow() {
        guard isEnabled, !activeProjectID.isEmpty else { return }
        reconnectAttempt = 0
        startStream()
    }

    /// Start a stream that never started (signed out at selection time) once
    /// the preconditions hold. Cheap enough to call on any auth-state change.
    func reevaluateIfIdle() {
        guard streamTask == nil, editor != nil else { return }
        guard LiveDraftSyncPolicy.shouldRun(isEnabled: isEnabled, isAuthenticated: isAuthenticated(), projectID: activeProjectID) else { return }
        reconnectAttempt = 0
        startStream()
    }

    /// Called by the editor after `/version` accepted a save so followers
    /// adopt the version id instead of saving the same text again.
    func announceSavedVersion(projectID: String, versionID: String, draft: String) {
        let cleanProject = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanVersion = versionID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isEnabled, !cleanVersion.isEmpty, cleanProject == activeProjectID else { return }
        pendingVersionAnnouncement = (cleanVersion, LiveDraftText.checksum(draft))
        flushVersionAnnouncementIfPossible()
    }

    // MARK: Project + text observation

    private func projectDidChange(_ projectID: String) {
        let clean = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean != activeProjectID else { return }
        stopStream()
        resetMirror()
        activeProjectID = clean
        peerDeviceIDs = []
        guard LiveDraftSyncPolicy.shouldRun(isEnabled: isEnabled, isAuthenticated: isAuthenticated(), projectID: clean) else {
            status = .idle
            return
        }
        reconnectAttempt = 0
        startStream()
    }

    private func localTextDidChange(_ text: String) {
        guard !isApplyingRemote, isConnected, text != mirrorText else { return }
        schedulePublish(after: LiveDraftSyncPolicy.publishCoalesceInterval)
    }

    private func resetMirror() {
        mirrorText = ""
        mirrorSeq = nil
        mirrorChecksum = ""
        pendingVersionAnnouncement = nil
        publishTask?.cancel()
        publishTask = nil
        resyncTask?.cancel()
        resyncTask = nil
        isPublishInFlight = false
    }

    // MARK: Stream

    private func startStream() {
        stopStream()
        let projectID = activeProjectID
        guard !projectID.isEmpty else { return }
        streamTask = Task { [weak self] in
            await self?.runStreamLoop(projectID: projectID)
        }
    }

    private func stopStream() {
        streamTask?.cancel()
        streamTask = nil
        isConnected = false
    }

    private func runStreamLoop(projectID: String) async {
        while !Task.isCancelled, projectID == activeProjectID {
            status = .connecting
            let checksum = LiveDraftText.checksum(editor?.liveDraftText ?? "")
            let stream = transport.openStream(projectID: projectID, deviceID: deviceID, checksum: checksum)
            var delay = LiveDraftSyncPolicy.reconnectDelay(attempt: reconnectAttempt)
            do {
                for try await event in stream {
                    guard !Task.isCancelled, projectID == activeProjectID else { return }
                    handle(event, projectID: projectID)
                }
                logger.info("live draft stream ended; reconnecting")
            } catch let error as LiveDraftTransportError {
                switch error {
                case .http(401):
                    if await refreshAuthIfPossible() {
                        logger.info("live draft stream refreshed auth; reconnecting")
                    }
                case .http(404):
                    // Project not on this backend yet (created locally, not
                    // saved). Check back slowly instead of hammering.
                    delay = LiveDraftSyncPolicy.projectMissingRetryDelay
                case .idleTimeout:
                    logger.info("live draft stream went quiet; reconnecting")
                    delay = 0
                default:
                    logger.warning("live draft stream failed: \(String(describing: error), privacy: .public)")
                }
            } catch {
                if Task.isCancelled { return }
                logger.warning("live draft stream failed: \(error.localizedDescription, privacy: .public)")
            }
            isConnected = false
            guard !Task.isCancelled, projectID == activeProjectID else { return }
            status = .offline(reason: "reconnecting")
            reconnectAttempt += 1
            if delay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            }
        }
    }

    private func refreshAuthIfPossible() async -> Bool {
        guard BackendAuthClient.currentAuthSessionState().refreshTokenPresent else { return false }
        do {
            return try await BackendAuthClient.refreshAuthSession(force: true).isAuthenticated
        } catch {
            return false
        }
    }

    private func handle(_ event: LiveDraftServerEvent, projectID: String) {
        let decoder = JSONDecoder()
        let data = Data(event.data.utf8)
        switch event.name {
        case "hello":
            guard let payload = try? decoder.decode(LiveDraftHelloPayload.self, from: data) else { return }
            handleHello(payload, projectID: projectID)
        case "op":
            guard let payload = try? decoder.decode(LiveDraftOpPayload.self, from: data) else { return }
            handleOp(payload, projectID: projectID)
        case "snapshot":
            guard let payload = try? decoder.decode(LiveDraftSnapshotPayload.self, from: data) else { return }
            handleSnapshot(payload, projectID: projectID)
        case "version":
            guard let payload = try? decoder.decode(LiveDraftVersionPayload.self, from: data) else { return }
            guard payload.deviceId != deviceID else { return }
            editor?.adoptRemoteLiveVersion(payload.versionId, projectID: projectID, draftChecksum: payload.checksum)
        case "presence":
            guard let payload = try? decoder.decode(LiveDraftPresencePayload.self, from: data) else { return }
            peerDeviceIDs = payload.devices.filter { $0 != deviceID }
            if isConnected {
                status = .live(peerCount: peerDeviceIDs.count)
            }
        case "error":
            status = .offline(reason: "server_error")
        default:
            break
        }
    }

    private func handleHello(_ payload: LiveDraftHelloPayload, projectID: String) {
        let localText = editor?.liveDraftText ?? ""
        let resolution = LiveDraftSyncPolicy.resolveHello(
            localText: localText,
            remoteText: payload.text,
            remoteSeq: payload.seq,
            remoteSeeded: payload.seeded ?? false,
            lastAgreedSeq: mirrorSeq
        )
        isConnected = true
        reconnectAttempt = 0
        status = .live(peerCount: peerDeviceIDs.count)
        switch resolution {
        case .inSync:
            mirrorText = localText
            mirrorSeq = payload.seq
            mirrorChecksum = LiveDraftText.checksum(localText)
        case .adoptRemote:
            reconcileRemote(
                text: payload.text ?? "",
                seq: payload.seq,
                checksum: payload.checksum,
                projectID: projectID,
                sourceDeviceID: "",
                revealLine: nil
            )
        case .pushLocal:
            // Take the channel's seq as our base so the snapshot push is not
            // rejected as stale, then replace its text with the editor's.
            setMirror(text: payload.text ?? "", seq: payload.seq, checksum: payload.checksum)
            schedulePushLocalSnapshot()
        }
        flushVersionAnnouncementIfPossible()
    }

    private func handleOp(_ payload: LiveDraftOpPayload, projectID: String) {
        if payload.deviceId == deviceID {
            // Our own op echoed back; the POST response already advanced the
            // mirror, but a reconnect race can deliver the echo first.
            if let seq = mirrorSeq, payload.seq > seq, payload.checksum == mirrorChecksum {
                mirrorSeq = payload.seq
            }
            return
        }
        guard let seq = mirrorSeq, payload.seq == seq + 1,
              let next = LiveDraftText.apply(payload.op, to: mirrorText),
              LiveDraftText.checksum(next) == payload.checksum else {
            scheduleResync()
            return
        }
        let caret = payload.cursor ?? payload.op.caret
        reconcileRemote(
            text: next,
            seq: payload.seq,
            checksum: payload.checksum,
            projectID: projectID,
            sourceDeviceID: payload.deviceId,
            revealLine: LiveDraftText.lineNumber(atUTF16Offset: caret, in: next)
        )
    }

    private func handleSnapshot(_ payload: LiveDraftSnapshotPayload, projectID: String) {
        guard payload.deviceId != deviceID else {
            if let seq = mirrorSeq, payload.seq > seq { mirrorSeq = payload.seq }
            return
        }
        reconcileRemote(
            text: payload.text,
            seq: payload.seq,
            checksum: payload.checksum,
            projectID: projectID,
            sourceDeviceID: payload.deviceId ?? "",
            revealLine: nil
        )
    }

    private func setMirror(text: String, seq: Int, checksum: String) {
        mirrorText = text
        mirrorSeq = seq
        mirrorChecksum = checksum.isEmpty ? LiveDraftText.checksum(text) : checksum
    }

    /// Move the mirror to what the channel now holds and bring the editor
    /// along. Keystrokes typed here but not yet published are rebased onto
    /// the remote text when they do not overlap it; otherwise the channel
    /// wins and the local recovery store keeps the dropped words.
    private func reconcileRemote(
        text remoteText: String,
        seq: Int,
        checksum: String,
        projectID: String,
        sourceDeviceID: String,
        revealLine: Int?
    ) {
        let previousMirror = mirrorText
        let localText = editor?.liveDraftText ?? previousMirror
        setMirror(text: remoteText, seq: seq, checksum: checksum)
        var merged: String?
        if localText != previousMirror,
           let localOp = LiveDraftText.diff(from: previousMirror, to: localText) {
            merged = LiveDraftText.rebase(localOp: localOp, base: previousMirror, remoteText: remoteText)
            if merged == nil {
                logger.notice("live draft: overlapping edits, channel text kept")
            }
        }
        applyToEditor(merged ?? remoteText, projectID: projectID, sourceDeviceID: sourceDeviceID)
        if let revealLine, merged == nil {
            revealRemoteLineIfDue(revealLine)
        }
        if merged != nil {
            schedulePublish(after: LiveDraftSyncPolicy.publishCoalesceInterval)
        }
    }

    private func applyToEditor(_ text: String, projectID: String, sourceDeviceID: String) {
        guard let editor else { return }
        isApplyingRemote = true
        defer { isApplyingRemote = false }
        _ = editor.applyRemoteLiveDraft(text, projectID: projectID, sourceDeviceID: sourceDeviceID)
    }

    private func revealRemoteLineIfDue(_ line: Int) {
        let now = Date()
        guard now.timeIntervalSince(lastRemoteLineRevealAt) >= LiveDraftSyncPolicy.remoteLineRevealInterval else { return }
        lastRemoteLineRevealAt = now
        editor?.revealRemoteEditLine(line)
    }

    // MARK: Publish

    private func schedulePublish(after delay: TimeInterval) {
        guard publishTask == nil else { return }
        publishTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(max(0, delay) * 1_000_000_000))
            guard let self, !Task.isCancelled else { return }
            self.publishTask = nil
            await self.publishPendingLocalChanges()
        }
    }

    private func publishPendingLocalChanges() async {
        guard isConnected, let editor, let baseSeq = mirrorSeq else { return }
        guard !isPublishInFlight else {
            schedulePublish(after: LiveDraftSyncPolicy.publishCoalesceInterval)
            return
        }
        let baseText = mirrorText
        let localText = editor.liveDraftText
        guard localText != baseText, let op = LiveDraftText.diff(from: baseText, to: localText) else { return }
        let projectID = activeProjectID
        let checksum = LiveDraftText.checksum(localText)
        isPublishInFlight = true
        defer { isPublishInFlight = false }
        do {
            let result = try await transport.postOp(
                projectID: projectID,
                deviceID: deviceID,
                baseSeq: baseSeq,
                baseChecksum: mirrorChecksum,
                op: op,
                checksum: checksum,
                cursor: op.caret
            )
            guard projectID == activeProjectID else { return }
            switch result {
            case let .applied(seq, appliedChecksum):
                setMirror(text: localText, seq: seq, checksum: appliedChecksum)
                flushVersionAnnouncementIfPossible()
            case let .conflict(seq, remoteChecksum, remoteText):
                // Another device moved the channel first. Rebase what was
                // typed here onto it when the edits do not overlap.
                reconcileRemote(
                    text: remoteText,
                    seq: seq,
                    checksum: remoteChecksum,
                    projectID: projectID,
                    sourceDeviceID: "",
                    revealLine: nil
                )
            case .rateLimited:
                schedulePublish(after: LiveDraftSyncPolicy.publishRetryInterval)
                return
            case let .rejected(status, reason):
                logger.warning("live draft op rejected status=\(status) reason=\(reason, privacy: .public)")
                if status == 401, await refreshAuthIfPossible() {
                    schedulePublish(after: LiveDraftSyncPolicy.publishRetryInterval)
                } else {
                    scheduleResync()
                }
                return
            }
        } catch {
            logger.warning("live draft op failed: \(error.localizedDescription, privacy: .public)")
            schedulePublish(after: LiveDraftSyncPolicy.publishRetryInterval)
            return
        }
        if let editor = self.editor, editor.liveDraftText != mirrorText {
            schedulePublish(after: LiveDraftSyncPolicy.publishCoalesceInterval)
        }
    }

    private func schedulePushLocalSnapshot() {
        guard publishTask == nil else { return }
        publishTask = Task { [weak self] in
            guard let self, !Task.isCancelled else { return }
            self.publishTask = nil
            await self.pushLocalSnapshot()
        }
    }

    private func pushLocalSnapshot() async {
        guard isConnected, let editor else { return }
        let projectID = activeProjectID
        let localText = editor.liveDraftText
        do {
            let result = try await transport.postSnapshot(
                projectID: projectID,
                deviceID: deviceID,
                text: localText,
                versionID: editor.liveDraftLatestVersionID
            )
            guard projectID == activeProjectID else { return }
            switch result {
            case let .applied(seq, checksum):
                setMirror(text: localText, seq: seq, checksum: checksum)
                flushVersionAnnouncementIfPossible()
            case let .conflict(seq, remoteChecksum, remoteText):
                reconcileRemote(
                    text: remoteText,
                    seq: seq,
                    checksum: remoteChecksum,
                    projectID: projectID,
                    sourceDeviceID: "",
                    revealLine: nil
                )
            case .rateLimited:
                schedulePublish(after: LiveDraftSyncPolicy.publishRetryInterval)
            case let .rejected(status, reason):
                logger.warning("live draft snapshot rejected status=\(status) reason=\(reason, privacy: .public)")
            }
        } catch {
            logger.warning("live draft snapshot failed: \(error.localizedDescription, privacy: .public)")
            schedulePublish(after: LiveDraftSyncPolicy.publishRetryInterval)
        }
        if let editor = self.editor, editor.liveDraftText != mirrorText {
            schedulePublish(after: LiveDraftSyncPolicy.publishCoalesceInterval)
        }
    }

    private func flushVersionAnnouncementIfPossible() {
        guard isConnected, let pending = pendingVersionAnnouncement, pending.checksum == mirrorChecksum else { return }
        pendingVersionAnnouncement = nil
        let projectID = activeProjectID
        Task { [weak self] in
            guard let self else { return }
            do {
                _ = try await self.transport.postVersion(
                    projectID: projectID,
                    deviceID: self.deviceID,
                    versionID: pending.versionID,
                    checksum: pending.checksum
                )
            } catch {
                self.logger.warning("live draft version announce failed: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    // MARK: Resync

    private func scheduleResync() {
        guard resyncTask == nil else { return }
        let projectID = activeProjectID
        resyncTask = Task { [weak self] in
            guard let self else { return }
            defer { self.resyncTask = nil }
            do {
                let snapshot = try await self.transport.fetchSnapshot(projectID: projectID)
                guard projectID == self.activeProjectID else { return }
                self.reconcileRemote(
                    text: snapshot.text,
                    seq: snapshot.seq,
                    checksum: snapshot.checksum,
                    projectID: projectID,
                    sourceDeviceID: snapshot.deviceId ?? "",
                    revealLine: nil
                )
            } catch {
                self.logger.warning("live draft resync failed: \(error.localizedDescription, privacy: .public)")
                self.schedulePublish(after: LiveDraftSyncPolicy.publishRetryInterval)
            }
        }
    }

    // MARK: App state

    private func observeAppState() {
        #if os(iOS)
        let foregroundName = UIApplication.willEnterForegroundNotification
        #elseif os(macOS)
        let foregroundName = NSApplication.didBecomeActiveNotification
        #else
        let foregroundName = Notification.Name("io.them.them.liveDraftForeground")
        #endif
        NotificationCenter.default.publisher(for: foregroundName)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    guard let self, !self.isConnected else { return }
                    self.retryNow()
                }
            }
            .store(in: &cancellables)
        // Sign-in lands in UserDefaults (auth_signed_in); a stream that never
        // started because the user was signed out can start now. The Studio
        // writes defaults constantly, so coalesce and act only when the
        // signed-in flag actually flips.
        guard isEnabled else { return }
        NotificationCenter.default.publisher(for: UserDefaults.didChangeNotification)
            .debounce(for: .seconds(1), scheduler: RunLoop.main)
            .sink { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.signedInFlagMayHaveChanged()
                }
            }
            .store(in: &cancellables)
    }

    private func signedInFlagMayHaveChanged() {
        let signedIn = UserDefaults.standard.bool(forKey: "auth_signed_in")
        guard signedIn != lastObservedSignedInFlag else { return }
        lastObservedSignedInFlag = signedIn
        if signedIn {
            reevaluateIfIdle()
        }
    }
}

// MARK: - URLSession transport

/// Tracks the last byte seen on a stream so a silent socket can be detected.
nonisolated final class LiveDraftStreamActivity: @unchecked Sendable {
    private let lock = NSLock()
    private var lastActivity = Date()
    private var timedOut = false

    func touch() {
        lock.lock()
        lastActivity = Date()
        lock.unlock()
    }

    func idleInterval() -> TimeInterval {
        lock.lock()
        defer { lock.unlock() }
        return Date().timeIntervalSince(lastActivity)
    }

    func markTimedOut() {
        lock.lock()
        timedOut = true
        lock.unlock()
    }

    var didTimeOut: Bool {
        lock.lock()
        defer { lock.unlock() }
        return timedOut
    }
}

nonisolated final class LiveDraftBackendTransport: LiveDraftTransport {
    private let session: URLSession
    private let requestTimeout: TimeInterval = 20

    init() {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 24 * 60 * 60
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration)
    }

    func openStream(projectID: String, deviceID: String, checksum: String) -> AsyncThrowingStream<LiveDraftServerEvent, Error> {
        AsyncThrowingStream { continuation in
            let activity = LiveDraftStreamActivity()
            let reader = Task {
                do {
                    var request = try Self.makeRequest(
                        projectID: projectID,
                        path: "stream",
                        method: "GET",
                        query: [
                            URLQueryItem(name: "device_id", value: deviceID),
                            URLQueryItem(name: "checksum", value: checksum),
                        ]
                    )
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 24 * 60 * 60
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse else {
                        throw LiveDraftTransportError.invalidResponse
                    }
                    guard http.statusCode == 200 else {
                        throw LiveDraftTransportError.http(http.statusCode)
                    }
                    activity.touch()
                    var parser = LiveDraftSSEParser()
                    for try await byte in bytes {
                        if Task.isCancelled { break }
                        activity.touch()
                        if let event = parser.feed(byte) {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish(throwing: activity.didTimeOut ? LiveDraftTransportError.idleTimeout : nil)
                } catch {
                    continuation.finish(throwing: activity.didTimeOut ? LiveDraftTransportError.idleTimeout : error)
                }
            }
            // Server pings every 15 s; if nothing arrives for the idle window
            // the socket is dead (network switch, sleep) and the service must
            // reconnect rather than sit "live" while receiving nothing.
            let watchdog = Task {
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 5_000_000_000)
                    if Task.isCancelled { break }
                    if activity.idleInterval() > LiveDraftSyncPolicy.streamIdleTimeout {
                        activity.markTimedOut()
                        reader.cancel()
                        break
                    }
                }
            }
            continuation.onTermination = { _ in
                reader.cancel()
                watchdog.cancel()
            }
        }
    }

    func fetchSnapshot(projectID: String) async throws -> LiveDraftSnapshotPayload {
        let request = try Self.makeRequest(projectID: projectID, path: "snapshot", method: "GET", query: [])
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LiveDraftTransportError.invalidResponse }
        guard http.statusCode == 200 else { throw LiveDraftTransportError.http(http.statusCode) }
        return try JSONDecoder().decode(LiveDraftSnapshotPayload.self, from: data)
    }

    func postOp(
        projectID: String,
        deviceID: String,
        baseSeq: Int,
        baseChecksum: String,
        op: LiveDraftOp,
        checksum: String,
        cursor: Int?
    ) async throws -> LiveDraftPublishResult {
        var body: [String: Any] = [
            "device_id": deviceID,
            "base_seq": baseSeq,
            "base_checksum": baseChecksum,
            "op": ["start": op.start, "delete_count": op.deleteCount, "insert": op.insert],
            "checksum": checksum,
        ]
        if let cursor { body["cursor"] = cursor }
        return try await post(projectID: projectID, path: "ops", body: body)
    }

    func postSnapshot(projectID: String, deviceID: String, text: String, versionID: String) async throws -> LiveDraftPublishResult {
        var body: [String: Any] = ["device_id": deviceID, "text": text]
        if !versionID.isEmpty { body["version_id"] = versionID }
        return try await post(projectID: projectID, path: "snapshot", body: body)
    }

    func postVersion(projectID: String, deviceID: String, versionID: String, checksum: String) async throws -> LiveDraftPublishResult {
        try await post(
            projectID: projectID,
            path: "version",
            body: ["device_id": deviceID, "version_id": versionID, "checksum": checksum]
        )
    }

    private func post(projectID: String, path: String, body: [String: Any]) async throws -> LiveDraftPublishResult {
        var request = try Self.makeRequest(projectID: projectID, path: path, method: "POST", query: [])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        request.timeoutInterval = requestTimeout
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw LiveDraftTransportError.invalidResponse }
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let seq = (json["seq"] as? NSNumber)?.intValue ?? 0
        let checksum = json["checksum"] as? String ?? ""
        switch http.statusCode {
        case 200...299:
            return .applied(seq: seq, checksum: checksum)
        case 409:
            return .conflict(seq: seq, checksum: checksum, text: json["text"] as? String ?? "")
        case 429:
            return .rateLimited
        default:
            return .rejected(status: http.statusCode, reason: json["error"] as? String ?? "http_\(http.statusCode)")
        }
    }

    private static func makeRequest(projectID: String, path: String, method: String, query: [URLQueryItem]) throws -> URLRequest {
        let cleanProject = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanProject.isEmpty else { throw LiveDraftTransportError.notConfigured }
        var url = BackendAuthClient.resolvedBackendBaseURL()
        url.appendPathComponent("screenplay")
        url.appendPathComponent("projects")
        url.appendPathComponent(cleanProject)
        url.appendPathComponent("live")
        url.appendPathComponent(path)
        if !query.isEmpty, var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            components.queryItems = query
            url = components.url ?? url
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let authorization = BackendAuthClient.authorizationHeaderValue(), !authorization.isEmpty {
            request.setValue(authorization, forHTTPHeaderField: "Authorization")
        }
        if let appToken = resolveAppToken() {
            request.setValue(appToken, forHTTPHeaderField: "X-APP-TOKEN")
        }
        request.setValue("them", forHTTPHeaderField: "X-Them-Client-Name")
        #if os(macOS)
        request.setValue("macOS", forHTTPHeaderField: "X-Them-Client-Platform")
        #elseif os(iOS)
        request.setValue("iOS", forHTTPHeaderField: "X-Them-Client-Platform")
        #else
        request.setValue("Apple", forHTTPHeaderField: "X-Them-Client-Platform")
        #endif
        return request
    }

    // Same precedence as BackendClient.appToken(): keychain, Info.plist, env,
    // then the DEBUG dev fallback.
    private static func resolveAppToken() -> String? {
        let candidates = [
            BackendAuthClient.sharedAppToken() ?? "",
            Bundle.main.object(forInfoDictionaryKey: "APP_TOKEN") as? String ?? "",
            ProcessInfo.processInfo.environment["APP_TOKEN"] ?? "",
        ].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let usable = candidates.first(where: { isUsableToken($0) }) {
            return usable
        }
        #if DEBUG
        return "them-dev"
        #else
        return nil
        #endif
    }

    private static func isUsableToken(_ value: String) -> Bool {
        guard !value.isEmpty else { return false }
        let lowered = value.lowercased()
        return !(lowered.hasPrefix("$(") || lowered == "changeme" || lowered == "your_app_token")
    }
}
