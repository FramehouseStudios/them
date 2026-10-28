import Foundation
import XCTest
@testable import them

@MainActor
final class OfflineTalkLivePageIntentTests: XCTestCase {
    private var directory: URL!
    private let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "intent-writer",
        clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    private let backend = URL(string: "https://live-intent.test")!
    private let before = "INT. ROOM - NIGHT\r\nJOHN\r\nOld cafe\u{0301} line.  \r\n"
    private let insertion = "Keep the scar."
    private var range: NSRange { (before as NSString).range(of: "Old cafe\u{0301} line.") }
    private var after: String { (before as NSString).replacingCharacters(in: range, with: insertion) }

    override func setUp() {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("LiveIntent-\(UUID())")
    }
    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    func testEarlyReplacementIsDurableAndExportableWithoutPretendingResponseCompleted() async throws {
        let box = queue(), admission = try await admit(box)
        let plan = try await prepare(box, admission)
        let reopened = queue(), rows = await reopened.allEntries()
        let row = try XCTUnwrap(rows.first)
        XCTAssertEqual(row.hasLivePageIntent, true)
        XCTAssertNotEqual(row.receivedReply, true)
        XCTAssertFalse(row.canResumeInterruptedEnqueue)
        let artifact = try await reopened.exportRecoveryEntry(row.id, initiatingIdentity: owner, backendURL: backend)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        XCTAssertNil(payload["response"])
        XCTAssertEqual(payload["delivery_state"] as? String, "prepared_reply_incomplete")
        let exported = try XCTUnwrap(payload["page_delivery"] as? [String: Any])
        XCTAssertTrue((exported["beforeDraft"] as? String)?.utf8.elementsEqual(before.utf8) == true)
        XCTAssertTrue((exported["afterDraft"] as? String)?.utf8.elementsEqual(after.utf8) == true)
        XCTAssertEqual(plan.receiptID, OfflineTalkPageDeliveryPlan.pendingReceiptID(entryID: admission.entryID))
        let cancelled = try await reopened.endLiveTalkWithoutAcceptedResponse(admission)
        XCTAssertFalse(cancelled, "Cancellation alone cannot prove a prepared page was rolled back")
        var sends = 0
        _ = await reopened.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }

    func testCompletedResponseAtomicallyBindsExistingMutationWithoutReplacingItsIdentity() async throws {
        let box = queue(), admission = try await admit(box), pending = try await prepare(box, admission)
        let receipt = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        let packet = try await queue().receivedReply(receipt.entryID, initiatingIdentity: owner, backendURL: backend)
        let bound = try XCTUnwrap(packet.pageDelivery)
        XCTAssertEqual(bound.id, pending.id)
        XCTAssertEqual(bound.liveMutation, pending.liveMutation)
        XCTAssertEqual(bound.receiptID, packet.response.id)
        XCTAssertTrue(bound.afterDraft.utf8.elementsEqual(after.utf8))
        do {
            try await box.acknowledgeReceivedReply(receipt.entryID, receiptID: packet.response.id,
                initiatingIdentity: owner, backendURL: backend)
            XCTFail("A receiver with no page-save evidence erased the live plan")
        } catch {}
    }

    func testRepeatedPreparationIsIdempotentButDifferentMutationCannotOverwriteIt() async throws {
        let box = queue(), admission = try await admit(box)
        let first = try await prepare(box, admission), same = try await prepare(box, admission)
        XCTAssertEqual(first.id, same.id)
        do {
            _ = try await box.prepareLivePageDelivery(admission, projectID: "project-a", documentID: "document-a",
                beforeDraft: before, range: range, insertion: "Other words", afterDraft: after,
                owner: owner, backendURL: backend)
            XCTFail("A different operation silently replaced pending page custody")
        } catch {}
        let kept = try await prepare(box, admission)
        XCTAssertEqual(kept.id, first.id)
        XCTAssertTrue(kept.afterDraft.utf8.elementsEqual(after.utf8))
    }

    func testUnboundHomePageCanKeepIntentBeforeItsFirstProjectExists() async throws {
        let box = queue(), admission = try await admit(box)
        let plan = try await box.prepareLivePageDelivery(admission, projectID: "", documentID: "home-document",
            beforeDraft: "", range: NSRange(location: 0, length: 0), insertion: "INT. SPACE - NIGHT\nA set.",
            afterDraft: "INT. SPACE - NIGHT\nA set.", owner: owner, backendURL: backend)
        XCTAssertEqual(plan.projectID, "")
        let receipt = try await box.completeLiveTalk(admission, response: accepted(), responseURL: backend.appendingPathComponent("talk"))
        let restored = try await queue().receivedReply(receipt.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(restored.pageDelivery?.documentID, "home-document")
        XCTAssertEqual(restored.pageDelivery?.projectID, "")
    }

    func testLiveReplacementDoesNotWeakenLegacyAppendValidation() async throws {
        let box = queue(), admission = try await admit(box)
        let live = try await prepare(box, admission)
        let response = try OfflineTalkStoredResponse(accepted())
        var legacy = live
        legacy.liveMutation = nil
        legacy.receiptID = response.id
        XCTAssertThrowsError(try legacy.validate(response: response))
        var tampered = live
        tampered.liveMutation = OfflineTalkLiveMutation(entryID: admission.entryID, requestID: admission.requestID,
            sourceProjectID: "project-a", documentID: "document-a", location: range.location,
            length: range.length + 1, insertion: insertion)
        XCTAssertThrowsError(try tampered.validate(response: nil))
    }

    func testReadyRecordWithAcceptedResponseCannotBecomeSendable() throws {
        let body = Data("original request".utf8)
        let entry = OfflineTalkOutboxEntry(id: UUID().uuidString, createdAt: 1, updatedAt: 1, endpoint: "/talk", method: "POST",
            urlString: backend.appendingPathComponent("talk").absoluteString, headers: ["X-User-Id":owner.userID],
            bodyRef: "fixture.turn", bodyByteCount: body.count, idempotencyKey: "request", timeoutInterval: 40,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: nil)
        var record = OfflineTalkStoredBody(entry: entry, body: body)
        XCTAssertEqual(try record.validatedBody(), body)
        record.version = 2; record.response = try OfflineTalkStoredResponse(accepted())
        XCTAssertThrowsError(try record.validatedBody(), "A state flip cannot turn completed evidence into generation permission")
    }

    func testAnotherAccountCannotAttachPageIntentToOriginalAdmission() async throws {
        let box = queue(), admission = try await admit(box)
        let b = BackendAuthRequestIdentity(sessionEpoch: 2, userID: "other-writer", clientToken: "b", accessToken: "b", sessionIntentGeneration: 2)
        let origin = backend
        let other = OfflineTalkOutbox(storageDirectory: directory, requestIdentityProvider: { _ in b }, backendURLProvider: { origin })
        do {
            _ = try await other.prepareLivePageDelivery(admission, projectID: "project-a", documentID: "document-a",
                beforeDraft: before, range: range, insertion: insertion, afterDraft: after, owner: b, backendURL: backend)
            XCTFail("B used A's admission to prepare a page")
        } catch {}
        let rows = await box.allEntries()
        XCTAssertNotEqual(rows.first?.hasLivePageIntent, true)
    }

    func testIndexFailureDoesNotEraseDurableBeforeMutationIntent() async throws {
        let box = queue(), admission = try await admit(box)
        let manifest = directory.appendingPathComponent("queue.jsonl"), backup = directory.appendingPathComponent("old-index")
        try FileManager.default.moveItem(at: manifest, to: backup)
        try FileManager.default.createDirectory(at: manifest, withIntermediateDirectories: false)
        let plan = try await prepare(box, admission)
        try FileManager.default.removeItem(at: manifest)
        try FileManager.default.moveItem(at: backup, to: manifest)
        let artifact = try await queue().exportRecoveryEntry(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: artifact.data) as? [String: Any])
        let exported = try XCTUnwrap(payload["page_delivery"] as? [String: Any])
        XCTAssertEqual(exported["id"] as? String, plan.id.uuidString)
        XCTAssertTrue((exported["afterDraft"] as? String)?.utf8.elementsEqual(after.utf8) == true)
    }

    func testMetadataEnrichmentRebindsLivePlanAndReceiptInOneRecord() async throws {
        let box = queue(), admission = try await admit(box), plan = try await prepare(box, admission)
        let receipt = try await box.completeLiveTalk(admission, response: accepted(metadata: true), responseURL: backend.appendingPathComponent("talk"))
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [LiveIntentMetadataProtocol.self]
        let api = BackendClient(baseURL: backend, fallbackURL: backend, urlSession: .init(configuration: config), persistBackendBaseURL: false)
        let enriched = try await box.captureReceivedTurnMetadata(receipt.entryID, initiatingIdentity: owner, backendURL: backend, client: api)
        XCTAssertNotEqual(enriched.response.id, receipt.responseID)
        XCTAssertNotNil(enriched.response.turnMetadata)
        XCTAssertEqual(enriched.pageDelivery?.id, plan.id)
        XCTAssertEqual(enriched.pageDelivery?.receiptID, enriched.response.id)
        let reopened = try await queue().receivedReply(receipt.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(reopened.pageDelivery?.receiptID, reopened.response.id)
        do {
            try await box.acknowledgeReceivedReply(receipt.entryID, receiptID: receipt.responseID,
                initiatingIdentity: owner, backendURL: backend, deliveryPlanID: plan.id)
            XCTFail("An old audio-only reader acknowledged newly enriched live delivery")
        } catch {}
    }

    private func queue() -> OfflineTalkOutbox {
        let owner = owner, backend = backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in owner }, backendURLProvider: { backend })
    }
    private func admit(_ box: OfflineTalkOutbox) async throws -> OfflineTalkLiveAdmission {
        var request = URLRequest(url: backend.appendingPathComponent("talk")); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(owner.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("intent-request", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        return try await box.admitLiveTalk(request: request, body: Data("Original spoken story".utf8), owner: owner, backendURL: backend)
    }
    private func prepare(_ box: OfflineTalkOutbox, _ admission: OfflineTalkLiveAdmission) async throws -> OfflineTalkPageDeliveryPlan {
        try await box.prepareLivePageDelivery(admission, projectID: "project-a", documentID: "document-a",
            beforeDraft: before, range: range, insertion: insertion, afterDraft: after, owner: owner, backendURL: backend)
    }
    private func accepted(metadata: Bool = false) -> OfflineTalkOutboxSendResult {
        .init(statusCode: 200, headers: ["content-type":"audio/mpeg", "x-turn-id":"intent-turn",
            "x-turn-meta-available":metadata ? "1" : "0"], body: Data("ID3fixture".utf8))
    }
}

private nonisolated final class LiveIntentMetadataProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard request.httpMethod == "GET", request.url?.path == "/talk/turn/intent-turn",
              request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access" else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return
        }
        let body = Data(#"{"turn_id":"intent-turn","reply":"Retained mentor reply"}"#.utf8)
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["content-type":"application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
