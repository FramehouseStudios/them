import Combine
import XCTest
@testable import them

// T-live-draft-sync — client contract tests.
//
// The checksum vectors, diff/apply behavior, and SSE framing must match
// backend/tests/screenplay_live_draft_routes.test.mjs byte for byte; the
// service tests drive the sync loop with a fake transport and a fake editor.

final class ScreenplayLiveDraftTextTests: XCTestCase {
    func testChecksumMatchesBackendVectors() {
        XCTAssertEqual(LiveDraftText.checksum(""), "811c9dc5")
        XCTAssertEqual(LiveDraftText.checksum("a"), "e40c292c")
        XCTAssertEqual(LiveDraftText.checksum("🎬"), LiveDraftText.checksum("🎬"))
        XCTAssertNotEqual(LiveDraftText.checksum("a"), LiveDraftText.checksum("b"))
    }

    func testDiffApplyRoundTripsIncludingSurrogatePairs() {
        let cases: [(String, String)] = [
            ("", "INT. ROOM - DAY"),
            ("INT. ROOM - DAY", "INT. ROOM - NIGHT"),
            ("hello world", "hello"),
            ("hello", "hello world"),
            ("MARA\nYou said the file was gone.", "MARA\nYou said the reel was gone."),
            ("A 🎬 B", "A 🎬🎥 B"),
            ("A 🎬🎥 B", "A B"),
            ("🎬", "🎥"),
            ("x🎬", "x🎥y"),
        ]
        for (from, to) in cases {
            guard let op = LiveDraftText.diff(from: from, to: to) else {
                return XCTFail("expected op for \(from) -> \(to)")
            }
            XCTAssertEqual(LiveDraftText.apply(op, to: from), to, "\(from) -> \(to)")
        }
        XCTAssertNil(LiveDraftText.diff(from: "same", to: "same"))
    }

    func testDiffNeverSplitsASurrogatePair() {
        let op = LiveDraftText.diff(from: "🎬", to: "🎥")
        XCTAssertEqual(op, LiveDraftOp(start: 0, deleteCount: 2, insert: "🎥"))
    }

    func testApplyRejectsOutOfRangeOps() {
        XCTAssertNil(LiveDraftText.apply(LiveDraftOp(start: 4, deleteCount: 0, insert: "x"), to: "abc"))
        XCTAssertNil(LiveDraftText.apply(LiveDraftOp(start: 1, deleteCount: 5, insert: ""), to: "abc"))
        XCTAssertNil(LiveDraftText.apply(LiveDraftOp(start: -1, deleteCount: 0, insert: ""), to: "abc"))
        XCTAssertEqual(LiveDraftText.apply(LiveDraftOp(start: 3, deleteCount: 0, insert: "d"), to: "abc"), "abcd")
    }

    func testRebaseMergesNonOverlappingEditsAndRefusesOverlaps() {
        let base = "INT. ROOM - DAY\n\nMara waits."
        // Phone appended a line; Mac fixed the slugline. Both survive.
        let remote = base + "\n\nShe leaves."
        let local = "INT. ROOM - NIGHT\n\nMara waits."
        let localOp = LiveDraftText.diff(from: base, to: local)!
        XCTAssertEqual(
            LiveDraftText.rebase(localOp: localOp, base: base, remoteText: remote),
            "INT. ROOM - NIGHT\n\nMara waits.\n\nShe leaves."
        )
        // Mac appended after the phone's earlier insert: shift by the delta.
        let remoteEarly = "INT. ROOM - DAY\n\nMara waits and waits."
        let localLate = base + " She leaves."
        let lateOp = LiveDraftText.diff(from: base, to: localLate)!
        XCTAssertEqual(
            LiveDraftText.rebase(localOp: lateOp, base: base, remoteText: remoteEarly),
            "INT. ROOM - DAY\n\nMara waits and waits. She leaves."
        )
        // Two inserts at the same spot: remote first, local second, on every device.
        let sameSpotRemote = base + "A"
        let sameSpotLocal = base + "B"
        let sameOp = LiveDraftText.diff(from: base, to: sameSpotLocal)!
        XCTAssertEqual(LiveDraftText.rebase(localOp: sameOp, base: base, remoteText: sameSpotRemote), base + "AB")
        // Both rewrote the same word: no honest merge.
        let overlapRemote = "INT. ROOM - DUSK\n\nMara waits."
        XCTAssertNil(LiveDraftText.rebase(localOp: localOp, base: base, remoteText: overlapRemote))
        // Remote unchanged from base: local applies as-is.
        XCTAssertEqual(LiveDraftText.rebase(localOp: localOp, base: base, remoteText: base), local)
    }

    func testLineNumberAtOffset() {
        let text = "INT. ROOM - DAY\n\nMara waits.\nShe leaves."
        XCTAssertEqual(LiveDraftText.lineNumber(atUTF16Offset: 0, in: text), 1)
        XCTAssertEqual(LiveDraftText.lineNumber(atUTF16Offset: 15, in: text), 1)
        XCTAssertEqual(LiveDraftText.lineNumber(atUTF16Offset: 17, in: text), 3)
        XCTAssertEqual(LiveDraftText.lineNumber(atUTF16Offset: text.utf16.count, in: text), 4)
        XCTAssertEqual(LiveDraftText.lineNumber(atUTF16Offset: 999, in: text), 4)
    }

    func testOpDecodesWireShape() throws {
        let json = Data(#"{"start":2,"delete_count":1,"insert":"x"}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(LiveDraftOp.self, from: json), LiveDraftOp(start: 2, deleteCount: 1, insert: "x"))
        let sparse = Data(#"{"start":0}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(LiveDraftOp.self, from: sparse), LiveDraftOp(start: 0, deleteCount: 0, insert: ""))
    }
}

final class ScreenplayLiveDraftSSEParserTests: XCTestCase {
    func testParsesEventsAcrossChunkBoundariesAndIgnoresComments() {
        var parser = LiveDraftSSEParser()
        let frame = "id: 3\nevent: op\ndata: {\"seq\":3,\ndata: \"x\":1}\n\n: ping\n\nevent: presence\r\ndata: {\"devices\":[]}\r\n\r\n"
        let bytes = Array(frame.utf8)
        let first = parser.feed(bytes[0..<10])
        let second = parser.feed(bytes[10...])
        let events = first + second
        XCTAssertEqual(events, [
            LiveDraftServerEvent(name: "op", data: "{\"seq\":3,\n\"x\":1}", id: "3"),
            LiveDraftServerEvent(name: "presence", data: "{\"devices\":[]}", id: nil),
        ])
    }

    func testDataWithoutEventNameDefaultsToMessage() {
        var parser = LiveDraftSSEParser()
        let events = parser.feed(Array("data: hello\n\n".utf8))
        XCTAssertEqual(events, [LiveDraftServerEvent(name: "message", data: "hello", id: nil)])
    }

    func testMultibyteCharactersSurviveByteWiseFeeding() {
        var parser = LiveDraftSSEParser()
        let events = parser.feed(Array("event: snapshot\ndata: 🎬 Mara\n\n".utf8))
        XCTAssertEqual(events.first?.data, "🎬 Mara")
    }
}

final class ScreenplayLiveDraftPolicyTests: XCTestCase {
    func testReconnectDelaysAreBoundedAndMonotonic() {
        XCTAssertEqual(LiveDraftSyncPolicy.reconnectDelay(attempt: 0), 1)
        XCTAssertEqual(LiveDraftSyncPolicy.reconnectDelay(attempt: 2), 4)
        XCTAssertEqual(LiveDraftSyncPolicy.reconnectDelay(attempt: 99), 30)
        XCTAssertEqual(LiveDraftSyncPolicy.reconnectDelay(attempt: -5), 1)
    }

    func testShouldRunRequiresEnabledAuthenticatedAndProject() {
        XCTAssertTrue(LiveDraftSyncPolicy.shouldRun(isEnabled: true, isAuthenticated: true, projectID: "p1"))
        XCTAssertFalse(LiveDraftSyncPolicy.shouldRun(isEnabled: false, isAuthenticated: true, projectID: "p1"))
        XCTAssertFalse(LiveDraftSyncPolicy.shouldRun(isEnabled: true, isAuthenticated: false, projectID: "p1"))
        XCTAssertFalse(LiveDraftSyncPolicy.shouldRun(isEnabled: true, isAuthenticated: true, projectID: "  "))
    }

    func testHelloResolution() {
        typealias P = LiveDraftSyncPolicy
        XCTAssertEqual(P.resolveHello(localText: "a", remoteText: nil, remoteSeq: 4, remoteSeeded: false, lastAgreedSeq: nil), .inSync)
        XCTAssertEqual(P.resolveHello(localText: "a", remoteText: "a", remoteSeq: 4, remoteSeeded: false, lastAgreedSeq: nil), .inSync)
        // Fresh channel seeded from the saved version: the editor is at least as fresh.
        XCTAssertEqual(P.resolveHello(localText: "local edits", remoteText: "saved", remoteSeq: 0, remoteSeeded: true, lastAgreedSeq: nil), .pushLocal)
        // Fresh channel and an empty editor: take the saved text.
        XCTAssertEqual(P.resolveHello(localText: "", remoteText: "saved", remoteSeq: 0, remoteSeeded: true, lastAgreedSeq: nil), .adoptRemote)
        // Reconnect after offline typing; channel did not move.
        XCTAssertEqual(P.resolveHello(localText: "offline edits", remoteText: "old", remoteSeq: 7, remoteSeeded: false, lastAgreedSeq: 7), .pushLocal)
        // Another device typed while we were away.
        XCTAssertEqual(P.resolveHello(localText: "offline edits", remoteText: "phone text", remoteSeq: 9, remoteSeeded: false, lastAgreedSeq: 7), .adoptRemote)
        XCTAssertEqual(P.resolveHello(localText: "stale", remoteText: "phone text", remoteSeq: 9, remoteSeeded: false, lastAgreedSeq: nil), .adoptRemote)
    }

    func testDeviceDisplayLabels() {
        XCTAssertEqual(LiveDraftDeviceIdentity.displayLabel(for: "mac-1234"), "your Mac")
        XCTAssertEqual(LiveDraftDeviceIdentity.displayLabel(for: "ios-1234"), "your iPhone")
        XCTAssertEqual(LiveDraftDeviceIdentity.displayLabel(for: "web-1"), "another device")
        XCTAssertGreaterThan(LiveDraftSyncPolicy.streamIdleTimeout, 15 * 2, "must outlast two server pings")
        XCTAssertGreaterThan(LiveDraftSyncPolicy.followFallbackInterval, 2, "must outlast the leader's autosave debounce")
    }

    func testDeviceIdentityIsStablePerInstall() {
        let suiteName = "live-draft-device-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let first = LiveDraftDeviceIdentity.current(defaults: defaults)
        let second = LiveDraftDeviceIdentity.current(defaults: defaults)
        XCTAssertEqual(first, second)
        XCTAssertTrue(first.hasPrefix(LiveDraftDeviceIdentity.platformPrefix() + "-"))
        XCTAssertTrue(LiveDraftDeviceIdentity.isValid(first))
        XCTAssertFalse(LiveDraftDeviceIdentity.isValid("bad id with spaces"))
        XCTAssertFalse(LiveDraftDeviceIdentity.isValid(""))
    }
}

// MARK: - Service tests

@MainActor
private final class FakeLiveDraftEditor: LiveDraftEditorBinding {
    @Published var projectID: String
    @Published var text: String
    var latestVersionID = "v1"
    var appliedRemoteTexts: [String] = []
    var appliedSourceDevices: [String] = []
    var adoptedVersions: [(versionID: String, checksum: String)] = []
    var revealedLines: [Int] = []

    init(projectID: String, text: String) {
        self.projectID = projectID
        self.text = text
    }

    var liveDraftProjectID: String { projectID }
    var liveDraftText: String { text }
    var liveDraftLatestVersionID: String { latestVersionID }
    var liveDraftProjectIDPublisher: AnyPublisher<String, Never> { $projectID.eraseToAnyPublisher() }
    var liveDraftTextPublisher: AnyPublisher<String, Never> { $text.eraseToAnyPublisher() }

    func applyRemoteLiveDraft(_ text: String, projectID: String, sourceDeviceID: String) -> Bool {
        guard projectID == self.projectID else { return false }
        appliedRemoteTexts.append(text)
        appliedSourceDevices.append(sourceDeviceID)
        self.text = text
        return true
    }

    func revealRemoteEditLine(_ line: Int) {
        revealedLines.append(line)
    }

    func adoptRemoteLiveVersion(_ versionID: String, projectID: String, draftChecksum: String) {
        adoptedVersions.append((versionID, draftChecksum))
    }
}

/// Scripted transport: the test pushes server events through `emit` and
/// reads what the service posted.
private final class FakeLiveDraftTransport: LiveDraftTransport, @unchecked Sendable {
    struct PostedOp: Equatable {
        let baseSeq: Int
        let baseChecksum: String
        let op: LiveDraftOp
        let checksum: String
    }

    private let lock = NSLock()
    private var continuation: AsyncThrowingStream<LiveDraftServerEvent, Error>.Continuation?
    private var _postedOps: [PostedOp] = []
    private var _postedSnapshots: [String] = []
    private var _postedVersions: [(String, String)] = []
    private var _openedStreams: [(projectID: String, checksum: String)] = []
    var opResponder: (PostedOp) -> LiveDraftPublishResult = { .applied(seq: 1, checksum: $0.checksum) }
    var snapshotText = ""
    var snapshotSeq = 0

    var postedOps: [PostedOp] { lock.withLock { _postedOps } }
    var postedSnapshots: [String] { lock.withLock { _postedSnapshots } }
    var postedVersions: [(String, String)] { lock.withLock { _postedVersions } }
    var openedStreams: [(projectID: String, checksum: String)] { lock.withLock { _openedStreams } }

    func emit(_ name: String, _ json: String) {
        lock.withLock { continuation }?.yield(LiveDraftServerEvent(name: name, data: json, id: nil))
    }

    func openStream(projectID: String, deviceID: String, checksum: String) -> AsyncThrowingStream<LiveDraftServerEvent, Error> {
        lock.withLock { _openedStreams.append((projectID, checksum)) }
        return AsyncThrowingStream { continuation in
            lock.withLock { self.continuation = continuation }
        }
    }

    func fetchSnapshot(projectID: String) async throws -> LiveDraftSnapshotPayload {
        LiveDraftSnapshotPayload(seq: snapshotSeq, deviceId: nil, text: snapshotText, checksum: LiveDraftText.checksum(snapshotText), versionId: nil)
    }

    func postOp(projectID: String, deviceID: String, baseSeq: Int, baseChecksum: String, op: LiveDraftOp, checksum: String, cursor: Int?) async throws -> LiveDraftPublishResult {
        let posted = PostedOp(baseSeq: baseSeq, baseChecksum: baseChecksum, op: op, checksum: checksum)
        lock.withLock { _postedOps.append(posted) }
        return opResponder(posted)
    }

    func postSnapshot(projectID: String, deviceID: String, text: String, versionID: String) async throws -> LiveDraftPublishResult {
        lock.withLock { _postedSnapshots.append(text) }
        return .applied(seq: 1, checksum: LiveDraftText.checksum(text))
    }

    func postVersion(projectID: String, deviceID: String, versionID: String, checksum: String) async throws -> LiveDraftPublishResult {
        lock.withLock { _postedVersions.append((versionID, checksum)) }
        return .applied(seq: 1, checksum: checksum)
    }
}

@MainActor
final class ScreenplayLiveDraftSyncServiceTests: XCTestCase {
    private func waitUntil(_ timeout: TimeInterval = 2, _ condition: @escaping @MainActor () -> Bool) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
    }

    private func makeService(transport: FakeLiveDraftTransport) -> ScreenplayLiveDraftSyncService {
        ScreenplayLiveDraftSyncService(
            transport: transport,
            deviceID: "mac-test",
            isEnabled: true,
            isAuthenticated: { true }
        )
    }

    func testRemoteTypingReachesTheEditorAndOwnEchoIsIgnored() async {
        let transport = FakeLiveDraftTransport()
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: "")
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { !transport.openedStreams.isEmpty }
        XCTAssertEqual(transport.openedStreams.first?.projectID, "proj-1")

        let seed = "INT. ROOM - DAY"
        transport.emit("hello", #"{"seq":0,"checksum":"\#(LiveDraftText.checksum(seed))","seeded":true,"text":"\#(seed)"}"#)
        await waitUntil { editor.text == seed }
        XCTAssertEqual(editor.appliedRemoteTexts, [seed], "empty editor adopts the seeded channel text")
        XCTAssertTrue(service.status.isLive)

        // The phone types " She" one keystroke at a time.
        var text = seed
        var seq = 0
        for keystroke in [" ", "S", "h", "e"] {
            let next = text + keystroke
            let op = LiveDraftText.diff(from: text, to: next)!
            seq += 1
            transport.emit("op", #"{"seq":\#(seq),"device_id":"ios-phone","op":{"start":\#(op.start),"delete_count":\#(op.deleteCount),"insert":"\#(op.insert)"},"checksum":"\#(LiveDraftText.checksum(next))"}"#)
            text = next
            await waitUntil { editor.text == next }
            XCTAssertEqual(editor.text, next)
        }
        XCTAssertEqual(editor.text, "INT. ROOM - DAY She")
        XCTAssertTrue(transport.postedOps.isEmpty, "remote text must not be echoed back as local typing")
        XCTAssertEqual(editor.appliedSourceDevices.last, "ios-phone")
        XCTAssertEqual(editor.revealedLines.first, 1, "follower is scrolled to the writer's line")

        // Our own echo (a reconnect race) must not be re-applied.
        transport.emit("op", #"{"seq":\#(seq + 1),"device_id":"mac-test","op":{"start":0,"delete_count":0,"insert":"ZZZ"},"checksum":"deadbeef"}"#)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(editor.text, "INT. ROOM - DAY She")

        transport.emit("presence", #"{"devices":["mac-test","ios-phone"]}"#)
        await waitUntil { service.peerDeviceIDs == ["ios-phone"] }
        XCTAssertEqual(service.status, .live(peerCount: 1))
        service.detach()
    }

    func testLocalTypingPublishesCoalescedOpsAgainstTheMirror() async {
        let transport = FakeLiveDraftTransport()
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: "INT. ROOM - DAY")
        var serverSeq = 0
        transport.opResponder = { posted in
            serverSeq += 1
            return .applied(seq: serverSeq, checksum: posted.checksum)
        }
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { !transport.openedStreams.isEmpty }
        XCTAssertEqual(transport.openedStreams.first?.checksum, LiveDraftText.checksum("INT. ROOM - DAY"))
        transport.emit("hello", #"{"seq":0,"checksum":"\#(LiveDraftText.checksum("INT. ROOM - DAY"))","seeded":false}"#)
        await waitUntil { service.status.isLive }

        editor.text = "INT. ROOM - DAY\n"
        editor.text = "INT. ROOM - DAY\n\nM"
        editor.text = "INT. ROOM - DAY\n\nMara"
        await waitUntil { !transport.postedOps.isEmpty }
        // Keystrokes inside the coalesce window collapse into one op.
        await waitUntil(0.3) { transport.postedOps.count > 1 }
        let posted = transport.postedOps
        XCTAssertEqual(posted.first?.baseSeq, 0)
        XCTAssertEqual(posted.first?.baseChecksum, LiveDraftText.checksum("INT. ROOM - DAY"))
        XCTAssertEqual(posted.first?.op, LiveDraftOp(start: 15, deleteCount: 0, insert: "\n\nMara"))
        XCTAssertEqual(posted.first?.checksum, LiveDraftText.checksum("INT. ROOM - DAY\n\nMara"))
        XCTAssertEqual(posted.count, 1)

        // A save on this device is announced once the mirror carries that text.
        service.announceSavedVersion(projectID: "proj-1", versionID: "v2", draft: "INT. ROOM - DAY\n\nMara")
        await waitUntil { !transport.postedVersions.isEmpty }
        XCTAssertEqual(transport.postedVersions.first?.0, "v2")
        XCTAssertEqual(transport.postedVersions.first?.1, LiveDraftText.checksum("INT. ROOM - DAY\n\nMara"))
        service.detach()
    }

    func testConflictAdoptsServerTextAndVersionEventReachesEditor() async {
        let transport = FakeLiveDraftTransport()
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: "base")
        // Overlapping rewrite of the same word: the channel wins.
        transport.opResponder = { _ in
            .conflict(seq: 5, checksum: LiveDraftText.checksum("phone wins"), text: "phone wins")
        }
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { !transport.openedStreams.isEmpty }
        transport.emit("hello", #"{"seq":0,"checksum":"\#(LiveDraftText.checksum("base"))","seeded":false}"#)
        await waitUntil { service.status.isLive }

        editor.text = "bAse"
        await waitUntil { editor.text == "phone wins" }
        XCTAssertEqual(editor.appliedRemoteTexts.last, "phone wins")

        transport.emit("version", #"{"seq":5,"device_id":"ios-phone","version_id":"v9","checksum":"\#(LiveDraftText.checksum("phone wins"))"}"#)
        await waitUntil { !editor.adoptedVersions.isEmpty }
        XCTAssertEqual(editor.adoptedVersions.first?.versionID, "v9")
        service.detach()
    }

    func testConflictWithNonOverlappingEditsKeepsBothDevicesWords() async {
        let transport = FakeLiveDraftTransport()
        let base = "INT. ROOM - DAY\n\nMara waits."
        let phoneText = base + "\n\nShe leaves."
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: base)
        var responses: [LiveDraftPublishResult] = [
            .conflict(seq: 3, checksum: LiveDraftText.checksum(phoneText), text: phoneText),
        ]
        transport.opResponder = { posted in
            responses.isEmpty ? .applied(seq: 4, checksum: posted.checksum) : responses.removeFirst()
        }
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { !transport.openedStreams.isEmpty }
        transport.emit("hello", #"{"seq":0,"checksum":"\#(LiveDraftText.checksum(base))","seeded":false}"#)
        await waitUntil { service.status.isLive }

        // Mac fixes the slugline while the phone appended a line.
        editor.text = "INT. ROOM - NIGHT\n\nMara waits."
        let merged = "INT. ROOM - NIGHT\n\nMara waits.\n\nShe leaves."
        await waitUntil { editor.text == merged }
        XCTAssertEqual(editor.text, merged, "neither device's words are lost")
        // The rebased local edit is then published against the new mirror.
        await waitUntil { transport.postedOps.count == 2 }
        XCTAssertEqual(transport.postedOps.last?.baseSeq, 3)
        XCTAssertEqual(transport.postedOps.last?.checksum, LiveDraftText.checksum(merged))
        service.detach()
    }

    func testRemoteOpWhileTypingLocallyMergesInsteadOfClobbering() async {
        let transport = FakeLiveDraftTransport()
        let base = "INT. ROOM - DAY\n\nMara waits."
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: base)
        // Hold the Mac's publish so a phone op lands while local typing is unsent.
        transport.opResponder = { posted in .applied(seq: 2, checksum: posted.checksum) }
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { !transport.openedStreams.isEmpty }
        transport.emit("hello", #"{"seq":0,"checksum":"\#(LiveDraftText.checksum(base))","seeded":false}"#)
        await waitUntil { service.status.isLive }

        // Phone prepends FADE IN before the Mac's coalesce window closes.
        let phoneText = "FADE IN:\n\n" + base
        let phoneOp = LiveDraftText.diff(from: base, to: phoneText)!
        editor.text = base + " She leaves."
        transport.emit("op", #"{"seq":1,"device_id":"ios-phone","op":{"start":\#(phoneOp.start),"delete_count":0,"insert":"FADE IN:\n\n"},"checksum":"\#(LiveDraftText.checksum(phoneText))"}"#)
        let merged = "FADE IN:\n\n" + base + " She leaves."
        await waitUntil { editor.text == merged }
        XCTAssertEqual(editor.text, merged)
        await waitUntil { !transport.postedOps.isEmpty }
        XCTAssertEqual(transport.postedOps.first?.baseSeq, 1, "local words are published on top of the phone's op")
        XCTAssertEqual(transport.postedOps.first?.op, LiveDraftOp(start: merged.utf16.count - " She leaves.".utf16.count, deleteCount: 0, insert: " She leaves."))
        service.detach()
    }

    func testFreshChannelPushesNonEmptyLocalDraft() async {
        let transport = FakeLiveDraftTransport()
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: "local unsaved work")
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { !transport.openedStreams.isEmpty }
        transport.emit("hello", #"{"seq":0,"checksum":"\#(LiveDraftText.checksum("saved"))","seeded":true,"text":"saved"}"#)
        await waitUntil { !transport.postedSnapshots.isEmpty }
        XCTAssertEqual(transport.postedSnapshots, ["local unsaved work"])
        XCTAssertEqual(editor.text, "local unsaved work", "a seeded channel never clobbers local edits")
        XCTAssertTrue(editor.appliedRemoteTexts.isEmpty)
        service.detach()
    }

    func testOutOfOrderOpTriggersResync() async {
        let transport = FakeLiveDraftTransport()
        transport.snapshotText = "resynced"
        transport.snapshotSeq = 9
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: "a")
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { !transport.openedStreams.isEmpty }
        transport.emit("hello", #"{"seq":0,"checksum":"\#(LiveDraftText.checksum("a"))","seeded":false}"#)
        await waitUntil { service.status.isLive }
        transport.emit("op", #"{"seq":4,"device_id":"ios-phone","op":{"start":1,"delete_count":0,"insert":"b"},"checksum":"\#(LiveDraftText.checksum("ab"))"}"#)
        await waitUntil { editor.text == "resynced" }
        XCTAssertEqual(editor.text, "resynced")
        service.detach()
    }

    func testProjectSwitchReopensStreamAndDisabledServiceStaysIdle() async {
        let transport = FakeLiveDraftTransport()
        let editor = FakeLiveDraftEditor(projectID: "proj-1", text: "")
        let service = makeService(transport: transport)
        service.attach(to: editor)
        await waitUntil { transport.openedStreams.count == 1 }
        editor.projectID = "proj-2"
        await waitUntil { transport.openedStreams.count == 2 }
        XCTAssertEqual(transport.openedStreams.last?.projectID, "proj-2")
        editor.projectID = ""
        await waitUntil { service.status == .idle }
        service.detach()

        let disabled = ScreenplayLiveDraftSyncService(transport: transport, deviceID: "x", isEnabled: false, isAuthenticated: { true })
        disabled.attach(to: editor)
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(transport.openedStreams.count, 2, "disabled service opens nothing")
        XCTAssertEqual(disabled.status, .idle)
    }
}
