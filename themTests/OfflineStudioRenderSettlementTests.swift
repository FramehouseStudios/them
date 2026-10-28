import Foundation
import XCTest
@testable import them

@MainActor
final class OfflineStudioRenderSettlementTests: XCTestCase {
    private var directory: URL!
    private let backend = URL(string: "https://render-settlement.test")!
    private let owner = BackendAuthRequestIdentity(sessionEpoch: 1, userID: "writer-a",
        clientToken: "fixture-client", accessToken: "fixture-access", sessionIntentGeneration: 1)
    private let before = "INT. CAFE - NIGHT\r\nJOHN\r\nOld cafe\u{0301} line.  \r\n"
    private let insertion = "Keep the scar."
    private var range: NSRange { (before as NSString).range(of: "Old cafe\u{0301} line.") }
    private var after: String { (before as NSString).replacingCharacters(in: range, with: insertion) }

    override func setUp() { directory = FileManager.default.temporaryDirectory.appendingPathComponent("RenderSettlement-\(UUID())") }
    override func tearDownWithError() throws {
        if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }

    func testPageCannotRetireAsPinOrWithoutTheOriginalNativeMutationAndExactSave() async throws {
        let box = queue(), admission = try await admit(box), delivery = try await complete(box, admission)
        let forgedPin = BackendStudioRenderDeliveryReceipt(receipt: delivery.receipt, request: delivery.request, writesToPage: false)
        do { _ = try await box.confirmPublishedStudioPin(forgedPin, owner: owner); XCTFail("Page used pin bypass") } catch {}
        do {
            try await box.acknowledgeReceivedReply(admission.entryID, receiptID: delivery.receipt.responseID,
                initiatingIdentity: owner, backendURL: backend)
            XCTFail("An unplanned page was erased")
        } catch {}
        _ = try await prepare(box, admission)
        let held = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertNotNil(held.pageDelivery?.liveMutation)
        XCTAssertNil(held.savedPage)
        do {
            try await box.acknowledgeReceivedReply(admission.entryID, receiptID: delivery.receipt.responseID,
                initiatingIdentity: owner, backendURL: backend, deliveryPlanID: held.pageDelivery?.id)
            XCTFail("A plan ID manufactured save evidence")
        } catch {}
    }

    func testExactSavedPageRetiresRenderWithoutAnAudioPlaybackMarker() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await complete(box, admission); _ = try await prepare(box, admission)
        let matched = try await queue().recordConfirmedPageSave(proof())
        XCTAssertEqual(matched, 1)
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
        var sends = 0
        _ = await queue().drainDue(now: .distantFuture, initiatingIdentity: owner, backendURL: backend) { _ in
            sends += 1; return .init(statusCode: 200)
        }
        XCTAssertEqual(sends, 0)
    }

    func testWrongProjectDocumentOrBytesCannotSettleRenderedPage() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await complete(box, admission); _ = try await prepare(box, admission)
        for bad in [try proof(project: "project-b"), try proof(document: "document-b"), try proof(draft: after + " ")] {
            let matched = try await box.recordConfirmedPageSave(bad)
            XCTAssertEqual(matched, 0)
        }
        let held = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertNil(held.savedPage)
        XCTAssertTrue(held.pageDelivery?.afterDraft.utf8.elementsEqual(after.utf8) == true)
    }

    func testEarlySaveRemainsBoundAcrossReopenUntilTheCompleteRenderIsConfirmed() async throws {
        let box = queue(), admission = try await admit(box), plan = try await prepare(box, admission)
        let early = try await box.recordConfirmedPageSave(proof())
        XCTAssertEqual(early, 1)
        _ = try await complete(queue(), admission)
        let kept = try await queue().receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertEqual(kept.savedPage?.planID, plan.id)
        let confirmed = try await queue().recordConfirmedPageSave(proof())
        XCTAssertEqual(confirmed, 1)
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testUnboundRenderRequiresVerifiedInitialPromotionOfTheSameDocument() async throws {
        let box = queue(), admission = try await admit(box, project: "")
        _ = try await complete(box, admission); _ = try await prepare(box, admission, project: "")
        let copied = try await box.recordConfirmedPageSave(proof(project: "copied-project"))
        XCTAssertEqual(copied, 0, "A caller-supplied new project ID is not promotion evidence")
        let promoted = try await box.recordConfirmedPageSave(proof(project: "first-project", initialSource: ""))
        XCTAssertEqual(promoted, 1)
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testJSONInitiatingProjectCannotBeRelabeledByTheNativePage() async throws {
        let box = queue(), admission = try await admit(box)
        _ = try await complete(box, admission)
        do { _ = try await prepare(box, admission, project: "project-b"); XCTFail("JSON source project was ignored") } catch {}
        let held = try await box.receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
        XCTAssertNil(held.pageDelivery)
    }

    func testPinStaysUntilExplicitPublicationAndSettlesOnlyOnce() async throws {
        let box = queue(), admission = try await admit(box, target: "voice_pin")
        let delivery = try await complete(box, admission)
        XCTAssertFalse(delivery.writesToPage)
        do { _ = try await prepare(box, admission); XCTFail("Pin became a native page intent") } catch {}
        let held = await queue().allEntries()
        XCTAssertEqual(held.count, 1)
        let first = try await queue().confirmPublishedStudioPin(delivery, owner: owner)
        let second = try await queue().confirmPublishedStudioPin(delivery, owner: owner)
        XCTAssertTrue(first); XCTAssertFalse(second)
        let remaining = await queue().allEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testWrongReceiptOwnerOrBackendCannotPublishPin() async throws {
        let box = queue(), admission = try await admit(box, target: "voice_pin"), delivery = try await complete(box, admission)
        let wrongReceipt = BackendStudioRenderDeliveryReceipt(receipt: .init(entryID: admission.entryID,
            responseID: "another-response", bodyOmitted: false), request: delivery.request, writesToPage: false)
        let wrongBackend = BackendStudioRenderDeliveryReceipt(receipt: delivery.receipt,
            request: .init(admission: admission, owner: owner.ownerContext, backendURL: URL(string: "https://other.test")!), writesToPage: false)
        for bad in [wrongReceipt, wrongBackend] {
            do { _ = try await box.confirmPublishedStudioPin(bad, owner: owner); XCTFail("Foreign pin receipt retired original") } catch {}
        }
        let foreign = BackendAuthRequestIdentity(sessionEpoch: 2, userID: "writer-b", clientToken: "b", accessToken: "b", sessionIntentGeneration: 2)
        do { _ = try await box.confirmPublishedStudioPin(delivery, owner: foreign); XCTFail("Foreign owner published pin") } catch {}
        let held = await queue().allEntries()
        XCTAssertEqual(held.count, 1)
    }

    func testIncompleteOrRejectedResultCannotCreatePageDeliveryReceipt() async throws {
        for (complete, quality) in [(false, true), (true, false)] {
            let box = queue(), admission = try await admit(box, key: UUID().uuidString)
            let body = try JSONSerialization.data(withJSONObject: ["ok":true, "reply":insertion, "screenplay_quality":["ok":quality]])
            _ = try await box.checkpointStudioRender(admission, response: .init(statusCode: 200,
                headers: ["content-type":"application/json"], body: body), responseURL: backend.appendingPathComponent(StudioRenderEndpoint.oneShotPath), complete: complete)
            do { _ = try await box.studioRenderDelivery(admission, owner: owner, backendURL: backend); XCTFail("Unconfirmed page got a delivery receipt") } catch {}
            let held = try await box.receivedReply(admission.entryID, initiatingIdentity: owner, backendURL: backend)
            XCTAssertEqual(held.response.body, body)
        }
    }

    func testJSONProjectParserKeepsBindingAndRejectsInvalidTypes() throws {
        let headers = ["Content-Type":"application/json; charset=utf-8"]
        XCTAssertEqual(try offlineTalkRequestProjectID(body: Data(#"{"screenplay_project_id":"project-a"}"#.utf8), headers: headers), "project-a")
        XCTAssertNil(try offlineTalkRequestProjectID(body: Data(#"{"screenplay_project_id":""}"#.utf8), headers: headers))
        XCTAssertThrowsError(try offlineTalkRequestProjectID(body: Data(#"{"screenplay_project_id":12}"#.utf8), headers: headers))
        XCTAssertThrowsError(try offlineTalkRequestProjectID(body: Data(#"{"screenplay_project_id":"bad\u0000id"}"#.utf8), headers: headers))
    }

    private func queue() -> OfflineTalkOutbox {
        let identity = owner, origin = backend
        return .init(storageDirectory: directory, requestIdentityProvider: { _ in identity }, backendURLProvider: { origin })
    }
    private func admit(_ box: OfflineTalkOutbox, target: String = "page", key: String = "render-settlement", project: String = "project-a") async throws -> OfflineTalkLiveAdmission {
        var request = URLRequest(url: backend.appendingPathComponent(StudioRenderEndpoint.oneShotPath)); request.httpMethod = "POST"
        request.setValue(owner.userID, forHTTPHeaderField: "X-User-Id")
        request.setValue("Bearer \(owner.accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(key, forHTTPHeaderField: "X-Idempotency-Key"); request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body = try JSONSerialization.data(withJSONObject: ["transcript":"Write my story", "screenplay_target":target, "screenplay_project_id":project])
        return try await box.admitLiveStudioRender(request: request, body: body, owner: owner, backendURL: backend)
    }
    private func complete(_ box: OfflineTalkOutbox, _ admission: OfflineTalkLiveAdmission) async throws -> BackendStudioRenderDeliveryReceipt {
        let body = try JSONSerialization.data(withJSONObject: ["ok":true, "reply":insertion, "screenplay_quality":["ok":true]])
        _ = try await box.checkpointStudioRender(admission, response: .init(statusCode: 200, headers: ["content-type":"application/json"], body: body),
            responseURL: backend.appendingPathComponent(StudioRenderEndpoint.oneShotPath), complete: true)
        return try await box.studioRenderDelivery(admission, owner: owner, backendURL: backend)
    }
    private func prepare(_ box: OfflineTalkOutbox, _ admission: OfflineTalkLiveAdmission, project: String = "project-a") async throws -> OfflineTalkPageDeliveryPlan {
        try await box.prepareLivePageDelivery(admission, projectID: project, documentID: "document-a", beforeDraft: before,
            range: range, insertion: insertion, afterDraft: after, owner: owner, backendURL: backend)
    }
    private func proof(project: String = "project-a", document: String = "document-a", draft: String? = nil, initialSource: String? = nil) throws -> ScreenplayConfirmedDraftSave {
        let auth = owner.ownerContext
        var entry = ScreenplayDraftSaveOutboxEntry(id: "render-save", projectId: project, ownerUserId: auth.userID,
            draft: draft ?? after, title: "", phase: "scene_draft", notes: "", source: "studio_manual", studioWriteAnchors: [],
            screenplayBindings: [], baseVersionId: "v0", createdAt: 1, updatedAt: 1, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: "", deliveryOrigin: .init(documentID: document, backendURL: backend))
        let json: [String: Any] = ["id":"saved-v1", "projectId":project, "clientRequestId":entry.id, "draft":entry.draft]
        let version = try JSONDecoder().decode(BackendScreenplayVersion.self, from: JSONSerialization.data(withJSONObject: json))
        if let initialSource { entry.initialization = .init(documentID: document, backendURL: backend, sourceProjectID: initialSource) }
        let value = initialSource == nil
            ? ScreenplayConfirmedDraftSave.ordinary(entry: entry, version: version, versionID: version.id, projectID: project,
                responseURL: backend.appendingPathComponent("screenplay/projects/\(project)/version"), owner: auth, currentOwner: auth)
            : ScreenplayConfirmedDraftSave.initial(entry: entry, version: version, versionID: version.id, projectID: project,
                responseURL: backend.appendingPathComponent("screenplay/projects/initialize"), owner: auth, currentOwner: auth)
        return try XCTUnwrap(value)
    }
}
