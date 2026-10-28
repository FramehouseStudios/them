import Foundation
import XCTest
@testable import them

@MainActor
final class BackendStudioRenderCustodyTests: XCTestCase {
    private var directory: URL!
    private var fixture: RenderCustodyFixture!
    private let base = URL(string: "https://render-custody.test")!

    override func setUp() {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("RenderCustody-\(UUID())")
        fixture = RenderCustodyFixture(); RenderCustodyProtocol.fixture = fixture
    }
    override func tearDownWithError() throws {
        RenderCustodyProtocol.fixture = nil
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    func testActualJSONClientKeepsExactResponseAndOriginalRequestBeforeReturning() async throws {
        let result = try await client().renderRealtimeStudioResult(transcript: "My original direction", systemPrompt: "Write.", screenplayTarget: "page")
        XCTAssertEqual(result.reply, fixture.reply.trimmingCharacters(in: .whitespacesAndNewlines))
        let rows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(rows.first).id, initiatingIdentity: fixture.identity(), backendURL: base)
        XCTAssertEqual(packet.response.body, fixture.json)
        XCTAssertEqual(packet.response.headers["x-them-render-complete"], "1")
        let delivery = try XCTUnwrap(result.delivery)
        XCTAssertTrue(delivery.writesToPage)
        XCTAssertEqual(delivery.receipt.entryID, packet.entry.id)
        XCTAssertEqual(delivery.receipt.responseID, packet.response.id)
        XCTAssertEqual(delivery.request.owner, fixture.identity().ownerContext)
        XCTAssertEqual(delivery.request.backendURL, base)
        let request = try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(packet.requestBody)) as? [String: Any])
        XCTAssertEqual(request["transcript"] as? String, "My original direction")
        XCTAssertNil(packet.entry.headers["Authorization"])
        XCTAssertNil(packet.entry.headers["X-Client-Token"])
        XCTAssertEqual(fixture.generations, 1)
    }

    func testMalformedAcceptedJSONIsKeptAndCannotBecomeAnotherGeneration() async throws {
        fixture.mode = .malformed
        do { _ = try await client().renderRealtimeStudioResult(transcript: "Keep this", systemPrompt: "Write."); XCTFail("Malformed response succeeded") }
        catch {
            XCTAssertTrue(error is BackendTalkAcceptedReplyError)
            XCTAssertFalse(StudioRenderExecutionPolicy.shouldRetry(for: error))
            XCTAssertFalse(StudioRenderExecutionPolicy.shouldFallback(for: error))
        }
        let rows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(rows.first).id, initiatingIdentity: fixture.identity(), backendURL: base)
        XCTAssertEqual(packet.response.body, Data("malformed accepted JSON".utf8))
        XCTAssertEqual(fixture.generations, 1)
    }

    func testAcceptedJSONConnectionLossKeepsAvailablePrefixWithoutAutomaticRetry() async throws {
        fixture.mode = .partialJSON
        do { _ = try await client().renderRealtimeStudioResult(transcript: "Keep partial", systemPrompt: "Write."); XCTFail("Partial JSON succeeded") }
        catch { XCTAssertTrue(error is BackendStudioRenderUnconfirmedError); XCTAssertFalse(StudioRenderExecutionPolicy.shouldRetry(for: error)) }
        let rows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(rows.first).id, initiatingIdentity: fixture.identity(), backendURL: base)
        // URLSession may deliver its failure before handing buffered URLProtocol
        // bytes to the delegate. The observed prefix may consequently be empty;
        // the direct transport regression pins bytes actually handed to it.
        XCTAssertTrue(Data("{\"reply\":\"accepted prefix".utf8).starts(with: packet.response.body))
        XCTAssertEqual(packet.response.headers["x-them-render-complete"], "0")
        XCTAssertEqual(fixture.generations, 1)
    }

    func testCreatedJSONStatusIsRetainedWithItsActualStatus() async throws {
        fixture.mode = .created
        _ = try await client().renderRealtimeStudioResult(transcript: "Keep created", systemPrompt: "Write.")
        let rows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(rows.first).id, initiatingIdentity: fixture.identity(), backendURL: base)
        XCTAssertEqual(packet.response.statusCode, 201)
        XCTAssertEqual(packet.response.body, fixture.json)
    }

    func testMalformedDoneCannotPromoteEarlierPassingTraceAndPartialToSuccess() async throws {
        fixture.mode = .malformedDone
        do { _ = try await client().streamRealtimeStudioResult(transcript: "Write", systemPrompt: "Write.", screenplayTarget: "page"); XCTFail("Malformed done became authoritative") }
        catch { XCTAssertTrue(error is BackendTalkAcceptedReplyError); XCTAssertFalse(StudioRenderExecutionPolicy.shouldFallback(for: error)) }
        let rows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(rows.first).id, initiatingIdentity: fixture.identity(), backendURL: base)
        XCTAssertTrue(String(decoding: packet.response.body, as: UTF8.self).contains("not-json"))
        XCTAssertEqual(fixture.generations, 1)
    }

    func testDamagedPendingIndexCannotReplayAReadyRenderRequest() async throws {
        let box = queue(), owner = fixture.identity()
        var request = URLRequest(url: base.appendingPathComponent(StudioRenderEndpoint.oneShotPath))
        request.httpMethod = "POST"; request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(owner.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("index-proof", forHTTPHeaderField: "X-Idempotency-Key")
        let admission = try await box.admitLiveStudioRender(request: request, body: Data("{}".utf8), owner: owner, backendURL: base)
        let manifest = directory.appendingPathComponent("queue.jsonl")
        let lines = try String(contentsOf: manifest, encoding: .utf8).split(separator: "\n")
        var row = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(XCTUnwrap(lines.first).utf8)) as? [String: Any])
        row["status"] = "pending"; row["nextAttemptAt"] = 0
        var changed = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]); changed.append(10)
        try changed.write(to: manifest)
        let reopened = queue()
        var sends = 0
        _ = await reopened.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: base) { _ in sends += 1; return .init(statusCode: 200) }
        let rows = await reopened.allEntries()
        XCTAssertEqual(sends, 0); XCTAssertEqual(rows.first?.id, admission.entryID); XCTAssertEqual(rows.first?.status, .parked)
    }

    func testSSEPartialIsDurableBeforeItsCallbackAndDoneIsRetained() async throws {
        fixture.mode = .stream
        let box = queue(), origin = base, state = fixture!, probe = RenderCustodyProbe()
        let result = try await client(box).streamRealtimeStudioResult(transcript: "Write", systemPrompt: "Write.", screenplayTarget: "page", onPartial: { _ in
            do {
                let rows = await box.allEntries()
                let entry = try XCTUnwrap(rows.first)
                let packet = try await box.receivedReply(entry.id, initiatingIdentity: state.identity(), backendURL: origin)
                await probe.append(!packet.response.body.isEmpty)
            } catch { await probe.append(false) }
        })
        XCTAssertEqual(result.reply, fixture.reply.trimmingCharacters(in: .whitespacesAndNewlines))
        let observed = await probe.values
        XCTAssertFalse(observed.isEmpty); XCTAssertTrue(observed.allSatisfy { $0 })
        let rows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(rows.first).id, initiatingIdentity: fixture.identity(), backendURL: base)
        XCTAssertTrue(String(decoding: packet.response.body, as: UTF8.self).contains("event: done"))
        XCTAssertEqual(packet.response.headers["x-them-render-complete"], "1")
        let delivery = try XCTUnwrap(result.delivery)
        XCTAssertTrue(delivery.writesToPage)
        XCTAssertEqual(delivery.receipt.responseID, packet.response.id)
        XCTAssertEqual(delivery.request.admission.entryID, packet.entry.id)
    }

    func testCutSSEIsHeldWithoutQualityApprovalOrAutomaticReplay() async throws {
        fixture.mode = .cut
        do { _ = try await client().streamRealtimeStudioResult(transcript: "Write", systemPrompt: "Write.", screenplayTarget: "page"); XCTFail("Cut stream succeeded") }
        catch {
            XCTAssertTrue(error is BackendTalkAcceptedReplyError)
            XCTAssertFalse(StudioRenderExecutionPolicy.shouldRetry(for: error))
            XCTAssertFalse(StudioRenderExecutionPolicy.shouldFallback(for: error))
        }
        let rows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(rows.first).id, initiatingIdentity: fixture.identity(), backendURL: base)
        XCTAssertEqual(packet.response.headers["x-them-render-complete"], "0")
        XCTAssertTrue(String(decoding: packet.response.body, as: UTF8.self).contains("event: delta"))
        var sends = 0
        _ = await queue().drainDue(now: .distantFuture, initiatingIdentity: fixture.identity(), backendURL: base) { _ in sends += 1; return .init(statusCode: 200) }
        XCTAssertEqual(sends, 0); XCTAssertEqual(fixture.generations, 1)
    }

    func testOwnerSwitchAfterPartialKeepsAcceptedAWithoutReturningItToB() async throws {
        fixture.mode = .stream
        let state = fixture!
        do {
            _ = try await client().streamRealtimeStudioResult(transcript: "Write", systemPrompt: "Write.", screenplayTarget: "page", onPartial: { _ in state.switchOwner("writer-b") })
            XCTFail("Old owner received completion")
        } catch { XCTAssertTrue(error is BackendTalkAcceptedReplyError) }
        let bRows = await queue().allEntries(); XCTAssertTrue(bRows.isEmpty)
        state.switchOwner("writer-a")
        let aRows = await queue().allEntries()
        let packet = try await queue().receivedReply(XCTUnwrap(aRows.first).id, initiatingIdentity: state.identity(), backendURL: base)
        XCTAssertTrue(String(decoding: packet.response.body, as: UTF8.self).contains("event: done"))
        XCTAssertEqual(fixture.generations, 1)
    }

    func testFailedAcceptedWriteKeepsRequestAndNeverBecomesRetryable() async throws {
        let box = queue(beforeWrite: { throw URLError(.cannotWriteToFile) })
        do { _ = try await client(box).renderRealtimeStudioResult(transcript: "Write", systemPrompt: "Write."); XCTFail("Storage failure succeeded") }
        catch { XCTAssertTrue(error is BackendTalkCustodyError); XCTAssertFalse(StudioRenderExecutionPolicy.shouldRetry(for: error)) }
        let rows = await queue().allEntries()
        XCTAssertEqual(rows.count, 1); XCTAssertNotEqual(rows.first?.receivedReply, true)
        XCTAssertEqual(rows.first?.status, .parked); XCTAssertEqual(fixture.generations, 1)
    }

    func testStreamPrefixCannotShrinkChangeOrOverwriteCompletedResult() async throws {
        let box = queue(), owner = fixture.identity()
        var request = URLRequest(url: base.appendingPathComponent(StudioRenderEndpoint.streamPath))
        request.httpMethod = "POST"; request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(owner.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("prefix-proof", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let admission = try await box.admitLiveStudioRender(request: request, body: Data("{}".utf8), owner: owner, backendURL: base)
        func save(_ text: String, _ complete: Bool) async throws {
            _ = try await box.checkpointStudioRender(admission, response: .init(statusCode: 200,
                headers: ["content-type":"text/event-stream"], body: Data(text.utf8)), responseURL: request.url!, complete: complete)
        }
        try await save("first", false)
        do { try await save("different", false); XCTFail("Changed prefix accepted") } catch {}
        do { try await save("fir", false); XCTFail("Shrunk prefix accepted") } catch {}
        try await save("first done", true)
        do { try await save("first done later", true); XCTFail("Completed result changed") } catch {}
        let packet = try await box.receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: base)
        XCTAssertEqual(packet.response.body, Data("first done".utf8))
        do { _ = try await box.enqueue(request: request, body: Data("{}".utf8), reason: "retry"); XCTFail("Render entered replay queue") } catch {}
        XCTAssertFalse(packet.entry.canResumeInterruptedEnqueue)
    }

    func testDeadlineAndAcceptedUnderlyingNetworkErrorsDoNotRetryOrFallback() async throws {
        let errors: [Error] = [BackendStudioRenderDeadlineError(), BackendTalkAcceptedReplyError(entryID: "kept", underlyingError: URLError(.networkConnectionLost))]
        for error in errors {
            XCTAssertFalse(StudioRenderExecutionPolicy.shouldRetry(for: error))
            XCTAssertFalse(StudioRenderExecutionPolicy.shouldFallback(for: error))
        }
        XCTAssertTrue(StudioRenderExecutionPolicy.shouldRetry(for: URLError(.notConnectedToInternet)))
        do {
            let _: String = try await StudioRenderExecutionPolicy.withTimeout(seconds: 0.001) {
                try await Task.sleep(nanoseconds: 10_000_000_000); return "late"
            }
            XCTFail("Deadline succeeded")
        } catch { XCTAssertTrue(error is BackendStudioRenderDeadlineError) }
    }

    private func queue(beforeWrite: (@Sendable () throws -> Void)? = nil) -> OfflineTalkOutbox {
        let state = fixture!, base = base
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in state.identity() }, backendURLProvider: { base }, beforeLiveResponseWrite: beforeWrite)
    }
    private func client(_ box: OfflineTalkOutbox? = nil) -> BackendClient {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [RenderCustodyProtocol.self]
        let state = fixture!
        return BackendClient(baseURL: base, fallbackURL: base, urlSession: .init(configuration: config), persistBackendBaseURL: false,
            talkOutbox: box ?? queue(), talkIdentityProvider: { _ in state.identity() })
    }
}

private actor RenderCustodyProbe { var values: [Bool] = []; func append(_ value: Bool) { values.append(value) } }

private nonisolated final class RenderCustodyFixture: @unchecked Sendable {
    enum Mode { case json, malformed, stream, cut, partialJSON, created, malformedDone }
    let reply = "INT. CAFE - NIGHT\r\nA cafe\u{0301} stays open.  \r\n"
    private let lock = NSLock()
    private var owner = "writer-a", generation = 1, count = 0, selectedMode: Mode = .json
    var mode: Mode { get { lock.lock(); defer { lock.unlock() }; return selectedMode } set { lock.lock(); selectedMode = newValue; lock.unlock() } }
    var generations: Int { lock.lock(); defer { lock.unlock() }; return count }
    var json: Data { try! JSONSerialization.data(withJSONObject: ["ok":true,"reply":reply,"screenplay_quality":["ok":true]], options: [.sortedKeys]) }
    func identity() -> BackendAuthRequestIdentity {
        lock.lock(); defer { lock.unlock() }
        return .init(sessionEpoch: generation, userID: owner, clientToken: "fixture-client", accessToken: "fixture-token", sessionIntentGeneration: generation)
    }
    func switchOwner(_ user: String) { lock.lock(); owner = user; generation += 1; lock.unlock() }
    func handle(_ transport: RenderCustodyProtocol) {
        let path = transport.request.url!.path
        if path == "/health" { transport.respond(Data("{\"ok\":true}".utf8)); return }
        if path == "/session" { transport.respond(Data("{\"client_token\":\"fixture-client\",\"expires_in\":3600}".utf8)); return }
        guard StudioRenderEndpoint.paths.contains(path) else { transport.respond(Data(), status: 404); return }
        lock.lock(); count += 1; let mode = selectedMode; lock.unlock()
        if mode == .malformed { transport.respond(Data("malformed accepted JSON".utf8)); return }
        if mode == .partialJSON { transport.interrupt(Data("{\"reply\":\"accepted prefix".utf8)); return }
        if mode == .created { transport.respond(json, status: 201); return }
        if mode == .json { transport.respond(json); return }
        let delta = String(data: try! JSONSerialization.data(withJSONObject: ["delta":reply]), encoding: .utf8)!
        let done = String(data: json, encoding: .utf8)!
        let trace = mode == .malformedDone ? "event: trace\ndata: {\"screenplay_quality\":{\"ok\":true}}\n\n" : ""
        let frames = trace + "event: delta\ndata: \(delta)\n\n" + (mode == .cut ? "" : "event: done\ndata: \(mode == .malformedDone ? "not-json" : done)\n\n")
        transport.respond(Data(frames.utf8), contentType: "text/event-stream")
    }
}

private nonisolated final class RenderCustodyProtocol: URLProtocol {
    nonisolated(unsafe) static var fixture: RenderCustodyFixture?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.fixture?.handle(self) }
    override func stopLoading() {}
    func interrupt(_ body: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["content-type":"application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
    }
    func respond(_ body: Data, status: Int = 200, contentType: String = "application/json") {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["content-type":contentType])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body); client?.urlProtocolDidFinishLoading(self)
    }
}
