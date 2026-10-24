import Foundation
import XCTest
@testable import them

@MainActor
final class OfflineTalkMetadataCustodyTests: XCTestCase {
    private let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "metadata-writer",
        clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    private let backend = URL(string: "https://metadata-custody.test")!

    override func tearDown() {
        MetadataCustodyProtocol.handler = nil
        super.tearDown()
    }

    func testFullPageMetadataIsDurableAndDecodesWithoutServerAfterRelaunch() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let queue = makeQueue(directory), original = try await receive(queue)
        let page = (1...100).map { "INT. ROOM \($0) - NIGHT\n\nMara keeps the exact words, including café.\n\nMARA\nDo not cut this line.\n" }.joined(separator: "\n")
        XCTAssertGreaterThan(page.utf8.count, 8_000)
        var calls = 0
        MetadataCustodyProtocol.handler = { request, transport in
            calls += 1
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/talk/turn/held-turn")
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-User-Id"), "metadata-writer")
            let data = try! JSONSerialization.data(withJSONObject: ["turn_id": "held-turn", "session_id": "fixture-credential",
                "unknown_credential": "not-retained", "transcript": "Write this scene", "reply": "Preview",
                "screenplay_output": ["target": "page", "format": "hollywood", "source": "studio_target", "text": page, "lines": []],
                "render_contract": ["reply_role": "preview", "authoritative_page_text_available": true, "sync_ready": true]])
            transport.complete(200, data)
        }
        let api = client()
        let captured = try await queue.captureReceivedTurnMetadata(original.entry.id, initiatingIdentity: owner, backendURL: backend, client: api)
        XCTAssertEqual(calls, 1)
        XCTAssertNotEqual(captured.response.id, original.response.id, "A stale incomplete preview must not acknowledge enriched content.")
        XCTAssertEqual(captured.response.body, original.response.body)
        do {
            try await queue.acknowledgeReceivedReply(original.entry.id, receiptID: original.response.id,
                initiatingIdentity: owner, backendURL: backend)
            XCTFail("An old receipt acknowledged newly captured page text.")
        } catch {}
        let data = try XCTUnwrap(captured.response.turnMetadata)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertNil(object["session_id"])
        XCTAssertNil(object["unknown_credential"])
        MetadataCustodyProtocol.handler = { _, transport in
            XCTFail("Relaunch decoding depended on volatile server metadata.")
            transport.complete(404, Data())
        }
        let relaunched = makeQueue(directory)
        let packet = try await relaunched.receivedReply(original.entry.id, initiatingIdentity: owner, backendURL: backend)
        let result = try await api.decodeReceivedTalkReply(packet, initiatingIdentity: owner, backendURL: backend,
            currentScopeProvider: { .init(identity: self.owner, backendURL: self.backend) })
        defer { try? FileManager.default.removeItem(at: result.audioURL) }
        XCTAssertEqual(result.screenplayOutput?.text, page)
        XCTAssertEqual(result.reply, page.trimmingCharacters(in: .whitespacesAndNewlines))
        XCTAssertTrue(result.renderContract.authoritativePageTextAvailable)
        let artifact = try await relaunched.exportRecoveryEntry(original.entry.id, initiatingIdentity: owner, backendURL: backend)
        let exported = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        let response = try XCTUnwrap(exported["response"] as? [String: Any])
        XCTAssertEqual(response["turn_metadata_base64"] as? String, data.base64EncodedString())
        var sends = 0
        _ = await relaunched.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }

    func testFailedLookupOrWrongTurnNeverReplacesRetainedAudioReceipt() async throws {
        for status in [404, 200] {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let queue = makeQueue(directory), original = try await receive(queue)
            MetadataCustodyProtocol.handler = { _, transport in
                transport.complete(status, Data(#"{"turn_id":"another-turn","reply":"wrong"}"#.utf8))
            }
            do {
                _ = try await queue.captureReceivedTurnMetadata(original.entry.id, initiatingIdentity: owner, backendURL: backend, client: client())
                XCTFail("Unavailable or different turn metadata was accepted.")
            } catch {}
            let packet = try await makeQueue(directory).receivedReply(original.entry.id, initiatingIdentity: owner, backendURL: backend)
            XCTAssertEqual(packet.response.id, original.response.id)
            XCTAssertEqual(packet.response.body, original.response.body)
            XCTAssertNil(packet.response.turnMetadata)
        }
    }

    func testDeletingHeldTurnWhileLookupIsOutstandingCannotResurrectIt() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let queue = makeQueue(directory), original = try await receive(queue)
        let started = expectation(description: "metadata GET is outstanding"), pending = PendingMetadataTransport()
        MetadataCustodyProtocol.handler = { _, transport in pending.store(transport); started.fulfill() }
        let api = client()
        let task = Task { try await queue.captureReceivedTurnMetadata(original.entry.id, initiatingIdentity: owner, backendURL: backend, client: api) }
        await fulfillment(of: [started], timeout: 5)
        _ = try await queue.deleteParkedEntries(confirmedEntryIDs: [original.entry.id], initiatingIdentity: owner, backendURL: backend)
        try XCTUnwrap(pending.take()).complete(200, Data(#"{"turn_id":"held-turn","reply":"late"}"#.utf8))
        do { _ = try await task.value; XCTFail("Deleted turn was accepted again.") } catch {}
        let state = try await makeQueue(directory).recoveryState(initiatingIdentity: owner, backendURL: backend)
        XCTAssertTrue(state.entries.isEmpty)
    }

    private func makeQueue(_ directory: URL) -> OfflineTalkOutbox {
        let identity = owner, origin = backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in identity }, backendURLProvider: { origin })
    }

    private func receive(_ queue: OfflineTalkOutbox) async throws -> OfflineTalkReceivedReply {
        var request = URLRequest(url: backend.appendingPathComponent("talk")); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        let entry = try await queue.enqueue(request: request, body: Data("original audio".utf8), reason: "offline").entry
        _ = await queue.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in
            .init(statusCode: 200, headers: ["content-type": "audio/mpeg", "x-turn-id": "held-turn",
                "x-turn-meta-available": "1", "x-screenplay-output-available": "1", "x-screenplay-authoritative": "1"], body: Data("ID3fixture".utf8))
        }
        return try await queue.receivedReply(entry.id, initiatingIdentity: owner, backendURL: backend)
    }

    private func client() -> BackendClient {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MetadataCustodyProtocol.self]
        let identity = owner
        return BackendClient(baseURL: backend, fallbackURL: backend, urlSession: .init(configuration: config),
                             persistBackendBaseURL: false, requestIdentityProvider: { _ in identity })
    }
}

private final class PendingMetadataTransport: @unchecked Sendable {
    private let lock = NSLock()
    private var transport: MetadataCustodyProtocol?
    func store(_ value: MetadataCustodyProtocol) { lock.lock(); defer { lock.unlock() }; transport = value }
    func take() -> MetadataCustodyProtocol? { lock.lock(); defer { lock.unlock() }; return transport }
}

private final class MetadataCustodyProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest, MetadataCustodyProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.handler?(request, self) }
    override func stopLoading() {}
    func complete(_ status: Int, _ data: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
