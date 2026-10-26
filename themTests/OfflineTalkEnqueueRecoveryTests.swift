import Foundation
import XCTest
@testable import them

final class OfflineTalkEnqueueRecoveryTests: XCTestCase {
    private var directory: URL!
    private let backend = URL(string: "https://them.test")!
    private let exact = Data([0, 255, 13, 10]) + Data("Cafe\u{0301}.\r\n \t ".utf8)

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("TalkEnqueue-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory.appendingPathComponent("blobs"), withIntermediateDirectories: true)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: directory) }

    func testManifestFailureLeavesAnOwnedRequestRecoverableAfterRelaunchWithoutSendingIt() async throws {
        let original = queue()
        _ = await original.allEntries()
        let manifest = directory.appendingPathComponent("queue.jsonl")
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        do {
            _ = try await original.enqueue(request: request(), body: exact, reason: "offline", initiatingIdentity: owner())
            XCTFail("The failed manifest write was acknowledged.")
        } catch {}
        try FileManager.default.removeItem(at: manifest)
        let restored = queue()
        let recovery = try await restored.recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertEqual(recovery.entries.count, 1, "An interrupted enqueue disappeared from recovery.")
        let entry = try XCTUnwrap(recovery.entries.first)
        XCTAssertEqual(entry.status, .parked, "Recovery must require review, not an automatic paid retry.")
        let artifact = try await restored.exportRecoveryEntry(entry.id, initiatingIdentity: owner(), backendURL: backend)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        XCTAssertEqual(Data(base64Encoded: try XCTUnwrap(json["body_base64"] as? String)), exact)
        var calls = 0
        _ = await restored.drainDue(now: .distantFuture, initiatingIdentity: owner(), backendURL: backend) { _ in
            calls += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(calls, 0)
        let again = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertEqual(again.entries.map(\.id), [entry.id])
    }

    func testLegacyBodyWithoutOwnershipStaysQuarantinedAndHasARecoveryNotice() async throws {
        let blob = directory.appendingPathComponent("blobs/blob-legacy.multipart")
        try exact.write(to: blob)
        let state = try await queue().recoveryState(initiatingIdentity: owner(), backendURL: backend)
        XCTAssertTrue(state.entries.isEmpty)
        XCTAssertTrue(state.hasUnassignedEntries, "Unassigned bytes must not silently disappear from recovery status.")
        XCTAssertEqual(try Data(contentsOf: blob), exact)
    }

    private func owner(_ user: String = "writer-a") -> BackendAuthRequestIdentity {
        .init(sessionEpoch: 1, userID: user, clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    }
    private func queue(user: String = "writer-a", url: URL? = nil, fileManager: FileManager = .default) -> OfflineTalkOutbox {
        let identity = owner(user), origin = url ?? backend
        return OfflineTalkOutbox(storageDirectory: directory, fileManager: fileManager,
            requestIdentityProvider: { _ in identity }, backendURLProvider: { origin })
    }
    private func request() -> URLRequest {
        var request = URLRequest(url: backend.appendingPathComponent("talk"))
        request.httpMethod = "POST"
        request.setValue("writer-a", forHTTPHeaderField: "X-User-Id")
        request.setValue("durable-request", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("multipart/form-data; boundary=fixture", forHTTPHeaderField: "Content-Type")
        return request
    }
}

