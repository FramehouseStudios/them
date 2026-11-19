import Foundation
import XCTest
@testable import them

final class BackendTurnOwnerBoundaryTests: XCTestCase {
    func testFirstPageProjectAndVersionRejectOwnerChangeDuringBootstrap() async throws {
        let operations: [(BackendMemoryAPI) async throws -> Void] = [
            { api in
                _ = try await api.upsertScreenplayProject(title: "Draft", activate: false,
                    expectedOwner: TurnOwnerFixture.ownerA.ownerContext)
            },
            { api in
                _ = try await api.upsertScreenplayProjectVersion(projectId: "project", draft: "New scene",
                    activate: false, expectedOwner: TurnOwnerFixture.ownerA.ownerContext)
            },
        ]
        for operation in operations {
            let fixture = TurnOwnerFixture(transition: .bootstrap(TurnOwnerFixture.ownerB))
            defer { fixture.close() }
            do {
                try await operation(fixture.api)
                XCTFail("The first-page mutation must reject the superseded owner.")
            } catch BackendMemoryAPIError.server(let status, let message) {
                XCTAssertEqual(status, 409)
                XCTAssertEqual(message, "request_owner_superseded")
            }
            XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/session"])
        }
    }

    func testIdentityOwnerUsesIntentGenerationRatherThanRotatingTokenOrEpoch() async throws {
        let original = TurnOwnerFixture.ownerA
        let refreshed = TurnOwnerFixture.refreshedA
        XCTAssertEqual(original.ownerContext, refreshed.ownerContext)
        XCTAssertNotEqual(original.ownerContext, TurnOwnerFixture.reauthenticatedA.ownerContext)
        let legacy = BackendAuthRequestIdentity(
            sessionEpoch: 1, userID: "legacy-owner", clientToken: "client", accessToken: "access"
        )
        XCTAssertEqual(legacy.ownerContext,
            ScreenplayStudioAuthContext(userID: "legacy-owner", sessionIntentGeneration: 0))
    }

    func testCommitDoesNotRebindToOwnerWhoReplacesItDuringBootstrap() async throws {
        await verifyBootstrapSwitch(.commit, replacement: TurnOwnerFixture.ownerB)
    }

    func testAnnotationDoesNotRebindToOwnerWhoReplacesItDuringBootstrap() async throws {
        await verifyBootstrapSwitch(.annotation, replacement: TurnOwnerFixture.ownerB)
    }

    func testCommitRejectsExplicitOldOwnerBeforeAnyRequest() async throws {
        await verifyPreEntryOwner(.commit)
    }

    func testAnnotationRejectsExplicitOldOwnerBeforeAnyRequest() async throws {
        await verifyPreEntryOwner(.annotation)
    }

    func testCommitUsesFreshBearerWhenSameOwnerRotatesDuringBootstrap() async throws {
        try await verifySameOwnerRotation(.commit)
    }

    func testAnnotationUsesFreshBearerWhenSameOwnerRotatesDuringBootstrap() async throws {
        try await verifySameOwnerRotation(.annotation)
    }

    func testCommitRejectsSupersededSuccessfulResponseWithoutStateOrNotifications() async throws {
        await verifyResponseSwitch(.commit)
    }

    func testAnnotationRejectsSupersededSuccessfulResponseWithoutStateOrNotifications() async throws {
        await verifyResponseSwitch(.annotation)
    }

    func testNewIntentForSameUserSupersedesBothPendingMutationKinds() async throws {
        for operation in TurnOwnerOperation.allCases {
            await verifyBootstrapSwitch(operation, replacement: TurnOwnerFixture.reauthenticatedA)
        }
    }

    func testCommitDoesNotReplayUnauthorizedMutationAfterBearerRotation() async throws {
        await verifyUnauthorizedIsNotReplayed(.commit)
    }

    func testAnnotationDoesNotReplayUnauthorizedMutationAfterBearerRotation() async throws {
        await verifyUnauthorizedIsNotReplayed(.annotation)
    }

    func testNotificationChecksOwnerAtDeliveryAndNeverPostsSynchronously() async throws {
        let marker = UUID().uuidString
        let name = Notification.Name("THEM.tests.owner-delivery.\(marker)")
        let identity = TurnOwnerIdentityBox(TurnOwnerFixture.ownerA)
        let recorder = TurnOwnerNotificationProbe(names: [name], marker: marker)
        defer { recorder.close() }
        await MainActor.run {
            postBackendNotificationOnMain(
                name: name, userInfo: ["marker": marker],
                shouldDeliver: { identity.snapshot().ownerContext == TurnOwnerFixture.ownerA.ownerContext }
            )
            XCTAssertTrue(recorder.snapshot().isEmpty, "Delivery must always be queued, including on MainActor.")
            identity.replace(with: TurnOwnerFixture.ownerB)
        }
        await drainMainQueue()
        XCTAssertTrue(recorder.snapshot().isEmpty, "The owner changed after enqueue but before delivery.")
        await MainActor.run {
            postBackendNotificationOnMain(name: name, userInfo: ["marker": marker])
            XCTAssertTrue(recorder.snapshot().isEmpty, "The default delivery path must also remain asynchronous.")
        }
        await drainMainQueue()
        XCTAssertEqual(recorder.snapshot(), [name.rawValue], "A current, unguarded notification must still be delivered once.")
    }

    func testDeferredEvolutionSyncRejectsOwnerChangedInsidePolicy() async throws {
        let policyCalled = expectation(description: "Deferred evolution policy ran")
        let fixture = TurnOwnerEvolutionFixture(replacement: TurnOwnerFixture.ownerB, policyCalled: policyCalled)
        defer { fixture.close() }
        await enqueueEvolution(on: fixture.api)
        await fulfillment(of: [policyCalled], timeout: 3)
        // The policy runs on the inherited API actor. This query cannot pass
        // it until the child returned or reached its network await.
        _ = await fixture.api.currentSyncState()
        let activeTasks = await fixture.activeTaskCount()
        XCTAssertEqual(activeTasks, 0, "A superseded evolution write must not even enqueue a URLSession task.")
        XCTAssertTrue(fixture.requests.snapshot().isEmpty,
            "A deferred update must not send the prior owner's state under the replacement account.")
    }

    func testDeferredEvolutionSyncUsesInjectedSessionAndFreshSameOwnerHeaders() async throws {
        let policyCalled = expectation(description: "Deferred evolution policy ran")
        let requestReceived = expectation(description: "Injected session received evolution PATCH")
        let fixture = TurnOwnerEvolutionFixture(replacement: TurnOwnerFixture.refreshedA,
            policyCalled: policyCalled, requestReceived: requestReceived)
        defer { fixture.close() }
        await enqueueEvolution(on: fixture.api, expectedOwner: TurnOwnerFixture.ownerA.ownerContext)
        await fulfillment(of: [policyCalled, requestReceived], timeout: 3, enforceOrder: true)
        let requests = fixture.requests.snapshot()
        XCTAssertEqual(requests.map(\.path), ["/session/evolution"])
        let request = try XCTUnwrap(requests.first)
        XCTAssertEqual(request.method, "PATCH")
        XCTAssertEqual(request.authorization, "Bearer access-a-refreshed")
        XCTAssertEqual(request.clientToken, "client-a-refreshed")
        XCTAssertEqual(request.userID, "owner-a")
        let captured = try XCTUnwrap(fixture.payload.snapshot())
        XCTAssertEqual(captured.timeout, 8)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: captured.data) as? [String: Any])
        XCTAssertEqual(payload["stage"] as? Int, 2)
        XCTAssertEqual(payload["session_count"] as? Int, 3)
        XCTAssertEqual(try XCTUnwrap(payload["depth_score"] as? Double), 1.23, accuracy: 0.00001)
        XCTAssertEqual(try XCTUnwrap(payload["reassurance_need"] as? Double), 0.123, accuracy: 0.00001)
        XCTAssertEqual(payload["last_theme_cue"] as? String, "revision")
        XCTAssertEqual(payload["preferred_name"] as? String, "Test Writer")
        XCTAssertEqual(payload["is_screenwriter"] as? Bool, true)
        XCTAssertEqual(payload["latest_user_message"] as? String, "Please be direct about this scene.")
    }

    private func enqueueEvolution(on api: BackendMemoryAPI, expectedOwner: ScreenplayStudioAuthContext? = nil) async {
        await api.syncEvolutionState(stage: 2, depthScore: 1.234, romanceTension: 0.456, sessionCount: 3,
            reassuranceNeed: 0.1234, boundaryNeed: 0.2345, playfulMomentum: 0.3456, trustSignal: 0.4567,
            lastThemeCue: "  revision  ", preferredName: "  Test Writer  ", isScreenwriter: true,
            latestUserMessage: "  Please be direct about this scene.  ", expectedOwner: expectedOwner)
    }

    private func verifyBootstrapSwitch(
        _ operation: TurnOwnerOperation,
        replacement: BackendAuthRequestIdentity,
        file: StaticString = #filePath, line: UInt = #line
    ) async {
        let fixture = TurnOwnerFixture(transition: .bootstrap(replacement))
        defer { fixture.close() }
        await assertSuperseded(operation, fixture: fixture, file: file, line: line)
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/session"],
            "\(operation): replacing the owner during bootstrap must prevent the mutation.", file: file, line: line)
        let sync = await fixture.api.currentSyncState()
        XCTAssertEqual(sync, .empty, file: file, line: line)
    }

    private func verifyPreEntryOwner(
        _ operation: TurnOwnerOperation,
        file: StaticString = #filePath, line: UInt = #line
    ) async {
        let fixture = TurnOwnerFixture(initial: TurnOwnerFixture.ownerB)
        defer { fixture.close() }
        await assertSuperseded(operation, fixture: fixture,
            expectedOwner: TurnOwnerFixture.ownerA.ownerContext, file: file, line: line)
        XCTAssertTrue(fixture.requests.snapshot().isEmpty,
            "\(operation): an explicit stale owner must fail before bootstrap or mutation.", file: file, line: line)
    }

    private func verifySameOwnerRotation(
        _ operation: TurnOwnerOperation,
        file: StaticString = #filePath, line: UInt = #line
    ) async throws {
        let fixture = TurnOwnerFixture(transition: .bootstrap(TurnOwnerFixture.refreshedA))
        defer { fixture.close() }
        let notifications = TurnOwnerNotificationProbe(marker: fixture.marker)
        defer { notifications.close() }
        let result = try await operation.perform(on: fixture.api,
            expectedOwner: TurnOwnerFixture.ownerA.ownerContext)
        let requests = fixture.requests.snapshot()
        XCTAssertEqual(requests.map(\.path), ["/session", operation.path], file: file, line: line)
        let mutation = try XCTUnwrap(requests.last, file: file, line: line)
        XCTAssertEqual(mutation.method, "POST", file: file, line: line)
        XCTAssertEqual(mutation.authorization, "Bearer access-a-refreshed", file: file, line: line)
        XCTAssertEqual(mutation.userID, "owner-a", file: file, line: line)
        XCTAssertEqual(mutation.clientToken, "client-a-refreshed", file: file, line: line)
        XCTAssertEqual(result.payload.turnId, "turn-\(fixture.marker)", file: file, line: line)
        XCTAssertEqual(result.sync.stateVersion, "state-\(fixture.marker)", file: file, line: line)
        let current = await fixture.api.currentSyncState()
        XCTAssertEqual(current, result.sync, file: file, line: line)
        await drainMainQueue()
        let names = notifications.snapshot()
        XCTAssertEqual(names.filter { $0 == Notification.Name.themBackendSyncUpdated.rawValue }.count, 1,
            file: file, line: line)
        XCTAssertEqual(names.filter { $0 == Notification.Name.themTurnCommitted.rawValue }.count, 1,
            file: file, line: line)
        if operation == .commit {
            XCTAssertEqual(names.filter { $0 == Notification.Name.themScreenplayQuestionResolved.rawValue }.count, 1,
                file: file, line: line)
        }
    }

    private func verifyResponseSwitch(
        _ operation: TurnOwnerOperation,
        file: StaticString = #filePath, line: UInt = #line
    ) async {
        let fixture = TurnOwnerFixture(transition: .response(TurnOwnerFixture.ownerB))
        defer { fixture.close() }
        let notifications = TurnOwnerNotificationProbe(marker: fixture.marker)
        defer { notifications.close() }
        let before = await fixture.api.currentSyncState()
        await assertSuperseded(operation, fixture: fixture, file: file, line: line)
        let after = await fixture.api.currentSyncState()
        XCTAssertEqual(after, before, "\(operation): a stale successful response must not change local sync.",
            file: file, line: line)
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/session", operation.path],
            file: file, line: line)
        XCTAssertEqual(fixture.requests.snapshot().last?.userID, "owner-a", file: file, line: line)
        await drainMainQueue()
        XCTAssertTrue(notifications.snapshot().isEmpty,
            "\(operation): stale turn, sync and question events must not escape.", file: file, line: line)
    }

    private func verifyUnauthorizedIsNotReplayed(
        _ operation: TurnOwnerOperation,
        file: StaticString = #filePath, line: UInt = #line
    ) async {
        let fixture = TurnOwnerFixture(transition: .response(TurnOwnerFixture.refreshedA), mutationStatus: 401)
        defer { fixture.close() }
        do {
            _ = try await operation.perform(on: fixture.api)
            XCTFail("Unauthorized mutation should fail.", file: file, line: line)
        } catch BackendMemoryAPIError.server(let status, _) {
            XCTAssertEqual(status, 401, file: file, line: line)
        } catch {
            XCTFail("Unexpected error: \(error)", file: file, line: line)
        }
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/session", operation.path],
            "Mutation retries require an explicit replay contract.", file: file, line: line)
        let current = await fixture.api.currentSyncState()
        XCTAssertEqual(current, .empty, file: file, line: line)
    }

    private func assertSuperseded(
        _ operation: TurnOwnerOperation, fixture: TurnOwnerFixture,
        expectedOwner: ScreenplayStudioAuthContext? = nil,
        file: StaticString = #filePath, line: UInt = #line
    ) async {
        do {
            _ = try await operation.perform(on: fixture.api, expectedOwner: expectedOwner)
            XCTFail("\(operation): expected captured owner to be rejected.", file: file, line: line)
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409, file: file, line: line)
            XCTAssertEqual(message, "request_owner_superseded", file: file, line: line)
        } catch {
            XCTFail("\(operation): unexpected error: \(error)", file: file, line: line)
        }
    }

    private func drainMainQueue() async {
        await withCheckedContinuation { continuation in
            DispatchQueue.main.async { continuation.resume() }
        }
    }
}

private enum TurnOwnerOperation: CaseIterable {
    case commit, annotation
    var path: String { self == .commit ? "/realtime/turn_commit" : "/history/annotate_turn" }

    func perform(on api: BackendMemoryAPI, expectedOwner: ScreenplayStudioAuthContext? = nil) async throws
        -> BackendReadResult<BackendRealtimeTurnCommitResponse> {
        switch self {
        case .commit:
            return try await api.commitRealtimeTurn(userMessage: "A test story direction.",
                assistantMessage: "INT. TEST ROOM - DAY\n\nA lamp turns on.",
                requestId: "turn-owner-boundary", studioMetadata: Self.metadata, expectedOwner: expectedOwner)
        case .annotation:
            return try await api.annotateTurnHistory(turnId: "existing-test-turn",
                studioMetadata: Self.metadata, expectedOwner: expectedOwner)
        }
    }

    private static var metadata: BackendStudioThreadCommitMetadata {
        BackendStudioThreadCommitMetadata(
            screenplayProjectId: "test-project", screenplayDocumentRevisionId: "test-revision",
            screenplayTarget: "page", screenplayPromptSource: "typed", screenplayWriteId: "test-write",
            screenplayAnchorLine: nil, screenplayAnchorEndLine: nil, screenplayInsertionMode: "append",
            screenplayAnchorSceneLabel: "", screenplayAnchorDraftSceneId: "", screenplayAnchorOutlineSceneId: "",
            screenplayAnchorOutlineBeatIds: [], screenplayAnchorScriptNodeId: "", screenplayNoteTitle: "",
            screenplayNoteBody: "", screenplayInsertedText: "A lamp turns on.", screenplayReplacementApplied: false,
            screenplayReplacedWriteId: "", screenplayRevisedBlockText: "", screenplayResolvedAnchorExcerpt: ""
        )
    }
}

private final class TurnOwnerFixture {
    enum Transition { case none, bootstrap(BackendAuthRequestIdentity), response(BackendAuthRequestIdentity) }
    static let ownerA = identity(user: "owner-a", epoch: 21, intent: 4, suffix: "a")
    static let ownerB = identity(user: "owner-b", epoch: 22, intent: 5, suffix: "b")
    static let refreshedA = identity(user: "owner-a", epoch: 23, intent: 4, suffix: "a-refreshed")
    static let reauthenticatedA = identity(user: "owner-a", epoch: 24, intent: 5, suffix: "a-new-intent")
    let marker = UUID().uuidString.lowercased()
    let identity: TurnOwnerIdentityBox
    let requests = TurnOwnerRequestLog()
    let api: BackendMemoryAPI
    private let session: URLSession
    private let host: String

    init(initial: BackendAuthRequestIdentity = ownerA, transition: Transition = .none, mutationStatus: Int = 200) {
        identity = TurnOwnerIdentityBox(initial)
        host = "turn-owner-\(marker).test"
        let box = identity, log = requests, uniqueMarker = marker
        TurnOwnerURLProtocol.register(host: host) { request in
            log.record(request)
            if request.url?.path == "/session" {
                if case .bootstrap(let replacement) = transition { box.replace(with: replacement) }
                // Exercise the real bootstrap await, without writing shared credentials.
                // Both mutation APIs intentionally tolerate bootstrap failure (try?).
                return (503, Data(#"{"error":"controlled_bootstrap_unavailable"}"#.utf8))
            }
            if case .response(let replacement) = transition { box.replace(with: replacement) }
            guard mutationStatus == 200 else {
                return (mutationStatus, Data(#"{"stage":"auth_user","error":"user_auth_required"}"#.utf8))
            }
            let payload: [String: Any] = [
                "ok": true, "action": "turn_commit", "status": "committed",
                "turn_id": "turn-\(uniqueMarker)", "session_id": "session-\(uniqueMarker)",
                "state_version": "state-\(uniqueMarker)", "last_updated_at": 100,
                "history_updated_at": 100, "memory_updated_at": 100,
                "screenplay_question_resolution": [
                    "question_id": "question-\(uniqueMarker)", "response_status": "answered"
                ]
            ]
            return (200, try JSONSerialization.data(withJSONObject: payload))
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TurnOwnerURLProtocol.self]
        session = URLSession(configuration: configuration)
        api = BackendMemoryAPI(session: session, baseURL: URL(string: "https://\(host)")!,
            requestIdentityProvider: { _ in box.snapshot() })
    }

    func close() {
        session.invalidateAndCancel()
        TurnOwnerURLProtocol.unregister(host: host)
    }

    private static func identity(user: String, epoch: Int, intent: Int, suffix: String) -> BackendAuthRequestIdentity {
        BackendAuthRequestIdentity(sessionEpoch: epoch, userID: user, clientToken: "client-\(suffix)",
            accessToken: "access-\(suffix)", sessionIntentGeneration: intent)
    }
}

private final class TurnOwnerIdentityBox: @unchecked Sendable {
    private let lock = NSLock()
    private var value: BackendAuthRequestIdentity
    init(_ value: BackendAuthRequestIdentity) { self.value = value }
    func snapshot() -> BackendAuthRequestIdentity { lock.lock(); defer { lock.unlock() }; return value }
    func replace(with next: BackendAuthRequestIdentity) { lock.lock(); defer { lock.unlock() }; value = next }
}

private final class TurnOwnerRequestLog: @unchecked Sendable {
    struct Entry {
        let path: String, method: String, authorization: String, userID: String, clientToken: String
    }
    private let lock = NSLock()
    private var entries: [Entry] = []
    func record(_ request: URLRequest) {
        let entry = Entry(path: request.url?.path ?? "", method: request.httpMethod ?? "",
            authorization: request.value(forHTTPHeaderField: "Authorization") ?? "",
            userID: request.value(forHTTPHeaderField: "X-User-Id") ?? "",
            clientToken: request.value(forHTTPHeaderField: "X-Client-Token") ?? "")
        lock.lock(); defer { lock.unlock() }; entries.append(entry)
    }
    func snapshot() -> [Entry] { lock.lock(); defer { lock.unlock() }; return entries }
}

private final class TurnOwnerNotificationProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var values: [String] = []
    private var observers: [NSObjectProtocol] = []
    init(names: [Notification.Name] = [.themTurnCommitted, .themBackendSyncUpdated, .themScreenplayQuestionResolved],
         marker: String) {
        observers = names.map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: nil) { [weak self] notification in
                guard notification.userInfo?.values.contains(where: {
                    ($0 as? String)?.contains(marker) == true
                }) == true else { return }
                self?.record(notification.name.rawValue)
            }
        }
    }
    private func record(_ value: String) { lock.lock(); defer { lock.unlock() }; values.append(value) }
    func snapshot() -> [String] { lock.lock(); defer { lock.unlock() }; return values }
    func close() { observers.forEach(NotificationCenter.default.removeObserver); observers.removeAll() }
}

private final class TurnOwnerURLProtocol: URLProtocol {
    typealias Handler = (URLRequest) throws -> (Int, Data)
    private static let lock = NSLock()
    nonisolated(unsafe) private static var handlers: [String: Handler] = [:]
    static func register(host: String, handler: @escaping Handler) {
        lock.lock(); defer { lock.unlock() }; handlers[host] = handler
    }
    static func unregister(host: String) { lock.lock(); defer { lock.unlock() }; handlers.removeValue(forKey: host) }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        let handler = Self.handlers[request.url?.host ?? ""]
        Self.lock.unlock()
        guard let handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return
        }
        do {
            let (status, data) = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

private final class TurnOwnerEvolutionFixture {
    let requests = TurnOwnerRequestLog()
    let payload = TurnOwnerEvolutionPayload()
    let api: BackendMemoryAPI
    private let session: URLSession
    private let host = "evolution-owner-\(UUID().uuidString.lowercased()).test"

    init(replacement: BackendAuthRequestIdentity, policyCalled: XCTestExpectation,
         requestReceived: XCTestExpectation? = nil) {
        let identity = TurnOwnerIdentityBox(TurnOwnerFixture.ownerA)
        let log = requests, capture = payload
        TurnOwnerURLProtocol.register(host: host) { request in
            log.record(request)
            capture.record(request)
            requestReceived?.fulfill()
            return (204, Data())
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TurnOwnerURLProtocol.self]
        session = URLSession(configuration: configuration)
        api = BackendMemoryAPI(session: session, baseURL: URL(string: "https://\(host)")!,
            requestIdentityProvider: { _ in identity.snapshot() },
            evolutionSyncPolicy: { _, _ in
                identity.replace(with: replacement)
                policyCalled.fulfill()
                return true
            })
    }

    func activeTaskCount() async -> Int {
        await withCheckedContinuation { continuation in
            session.getAllTasks { continuation.resume(returning: $0.count) }
        }
    }

    func close() {
        session.invalidateAndCancel()
        TurnOwnerURLProtocol.unregister(host: host)
    }
}

private final class TurnOwnerEvolutionPayload: @unchecked Sendable {
    struct Snapshot { let data: Data; let timeout: TimeInterval }
    private let lock = NSLock()
    private var value: Snapshot?
    func record(_ request: URLRequest) {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 1024)
            while data.count < 65_536 {
                let count = stream.read(&buffer, maxLength: min(buffer.count, 65_536 - data.count))
                guard count > 0 else { break }
                data.append(contentsOf: buffer.prefix(count))
            }
        }
        let captured = Snapshot(data: data, timeout: request.timeoutInterval)
        lock.lock(); defer { lock.unlock() }; value = captured
    }
    func snapshot() -> Snapshot? { lock.lock(); defer { lock.unlock() }; return value }
}
