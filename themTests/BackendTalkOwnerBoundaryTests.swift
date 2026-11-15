import Foundation
import XCTest
@testable import them

@MainActor
final class BackendTalkOwnerBoundaryTests: XCTestCase {
    func testTalkRejectsExplicitOldOwnerBeforeHealth() async throws {
        let fixture = TalkOwnerFixture(initial: TalkOwnerFixture.ownerB)
        defer { fixture.close() }
        await assertSuperseded { try await fixture.voice(expectedOwner: TalkOwnerFixture.ownerA.ownerContext) }
        XCTAssertTrue(fixture.requests.snapshot().isEmpty)
        XCTAssertEqual(fixture.requests.tokenCalls(), 0)
    }

    func testTalkTextRejectsExplicitOldOwnerBeforeBootstrap() async throws {
        let fixture = TalkOwnerFixture(initial: TalkOwnerFixture.ownerB)
        defer { fixture.close() }
        await assertSuperseded { try await fixture.client.talkText(transcript: "Test story.",
            expectedOwner: TalkOwnerFixture.ownerA.ownerContext) }
        XCTAssertTrue(fixture.requests.snapshot().isEmpty)
        XCTAssertEqual(fixture.requests.tokenCalls(), 0)
    }

    func testTalkCapturesOwnerBeforeHealthSuspends() async throws {
        let fixture = TalkOwnerFixture(handler: { request, identity, _ in
            if request.url?.path == "/health" { identity.replace(TalkOwnerFixture.ownerB) }
            return .healthy
        })
        defer { fixture.close() }
        await assertSuperseded { try await fixture.voice() }
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/health"])
        XCTAssertEqual(fixture.requests.tokenCalls(), 0)
    }

    func testTalkBootstrapSwitchCannotFallBackAndUploadOldStory() async throws {
        let fixture = TalkOwnerFixture(tokenResolver: { identity in
            identity.replace(TalkOwnerFixture.ownerB)
            throw URLError(.cannotConnectToHost)
        })
        defer { fixture.close() }
        await assertSuperseded { try await fixture.voice() }
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/health"])
        XCTAssertEqual(fixture.requests.tokenCalls(), 1)
    }

    func testTalkTextBootstrapSwitchCannotFallBackAndUploadOldStory() async throws {
        let fixture = TalkOwnerFixture(tokenResolver: { identity in
            identity.replace(TalkOwnerFixture.ownerB)
            return "client-b"
        })
        defer { fixture.close() }
        await assertSuperseded { try await fixture.client.talkText(transcript: "Test story.") }
        XCTAssertTrue(fixture.requests.snapshot().isEmpty)
        XCTAssertEqual(fixture.requests.tokenCalls(), 1)
    }

    func testExplicitSupersessionErrorIsNeverAnEmptyTokenFallback() async throws {
        let fixture = TalkOwnerFixture(tokenResolver: { _ in
            throw BackendMemoryAPIError.server(status: 409, message: "request_owner_superseded")
        })
        defer { fixture.close() }
        await assertSuperseded { try await fixture.client.talkText(transcript: "Test story.") }
        XCTAssertTrue(fixture.requests.snapshot().isEmpty)
    }

    func testSameOwnerRefreshUsesFreshAtomicHeadersAndDeliversContent() async throws {
        let fixture = TalkOwnerFixture(tokenResolver: { identity in
            identity.replace(TalkOwnerFixture.refreshedA)
            return "client-a-refreshed"
        })
        defer { fixture.close() }
        let callbacks = TalkOwnerCallbackLog()
        let result = try await fixture.client.talkText(transcript: "Test story.", idempotencyKey: "owner-boundary-test",
            onResponseMetadataReady: { _ in callbacks.record("metadata") },
            onFirstAudioSegmentReady: { callbacks.record("audio", url: $0) },
            onTextReady: { _ in callbacks.record("text") }, expectedOwner: TalkOwnerFixture.ownerA.ownerContext)
        await drainMainQueue()
        defer { cleanupAudio(result, callbacks: callbacks) }
        let request = try XCTUnwrap(fixture.requests.snapshot().first)
        XCTAssertEqual(request.path, "/talk")
        XCTAssertEqual(request.authorization, "Bearer access-a-refreshed")
        XCTAssertEqual(request.userID, "owner-a")
        XCTAssertEqual(request.clientToken, "client-a-refreshed")
        XCTAssertEqual(request.idempotencyKey, "owner-boundary-test")
        XCTAssertTrue(String(decoding: request.body, as: UTF8.self).contains("Test story."))
        XCTAssertEqual(result.reply, "Test reply.")
        XCTAssertEqual(result.transcript, "Test story.")
        XCTAssertEqual(Set(callbacks.events()), Set(["metadata", "text", "audio"]))
        XCTAssertEqual(callbacks.events().count, 3)
    }

    func testOwnerSwitchOnSuccessfulResponseDropsResultAndAllContentCallbacks() async throws {
        let fixture = TalkOwnerFixture(handler: { _, identity, _ in
            identity.replace(TalkOwnerFixture.ownerB)
            return .audio()
        })
        defer { fixture.close() }
        let callbacks = TalkOwnerCallbackLog()
        await assertSuperseded { try await fixture.client.talkText(transcript: "Test story.",
            onResponseMetadataReady: { _ in callbacks.record("metadata") },
            onFirstAudioSegmentReady: { callbacks.record("audio", url: $0) },
            onTextReady: { _ in callbacks.record("text") }) }
        await drainMainQueue()
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/talk"])
        XCTAssertTrue(callbacks.events().isEmpty)
    }

    func testQueuedCallbacksRecheckOwnerAtDeliveryAfterMetadataChangesAccount() async throws {
        let bodyGate = TalkOwnerBodyGate()
        let fixture = TalkOwnerFixture(handler: { _, _, _ in .audio(bodyGate: bodyGate) })
        defer { fixture.close() }
        let callbacks = TalkOwnerCallbackLog()
        let metadataDelivered = expectation(description: "Metadata delivered before gated body")
        let request = Task { @MainActor in
            try await fixture.client.talkText(transcript: "Test story.",
                onResponseMetadataReady: { _ in
                    callbacks.record("metadata")
                    fixture.identity.replace(TalkOwnerFixture.ownerB)
                    metadataDelivered.fulfill()
                    bodyGate.open()
                },
                onFirstAudioSegmentReady: { callbacks.record("audio", url: $0) },
                onTextReady: { _ in callbacks.record("text") })
        }
        await fulfillment(of: [metadataDelivered], timeout: 3)
        bodyGate.open() // Also releases the request if an incorrect implementation omits metadata.
        await assertSuperseded { try await request.value }
        await drainMainQueue()
        XCTAssertEqual(callbacks.events(), ["metadata"])
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/talk"])
    }

    func testOwnerChangeOnRetryableResponsePreventsAnySecondUpload() async throws {
        let fixture = TalkOwnerFixture(handler: { _, identity, _ in
            identity.replace(TalkOwnerFixture.ownerB)
            return .json(status: 503, body: #"{"error":"temporary"}"#)
        })
        defer { fixture.close() }
        await assertSuperseded { try await fixture.client.talkText(transcript: "Test story.") }
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/talk"])
    }

    func testOwnerChangeOnUnauthorizedResponsePreventsAuthRefreshReplay() async throws {
        let fixture = TalkOwnerFixture(handler: { _, identity, _ in
            identity.replace(TalkOwnerFixture.ownerB)
            return .json(status: 401, body: #"{"stage":"auth_user","error":"user_auth_required"}"#)
        })
        defer { fixture.close() }
        await assertSuperseded { try await fixture.client.talkText(transcript: "Test story.") }
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/talk"])
        XCTAssertEqual(fixture.requests.tokenCalls(), 1)
    }

    func testUnchangedOwnerRetryPreservesExactMultipartAndIdempotency() async throws {
        let fixture = TalkOwnerFixture(handler: { _, _, requests in
            if requests.snapshot().count == 1 { return .json(status: 503, body: #"{"error":"temporary"}"#) }
            return .audio()
        })
        defer { fixture.close() }
        let result = try await fixture.client.talkText(transcript: "Test story.", idempotencyKey: "unchanged-retry")
        defer { cleanupAudio(result) }
        let requests = fixture.requests.snapshot()
        XCTAssertEqual(requests.map(\.path), ["/talk", "/talk"])
        XCTAssertEqual(requests.map(\.idempotencyKey), ["unchanged-retry", "unchanged-retry"])
        XCTAssertEqual(requests.first?.body, requests.last?.body)
        XCTAssertEqual(result.reply, "Test reply.")
    }

    func testTurnMetadataOwnerSwitchCannotBeSwallowedAsOptionalMetadataFailure() async throws {
        let fixture = TalkOwnerFixture(handler: { request, identity, _ in
            if request.url?.path == "/talk" {
                return .audio(extraHeaders: ["x-turn-id": "test-turn", "x-turn-meta-available": "1"])
            }
            identity.replace(TalkOwnerFixture.ownerB)
            return .json(status: 200, body: #"{"turn_id":"test-turn","reply":"Test reply."}"#)
        })
        defer { fixture.close() }
        await assertSuperseded { try await fixture.client.talkText(transcript: "Test story.") }
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/talk", "/talk/turn/test-turn"])
    }

    func testRecoveredSTTFailureRemainsDecodedFailureWithoutEarlyContent() async throws {
        let fixture = TalkOwnerFixture(handler: { _, _, _ in
            .audio(extraHeaders: ["x-turn-status": "error_recovered", "x-turn-error-stage": "stt",
                "x-turn-error-message": "Speech service unavailable.", "x-turn-meta-available": "0"],
                includeContent: false)
        })
        defer { fixture.close() }
        let callbacks = TalkOwnerCallbackLog()
        let result = try await fixture.client.talkText(transcript: "Test story.",
            onResponseMetadataReady: { _ in callbacks.record("metadata") },
            onFirstAudioSegmentReady: { callbacks.record("audio", url: $0) },
            onTextReady: { _ in callbacks.record("text") })
        await drainMainQueue()
        defer { cleanupAudio(result, callbacks: callbacks) }
        XCTAssertEqual(result.turnStatus, "error_recovered")
        XCTAssertEqual(result.turnErrorStage, "stt")
        XCTAssertEqual(result.turnErrorMessage, "Speech service unavailable.")
        XCTAssertNil(result.transcript)
        XCTAssertNil(result.reply)
        XCTAssertNil(result.commit)
        XCTAssertNil(result.screenplayOutput)
        XCTAssertFalse(result.streamedFirstSegment)
        XCTAssertTrue(callbacks.events().isEmpty, "Recovery explanation audio must not begin as a successful story reply.")
        XCTAssertEqual(fixture.requests.snapshot().map(\.path), ["/talk"])
    }

    private func assertSuperseded(_ operation: () async throws -> BackendTalkResult,
                                  file: StaticString = #filePath, line: UInt = #line) async {
        do {
            let unexpected = try await operation()
            cleanupAudio(unexpected)
            XCTFail("Expected owner supersession.", file: file, line: line)
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409, file: file, line: line)
            XCTAssertEqual(message, "request_owner_superseded", file: file, line: line)
        } catch { XCTFail("Unexpected error: \(error)", file: file, line: line) }
    }

    private func drainMainQueue() async {
        await withCheckedContinuation { continuation in DispatchQueue.main.async { continuation.resume() } }
    }

    private func cleanupAudio(_ result: BackendTalkResult, callbacks: TalkOwnerCallbackLog? = nil) {
        let urls = [result.audioURL] + [result.streamedRemainderURL].compactMap { $0 } + (callbacks?.urls() ?? [])
        for url in Set(urls) { try? FileManager.default.removeItem(at: url) }
    }
}

@MainActor
private final class TalkOwnerFixture {
    nonisolated static let ownerA = BackendAuthRequestIdentity(sessionEpoch: 31, userID: "owner-a", clientToken: "client-a",
        accessToken: "access-a", sessionIntentGeneration: 7)
    nonisolated static let ownerB = BackendAuthRequestIdentity(sessionEpoch: 32, userID: "owner-b", clientToken: "client-b",
        accessToken: "access-b", sessionIntentGeneration: 8)
    nonisolated static let refreshedA = BackendAuthRequestIdentity(sessionEpoch: 33, userID: "owner-a", clientToken: "client-a-refreshed",
        accessToken: "access-a-refreshed", sessionIntentGeneration: 7)
    let client: BackendClient
    let identity: TalkOwnerIdentityBox
    let requests = TalkOwnerRequestLog()
    private let session: URLSession
    private let host = "talk-owner-\(UUID().uuidString.lowercased()).test"

    init(initial: BackendAuthRequestIdentity = ownerA,
         tokenResolver: (@Sendable (TalkOwnerIdentityBox) async throws -> String)? = nil,
         handler: @escaping @Sendable (URLRequest, TalkOwnerIdentityBox, TalkOwnerRequestLog) throws -> TalkOwnerHTTPStub = { request, _, _ in
             request.url?.path == "/health" ? .healthy : .audio()
         }) {
        identity = TalkOwnerIdentityBox(initial)
        let box = identity, log = requests
        TalkOwnerURLProtocol.register(host: host) { request in
            log.record(request)
            return try handler(request, box, log)
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [TalkOwnerURLProtocol.self]
        session = URLSession(configuration: configuration)
        let url = URL(string: "https://\(host)")!
        client = BackendClient(baseURL: url, fallbackURL: url, urlSession: session,
            persistBackendBaseURL: false, requestIdentityProvider: { _ in box.snapshot() },
            talkClientTokenResolver: { _, _ in
                log.recordTokenCall()
                if let tokenResolver { return try await tokenResolver(box) }
                return box.snapshot().clientToken
            })
    }

    func voice(expectedOwner: ScreenplayStudioAuthContext? = nil) async throws -> BackendTalkResult {
        try await client.talk(fileURL: URL(fileURLWithPath: "/unused-unit-recording.wav"),
            fileDataOverride: TalkOwnerHTTPStub.wav, expectedOwner: expectedOwner)
    }
    func close() { session.invalidateAndCancel(); TalkOwnerURLProtocol.unregister(host: host) }
}

private final class TalkOwnerIdentityBox: @unchecked Sendable {
    private let lock = NSLock()
    private var value: BackendAuthRequestIdentity
    init(_ value: BackendAuthRequestIdentity) { self.value = value }
    func snapshot() -> BackendAuthRequestIdentity { lock.lock(); defer { lock.unlock() }; return value }
    func replace(_ next: BackendAuthRequestIdentity) { lock.lock(); defer { lock.unlock() }; value = next }
}

private final class TalkOwnerRequestLog: @unchecked Sendable {
    struct Entry { let path: String, authorization: String, userID: String, clientToken: String, idempotencyKey: String; let body: Data }
    private let lock = NSLock()
    private var entries: [Entry] = []
    private var tokenCallCount = 0
    func record(_ request: URLRequest) {
        var body = request.httpBody ?? Data()
        if body.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 1024)
            while body.count < 1_000_000 {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }; body.append(contentsOf: buffer.prefix(count))
            }
        }
        let entry = Entry(path: request.url?.path ?? "", authorization: request.value(forHTTPHeaderField: "Authorization") ?? "",
            userID: request.value(forHTTPHeaderField: "X-User-Id") ?? "", clientToken: request.value(forHTTPHeaderField: "X-Client-Token") ?? "",
            idempotencyKey: request.value(forHTTPHeaderField: "X-Idempotency-Key") ?? "", body: body)
        lock.lock(); defer { lock.unlock() }; entries.append(entry)
    }
    func recordTokenCall() { lock.lock(); defer { lock.unlock() }; tokenCallCount += 1 }
    func tokenCalls() -> Int { lock.lock(); defer { lock.unlock() }; return tokenCallCount }
    func snapshot() -> [Entry] { lock.lock(); defer { lock.unlock() }; return entries }
}

private final class TalkOwnerCallbackLog: @unchecked Sendable {
    private let lock = NSLock()
    private var names: [String] = []
    private var files: [URL] = []
    func record(_ name: String, url: URL? = nil) {
        lock.lock(); defer { lock.unlock() }; names.append(name); if let url { files.append(url) }
    }
    func events() -> [String] { lock.lock(); defer { lock.unlock() }; return names }
    func urls() -> [URL] { lock.lock(); defer { lock.unlock() }; return files }
}

private struct TalkOwnerHTTPStub {
    let status: Int, headers: [String: String], body: Data
    var bodyGate: TalkOwnerBodyGate? = nil
    static var healthy: Self { .json(status: 200, body: #"{"ok":true}"#) }
    static func json(status: Int, body: String) -> Self {
        Self(status: status, headers: ["Content-Type": "application/json"], body: Data(body.utf8))
    }
    static func audio(extraHeaders: [String: String] = [:], includeContent: Bool = true, bodyGate: TalkOwnerBodyGate? = nil) -> Self {
        var headers = ["Content-Type": "audio/wav", "x-tts-first-bytes": "1024"]
        if includeContent { headers["x-reply"] = "Test reply."; headers["x-transcript"] = "Test story." }
        headers.merge(extraHeaders) { _, supplied in supplied }
        return Self(status: 200, headers: headers, body: wav, bodyGate: bodyGate)
    }
    static var wav: Data {
        let samples = Data(repeating: 0, count: 4096)
        func u16(_ value: UInt16) -> Data { var value = value.littleEndian; return Data(bytes: &value, count: 2) }
        func u32(_ value: UInt32) -> Data { var value = value.littleEndian; return Data(bytes: &value, count: 4) }
        return Data("RIFF".utf8) + u32(UInt32(36 + samples.count)) + Data("WAVEfmt ".utf8) + u32(16)
            + u16(1) + u16(1) + u32(16000) + u32(32000) + u16(2) + u16(16)
            + Data("data".utf8) + u32(UInt32(samples.count)) + samples
    }
}

private final class TalkOwnerBodyGate: @unchecked Sendable {
    private let lock = NSLock()
    private var isOpen = false
    private var pending: (() -> Void)?
    func whenOpened(_ action: @escaping () -> Void) {
        lock.lock()
        if isOpen { lock.unlock(); action() } else { pending = action; lock.unlock() }
    }
    func open() {
        lock.lock(); isOpen = true; let action = pending; pending = nil; lock.unlock()
        action?()
    }
}

private final class TalkOwnerURLProtocol: URLProtocol {
    typealias Handler = (URLRequest) throws -> TalkOwnerHTTPStub
    private static let lock = NSLock()
    nonisolated(unsafe) private static var handlers: [String: Handler] = [:]
    static func register(host: String, handler: @escaping Handler) { lock.lock(); defer { lock.unlock() }; handlers[host] = handler }
    static func unregister(host: String) { lock.lock(); defer { lock.unlock() }; handlers.removeValue(forKey: host) }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); let handler = Self.handlers[request.url?.host ?? ""]; Self.lock.unlock()
        guard let handler else { client?.urlProtocol(self, didFailWithError: URLError(.unsupportedURL)); return }
        do {
            let stub = try handler(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: stub.status, httpVersion: "HTTP/1.1", headerFields: stub.headers)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            let finish = { [self] in
                client?.urlProtocol(self, didLoad: stub.body)
                client?.urlProtocolDidFinishLoading(self)
            }
            if let gate = stub.bodyGate { gate.whenOpened(finish) } else { finish() }
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
