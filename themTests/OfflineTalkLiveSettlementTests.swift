import Foundation
import XCTest
@testable import them

@MainActor
final class OfflineTalkLiveSettlementTests: XCTestCase {
    private var directory: URL!
    private let backend = URL(string: "https://live-settlement.test")!
    private let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "writer-a",
        clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    private let before = "INT. ROOM - NIGHT\r\nJOHN\r\nOld cafe\u{0301} line.  \r\n"
    private let insertion = "Keep the scar."
    private var range: NSRange { (before as NSString).range(of: "Old cafe\u{0301} line.") }
    private var after: String { (before as NSString).replacingCharacters(in: range, with: insertion) }

    override func setUp() { directory = FileManager.default.temporaryDirectory.appendingPathComponent("LiveSettlement-\(UUID())") }
    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    func testConversationRemainsUntilFullPlaybackThenRetiresWithoutAnotherRequest() async throws {
        let box = queue(), admission = try await admit(box), delivery = try await complete(box, admission, page: false)
        let beforePlayback = await queue().allEntries()
        XCTAssertEqual(beforePlayback.count, 1)
        let actualResult1 = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        XCTAssertTrue(actualResult1)
        let afterPlayback = await queue().allEntries()
        XCTAssertTrue(afterPlayback.isEmpty)
        let actualResult2 = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        XCTAssertFalse(actualResult2)
        var sends = 0
        _ = await queue().drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }

    func testEarlySaveSurvivesReopenAndWaitsForAcceptedResponseAndFullPlayback() async throws {
        let box = queue(), admission = try await admit(box), plan = try await prepare(box, admission)
        let actualResult3 = try await box.recordConfirmedPageSave(proof())
        XCTAssertEqual(actualResult3, 1)
        let export = try await queue().exportRecoveryEntry(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: export.data) as? [String: Any])
        XCTAssertNil(json["response"])
        XCTAssertNotNil(json["saved_page"])
        let delivery = try await complete(queue(), admission)
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(kept.savedPage?.planID, plan.id)
        XCTAssertEqual(kept.savedPage?.versionID, "saved-v1")
        let actualResult4 = try await queue().recordFinishedLivePlayback(delivery, owner: owner)
        XCTAssertTrue(actualResult4)
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testPlaybackBeforeSaveStaysKeptAndExactLaterAcknowledgementRetiresIt() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission)
        let delivery = try await complete(box, admission)
        let actualResult5 = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        XCTAssertFalse(actualResult5)
        let kept = await queue().allEntries()
        XCTAssertEqual(kept.count, 1)
        let actualResult6 = try await queue().recordConfirmedPageSave(proof())
        XCTAssertEqual(actualResult6, 1)
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testSaveAloneCannotRetireAStoppedReply() async throws {
        let box = queue(), admission = try await admit(box)
        let plan = try await prepare(box, admission)
        _ = try await complete(box, admission)
        _ = try await box.recordConfirmedPageSave(proof())
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(kept.savedPage?.planID, plan.id)
        XCTAssertTrue(kept.pageDelivery?.afterDraft.utf8.elementsEqual(after.utf8) == true)
    }

    func testPagePlaybackWithoutNativeIntentCannotBeAcknowledgedAsConversation() async throws {
        let box = queue(), admission = try await admit(box), delivery = try await complete(box, admission)
        let actualResult7 = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        XCTAssertFalse(actualResult7)
        let kept = await queue().allEntries()
        XCTAssertEqual(kept.count, 1)
        _ = try await prepare(queue(), admission)
        _ = try await queue().recordConfirmedPageSave(proof())
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testWrongProjectDocumentOrExactBytesCannotSettleOriginalPage() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission)
        let delivery = try await complete(box, admission)
        _ = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        for bad in [try proof(project: "other-project"), try proof(document: "other-document"), try proof(draft: after + " ")] {
            let actualResult8 = try await box.recordConfirmedPageSave(bad)
            XCTAssertEqual(actualResult8, 0)
        }
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertNil(kept.savedPage)
        XCTAssertTrue(kept.pageDelivery?.afterDraft.utf8.elementsEqual(after.utf8) == true)
    }

    func testWrongAccountAndBackendProofsCannotAcknowledgeAnotherOwnersReply() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission); _ = try await complete(box, admission)
        for bad in [try proof(user: "writer-b"), try proof(origin: URL(string: "https://other.test")!)] {
            do { _ = try await box.recordConfirmedPageSave(bad); XCTFail("Foreign proof changed original custody") } catch {}
        }
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertNil(kept.savedPage)
    }

    func testVerifiedInitialReceiptPromotesOnlyTheOriginalUnboundDocument() async throws {
        let box = queue(), admission = try await admit(box)
        let pending = try await prepare(box, admission, project: "")
        _ = try await box.recordConfirmedPageSave(proof(project: "first-project", initialSource: ""))
        let delivery = try await complete(box, admission)
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(kept.pageDelivery?.projectID, "first-project")
        XCTAssertEqual(kept.pageDelivery?.id, pending.id)
        XCTAssertEqual(kept.pageDelivery?.liveMutation?.sourceProjectID, "")
        XCTAssertEqual(kept.pageDelivery?.liveMutation?.initialProjectReceiptID, "save-request")
        let actualResult9 = try await box.recordConfirmedPageSave(proof(project: "second-project", initialSource: ""))
        XCTAssertEqual(actualResult9, 0)
        let same = try await prepare(box, admission, project: "")
        XCTAssertEqual(same.id, pending.id, "Verified promotion broke native idempotent preparation")
        let actualResult10 = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        XCTAssertTrue(actualResult10)
    }

    func testCopyingBoundProjectToANewProjectCannotRelabelItsLiveReceipt() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission); _ = try await complete(box, admission)
        let actualResult11 = try await box.recordConfirmedPageSave(proof(project: "copied-b", initialSource: "project-a"))
        XCTAssertEqual(actualResult11, 0)
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(kept.pageDelivery?.projectID, "project-a")
        XCTAssertNil(kept.savedPage)
    }

    func testCorrectPlanIDAloneCannotEraseAnUnsavedLiveMutation() async throws {
        let box = queue(), admission = try await admit(box), plan = try await prepare(box, admission)
        let delivery = try await complete(box, admission)
        do {
            try await box.acknowledgeReceivedReply(admission.entryID, receiptID: delivery.receipt.responseID,
                initiatingIdentity: owner, backendURL: backend, deliveryPlanID: plan.id)
            XCTFail("Knowing an intent ID manufactured a saved page")
        } catch {}
    }

    func testExplicitRecoveryCanFinishConfirmedSaveWithoutReplayingOrRequiringPlayback() async throws {
        let box = queue(), admission = try await admit(box), plan = try await prepare(box, admission)
        let delivery = try await complete(box, admission)
        _ = try await box.recordConfirmedPageSave(proof())
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(try plan.liveRecoveryDisposition(project: "project-a", document: "document-a", draft: before,
            saved: kept.savedPage), .finishConfirmedSave, "A later Undo must never replay an already saved mutation")
        try await box.acknowledgeReceivedReply(admission.entryID, receiptID: delivery.receipt.responseID,
            initiatingIdentity: owner, backendURL: backend, deliveryPlanID: plan.id)
        try await box.acknowledgeReceivedReply(admission.entryID, receiptID: delivery.receipt.responseID,
            initiatingIdentity: owner, backendURL: backend, deliveryPlanID: plan.id)
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testMutationRecoveryDistinguishesBeforeAfterAndAmbiguousUnicodeBytes() async throws {
        let box = queue(), admission = try await admit(box), plan = try await prepare(box, admission)
        XCTAssertEqual(try plan.liveRecoveryDisposition(project: "project-a", document: "document-a", draft: before, saved: nil), .applyOriginalMutation)
        XCTAssertEqual(try plan.liveRecoveryDisposition(project: "project-a", document: "document-a", draft: after, saved: nil), .saveCurrentPage)
        XCTAssertEqual(plan.liveMutationLineRange?.start, 3)
        XCTAssertEqual(plan.liveMutation?.insertion, insertion)
        XCTAssertEqual(plan.liveMutation?.length, range.length)
        XCTAssertEqual(before, before.precomposedStringWithCanonicalMapping)
        XCTAssertThrowsError(try plan.liveRecoveryDisposition(project: "project-a", document: "document-a",
            draft: before.precomposedStringWithCanonicalMapping, saved: nil))
        XCTAssertThrowsError(try plan.liveRecoveryDisposition(project: "project-a", document: "other-document", draft: before, saved: nil))
    }

    func testSaveEvidenceDiskFailureKeepsAudioAndOriginalPageWithoutRegeneration() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission); let delivery = try await complete(box, admission)
        _ = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        let blobs = directory.appendingPathComponent("blobs")
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: blobs.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: blobs.path) }
        do { _ = try await box.recordConfirmedPageSave(proof()); XCTFail("Unwritable evidence was acknowledged") } catch {}
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertNil(kept.savedPage)
        XCTAssertEqual(kept.response.body, Data("ID3fixture".utf8))
        var sends = 0
        _ = await box.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in sends += 1; return .init(statusCode: 200) }
        XCTAssertEqual(sends, 0)
    }

    func testSettledBlobPreventsReplayWhenIndexRemovalFails() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission); let delivery = try await complete(box, admission)
        _ = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        let index = directory.appendingPathComponent("queue.jsonl"), backup = directory.appendingPathComponent("old-index")
        try FileManager.default.moveItem(at: index, to: backup)
        try FileManager.default.createDirectory(at: index, withIntermediateDirectories: false)
        do { _ = try await box.recordConfirmedPageSave(proof()); XCTFail("Broken index was silently acknowledged") } catch {}
        try FileManager.default.removeItem(at: index)
        try FileManager.default.moveItem(at: backup, to: index)
        let reopened = queue(), remaining = await reopened.allEntries()
        XCTAssertTrue(remaining.isEmpty)
        var sends = 0
        _ = await reopened.drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in sends += 1; return .init(statusCode: 200) }
        XCTAssertEqual(sends, 0)
    }

    func testCorruptedSavedVersionEvidenceCannotBeUsedToRetireReply() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission); _ = try await complete(box, admission)
        _ = try await box.recordConfirmedPageSave(proof())
        let blobs = directory.appendingPathComponent("blobs")
        let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: blobs, includingPropertiesForKeys: nil).first { $0.pathExtension == "turn" })
        var stored = try XCTUnwrap(PropertyListSerialization.propertyList(from: Data(contentsOf: file), format: nil) as? [String: Any])
        var saved = try XCTUnwrap(stored["savedPage"] as? [String: Any]); saved["versionID"] = "fabricated-version"; stored["savedPage"] = saved
        try PropertyListSerialization.data(fromPropertyList: stored, format: .binary, options: 0).write(to: file)
        do { _ = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend); XCTFail("Corrupt receipt was accepted") } catch {}
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
    }

    func testMetadataRepairKeepsPlaybackEvidenceBoundToTheEnrichedReceipt() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await prepare(box, admission)
        let delivery = try await complete(box, admission, metadata: true)
        _ = try await box.recordFinishedLivePlayback(delivery, owner: owner)
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [SettlementMetadataProtocol.self]
        let session = URLSession(configuration: config); defer { session.invalidateAndCancel() }
        let identity = owner
        let api = BackendClient(baseURL: backend, fallbackURL: backend, urlSession: session,
            persistBackendBaseURL: false, talkOutbox: box, talkIdentityProvider: { _ in identity })
        let repaired = try await box.captureReceivedTurnMetadata(admission.entryID, initiatingIdentity: owner, backendURL: backend, client: api)
        XCTAssertNotEqual(repaired.response.id, delivery.receipt.responseID)
        _ = try await queue().recordConfirmedPageSave(proof())
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty, "Metadata repair detached the actual playback proof")
    }

    private func queue() -> OfflineTalkOutbox {
        let owner = owner, backend = backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in owner }, backendURLProvider: { backend })
    }
    private func admit(_ box: OfflineTalkOutbox) async throws -> OfflineTalkLiveAdmission {
        var request = URLRequest(url: backend.appendingPathComponent("talk")); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(owner.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("live-settlement-request", forHTTPHeaderField: "X-Idempotency-Key")
        request.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
        return try await box.admitLiveTalk(request: request, body: Data("Original spoken story".utf8), owner: owner, backendURL: backend)
    }
    private func prepare(_ box: OfflineTalkOutbox, _ admission: OfflineTalkLiveAdmission, project: String = "project-a") async throws -> OfflineTalkPageDeliveryPlan {
        try await box.prepareLivePageDelivery(admission, projectID: project, documentID: "document-a", beforeDraft: before,
            range: range, insertion: insertion, afterDraft: after, owner: owner, backendURL: backend)
    }
    private func complete(_ box: OfflineTalkOutbox, _ admission: OfflineTalkLiveAdmission, page: Bool = true, metadata: Bool = false) async throws -> BackendTalkLiveDeliveryReceipt {
        let receipt = try await box.completeLiveTalk(admission,
            response: .init(statusCode: 200, headers: ["content-type":"audio/mpeg", "x-reply":"Kept reply",
                "x-turn-id":"settlement-turn", "x-turn-meta-available":metadata ? "1" : "0"], body: Data("ID3fixture".utf8)),
            responseURL: backend.appendingPathComponent("talk"))
        return .init(receipt: receipt, request: .init(admission: admission, owner: owner.ownerContext, backendURL: backend), requiresPageSave: page)
    }
    private func proof(project: String = "project-a", document: String = "document-a", draft: String? = nil,
                       user: String? = nil, origin: URL? = nil, initialSource: String? = nil) throws -> ScreenplayConfirmedDraftSave {
        let auth = ScreenplayStudioAuthContext(userID: user ?? owner.userID, sessionIntentGeneration: owner.sessionIntentGeneration)
        let url = origin ?? backend
        var entry = ScreenplayDraftSaveOutboxEntry(id: "save-request", projectId: project, ownerUserId: auth.userID,
            draft: draft ?? after, title: "", phase: "scene_draft", notes: "", source: "studio_manual", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "v0", createdAt: 1, updatedAt: 1, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: "", deliveryOrigin: .init(documentID: document, backendURL: url))
        let object: [String: Any] = ["id":"saved-v1", "projectId":project, "clientRequestId":entry.id, "draft":entry.draft]
        let version = try JSONDecoder().decode(BackendScreenplayVersion.self, from: JSONSerialization.data(withJSONObject: object))
        if let initialSource { entry.initialization = .init(documentID: document, backendURL: url, sourceProjectID: initialSource) }
        let value = initialSource == nil
            ? ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: version, versionID: version.id, projectID: project,
                responseURL: url.appendingPathComponent("screenplay/projects/\(project)/version"), owner: auth, currentOwner: auth)
            : ScreenplayConfirmedDraftSave.initial(entry: entry, version: version, versionID: version.id, projectID: project,
                responseURL: url.appendingPathComponent("screenplay/projects/initialize"), owner: auth, currentOwner: auth)
        return try XCTUnwrap(value)
    }
}

private nonisolated final class SettlementMetadataProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard request.httpMethod == "GET", request.url?.path == "/talk/turn/settlement-turn",
              request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-access" else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse)); return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["content-type":"application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(#"{"turn_id":"settlement-turn","reply":"Kept reply"}"#.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
