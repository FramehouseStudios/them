import Foundation
import XCTest
@testable import them

@MainActor
final class OfflineTalkReplyDecodingTests: XCTestCase {
    private let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "decode-writer",
        clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    private let backend = URL(string: "https://reply-decoding.test")!

    func testRetainedPageUsesCanonicalDecoderWithoutNetworkOrAcknowledgement() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let page = "INT. OBSERVATORY - NIGHT\n\nMara keeps the scar.\n\nMARA\nKeep my exact words.\n"
        let output = try JSONSerialization.data(withJSONObject: ["target": "page", "format": "hollywood",
            "source": "studio_target", "text": page, "lines": []])
        let headers = ["content-type": "audio/mpeg", "x-transcript": "Write the scene",
            "x-reply": "Preview only", "x-turn-id": "received-turn", "x-turn-meta-available": "1",
            "x-screenplay-output-available": "1", "x-screenplay-output": String(decoding: output, as: UTF8.self)
                .addingPercentEncoding(withAllowedCharacters: .alphanumerics)!,
            "x-reply-role": "preview", "x-screenplay-authoritative": "1", "x-screenplay-sync-ready": "1"]
        let queue = makeQueue(directory)
        let packet = try await receive(queue, headers: headers)
        let result = try await client().decodeReceivedTalkReply(packet, initiatingIdentity: owner, backendURL: backend,
            currentScopeProvider: { .init(identity: self.owner, backendURL: self.backend) })
        defer { try? FileManager.default.removeItem(at: result.audioURL) }
        XCTAssertEqual(result.screenplayOutput?.text, page)
        XCTAssertEqual(result.reply, page.trimmingCharacters(in: .whitespacesAndNewlines))
        XCTAssertTrue(result.screenplayOutput?.writesToPage == true)
        XCTAssertTrue(result.renderContract.authoritativePageTextAvailable)
        XCTAssertEqual(result.commit?.turnId, "received-turn")
        XCTAssertEqual(result.commit?.sessionId, "", "Recovery must not adopt an old session credential.")
        XCTAssertFalse(result.streamedFirstSegment)
        XCTAssertEqual(try Data(contentsOf: result.audioURL), packet.response.body)
        let retained = try await queue.receivedReply(packet.entry.id, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(retained.response.id, packet.response.id, "Decoding is not durable writer delivery.")
    }

    func testIncompletePageOrInvalidAudioStaysHeldAndNeverGeneratesAgain() async throws {
        for headers in [
            ["content-type": "audio/mpeg", "x-turn-meta-available": "1", "x-turn-id": "audio-before-metadata", "x-reply": ""],
            ["content-type": "audio/mpeg", "x-screenplay-output-available": "1", "x-turn-meta-available": "1"],
            ["content-type": "audio/mpeg", "x-screenplay-authoritative": "1"],
            ["content-type": "application/json", "x-reply": "Not audio"]
        ] {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let queue = makeQueue(directory), packet = try await receive(queue, headers: headers)
            do {
                _ = try await client().decodeReceivedTalkReply(packet, initiatingIdentity: owner, backendURL: backend,
                    currentScopeProvider: { .init(identity: self.owner, backendURL: self.backend) })
                XCTFail("Incomplete result was declared delivered.")
            } catch {}
            let retained = try await queue.receivedReply(packet.entry.id, initiatingIdentity: owner, backendURL: backend)
            XCTAssertEqual(retained.response.id, packet.response.id)
            var sends = 0
            _ = await queue.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in
                sends += 1; return .init(statusCode: 200)
            }
            XCTAssertEqual(sends, 0)
        }
    }

    func testRecoveryRefusesDifferentAccountBackendAndStaleLoginIntent() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let packet = try await receive(makeQueue(directory), headers: ["content-type": "audio/mpeg", "x-reply": "Held"])
        let foreign = BackendAuthRequestIdentity(sessionEpoch: 2, userID: "another-writer", clientToken: "", accessToken: "", sessionIntentGeneration: 1)
        let relogged = BackendAuthRequestIdentity(sessionEpoch: 2, userID: owner.userID, clientToken: "", accessToken: "", sessionIntentGeneration: 2)
        for scope in [OfflineTalkRecoveryScope(identity: foreign, backendURL: backend),
            .init(identity: relogged, backendURL: backend),
            .init(identity: owner, backendURL: URL(string: "https://other.test")!)] {
            do {
                _ = try await client().decodeReceivedTalkReply(packet, initiatingIdentity: owner, backendURL: backend,
                    currentScopeProvider: { scope })
                XCTFail("A different account, backend or login intent decoded this response.")
            } catch {}
        }
    }

    private func makeQueue(_ directory: URL) -> OfflineTalkOutbox {
        let identity = owner, origin = backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in identity }, backendURLProvider: { origin })
    }

    private func receive(_ queue: OfflineTalkOutbox, headers: [String: String]) async throws -> OfflineTalkReceivedReply {
        var request = URLRequest(url: backend.appendingPathComponent("talk")); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        let entry = try await queue.enqueue(request: request, body: Data("original audio".utf8), reason: "offline").entry
        _ = await queue.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in
            .init(statusCode: 200, headers: headers, body: Data("ID3fixture".utf8))
        }
        return try await queue.receivedReply(entry.id, initiatingIdentity: owner, backendURL: backend)
    }

    private func client() -> BackendClient {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [NoRecoveryNetworkProtocol.self]
        return BackendClient(baseURL: backend, fallbackURL: backend, urlSession: .init(configuration: config),
            persistBackendBaseURL: false, attachUserIDHeader: false)
    }
}

private final class NoRecoveryNetworkProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        XCTFail("Retained-response decoding attempted a network request.")
        client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
    }
    override func stopLoading() {}
}
