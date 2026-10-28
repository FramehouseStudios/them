import Foundation
import XCTest
@testable import them

@MainActor
final class BackendTalkLiveCustodyTests: XCTestCase {
    private var directory: URL!
    private var state: LiveClientFixture!
    private let backend = URL(string: "https://live-client.test")!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("LiveClient-\(UUID())")
        state = LiveClientFixture()
        LiveClientProtocol.fixture = state
    }
    override func tearDownWithError() throws {
        state.releaseHeld()
        LiveClientProtocol.fixture = nil
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    func testActualClientReturnsOnlyAfterExactResponseIsDurable() async throws {
        let box = queue(), api = client(box)
        let result = try await api.talkText(transcript: "Tell me a story", idempotencyKey: "live-success")
        defer { try? FileManager.default.removeItem(at: result.audioURL) }
        let delivery = try XCTUnwrap(result.liveDeliveryReceipt)
        let reopened = try await queue().receivedReply(delivery.receipt.entryID,
            initiatingIdentity: state.identity(), backendURL: backend)
        XCTAssertEqual(reopened.response.id, delivery.receipt.responseID)
        XCTAssertEqual(reopened.response.body, state.audio)
        XCTAssertEqual(result.reply, "A retained reply.")
        XCTAssertEqual(state.talkRequests.count, 1)
        XCTAssertEqual(reopened.entry.status, .parked, "Return/decode is not delivery acknowledgement")
    }

    func testAcceptedInvalidAudioNeverPostsAnotherGenerationAndKeepsExactEvidence() async throws {
        for kind in [LiveClientFixture.Mode.invalidType, .emptyAudio, .invalidSignature] {
            state.setMode(kind)
            let box = queue(), before = state.talkRequests.count
            do {
                _ = try await client(box).talkText(transcript: "Keep this request", idempotencyKey: "invalid-\(before)")
                XCTFail("Invalid accepted audio reported delivery success")
            } catch { XCTAssertTrue(error is BackendTalkAcceptedReplyError) }
            XCTAssertEqual(state.talkRequests.count, before + 1)
            let entries = await box.allEntries()
            let entry = try XCTUnwrap(entries.first { $0.idempotencyKey == "invalid-\(before)" })
            let kept = try await queue().receivedReply(entry.id, initiatingIdentity: state.identity(), backendURL: backend)
            XCTAssertEqual(kept.response.body, kind == .emptyAudio ? Data() : state.invalidAudio)
        }
        var generated = 0
        _ = await queue().drainDue(now: .distantFuture, initiatingIdentity: state.identity(), backendURL: backend) { _ in
            generated += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(generated, 0)
    }

    func testAuthRetryUsesOriginalMultipartBytesBoundaryAndRequestID() async throws {
        state.setMode(.authRetry)
        let result = try await client(queue()).talkText(transcript: "Exact original request", idempotencyKey: "auth-retry")
        defer { try? FileManager.default.removeItem(at: result.audioURL) }
        let sent = state.talkRequests
        XCTAssertEqual(sent.count, 2)
        guard sent.count == 2 else { return }
        XCTAssertFalse(sent[0].body.isEmpty)
        XCTAssertEqual(sent[0].body, sent[1].body)
        XCTAssertEqual(sent[0].contentType, sent[1].contentType)
        XCTAssertEqual(sent.map(\.key), ["auth-retry", "auth-retry"])
    }

    func testAccountSwitchAfterCompleteResponseKeepsAAndNeverLooksUpMetadataAsB() async throws {
        state.setMode(.switchOwner)
        let box = queue()
        do {
            _ = try await client(box).talkText(transcript: "Writer A words", idempotencyKey: "owner-switch")
            XCTFail("Old owner reply published into B")
        } catch { XCTAssertTrue(error is BackendTalkAcceptedReplyError) }
        let b = await box.allEntries()
        XCTAssertTrue(b.isEmpty)
        XCTAssertEqual(state.metadataRequests, 0)
        state.setOwner("writer-a")
        let a = await queue().allEntries()
        let entry = try XCTUnwrap(a.first)
        let retained = try await queue().receivedReply(entry.id, initiatingIdentity: state.identity(), backendURL: backend)
        XCTAssertEqual(retained.response.body, state.audio)
        XCTAssertEqual(state.talkRequests.count, 1)
    }

    func testMissingMetadataCanBeRepairedAfterRelaunchWithoutNewPost() async throws {
        state.setMode(.needsMetadata)
        let box = queue(), api = client(box)
        do {
            _ = try await api.talkText(transcript: "Write the scene", idempotencyKey: "metadata")
            XCTFail("A missing authoritative page was treated as delivered")
        } catch { XCTAssertTrue(error is BackendTalkAcceptedReplyError) }
        let entries = await queue().allEntries()
        let entry = try XCTUnwrap(entries.first)
        state.setMetadataReady()
        let repaired = try await queue().captureReceivedTurnMetadata(entry.id,
            initiatingIdentity: state.identity(), backendURL: backend, client: api)
        let result = try await api.decodeReceivedTalkReply(repaired, initiatingIdentity: state.identity(),
            backendURL: backend, currentScopeProvider: { [fixture = state!, origin = backend] in .init(identity: fixture.identity(), backendURL: origin) })
        defer { try? FileManager.default.removeItem(at: result.audioURL) }
        XCTAssertEqual(result.screenplayOutput?.text, state.page)
        XCTAssertEqual(state.talkRequests.count, 1)
        XCTAssertGreaterThanOrEqual(state.metadataRequests, 2)
    }

    func testExplicitStopBeforeResponseRetiresOnlyUnacceptedAdmission() async throws {
        state.setMode(.hold)
        let entered = expectation(description: "Actual talk waits before headers")
        state.onTalk = { entered.fulfill() }
        let box = queue(), api = client(box)
        let operation = Task { try await api.talkText(transcript: "Stop this turn", idempotencyKey: "stop") }
        await fulfillment(of: [entered], timeout: 3)
        operation.cancel()
        do { _ = try await operation.value; XCTFail("Stopped turn succeeded") }
        catch { XCTAssertTrue(error is CancellationError) }
        let entries = await queue().allEntries()
        XCTAssertTrue(entries.isEmpty)
        XCTAssertEqual(state.talkRequests.count, 1)
    }

    func testOptionalMetadataRateLimitKeepsReplyAndOriginalCooldownNotice() async throws {
        state.setMode(.rateLimitedMetadata)
        let result = try await client(queue()).talkText(transcript: "Talk with me", idempotencyKey: "metadata-cooldown")
        defer { try? FileManager.default.removeItem(at: result.audioURL) }
        XCTAssertEqual(result.reply, "A retained reply.")
        XCTAssertEqual(result.turnMetaRateLimitNotice?.turnId, "fixture-turn")
        XCTAssertEqual(result.turnMetaRateLimitNotice?.retryAfterMs, 1000)
        XCTAssertNotNil(result.liveDeliveryReceipt)
        XCTAssertEqual(state.talkRequests.count, 1)
        XCTAssertEqual(state.metadataRequests, 1)
    }

    func testCancellationDuringAcceptedWriteFailurePreservesOriginalHeldRequest() async throws {
        let entered = expectation(description: "Completed200 entered actual response write")
        let gate = LiveClientWriteGate()
        defer { gate.release(); try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: directory.appendingPathComponent("blobs").path) }
        let box = queue(beforeWrite: { entered.fulfill(); try gate.wait() })
        let api = client(box)
        let operation = Task { try await api.talkText(transcript: "Preserve these original words", idempotencyKey: "accepted-write-fault") }
        await fulfillment(of: [entered], timeout: 3)
        operation.cancel()
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: directory.appendingPathComponent("blobs").path)
        gate.release()
        do { _ = try await operation.value; XCTFail("Failed write acknowledged success") }
        catch { XCTAssertTrue(error is BackendTalkCustodyError, "Cancellation must not erase accepted-response failure identity") }
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: directory.appendingPathComponent("blobs").path)
        let reopened = queue(), rows = await reopened.allEntries()
        let original = try XCTUnwrap(rows.first)
        XCTAssertEqual(original.status, .parked)
        XCTAssertNotEqual(original.receivedReply, true)
        let artifact = try await reopened.exportRecoveryEntry(original.id, initiatingIdentity: state.identity(), backendURL: backend)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        let body = try XCTUnwrap((object["body_base64"] as? String).flatMap { Data(base64Encoded: $0) })
        XCTAssertNotNil(body.range(of: Data("Preserve these original words".utf8)))
        var sends = 0
        _ = await reopened.drainDue(now: .distantFuture, initiatingIdentity: state.identity(), backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
        XCTAssertEqual(state.talkRequests.count, 1)
    }

    func testOfflineFailureKeepsPreparedRequestParkedWithoutAutomaticResend() async throws {
        state.setMode(.offline)
        do { _ = try await client(queue()).talkText(transcript: "Offline writer words", idempotencyKey: "offline"); XCTFail("Offline succeeded") }
        catch { XCTAssertTrue(error is BackendTalkQueuedError) }
        let rows = await queue().allEntries()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .parked)
        let requests = state.talkRequests
        XCTAssertEqual(requests.count, 2)
        XCTAssertEqual(requests.first?.body, requests.last?.body)
    }

    func testContinueListeningRetiresRejectedAdmission() async throws {
        state.setMode(.continueListening)
        do { _ = try await client(queue()).talkText(transcript: "A fragment", idempotencyKey: "fragment"); XCTFail("Fragment succeeded") }
        catch { if case BackendError.continueListening = error {} else { XCTFail("Wrong fragment error: \(type(of: error))") } }
        let rows = await queue().allEntries()
        XCTAssertTrue(rows.isEmpty)
        XCTAssertEqual(state.talkRequests.count, 1)
    }

    private func queue(beforeWrite: (@Sendable () throws -> Void)? = nil) -> OfflineTalkOutbox {
        let state = state!, origin = backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in state.identity() },
            backendURLProvider: { origin }, beforeLiveResponseWrite: beforeWrite)
    }
    private func client(_ box: OfflineTalkOutbox) -> BackendClient {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [LiveClientProtocol.self]
        let state = state!
        return BackendClient(baseURL: backend, fallbackURL: backend, urlSession: .init(configuration: config),
            persistBackendBaseURL: false, talkOutbox: box, talkIdentityProvider: { _ in state.identity() })
    }
}

private nonisolated final class LiveClientFixture: @unchecked Sendable {
    enum Mode { case success, invalidType, emptyAudio, invalidSignature, authRetry, switchOwner, needsMetadata, rateLimitedMetadata, hold, offline, continueListening }
    struct Sent { let body: Data; let contentType: String; let key: String }
    let audio = Data("ID3accepted fixture audio".utf8), invalidAudio = Data("invalid audio".utf8)
    let page = "INT. OBSERVATORY - NIGHT\n\nThe writer keeps the scar.\n"
    private let lock = NSLock()
    private var owner = "writer-a", generation = 1, mode: Mode = .success, ready = false
    private var sent: [Sent] = [], metadataCount = 0, sessionCount = 0
    private var held: LiveClientProtocol?
    var onTalk: (() -> Void)?
    func identity() -> BackendAuthRequestIdentity {
        lock.lock(); defer { lock.unlock() }
        return .init(sessionEpoch: generation, userID: owner, clientToken: "fixture-client", accessToken: "fixture-\(owner)", sessionIntentGeneration: generation)
    }
    func setMode(_ value: Mode) { lock.lock(); mode = value; lock.unlock() }
    func setOwner(_ value: String) { lock.lock(); owner = value; generation += 1; lock.unlock() }
    func setMetadataReady() { lock.lock(); ready = true; lock.unlock() }
    var talkRequests: [Sent] { lock.lock(); defer { lock.unlock() }; return sent }
    var metadataRequests: Int { lock.lock(); defer { lock.unlock() }; return metadataCount }
    func releaseHeld() { lock.lock(); let value = held; held = nil; lock.unlock(); value?.fail(URLError(.cancelled)) }
    func stopped(_ transport: LiveClientProtocol) { lock.lock(); if held === transport { held = nil }; lock.unlock() }
    func handle(_ transport: LiveClientProtocol) {
        let request = transport.request, path = request.url!.path
        if path == "/session" {
            lock.lock(); sessionCount += 1; let count = sessionCount; lock.unlock()
            transport.complete(200, ["content-type":"application/json"], Data("{\"client_token\":\"fixture-session-\(count)\",\"expires_in\":3600}".utf8)); return
        }
        if path.hasPrefix("/talk/turn/") {
            lock.lock(); metadataCount += 1; let isReady = ready, mode = mode; lock.unlock()
            if mode == .rateLimitedMetadata {
                transport.complete(429, ["content-type":"application/json", "retry-after":"1"], Data(#"{"error":"rate_limited"}"#.utf8)); return
            }
            let object: [String: Any] = ["turn_id":"fixture-turn", "reply":page,
                "screenplay_output":["target":"page", "format":"hollywood", "source":"studio_target", "text":page, "lines":[]]]
            transport.complete(isReady ? 200 : 404, ["content-type":"application/json"], isReady ? (try! JSONSerialization.data(withJSONObject: object)) : Data("{}".utf8)); return
        }
        guard path == "/talk" else { transport.complete(404, [:], Data()); return }
        let body = Self.body(request)
        lock.lock()
        sent.append(.init(body: body, contentType: request.value(forHTTPHeaderField: "Content-Type") ?? "", key: request.value(forHTTPHeaderField: "X-Idempotency-Key") ?? ""))
        let count = sent.count, mode = mode
        if mode == .hold { held = transport }
        lock.unlock()
        onTalk?()
        if mode == .hold { return }
        if mode == .offline { transport.fail(URLError(.notConnectedToInternet)); return }
        if mode == .authRetry && count == 1 {
            transport.complete(401, ["content-type":"application/json"], Data(#"{"stage":"auth_client","error":"Refresh fixture token"}"#.utf8)); return
        }
        if mode == .continueListening {
            transport.complete(204, ["x-turn-status":"continue_listening"], Data()); return
        }
        var headers = ["content-type": mode == .invalidType ? "application/json" : "audio/mpeg", "x-reply":"A retained reply.", "x-turn-id":"fixture-turn"]
        if mode == .needsMetadata || mode == .switchOwner {
            headers.removeValue(forKey: "x-reply")
            headers["x-turn-meta-available"] = "1"; headers["x-screenplay-output-available"] = "1"; headers["x-screenplay-authoritative"] = "1"
        }
        if mode == .rateLimitedMetadata { headers["x-turn-meta-available"] = "1" }
        if mode == .switchOwner { setOwner("writer-b") }
        transport.complete(200, headers, mode == .emptyAudio ? Data() : (mode == .invalidType || mode == .invalidSignature ? invalidAudio : audio))
    }
    private static func body(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var result = Data(), buffer = [UInt8](repeating: 0, count: 8192)
        while true { let count = stream.read(&buffer, maxLength: buffer.count); if count <= 0 { break }; result.append(contentsOf: buffer.prefix(count)) }
        return result
    }
}

private nonisolated final class LiveClientProtocol: URLProtocol {
    nonisolated(unsafe) static var fixture: LiveClientFixture?
    private var owner: LiveClientFixture?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { owner = Self.fixture; owner?.handle(self) }
    override func stopLoading() { owner?.stopped(self) }
    func complete(_ status: Int, _ headers: [String:String], _ data: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        if !data.isEmpty { client?.urlProtocol(self, didLoad: data) }
        client?.urlProtocolDidFinishLoading(self)
    }
    func fail(_ error: Error) { client?.urlProtocol(self, didFailWithError: error) }
}

private nonisolated final class LiveClientWriteGate: @unchecked Sendable {
    private let condition = NSCondition()
    private var released = false
    func wait() throws {
        condition.lock(); defer { condition.unlock() }
        let deadline = Date().addingTimeInterval(5)
        while !released {
            if !condition.wait(until: deadline) { throw URLError(.timedOut) }
        }
    }
    func release() { condition.lock(); released = true; condition.broadcast(); condition.unlock() }
}
