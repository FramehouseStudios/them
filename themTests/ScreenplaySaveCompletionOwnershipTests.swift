import Foundation
import XCTest
@testable import them

/// Real VM save -> BackendMemoryAPI -> URLSession -> durable draft outbox.
/// The version-write HTTP peer is deterministic; this is not provider proof.
@MainActor
final class ScreenplaySaveCompletionOwnershipTests: XCTestCase {
    func testCommittedWriteAcknowledgedDuringDerivedRefreshDoesNotSaveTwice() async throws {
        let fixture = try SaveCompletionFixture()
        defer {
            fixture.model.debugAfterDraftDerivedRefresh = nil
            ScreenplayLiveDraftBridge.shared.lastCommittedWrite = nil
            fixture.close()
        }
        fixture.select("a", draft: fixture.a, base: "a-base")
        fixture.model.autosaveEnabled = true
        let previousAnchor = try JSONDecoder().decode(BackendScreenplayWriteAnchor.self,
            from: Data("{\"writeId\":\"existing-write\",\"anchorLine\":2}".utf8))
        let binding = try JSONDecoder().decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"existing-scene\"}".utf8))
        fixture.model.studioWriteAnchors = [previousAnchor]
        fixture.model.screenplayBindings = [binding]
        let committedDraft = fixture.a + "\r\nClementine adds the final exact page.  \t"
        let write = ScreenplayCommittedWrite(
            id: UUID(),
            writeID: "committed-page-write",
            projectID: "a",
            previousDraft: fixture.a,
            committedDraft: committedDraft,
            insertedText: "Clementine adds the final exact page.",
            replacementApplied: false,
            replacedWriteID: nil,
            startLine: 4,
            endLine: 4,
            committedAt: Date()
        )

        ScreenplayLiveDraftBridge.shared.lastCommittedWrite = write
        XCTAssertTrue(fixture.model.adoptCommittedPageWriteIfNeeded(write))
        try await fixture.waitForFirstSave()
        XCTAssertEqual(fixture.peer.writes.map(\.source), ["studio_clementine_page_write"])
        let firstWrite = try XCTUnwrap(fixture.peer.writes.first)
        XCTAssertEqual(firstWrite.anchors.count, 2)
        XCTAssertEqual(firstWrite.anchors.last, previousAnchor)
        XCTAssertEqual(firstWrite.anchors.first?.writeId, "committed-page-write")
        XCTAssertEqual(firstWrite.anchors.first?.anchorLine, 4)
        XCTAssertEqual(firstWrite.anchors.first?.insertedText, write.insertedText)
        XCTAssertEqual(firstWrite.bindings, [binding])

        var interleavingCount = 0
        fixture.model.debugAfterDraftDerivedRefresh = {
            interleavingCount += 1
            guard interleavingCount == 1 else { return }
            fixture.peer.releaseFirst(.success)
            for _ in 0..<200 {
                if fixture.model.latestVersionID == "a-ack-1" { break }
                try? await Task.sleep(nanoseconds: 10_000_000)
            }
            // Preserve the dirty decision captured before the derived awaits.
            // The production handler must replace it from the newly
            // acknowledged fingerprint before it considers another save.
            fixture.model.hasUnsavedDraftChanges = true
        }

        await fixture.model.handleDraftDebouncedChange(committedDraft)

        XCTAssertEqual(fixture.model.latestVersionID, "a-ack-1")
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.peer.writes.count, 1,
            "The debounced observer must re-read the acknowledgement instead of saving the same committed page again")
        let remainingRows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(remainingRows.isEmpty)
    }

    func testQueuedRestoreDoesNotReplaceManualEditBeforeDebounce() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let earlier = fixture.a + "\nEarlier queued version."
        var queued = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: earlier, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        queued.deliveryOrigin = try fixture.currentOrigin()
        try await fixture.queue.enqueue(queued)
        let newer = fixture.a + "\nWriter's new exact words.  \t"
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        let restored = await fixture.model.restorePendingDraftSaveBeforeProjectHydration()
        XCTAssertTrue(restored)
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(newer.utf8))
        let recovery = fixture.store.dirtyOrdinarySnapshot(ownerUserId: fixture.owner, projectId: "a")
        XCTAssertEqual(recovery.map { Data($0.draft.utf8) }, Data(newer.utf8))
        try await Task.sleep(nanoseconds: 1_400_000_000)
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(newer.utf8))
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.contains { $0.id == queued.id && $0.draft.utf8.elementsEqual(earlier.utf8) })
    }

    func testQueuedHydrationObservationDoesNotSaveButSubsequentEditDoes() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.peer.releaseFirst(.offline); fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        fixture.model.autosaveEnabled = true
        let restored = fixture.a + "\nRestored queued words."
        fixture.model.debugPublishQueuedDraftRestoration(restored)
        fixture.model.hasUnsavedDraftChanges = true
        try await Task.sleep(nanoseconds: 1_400_000_000)
        XCTAssertTrue(fixture.peer.writes.isEmpty, "Restoring a queued row must not create a new save.")
        let newer = restored + "\nWriter adds exact words."
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        try await fixture.waitForFirstSave()
        XCTAssertEqual(fixture.peer.writes.first?.draft, newer)
        XCTAssertEqual(fixture.peer.writes.first?.source, "studio_autosave")
    }

    func testRelaunchedCustodyShowsReviewWithoutDiscardingCopies() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let origin = try fixture.currentOrigin()
        var first = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
        first.deliveryOrigin = origin
        var second = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a + "\nAnother local copy.", title: "A", phase: "draft", notes: "",
            source: "studio_conflict_custody", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "other-base", createdAt: 2, updatedAt: 2, status: .parked, retries: 0,
            nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.divergentCustodyReason)
        second.deliveryOrigin = origin
        try await fixture.queue.enqueue(first)
        try await fixture.queue.enqueue(second)
        XCTAssertTrue(fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: fixture.a,
            baseVersionId: "a-base", dirty: true))
        let data = try JSONSerialization.data(withJSONObject: ["id": "a", "title": "A", "active_version_id": "a-remote",
            "versions": [["id": "a-remote", "draft": "Server page"]]])
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let project = try decoder.decode(BackendScreenplayProjectSummary.self, from: data)
        _ = await fixture.model.restorePendingDraftSaveBeforeProjectHydration(serverProject: project)
        XCTAssertEqual(fixture.model.conflictState?.requiresCustodyReview, true)
        let review = await fixture.model.custodyRowsForReview()
        XCTAssertEqual(Set(review.map(\.id)), Set([first.id, second.id]))
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.contains { $0.id == first.id && $0.status == .parked })
        XCTAssertTrue(rows.contains { $0.id == second.id && $0.status == .parked })
    }

    func testSelectedCustodyWithNoncanonicalNotesDoesNotSend() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let origin = try fixture.currentOrigin()
        var first = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
        first.deliveryOrigin = origin
        var second = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: "Exact other page", title: "A", phase: "draft", notes: "  preserve  these notes  ",
            source: "studio_conflict_custody", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "other-base", createdAt: 2, updatedAt: 2, status: .parked, retries: 0,
            nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.divergentCustodyReason)
        second.deliveryOrigin = origin
        try await fixture.queue.enqueue(first)
        try await fixture.queue.enqueue(second)
        let tokenValue = await fixture.model.selectCustodyRowForReview(id: second.id)
        let token = try XCTUnwrap(tokenValue)
        let recorded = await fixture.model.recordCustodySelection(token)
        XCTAssertTrue(recorded)
        let saved = await fixture.model.saveSelectedCustodyCopy(token)
        XCTAssertFalse(saved)
        XCTAssertTrue(fixture.peer.writes.isEmpty, "Metadata the server would rewrite must be fenced before a version POST.")
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.contains { $0.id == second.id && $0.notes == second.notes && $0.status == .parked })
    }

    func testSelectedCustodyCopySavesAndKeepsBothSourceRows() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.peer.releaseFirst(.offline); fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let origin = try fixture.currentOrigin()
        var first = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
        first.deliveryOrigin = origin
        var second = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a + "\nAnother local copy.", title: "A", phase: "draft", notes: "",
            source: "studio_conflict_custody", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "other-base", createdAt: 2, updatedAt: 2, status: .parked, retries: 0,
            nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.divergentCustodyReason)
        second.deliveryOrigin = origin
        try await fixture.queue.enqueue(first)
        try await fixture.queue.enqueue(second)
        let tokenValue = await fixture.model.selectCustodyRowForReview(id: second.id)
        let token = try XCTUnwrap(tokenValue)
        let recorded = await fixture.model.recordCustodySelection(token)
        XCTAssertTrue(recorded)
        let recordedChoice = try await fixture.queue.custodyChoice(projectID: "a", ownerUserID: fixture.owner, deliveryOrigin: origin)
        let choice = try XCTUnwrap(recordedChoice)
        var altered = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: second.draft, title: second.title, phase: second.phase, notes: "changed note",
            source: "studio_custody_selected", studioWriteAnchors: second.studioWriteAnchors,
            screenplayBindings: second.screenplayBindings, baseVersionId: "a-remote", createdAt: 3, updatedAt: 3,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        altered.deliveryOrigin = origin
        altered.requestAuthority = .init(id: UUID(), generation: 0)
        altered.custodyChoice = choice
        altered.saveOrderingVersion = 1
        altered.hasExplicitBaseSelection = true
        do {
            _ = try await fixture.queue.beginCustodyChoiceDelivery(altered)
            XCTFail("A changed note must not be delivered as the selected copy.")
        } catch { }
        let save = Task { await fixture.model.saveSelectedCustodyCopy(token) }
        try await fixture.waitForFirstSave()
        XCTAssertEqual(fixture.peer.writes.first?.source, "studio_custody_selected")
        XCTAssertEqual(fixture.peer.writes.first?.base, "a-remote")
        XCTAssertEqual(fixture.peer.writes.first?.draft, second.draft)
        let newerConflict = ScreenplayStudioViewModel.SaveConflictState(
            projectId: "a", baseVersionId: "newer-base", serverVersionId: "newer-server",
            serverDraft: "Newer server draft", serverDraftExcerpt: "Newer server draft", serverUpdatedAt: 4)
        fixture.model.conflictState = newerConflict
        fixture.model.hasUnsavedDraftChanges = true
        fixture.peer.releaseFirst(.success)
        let saved = await save.value
        XCTAssertTrue(saved)
        XCTAssertEqual(fixture.model.conflictState, newerConflict,
            "An older selected-copy completion must not clear a newer conflict.")
        XCTAssertEqual(fixture.model.latestVersionID, "a-base", "A different visible page must not inherit the selected copy's server base.")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.contains { $0.id == first.id && $0.status == .parked })
        XCTAssertTrue(rows.contains { $0.id == second.id && $0.status == .parked })
    }

    func testSupersededCustodyReceiptRetainsOriginalAndAllowsFreshChoice() async throws {
        let readbackFault = SupersededReadbackFault()
        let fixture = try SaveCompletionFixture(supersededReceiptReader: { try readbackFault.read($0) })
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let origin = try fixture.currentOrigin()
        var first = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
        first.deliveryOrigin = origin
        var second = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a + "\nAnother held page.", title: "A", phase: "draft", notes: "",
            source: "studio_conflict_custody", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "other-base", createdAt: 2, updatedAt: 2, status: .parked, retries: 0,
            nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.divergentCustodyReason)
        second.deliveryOrigin = origin
        try await fixture.queue.enqueue(first)
        try await fixture.queue.enqueue(second)
        let choice = try await fixture.queue.recordCustodyChoice(selectedID: first.id, projectID: "a",
            ownerUserID: fixture.owner, deliveryOrigin: origin)
        var request = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: first.draft, title: first.title, phase: first.phase, notes: first.notes,
            source: "studio_custody_selected", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "server-base", createdAt: 3, updatedAt: 3, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: "")
        request.deliveryOrigin = origin
        request.requestAuthority = .init(id: UUID(), generation: 0)
        request.custodyChoice = choice
        request.saveOrderingVersion = 1
        request.hasExplicitBaseSelection = true
        guard case .deliver = try await fixture.queue.beginCustodyChoiceDelivery(request) else {
            return XCTFail("Selected save was not admitted.")
        }
        let payload: [String: Any] = ["stage": "screenplay_version", "status": "replayed_superseded",
            "conflict": true, "replayed": true, "replayProof": "full_request_hash_v1",
            "projectId": "a", "baseVersionId": request.baseVersionId, "versionId": "saved-version",
            "serverVersionId": "newer-version", "project": ["id": "a", "title": "Changed title", "activeVersionId": "newer-version"],
            "version": ["id": "saved-version", "projectId": "a", "clientRequestId": request.id,
                "draft": request.draft, "phase": request.phase, "source": request.source, "notes": request.notes,
                "studioWriteAnchors": [], "screenplayBindings": []]]
        let response = try JSONDecoder().decode(BackendScreenplayVersionMutationResponse.self,
            from: JSONSerialization.data(withJSONObject: payload))
        let owner = ScreenplayStudioAuthContext.current()
        let result = BackendReadResult(payload: response, sync: .empty, notModified: false,
            responseURL: origin.backendURL, httpStatusCode: 409)
        let evidence = try XCTUnwrap(ScreenplayConfirmedSupersededCustodySave.verify(entry: request,
            result: result, owner: owner, currentOwner: owner))
        readbackFault.failNextRead()
        do {
            try await fixture.queue.recordConfirmedSupersededCustody(request, evidence: evidence)
            XCTFail("A failed receipt readback must not report confirmation.")
        } catch { }
        do {
            try await fixture.queue.markParked(id: request.id, error: "Unconfirmed")
            XCTFail("A generic error cannot rewrite a proven terminal receipt.")
        } catch { }
        do {
            try await fixture.queue.remove(id: first.id)
            XCTFail("A source copy referenced by terminal evidence cannot be removed.")
        } catch { }
        do {
            try await fixture.queue.remove(id: request.id)
            XCTFail("A generic removal cannot discard the original terminal request.")
        } catch { }
        let restored = try await fixture.reloadQueueEntries()
        XCTAssertTrue(restored.contains { $0.id == request.id && $0.status == .parked &&
            $0.custodySupersededReceipt?.savedVersionID == "saved-version" })
        XCTAssertTrue(restored.contains { $0.id == first.id && $0.status == .parked })
        XCTAssertTrue(restored.contains { $0.id == second.id && $0.status == .parked })
        let nextChoice = try await fixture.queue.recordCustodyChoice(selectedID: second.id, projectID: "a",
            ownerUserID: fixture.owner, deliveryOrigin: origin)
        var next = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: second.draft, title: second.title, phase: second.phase, notes: second.notes,
            source: "studio_custody_selected", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "newer-version", createdAt: 4, updatedAt: 4, status: .pending,
            retries: 0, nextAttemptAt: 0, lastError: "")
        next.deliveryOrigin = origin; next.requestAuthority = .init(id: UUID(), generation: 0)
        next.custodyChoice = nextChoice; next.saveOrderingVersion = 1; next.hasExplicitBaseSelection = true
        guard case .deliver = try await fixture.queue.beginCustodyChoiceDelivery(next) else {
            return XCTFail("A fresh explicit choice did not proceed after verified supersession.")
        }
        let all = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(all.contains { $0.id == request.id && $0.custodySupersededReceipt != nil })
        XCTAssertTrue(all.contains { $0.id == first.id && $0.status == .parked })
        XCTAssertTrue(all.contains { $0.id == second.id && $0.status == .parked })
    }

    func testVersionResponsePreservesConflictStatusAndReplayProof() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.peer.releaseFirst(.offline); fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let origin = try fixture.currentOrigin()
        let request = Task {
            try await fixture.api.upsertScreenplayProjectVersion(projectId: "a", draft: fixture.a,
                title: "A", phase: "draft", source: "studio_custody_selected", baseVersionId: "a-base",
                clientRequestId: UUID().uuidString, expectedBackendURL: origin.backendURL,
                initiatingIdentity: fixture.identity)
        }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.replayedSuperseded)
        let result = try await request.value
        XCTAssertEqual(result.httpStatusCode, 409)
        XCTAssertEqual(result.payload.status, "replayed_superseded")
        XCTAssertEqual(result.payload.replayed, true)
        XCTAssertEqual(result.payload.replayProof, "full_request_hash_v1")
        XCTAssertEqual(result.payload.projectId, "a")
    }

    func testCustodySendFencePreventsPostWhenDocumentChanges() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let origin = try fixture.currentOrigin()
        do {
            _ = try await fixture.api.upsertScreenplayProjectVersion(projectId: "a", draft: fixture.a,
                title: "A", phase: "draft", source: "studio_custody_selected", baseVersionId: "a-base",
                clientRequestId: UUID().uuidString, expectedBackendURL: origin.backendURL,
                maySend: { false }, initiatingIdentity: fixture.identity)
            XCTFail("A custody save must not be sent after its document loses authority.")
        } catch BackendMemoryAPIError.server(let status, let message) {
            XCTAssertEqual(status, 409)
            XCTAssertEqual(message, "The active document changed before the save was sent.")
        } catch {
            XCTFail("An unrelated failure did not prove the custody fence: \(error)")
        }
        XCTAssertTrue(fixture.peer.writes.isEmpty, "The fence must reject the request before POST.")
    }

    func testInterruptedCustodySaveRetriesOnlyTheOriginalRequest() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.peer.releaseFirst(.offline); fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let origin = try fixture.currentOrigin()
        var first = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .parked, retries: 0, nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.conflictReason)
        first.deliveryOrigin = origin
        var second = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a + "\nAnother held page.", title: "A", phase: "draft", notes: "",
            source: "studio_conflict_custody", studioWriteAnchors: [], screenplayBindings: [],
            baseVersionId: "other-base", createdAt: 2, updatedAt: 2, status: .parked, retries: 0,
            nextAttemptAt: 0, lastError: ScreenplayDraftSaveOutbox.divergentCustodyReason)
        second.deliveryOrigin = origin
        try await fixture.queue.enqueue(first)
        try await fixture.queue.enqueue(second)
        let tokenValue = await fixture.model.selectCustodyRowForReview(id: second.id)
        let token = try XCTUnwrap(tokenValue)
        let firstSelection = await fixture.model.recordCustodySelection(token)
        XCTAssertTrue(firstSelection)
        let firstSave = Task { await fixture.model.saveSelectedCustodyCopy(token) }
        try await fixture.waitForFirstSave()
        let activeRows = try await fixture.queue.entriesForTesting()
        let active = try XCTUnwrap(activeRows.first { $0.source == "studio_custody_selected" && $0.status == .inflight })
        try await fixture.queue.releaseInflightClaim(active)
        let releasedRows = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(releasedRows.contains { $0.id == active.id && $0.status == .parked },
                      "Releasing an interrupted selected save must hold it, not make it pending.")
        fixture.peer.releaseFirst(.offline)
        let firstResult = await firstSave.value
        XCTAssertFalse(firstResult)
        let firstWrite = try XCTUnwrap(fixture.peer.writes.first)
        let parked = try await fixture.reloadQueueEntries()
        XCTAssertTrue(parked.contains { $0.id == firstWrite.id && $0.status == .parked })
        XCTAssertEqual(fixture.peer.writes.count, 1, "Interrupted custody saves must not retry automatically.")
        let retrySelection = await fixture.model.recordCustodySelection(token)
        XCTAssertTrue(retrySelection)
        XCTAssertTrue(fixture.model.custodyReviewRetryRequired)
        let retryResult = await fixture.model.saveSelectedCustodyCopy(token)
        XCTAssertTrue(retryResult)
        let retried = try XCTUnwrap(fixture.peer.writes.last)
        XCTAssertEqual(fixture.peer.writes.count, 2)
        XCTAssertEqual(retried.id, firstWrite.id)
        XCTAssertEqual(retried.base, firstWrite.base)
        XCTAssertEqual(retried.draft, firstWrite.draft)
        XCTAssertEqual(retried.notes, firstWrite.notes)
        let remaining = try await fixture.reloadQueueEntries()
        XCTAssertTrue(remaining.contains { $0.id == first.id && $0.status == .parked })
        XCTAssertTrue(remaining.contains { $0.id == second.id && $0.status == .parked })
        XCTAssertFalse(remaining.contains { $0.id == firstWrite.id })
    }

    func testConfirmedMatchingAutosaveReadbackDoesNotMarkExactPageDirtyAgain() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let save = Task { await fixture.model.handleDraftDebouncedChange(fixture.a) }
        defer { fixture.peer.releaseFirst(.offline); save.cancel() }
        try await fixture.waitForFirstSave()
        XCTAssertEqual(fixture.peer.writes.first?.source, "studio_autosave")
        fixture.peer.releaseFirst(.matchingConflict)
        await save.value
        XCTAssertEqual(fixture.model.latestVersionID, "a-remote")
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
        await fixture.model.handleDraftDebouncedChange(fixture.a)
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges, "Confirmed exact words must remain clean.")
        XCTAssertEqual(fixture.peer.writes.count, 1, "A later observer must not submit the same page again.")
    }

    func testPassiveAutosaveMatchingInflightManualSaveDoesNotCreateAnotherRequest() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let manualSave = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); manualSave.cancel() }
        try await fixture.waitForFirstSave()

        await fixture.model.handleDraftDebouncedChange(fixture.a)
        let rowsBeforeAcknowledgement = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rowsBeforeAcknowledgement.count, 1,
            "An identical passive autosave must not create another durable request")
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(manualSave)
        let remaining = try await fixture.reloadQueueEntries()
        XCTAssertTrue(remaining.isEmpty, "The acknowledged page must not leave a duplicate parked save")
        XCTAssertEqual(fixture.peer.writes.count, 1)
    }

    func testPassiveAutosaveWithTimestampOnlyBindingRefreshDoesNotDuplicateInflightSave() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let decoder = JSONDecoder()
        let first = try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"same-scene\",\"updatedAt\":100}".utf8))
        let refreshed = try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"same-scene\",\"updatedAt\":200}".utf8))
        fixture.model.screenplayBindings = [first]
        let save = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.model.screenplayBindings = [refreshed]
        await fixture.model.handleDraftDebouncedChange(fixture.a)
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 1, "A timestamp-only passive refresh must not create a second save request.")
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.peer.writes.count, 1)
        XCTAssertEqual(fixture.model.screenplayBindings, [refreshed], "The writer's current projection must remain visible.")
    }

    func testPassiveAutosaveWithMeaningfullyChangedBindingRemainsDurable() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let decoder = JSONDecoder()
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"first-scene\",\"updatedAt\":100}".utf8))]
        let save = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"different-scene\",\"updatedAt\":200}".utf8))]
        await fixture.model.handleDraftDebouncedChange(fixture.a)
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 2, "A meaningful binding change must not be coalesced with an earlier save.")
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
    }

    func testSuspendedPassiveAdmissionDoesNotDispatchAfterManualConfirmation() async throws {
        let fixture = try SaveCompletionFixture()
        defer {
            fixture.model.debugBeforePendingSaveAdmission = nil
            fixture.close()
        }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let decoder = JSONDecoder()
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"manual-projection\",\"updatedAt\":100}".utf8))]
        let manualSave = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); manualSave.cancel() }
        try await fixture.waitForFirstSave()

        let admissionStarted = expectation(description: "passive admission suspended")
        let releaseAdmission = expectation(description: "release passive admission")
        fixture.model.debugBeforePendingSaveAdmission = { _ in
            admissionStarted.fulfill()
            _ = await XCTWaiter.fulfillment(of: [releaseAdmission], timeout: 3)
        }
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"restored-derived-projection\",\"updatedAt\":200}".utf8))]
        let passiveSave = Task { @MainActor in
            await fixture.model.handleDraftDebouncedChange(fixture.a)
        }
        let admissionResult = await XCTWaiter.fulfillment(of: [admissionStarted], timeout: 3)
        XCTAssertEqual(admissionResult, .completed)

        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(manualSave)
        releaseAdmission.fulfill()
        await passiveSave.value

        XCTAssertEqual(fixture.peer.writes.count, 1,
            "A passive request suspended before admission must honor the manual save's fresh confirmation.")
        let remaining = try await fixture.reloadQueueEntries()
        XCTAssertTrue(remaining.isEmpty)
        XCTAssertFalse(fixture.model.debugIsDraftSaveInFlight)
        XCTAssertNil(fixture.model.debugActiveDraftSaveRequestID,
            "Absorbing the suspended passive request must not leave a phantom volatile tail.")
        XCTAssertEqual(fixture.model.screenplayBindings.first?.draftSceneId,
            "restored-derived-projection")
    }

    func testSuspendedPassiveAbsorptionRebasesLaterDurableRequest() async throws {
        let fixture = try SaveCompletionFixture()
        defer {
            fixture.model.debugBeforePendingSaveAdmission = nil
            fixture.close()
        }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let decoder = JSONDecoder()
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"manual-projection\",\"updatedAt\":100}".utf8))]
        let manualSave = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); manualSave.cancel() }
        try await fixture.waitForFirstSave()

        let passiveAdmissionStarted = expectation(description: "passive admission suspended")
        let releasePassiveAdmission = expectation(description: "release passive admission")
        var suspendedRequestID: String?
        var admissionCount = 0
        fixture.model.debugBeforePendingSaveAdmission = { requestID in
            admissionCount += 1
            guard admissionCount == 1 else { return }
            suspendedRequestID = requestID
            passiveAdmissionStarted.fulfill()
            _ = await XCTWaiter.fulfillment(of: [releasePassiveAdmission], timeout: 3)
        }
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"passive-derived-projection\",\"updatedAt\":200}".utf8))]
        let passiveSave = Task { @MainActor in
            await fixture.model.handleDraftDebouncedChange(fixture.a)
        }
        let admissionResult = await XCTWaiter.fulfillment(of: [passiveAdmissionStarted], timeout: 3)
        XCTAssertEqual(admissionResult, .completed)

        let newer = fixture.a + "\r\nA later exact request must remain ordered.  \t"
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        await fixture.model.manualSaveDraft()

        var rows = try await fixture.reloadQueueEntries()
        let parked = try XCTUnwrap(rows.first { $0.draft.utf8.elementsEqual(newer.utf8) })
        XCTAssertEqual(parked.status, .parked)
        XCTAssertEqual(parked.lastError, ScreenplayDraftSaveOutbox.unprovenPredecessorReason)
        XCTAssertEqual(parked.savePredecessor?.requestID, suspendedRequestID)

        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(manualSave)
        releasePassiveAdmission.fulfill()
        await passiveSave.value

        rows = try await fixture.reloadQueueEntries()
        let rebased = try XCTUnwrap(rows.first { $0.draft.utf8.elementsEqual(newer.utf8) })
        XCTAssertEqual(rebased.status, .pending)
        XCTAssertEqual(rebased.baseVersionId, "a-ack-1")
        XCTAssertNil(rebased.savePredecessor)
        XCTAssertEqual(fixture.peer.writes.count, 1,
            "Absorbing the passive follower must not itself create a duplicate version.")

        await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true)
        XCTAssertEqual(fixture.peer.writes.count, 2)
        XCTAssertEqual(fixture.peer.writes.last?.base, "a-ack-1")
        XCTAssertEqual(fixture.peer.writes.last.map { Data($0.draft.utf8) }, Data(newer.utf8))
        let remaining = try await fixture.reloadQueueEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testConfirmedPassiveReconciliationFencesNewAdmission() async throws {
        let fixture = try SaveCompletionFixture()
        defer {
            fixture.model.debugAfterConfirmedDraftSave = nil
            fixture.model.debugBeforePendingSaveAdmission = nil
            fixture.model.debugBeforeConfirmedPassiveReconciliation = nil
            fixture.close()
        }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let decoder = JSONDecoder()
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"manual-projection\",\"updatedAt\":100}".utf8))]

        let confirmedSaveHeld = expectation(description: "confirmed save held before flight cleanup")
        let releaseConfirmedSave = expectation(description: "release confirmed save")
        var confirmationCount = 0
        fixture.model.debugAfterConfirmedDraftSave = { _ in
            confirmationCount += 1
            guard confirmationCount == 1 else { return }
            confirmedSaveHeld.fulfill()
            _ = await XCTWaiter.fulfillment(of: [releaseConfirmedSave], timeout: 3)
        }
        let manualSave = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); manualSave.cancel() }
        try await fixture.waitForFirstSave()

        let passiveAdmissionStarted = expectation(description: "passive admission suspended")
        let releasePassiveAdmission = expectation(description: "release passive admission")
        var admissionCount = 0
        fixture.model.debugBeforePendingSaveAdmission = { _ in
            admissionCount += 1
            guard admissionCount == 1 else { return }
            passiveAdmissionStarted.fulfill()
            _ = await XCTWaiter.fulfillment(of: [releasePassiveAdmission], timeout: 3)
        }
        fixture.model.screenplayBindings = [try decoder.decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"passive-derived-projection\",\"updatedAt\":200}".utf8))]
        let passiveSave = Task { @MainActor in
            await fixture.model.handleDraftDebouncedChange(fixture.a)
        }
        let passiveAdmissionResult = await XCTWaiter.fulfillment(of: [passiveAdmissionStarted], timeout: 3)
        XCTAssertEqual(passiveAdmissionResult, .completed)

        fixture.peer.releaseFirst(.success)
        let confirmationResult = await XCTWaiter.fulfillment(of: [confirmedSaveHeld], timeout: 3)
        XCTAssertEqual(confirmationResult, .completed)
        XCTAssertTrue(fixture.model.debugIsDraftSaveInFlight)

        let reconciliationFenced = expectation(description: "volatile passive tail fenced")
        let releaseReconciliation = expectation(description: "release passive reconciliation")
        var reconciliationCount = 0
        fixture.model.debugBeforeConfirmedPassiveReconciliation = { _ in
            reconciliationCount += 1
            guard reconciliationCount == 1 else { return }
            reconciliationFenced.fulfill()
            _ = await XCTWaiter.fulfillment(of: [releaseReconciliation], timeout: 3)
        }
        releasePassiveAdmission.fulfill()
        let reconciliationResult = await XCTWaiter.fulfillment(of: [reconciliationFenced], timeout: 3)
        XCTAssertEqual(reconciliationResult, .completed)
        XCTAssertTrue(fixture.model.debugIsDraftSaveInFlight)
        XCTAssertNil(fixture.model.debugActiveDraftSaveRequestID,
            "The confirmed passive follower must not remain visible across reconciliation.")

        let newer = fixture.a + "\r\nA request captured during reconciliation stays durable.  \t"
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        await fixture.model.manualSaveDraft()

        let rows = try await fixture.reloadQueueEntries()
        let pending = try XCTUnwrap(rows.first { $0.draft.utf8.elementsEqual(newer.utf8) })
        XCTAssertEqual(pending.status, .pending)
        XCTAssertEqual(pending.baseVersionId, "a-ack-1")
        XCTAssertNil(pending.savePredecessor)

        releaseReconciliation.fulfill()
        await passiveSave.value
        releaseConfirmedSave.fulfill()
        try await fixture.waitForSave(manualSave)

        XCTAssertEqual(fixture.peer.writes.count, 2)
        XCTAssertEqual(fixture.peer.writes.map(\.source), ["studio_manual", "studio_manual"])
        XCTAssertEqual(fixture.peer.writes.last?.base, "a-ack-1")
        XCTAssertEqual(fixture.peer.writes.last.map { Data($0.draft.utf8) }, Data(newer.utf8))
        let remaining = try await fixture.reloadQueueEntries()
        XCTAssertTrue(remaining.isEmpty)
    }

    func testLaterIndependentPassiveMetadataSaveIsNotAbsorbedByOldConfirmation() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let save = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)

        let binding = try JSONDecoder().decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"independent-later-projection\",\"updatedAt\":300}".utf8))
        fixture.model.screenplayBindings = [binding]
        // This is a separately captured passive intent after the prior flight,
        // not the suspended follower that named that flight as predecessor.
        fixture.model.hasUnsavedDraftChanges = true
        await fixture.model.debugDispatchPassiveSave()

        XCTAssertEqual(fixture.peer.writes.count, 2,
            "An old confirmation must not absorb an independent later metadata-only save.")
        XCTAssertEqual(fixture.peer.writes.last?.source, "studio_autosave")
        XCTAssertEqual(fixture.peer.writes.last?.bindings, [binding])
    }

    func testUnscopedPassiveFollowerDoesNotCreateHeldLegacySave() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let save = fixture.startSave()
        defer {
            ScreenplayLiveDraftSyncService.shared.attach(to: fixture.model)
            fixture.peer.releaseFirst(.offline)
            save.cancel()
        }
        try await fixture.waitForFirstSave()
        ScreenplayLiveDraftSyncService.shared.detach()
        await fixture.model.debugDispatchPassiveSave()
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 1, "An unverified passive observation must not create an unscoped save.")
        XCTAssertTrue(rows.allSatisfy { $0.deliveryOrigin != nil })
        let recovery = fixture.store.dirtyOrdinarySnapshot(ownerUserId: fixture.owner, projectId: "a")
        XCTAssertEqual(recovery.map { Data($0.draft.utf8) }, Data(fixture.a.utf8))
    }

    func testUnscopedPassiveFollowerWithNewWordsRemainsDurable() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let save = fixture.startSave()
        defer {
            ScreenplayLiveDraftSyncService.shared.attach(to: fixture.model)
            fixture.peer.releaseFirst(.offline)
            save.cancel()
        }
        try await fixture.waitForFirstSave()
        let newer = fixture.a + "\nA newer exact writer line."
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        ScreenplayLiveDraftSyncService.shared.detach()
        await fixture.model.debugDispatchPassiveSave()
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 2)
        XCTAssertTrue(rows.contains { $0.draft.utf8.elementsEqual(newer.utf8) },
                      "Distinct writer words must remain durable when origin capture fails.")
    }

    func testUnscopedPassiveFollowerForOtherProjectRemainsDurable() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let save = fixture.startSave()
        defer {
            ScreenplayLiveDraftSyncService.shared.attach(to: fixture.model)
            fixture.peer.releaseFirst(.offline)
            save.cancel()
        }
        try await fixture.waitForFirstSave()
        fixture.select("b", draft: fixture.a, base: "a-base", dirty: true)
        ScreenplayLiveDraftSyncService.shared.detach()
        await fixture.model.debugDispatchPassiveSave()
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.contains { $0.projectId == "b" && $0.draft.utf8.elementsEqual(fixture.a.utf8) },
                      "A different project's words must not be absorbed by the active save.")
    }

    func testPassiveAutosaveWithNewerWordsRemainsDurableBehindInflightSave() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.model.autosaveEnabled = true
        let manualSave = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); manualSave.cancel() }
        try await fixture.waitForFirstSave()

        let newer = fixture.a + "\r\nA newer exact line.  \t"
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        await fixture.model.handleDraftDebouncedChange(newer)
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 2)
        let pending = try XCTUnwrap(rows.first { $0.draft.utf8.elementsEqual(newer.utf8) })
        XCTAssertEqual(pending.status, .pending)
        XCTAssertEqual(pending.source, "studio_autosave")
        XCTAssertEqual(pending.ownerUserId, fixture.owner)
        XCTAssertEqual(pending.projectId, "a")
    }

    func testManualWhitespaceOnlySavePreservesExactBytes() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let whitespace = "\r\n \t"
        fixture.model.fountainDraft = whitespace
        fixture.model.noteManualDraftEdit()
        let save = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); save.cancel() }
        try await fixture.waitForFirstSave()
        XCTAssertEqual(Data(try XCTUnwrap(fixture.peer.writes.first?.draft).utf8), Data(whitespace.utf8))
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
    }

    func testVersionIDOnly2xxKeepsOrdinarySaveAndLocalRecovery() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.versionIDOnly)
        try await fixture.waitForSave(save)

        XCTAssertEqual(fixture.model.latestVersionID, "a-base")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.model.autosaveStatusText, "Save confirmation pending")
        XCTAssertTrue(fixture.model.infoText.contains("could not confirm"))
        XCTAssertFalse(fixture.model.infoText.localizedCaseInsensitiveContains("connection"))
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .pending)
        XCTAssertEqual(rows.first?.lastError, ScreenplayDraftSaveOutbox.unconfirmedReceiptReason)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(fixture.a.utf8))
        let origin = try fixture.currentOrigin()
        let exactScope = try await fixture.queue.hasActiveUnconfirmedReceipt(
            projectId: "a", ownerUserId: fixture.owner, deliveryOrigin: origin)
        let otherProject = try await fixture.queue.hasActiveUnconfirmedReceipt(
            projectId: "b", ownerUserId: fixture.owner, deliveryOrigin: origin)
        let otherDocument = try await fixture.queue.hasActiveUnconfirmedReceipt(
            projectId: "a", ownerUserId: fixture.owner,
            deliveryOrigin: .init(documentID: "another-document", backendURL: origin.backendURL))
        XCTAssertTrue(exactScope)
        XCTAssertFalse(otherProject,
            "Another project's ambiguous receipt must not label this document")
        XCTAssertFalse(otherDocument,
            "Another document's ambiguous receipt must not label this document")
        let recovery = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual((recovery?["draft"] as? String).map { Data($0.utf8) }, Data(fixture.a.utf8))
        XCTAssertEqual(recovery?["baseVersionId"] as? String, "a-base")
        XCTAssertEqual(recovery?["dirty"] as? Bool, true)

        await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true)
        XCTAssertEqual(fixture.peer.writes.count, 2)
        XCTAssertEqual(fixture.peer.writes[0].id, fixture.peer.writes[1].id,
            "An ambiguous acknowledgement must retry the original idempotency key")
        let afterReplay = try await fixture.reloadQueueEntries()
        XCTAssertTrue(afterReplay.isEmpty)
    }

    func testWrong2xxReceiptKeepsOrdinarySaveAndLocalRecovery() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.wrongReceipt)
        try await fixture.waitForSave(save)

        XCTAssertEqual(fixture.model.latestVersionID, "a-base")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        XCTAssertEqual(fixture.model.autosaveStatusText, "Save confirmation pending")
        XCTAssertTrue(fixture.model.infoText.contains("could not confirm"))
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .pending)
        XCTAssertEqual(rows.first?.lastError, ScreenplayDraftSaveOutbox.unconfirmedReceiptReason)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(fixture.a.utf8))
    }

    func testNestedExactLegacyReceiptStillCompletesOrdinarySave() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.nestedExactReceipt)
        try await fixture.waitForSave(save)

        XCTAssertEqual(fixture.model.latestVersionID, "a-ack-1")
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.isEmpty)
    }

    func testAcknowledgedASaveCannotRebindBOrCopyItsWordsIntoARecovery() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        let before = fixture.snapshot()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.snapshot(), before, "A's acknowledgement changed B's UI or recovery")
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(rows.isEmpty, "A's real acknowledgement did not retire its own queue entry")
        let aRecovery = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual((aRecovery?["draft"] as? String).map { Data($0.utf8) }, Data(fixture.a.utf8))
        XCTAssertEqual(aRecovery?["baseVersionId"] as? String, "a-ack-1")
        XCTAssertEqual(fixture.peer.writes.count, 1)
    }

    func testPendingManualSaveIsDurableBeforeEarlierWriteCompletes() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); save.cancel() }
        try await fixture.waitForFirstSave()

        let newer = fixture.a + "\r\nThe writer's newer exact words.  \t"
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        await fixture.model.manualSaveDraft()

        let rows = try await fixture.reloadQueueEntries()
        let pending = try XCTUnwrap(rows.first { $0.draft.utf8.elementsEqual(newer.utf8) },
            "The pending manual request must survive process termination before the earlier acknowledgement.")
        XCTAssertEqual(pending.ownerUserId, fixture.owner)
        XCTAssertEqual(pending.projectId, "a")
        XCTAssertEqual(pending.baseVersionId, "a-base")
        XCTAssertEqual(pending.deliveryOrigin, try fixture.currentOrigin())
        XCTAssertFalse(pending.id.isEmpty)
        XCTAssertEqual(pending.source, "studio_manual")
    }

    func testReversePendingAdmissionsParkLaterExactRequestWithoutSiblingRebase() async throws {
        let fixture = try SaveCompletionFixture()
        defer {
            fixture.model.debugBeforePendingSaveAdmission = nil
            fixture.close()
        }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let activeSave = fixture.startSave()
        defer { fixture.peer.releaseFirst(.offline); activeSave.cancel() }
        try await fixture.waitForFirstSave()

        let firstAdmissionStarted = expectation(description: "first pending admission suspended")
        let releaseFirstAdmission = expectation(description: "release first pending admission")
        var admissionCount = 0
        fixture.model.debugBeforePendingSaveAdmission = { _ in
            admissionCount += 1
            guard admissionCount == 1 else { return }
            firstAdmissionStarted.fulfill()
            _ = await XCTWaiter.fulfillment(of: [releaseFirstAdmission], timeout: 3)
        }

        let secondWords = fixture.a + "\nSecond exact request"
        fixture.model.fountainDraft = secondWords
        fixture.model.noteManualDraftEdit()
        let secondSave = Task { @MainActor in await fixture.model.manualSaveDraft() }
        let admissionResult = await XCTWaiter.fulfillment(of: [firstAdmissionStarted], timeout: 3)
        XCTAssertEqual(admissionResult, .completed)

        let thirdWords = secondWords + "\nThird exact request"
        fixture.model.fountainDraft = thirdWords
        fixture.model.noteManualDraftEdit()
        await fixture.model.manualSaveDraft()
        releaseFirstAdmission.fulfill()
        await secondSave.value

        let rows = try await fixture.reloadQueueEntries()
        let second = try XCTUnwrap(rows.first { $0.draft == secondWords })
        let third = try XCTUnwrap(rows.first { $0.draft == thirdWords })
        XCTAssertEqual(second.status, .pending)
        XCTAssertEqual(third.status, .parked)
        XCTAssertEqual(third.baseVersionId, "a-base")
        XCTAssertEqual(third.lastError, ScreenplayDraftSaveOutbox.unprovenPredecessorReason)
    }

    func testNonOwningAcknowledgementDoesNotRebaseDistinctRecovery() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        let distinct = "Independent recovery cafe\u{301}.  \r\n"
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: distinct,
                           baseVersionId: "a-base", dirty: true)
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        let before = fixture.snapshot()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        let kept = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual((kept?["draft"] as? String).map { Data($0.utf8) }, Data(distinct.utf8))
        XCTAssertEqual(kept?["baseVersionId"] as? String, "a-base")
        XCTAssertEqual(kept?["dirty"] as? Bool, true)
        XCTAssertEqual(fixture.snapshot(), before)
    }

    func testAConflictAfterSelectingBKeepsARequestAndLeavesBExactlyAlone() async throws {
        try await assertRejectedAStaysScoped(.conflict, expectedStatus: .parked)
    }

    func testAFailureAfterSelectingBKeepsARequestAndLeavesBExactlyAlone() async throws {
        try await assertRejectedAStaysScoped(.offline, expectedStatus: .pending)
    }

    func testUnknownBaseEditKeepsOlderAndNewerWordsSeparate() throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: fixture.a,
                           baseVersionId: "a-base", dirty: true)
        let newer = fixture.a + "\nNewer unknown-base words."
        fixture.model.latestVersionID = ""
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        let recovery = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual(recovery?["draft"] as? String, fixture.a)
        XCTAssertEqual(recovery?["baseVersionId"] as? String, "a-base")
        let preserved = recovery?["preservedConflict"] as? [String: Any]
        XCTAssertEqual(preserved?["draft"] as? String, newer)
        XCTAssertEqual(preserved?["baseVersionId"] as? String, "")
    }

    func testFullRecoverySlotsWarnAndKeepEarlierCopies() throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: fixture.a,
                           baseVersionId: "a-base", dirty: true)
        fixture.model.latestVersionID = ""
        let newer = fixture.a + "\nSecond copy."
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        let continued = newer + "\nThird copy."
        fixture.model.fountainDraft = continued
        fixture.model.noteManualDraftEdit()
        let origin = try fixture.currentOrigin()
        guard case let .present(overflow) = fixture.overflow.load(ownerUserID: fixture.owner, projectID: "a",
            backendURL: origin.backendURL, documentID: origin.documentID) else {
            return XCTFail("The third copy must be secured before the full-slot check.")
        }
        XCTAssertEqual(Data(overflow.draft.utf8), Data(continued.utf8))
        let latest = continued + "\nNewest words."
        fixture.model.fountainDraft = latest
        fixture.model.noteManualDraftEdit()
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(latest.utf8))
        XCTAssertTrue(fixture.model.errorText.localizedCaseInsensitiveContains("export"))
        let stored = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual(stored?["draft"] as? String, fixture.a)
        XCTAssertEqual((stored?["preservedConflict"] as? [String: Any])?["draft"] as? String, newer)
        guard case let .present(stillHeld) = fixture.overflow.load(ownerUserID: fixture.owner, projectID: "a",
            backendURL: origin.backendURL, documentID: origin.documentID) else {
            return XCTFail("The existing overflow copy must remain available.")
        }
        XCTAssertEqual(Data(stillHeld.draft.utf8), Data(continued.utf8))
    }

    func testStartupEditDoesNotEraseKnownRecoveryBase() throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base", dirty: true)
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: fixture.a,
                           baseVersionId: "a-base", dirty: true)
        fixture.model.latestVersionID = ""
        fixture.model.noteManualDraftEdit()
        let recovery = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual(recovery?["draft"] as? String, fixture.a)
        XCTAssertEqual(recovery?["baseVersionId"] as? String, "a-base")
    }

    func testSameDocumentNewerAEditsStayDirtyOnTheAcknowledgedBase() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        let newer = fixture.a + "\r\nThe writer adds cafe\u{0301}. \t "
        fixture.model.fountainDraft = newer
        fixture.model.noteManualDraftEdit()
        _ = fixture.model.mirrorDraftIntoLiveBridgeIfOwned(newer)
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: newer,
                           baseVersionId: "a-base", dirty: true)
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.model.selectedProjectID, "a")
        XCTAssertEqual(fixture.model.latestVersionID, "a-ack-1")
        XCTAssertTrue(fixture.model.fountainDraft.utf8.elementsEqual(newer.utf8))
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        let kept = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual((kept?["draft"] as? String).map { Data($0.utf8) }, Data(newer.utf8))
        XCTAssertEqual(kept?["baseVersionId"] as? String, "a-ack-1")
        XCTAssertEqual(kept?["dirty"] as? Bool, true)
        XCTAssertEqual(fixture.peer.writes.count, 1, "A's completion manufactured another save")
    }

    func testPendingAUsesAAcknowledgementEvenWhenBIsNowVisible() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        let newer = fixture.a + "\r\nA second exact line.  "
        fixture.model.fountainDraft = newer
        fixture.model.hasUnsavedDraftChanges = true
        await fixture.model.manualSaveDraft() // Enters the real pending slot; HTTP A is still held.
        let pendingRecovery = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        let preserved = pendingRecovery?["preservedConflict"] as? [String: Any]
        XCTAssertEqual((preserved?["draft"] as? String).map { Data($0.utf8) }, Data(newer.utf8),
                       "The pending words must be protected before switching projects.")
        XCTAssertEqual(preserved?["baseVersionId"] as? String, "a-base")
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        let before = fixture.snapshot()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        let writes = fixture.peer.writes
        XCTAssertEqual(writes.map(\.project), ["a", "a"])
        XCTAssertEqual(writes.map(\.base), ["a-base", "a-ack-1"])
        XCTAssertEqual(writes.last.map { Data($0.draft.utf8) }, Data(newer.utf8))
        XCTAssertEqual(fixture.snapshot(), before)
        let kept = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        // This signed-out fixture has no document-origin proof. Keep both the
        // previous acknowledged cache and the exact pending recovery rather
        // than marking a byte-distinct copy clean on a bare version response.
        XCTAssertEqual((kept?["draft"] as? String).map { Data($0.utf8) }, Data(fixture.a.utf8))
        XCTAssertEqual(kept?["baseVersionId"] as? String, "a-ack-1")
        XCTAssertEqual(kept?["dirty"] as? Bool, false)
        let retainedPending = kept?["preservedConflict"] as? [String: Any]
        XCTAssertEqual((retainedPending?["draft"] as? String).map { Data($0.utf8) }, Data(newer.utf8))
        XCTAssertEqual(retainedPending?["baseVersionId"] as? String, "a-base")
        XCTAssertEqual(retainedPending?["dirty"] as? Bool, true)
        let remaining = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(remaining.isEmpty, "Both network acknowledgements should retire their queue rows")
    }

    func testPendingBKeepsItsOwnBaseRatherThanAAcknowledgement() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        await fixture.model.manualSaveDraft()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        let writes = fixture.peer.writes
        XCTAssertEqual(writes.map(\.project), ["a", "b"])
        XCTAssertEqual(writes.map(\.base), ["a-base", "b-base"])
        XCTAssertEqual(writes.last.map { Data($0.draft.utf8) }, Data(fixture.b.utf8))
        XCTAssertEqual(fixture.model.selectedProjectID, "b")
        XCTAssertEqual(fixture.model.latestVersionID, "b-ack-2")
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(rows.isEmpty)
    }

    func testPendingExplicitSaveRetainsChangedMetadataEvenWhenWordsMatch() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        let binding = try JSONDecoder().decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"explicit-new-binding\"}".utf8))
        fixture.model.screenplayBindings = [binding]
        await fixture.model.manualSaveDraft()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.peer.writes.count, 2, "Explicit changed metadata was absorbed as passive housekeeping")
        XCTAssertEqual(fixture.model.screenplayBindings, [binding])
        XCTAssertEqual(fixture.peer.writes.last?.base, "a-ack-1")
    }

    func testAcknowledgementKeepsNewerRestoredMetadataWhileMarkingTheSameWordsSaved() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        let anchor = try JSONDecoder().decode(BackendScreenplayWriteAnchor.self,
            from: Data("{\"writeId\":\"restored-history-note\",\"anchorLine\":4}".utf8))
        let binding = try JSONDecoder().decode(BackendScreenplayBindingRecord.self,
            from: Data("{\"draftSceneId\":\"restored-scene-binding\"}".utf8))
        fixture.model.studioWriteAnchors = [anchor]
        fixture.model.screenplayBindings = [binding]
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.model.studioWriteAnchors, [anchor], "An older acknowledgement erased newer history projections")
        XCTAssertEqual(fixture.model.screenplayBindings, [binding])
        XCTAssertEqual(fixture.peer.writes.count, 1)
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
    }

    func testIdenticalPendingManualSaveIsConsumedWithoutOuterRedispatch() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        await fixture.model.manualSaveDraft()
        fixture.peer.releaseFirst(.success)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.peer.writes.count, 1, "The outer dispatcher replayed an already consumed pending intent")
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(rows.isEmpty)
    }

    func testAccountIntentChangeAfterClaimKeepsDraftPending() async throws {
        let authKeys = ["auth_user_payload", "auth_signed_in", "auth_session_token_deletion_pending"]
        let previousAuth = authKeys.map { UserDefaults.standard.object(forKey: $0) }
        let user = BackendAuthUser(userId: "claim-race-\(UUID().uuidString)", email: "claim@example.invalid",
            authProvider: nil, emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil)
        UserDefaults.standard.set(try JSONEncoder().encode(user), forKey: authKeys[0])
        UserDefaults.standard.set(true, forKey: authKeys[1])
        UserDefaults.standard.set(false, forKey: authKeys[2])
        ScreenplayLiveDraftBridge.shared.reconcileAccountStorage()
        defer {
            for (index, key) in authKeys.enumerated() {
                if let value = previousAuth[index] { UserDefaults.standard.set(value, forKey: key) }
                else { UserDefaults.standard.removeObject(forKey: key) }
            }
            ScreenplayLiveDraftBridge.shared.reconcileAccountStorage()
        }
        let fixture = try SaveCompletionFixture()
        let intentKey = "auth_session_intent_generation"
        let previous = UserDefaults.standard.object(forKey: intentKey)
        defer {
            fixture.model.debugAfterDraftSaveClaim = nil
            if let previous { UserDefaults.standard.set(previous, forKey: intentKey) }
            else { UserDefaults.standard.removeObject(forKey: intentKey) }
            fixture.close()
        }
        fixture.select("a", draft: fixture.a, base: "a-base")
        var earlier = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        earlier.deliveryOrigin = .init(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
        try await fixture.queue.enqueue(earlier)
        var didClaim = false
        fixture.model.debugAfterDraftSaveClaim = {
            didClaim = true
            _ = BackendAuthClient.reserveAuthSessionIntent()
        }
        await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true)
        XCTAssertTrue(didClaim, "The regression must actually reach the post-claim account change.")
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .pending)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(fixture.a.utf8))
        XCTAssertTrue(fixture.peer.writes.isEmpty)
        XCTAssertFalse(fixture.model.debugIsDraftSaveInFlight)
    }

    func testQueuedConflictAfterServerHydrationKeepsWriterDraftOnPage() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        let writerDraft = fixture.a + "\r\nWriter's exact queued words.  \t"
        let serverDraft = "Other A words"
        fixture.select("a", draft: serverDraft, base: "a-remote")
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: writerDraft,
            baseVersionId: "a-base", dirty: true)
        var queued = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: writerDraft, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        queued.deliveryOrigin = try fixture.currentOrigin()
        try await fixture.queue.enqueue(queued)
        let drain = Task { await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true) }
        defer { fixture.peer.releaseFirst(.offline); drain.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.conflict)
        await drain.value
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(writerDraft.utf8),
            "A stale queued save must not leave the server copy presented as the writer's local conflict page")
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.status, .parked)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(writerDraft.utf8))
        let recovery = fixture.store.dirtyOrdinarySnapshot(ownerUserId: fixture.owner, projectId: "a")
        XCTAssertEqual(recovery.map { Data($0.draft.utf8) }, Data(writerDraft.utf8))
    }

    func testQueuedConflictPreservesNonmanualDirtyPageEvenWhenItMatchesServer() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        let queuedDraft = fixture.a + "\nOlder queued page."
        let writerPage = "Other A words"
        fixture.select("a", draft: writerPage, base: "a-remote")
        XCTAssertTrue(fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: queuedDraft,
            baseVersionId: "a-base", dirty: true))
        var queued = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: queuedDraft, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        queued.deliveryOrigin = try fixture.currentOrigin()
        try await fixture.queue.enqueue(queued)
        fixture.model.hasUnsavedDraftChanges = true
        let drain = Task { await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true) }
        defer { fixture.peer.releaseFirst(.offline); drain.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.conflict)
        await drain.value
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(writerPage.utf8),
            "A dirty nonmanual page must not be replaced solely because its bytes match the server.")
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.contains { $0.id == queued.id && $0.draft.utf8.elementsEqual(queuedDraft.utf8) && $0.status == .parked })
        let recovery = fixture.store.dirtyOrdinarySnapshot(ownerUserId: fixture.owner, projectId: "a")
        XCTAssertEqual(recovery.map { Data($0.draft.utf8) }, Data(queuedDraft.utf8))
        let payload = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        let preserved = payload?["preservedConflict"] as? [String: Any]
        let overflow: String?
        let origin = try fixture.currentOrigin()
        if case let .present(copy) = fixture.overflow.load(ownerUserID: fixture.owner, projectID: "a",
            backendURL: origin.backendURL, documentID: origin.documentID) {
            overflow = copy.draft
        } else { overflow = nil }
        XCTAssertTrue([recovery?.draft, preserved?["draft"] as? String, overflow].contains { $0?.utf8.elementsEqual(writerPage.utf8) == true },
            "The visible words must also have an independently durable recovery copy.")
        XCTAssertEqual(preserved?["baseVersionId"] as? String, "a-remote")
        XCTAssertEqual(fixture.model.latestVersionID, "a-remote")
        XCTAssertTrue(fixture.model.errorText.localizedCaseInsensitiveContains("export"))
    }

    func testQueuedConflictKeepsDirtyPageVisibleWhenRecoverySlotsAreFull() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        let queuedDraft = fixture.a + "\nOlder queued page."
        let writerPage = "Other A words"
        fixture.select("a", draft: writerPage, base: "a-remote")
        XCTAssertTrue(fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: queuedDraft,
            baseVersionId: "a-base", dirty: true))
        _ = fixture.store.saveInVacantRecoverySlot(ownerUserId: fixture.owner, projectId: "a",
            draft: "Second recovery copy", baseVersionId: "second-base")
        let origin = try fixture.currentOrigin()
        _ = fixture.overflow.saveIfVacant(ownerUserID: fixture.owner, projectID: "a", backendURL: origin.backendURL,
            documentID: origin.documentID, draft: "Third recovery copy", baseVersionID: "third-base")
        var queued = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: queuedDraft, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        queued.deliveryOrigin = origin
        try await fixture.queue.enqueue(queued)
        fixture.model.hasUnsavedDraftChanges = true
        let drain = Task { await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true) }
        defer { fixture.peer.releaseFirst(.offline); drain.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.conflict)
        await drain.value
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(writerPage.utf8))
        XCTAssertEqual(fixture.model.latestVersionID, "a-remote")
        XCTAssertTrue(fixture.model.errorText.localizedCaseInsensitiveContains("export"))
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertTrue(rows.contains { $0.id == queued.id && $0.status == .parked && $0.draft == queuedDraft })
        let payload = fixture.store.payloads(ownerUserId: fixture.owner)["a"]
        XCTAssertEqual(payload?["draft"] as? String, queuedDraft)
        XCTAssertEqual((payload?["preservedConflict"] as? [String: Any])?["draft"] as? String, "Second recovery copy")
        guard case let .present(overflow) = fixture.overflow.load(ownerUserID: fixture.owner, projectID: "a",
            backendURL: origin.backendURL, documentID: origin.documentID) else { return XCTFail("Overflow copy missing") }
        XCTAssertEqual(overflow.draft, "Third recovery copy")
    }

    func testQueuedConflictNeverOverwritesDifferentDirtyRecoveryCopy() async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        let queuedDraft = fixture.a + "\nEarlier queued words."
        let newerDraft = queuedDraft + "\nNewer exact words.  \t"
        fixture.select("a", draft: "Other A words", base: "a-remote")
        fixture.store.save(ownerUserId: fixture.owner, projectId: "a", draft: newerDraft,
            baseVersionId: "a-base", dirty: true)
        var queued = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: queuedDraft, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        queued.deliveryOrigin = try fixture.currentOrigin()
        try await fixture.queue.enqueue(queued)
        let drain = Task { await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true) }
        defer { fixture.peer.releaseFirst(.offline); drain.cancel() }
        try await fixture.waitForFirstSave()
        fixture.peer.releaseFirst(.conflict)
        await drain.value
        let recovery = fixture.store.dirtyOrdinarySnapshot(ownerUserId: fixture.owner, projectId: "a")
        XCTAssertEqual(recovery.map { Data($0.draft.utf8) }, Data(newerDraft.utf8))
        let rows = try await fixture.reloadQueueEntries()
        XCTAssertEqual(rows.first?.status, .parked)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(queuedDraft.utf8))
    }

    func testManualSaveBehindBackgroundDrainIsDispatchedExactlyOnce() async throws {
        try await assertPendingSaveFollowsBackgroundDrain(switchProject: false)
    }

    func testProjectBSaveBehindADrainKeepsItsCapturedBase() async throws {
        try await assertPendingSaveFollowsBackgroundDrain(switchProject: true)
    }

    func testPendingExplicitBaseBehindBackgroundDrainIsNotReplacedByItsAcknowledgement() async throws {
        try await assertPendingSaveFollowsBackgroundDrain(switchProject: false, explicitBase: "writer-choice-base")
    }

    func testConflictDuringBackgroundDrainRetainsBothOriginalAndNewerWordsForReview() async throws {
        try await assertFailedBackgroundDrainRetainsPending(.conflict, expectedStatus: .parked)
    }

    func testOfflineBackgroundDrainRetainsBothOriginalAndNewerWordsForRetry() async throws {
        try await assertFailedBackgroundDrainRetainsPending(.offline, expectedStatus: .pending)
    }

    private func assertFailedBackgroundDrainRetainsPending(_ outcome: SaveCompletionPeer.Outcome,
        expectedStatus: ScreenplayDraftSaveOutboxStatus) async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        var earlier = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        earlier.deliveryOrigin = try fixture.currentOrigin()
        try await fixture.queue.enqueue(earlier)
        let drain = Task { await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true) }
        defer { drain.cancel() }
        try await fixture.waitForFirstSave()
        let pending = fixture.a + "\r\nNewer cafe\u{0301} must not vanish. \t "
        fixture.model.fountainDraft = pending
        fixture.model.noteManualDraftEdit()
        await fixture.model.manualSaveDraft()
        fixture.peer.releaseFirst(outcome)
        await drain.value
        XCTAssertEqual(fixture.peer.writes.count, 1, "A failed earlier save cannot silently promote its pending successor")
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertEqual(rows.count, 2)
        XCTAssertTrue(rows.allSatisfy { $0.status == expectedStatus })
        XCTAssertEqual(Set(rows.map { Data($0.draft.utf8) }), Set([Data(fixture.a.utf8), Data(pending.utf8)]))
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(pending.utf8))
        XCTAssertTrue(fixture.model.hasUnsavedDraftChanges)
    }

    private func assertPendingSaveFollowsBackgroundDrain(switchProject: Bool, explicitBase: String? = nil) async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        var earlier = ScreenplayDraftSaveOutboxEntry(id: UUID().uuidString, projectId: "a", ownerUserId: fixture.owner,
            draft: fixture.a, title: "A", phase: "draft", notes: "", source: "studio_manual",
            studioWriteAnchors: [], screenplayBindings: [], baseVersionId: "a-base", createdAt: 1, updatedAt: 1,
            status: .pending, retries: 0, nextAttemptAt: 0, lastError: "")
        earlier.deliveryOrigin = try fixture.currentOrigin()
        try await fixture.queue.enqueue(earlier)
        let drain = Task { await fixture.model.resumeQueuedDraftSavesIfNeeded(force: true) }
        defer { drain.cancel() }
        try await fixture.waitForFirstSave()
        let pending = switchProject ? fixture.b : fixture.a + "\r\nNewest cafe\u{0301} remains exact. \t "
        if switchProject { fixture.select("b", draft: pending, base: "b-base", dirty: true) }
        else {
            fixture.model.fountainDraft = pending
            fixture.model.noteManualDraftEdit()
            _ = fixture.model.mirrorDraftIntoLiveBridgeIfOwned(pending)
        }
        if let explicitBase { fixture.model.latestVersionID = explicitBase }
        await fixture.model.manualSaveDraft()
        XCTAssertEqual(fixture.peer.writes.count, 1, "The background save must still own its HTTP flight")
        fixture.peer.releaseFirst(.success)
        await drain.value
        let writes = fixture.peer.writes
        XCTAssertEqual(writes.count, 2, "A manual save handed to background draining must not disappear in the pending slot")
        XCTAssertEqual(writes.map(\.project), ["a", switchProject ? "b" : "a"])
        XCTAssertEqual(writes.last?.base, explicitBase ?? (switchProject ? "b-base" : "a-ack-1"))
        XCTAssertEqual(writes.last.map { Data($0.draft.utf8) }, Data(pending.utf8))
        XCTAssertEqual(Data(fixture.model.fountainDraft.utf8), Data(pending.utf8))
        XCTAssertFalse(fixture.model.hasUnsavedDraftChanges)
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertTrue(rows.isEmpty)
    }

    private func assertRejectedAStaysScoped(_ outcome: SaveCompletionPeer.Outcome,
                                           expectedStatus: ScreenplayDraftSaveOutboxStatus) async throws {
        let fixture = try SaveCompletionFixture()
        defer { fixture.close() }
        fixture.select("a", draft: fixture.a, base: "a-base")
        let save = fixture.startSave()
        defer { save.cancel() }
        try await fixture.waitForFirstSave()
        fixture.select("b", draft: fixture.b, base: "b-base", dirty: true)
        let before = fixture.snapshot()
        fixture.peer.releaseFirst(outcome)
        try await fixture.waitForSave(save)
        XCTAssertEqual(fixture.snapshot(), before)
        let rows = try await fixture.queue.entriesForTesting()
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows.first?.projectId, "a")
        XCTAssertEqual(rows.first?.status, expectedStatus)
        XCTAssertEqual(rows.first.map { Data($0.draft.utf8) }, Data(fixture.a.utf8))
        XCTAssertEqual(fixture.peer.writes.count, 1)
    }
}

private nonisolated final class SupersededReadbackFault: @unchecked Sendable {
    private let lock = NSLock()
    private var fail = false
    func failNextRead() { lock.lock(); fail = true; lock.unlock() }
    func read(_ url: URL) throws -> Data {
        lock.lock(); let shouldFail = fail; fail = false; lock.unlock()
        if shouldFail { throw CocoaError(.fileReadNoPermission) }
        return try Data(contentsOf: url)
    }
}

@MainActor
private final class SaveCompletionFixture {
    let a = "INT. A - NIGHT\r\n\r\nA's cafe\u{0301} stays open. \t "
    let b = "INT. B - DAY\r\n\r\nB's exact words stay here.  \r\n"
    let model: ScreenplayStudioViewModel
    let queue: ScreenplayDraftSaveOutbox
    let store: ScreenplayLocalDraftRecoveryStore
    let overflow: ScreenplayRecoveryOverflowStore
    let owner: String
    let peer: SaveCompletionPeer
    let api: BackendMemoryAPI
    let identity: BackendAuthRequestIdentity
    private let directory: URL
    private let defaults: UserDefaults
    private let suite: String
    private let session: URLSession
    private let started: XCTestExpectation
    private let finished = XCTestExpectation(description: "Actual VM save completed")
    private let priorDraft: String
    private let priorProject: String
    private let priorVersion: String
    private let priorBinding: ScreenplayProjectBindingSnapshot
    private let environment: SaveCompletionEnvironmentSnapshot
    private let replyOutbox: OfflineTalkOutbox

    nonisolated deinit {}

    init(supersededReceiptReader: @escaping @Sendable (URL) throws -> Data = { try Data(contentsOf: $0) }) throws {
        let bridge = ScreenplayLiveDraftBridge.shared
        let savedEnvironment = SaveCompletionEnvironmentSnapshot()
        bridge.reconcileAccountStorage()
        priorDraft = bridge.draftText; priorProject = bridge.preferredProjectID
        priorVersion = bridge.preferredVersionID; priorBinding = bridge.projectBinding
        let testOwner = "save-completion-\(UUID().uuidString.lowercased())"
        let backend = BackendAuthClient.resolvedBackendBaseURL()
        var installedEnvironment = false
        defer {
            if !installedEnvironment {
                savedEnvironment.restore()
                bridge.reconcileAccountStorage()
                SaveCompletionEnvironmentSnapshot.removeOwnerScopedValues(owner: testOwner)
            }
        }
        try savedEnvironment.install(owner: testOwner)
        bridge.reconcileAccountStorage()
        owner = ScreenplayStudioAuthContext.current().userID
        guard owner == testOwner else {
            throw SaveCompletionFixtureError.environmentNotInstalled
        }
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("SaveCompletion-\(UUID())")
        suite = "them.save-completion.\(UUID())"
        defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
        overflow = ScreenplayRecoveryOverflowStore(rootDirectory: directory.appendingPathComponent("overflow"))
        queue = ScreenplayDraftSaveOutbox(storageDirectory: directory, supersededReceiptReader: supersededReceiptReader)
        started = XCTestExpectation(description: "A's actual version request reached URLSession")
        peer = SaveCompletionPeer(started: started)
        SaveCompletionProtocol.install(peer)
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [SaveCompletionProtocol.self]
        session = URLSession(configuration: config)
        let context = ScreenplayStudioAuthContext.current()
        let identity = BackendAuthRequestIdentity(sessionEpoch: 1, userID: testOwner,
            clientToken: "save-completion-client", accessToken: "save-completion-access",
            sessionIntentGeneration: context.sessionIntentGeneration)
        self.identity = identity
        let authenticatedState = BackendAuthSessionState(user: BackendAuthClient.currentAuthSessionState().user,
            accessTokenPresent: true, refreshTokenPresent: true, accessExpiresAt: 0, refreshExpiresAt: 0,
            currentSessionId: "save-completion-session", currentFamilyId: "save-completion-family",
            tokenType: "Bearer", pendingEmailVerification: false, verificationRequired: false)
        replyOutbox = OfflineTalkOutbox(storageDirectory: directory.appendingPathComponent("reply-outbox"),
            requestIdentityProvider: { _ in identity }, backendURLProvider: { backend })
        let api = BackendMemoryAPI(session: session, baseURL: backend,
            requestIdentityProvider: { _ in identity }, projectWriteAuthRefresher: { _ in authenticatedState })
        self.api = api
        let recoveryOrigin: (String) -> ScreenplayDraftSaveOrigin? = { projectID in
            guard bridge.draftOrigin.projectID == projectID, let documentID = bridge.draftOrigin.documentID else { return nil }
            return .init(documentID: documentID, backendURL: backend)
        }
        model = ScreenplayStudioViewModel(localDraftRecoveryStore: store, overflowRecoveryStore: overflow, recoveryOriginProvider: recoveryOrigin,
                                          draftSaveOutbox: queue, draftSaveAPI: api, projectSelectionAPI: api,
                                          draftSaveIdentityProvider: { identity }, liveReplyOutbox: replyOutbox)
        model.autosaveEnabled = false
        environment = savedEnvironment
        installedEnvironment = true
    }

    func select(_ id: String, draft: String, base: String, dirty: Bool = false) {
        let data = try! JSONSerialization.data(withJSONObject: ["id": id, "title": id.uppercased()])
        let project = try! JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: data)
        model.projects = [project]
        model.selectedProjectID = id
        model.selectedProject = project
        model.applyStructuralUITestDraft(dirty ? draft + "\nEarlier saved baseline." : draft, versionID: base)
        if dirty { model.fountainDraft = draft; model.noteManualDraftEdit() }
        let bridge = ScreenplayLiveDraftBridge.shared
        XCTAssertTrue(bridge.adoptLoadedProjectDraft(draft, projectID: id,
            versionID: base, owner: .current()))
        XCTAssertEqual(bridge.draftOrigin.projectID, id)
        XCTAssertNotNil(bridge.draftOrigin.documentID)
        model.hasUnsavedDraftChanges = dirty
        model.autosaveStatusText = "Editing \(id)"
        model.infoText = "Current \(id) notice"
        model.errorText = "Current \(id) local status"
        store.save(ownerUserId: owner, projectId: id, draft: draft, baseVersionId: base, dirty: dirty)
    }

    func reloadQueueEntries() async throws -> [ScreenplayDraftSaveOutboxEntry] {
        let reopened = ScreenplayDraftSaveOutbox(storageDirectory: directory)
        return try await reopened.entriesForTesting()
    }

    func currentOrigin() throws -> ScreenplayDraftSaveOrigin {
        let documentID = try XCTUnwrap(ScreenplayLiveDraftBridge.shared.draftOrigin.documentID)
        return .init(documentID: documentID, backendURL: BackendAuthClient.resolvedBackendBaseURL())
    }

    func startSave() -> Task<Void, Never> {
        let model = model, finished = finished
        return Task { @MainActor in
            await model.manualSaveDraft()
            finished.fulfill()
        }
    }

    func waitForFirstSave() async throws {
        let result = await XCTWaiter.fulfillment(of: [started], timeout: 3)
        XCTAssertEqual(result, .completed, "Save state: \(model.autosaveStatusText); error: \(model.errorText)")
        guard !peer.writes.isEmpty else { throw URLError(.timedOut) }
    }

    func waitForSave(_ task: Task<Void, Never>) async throws {
        let result = await XCTWaiter.fulfillment(of: [finished], timeout: 5)
        XCTAssertEqual(result, .completed)
        guard result == .completed else { task.cancel(); peer.close(); throw URLError(.timedOut) }
        await task.value
    }

    struct Snapshot: Equatable {
        let project: String
        let selectedProject: String?
        let version: String
        let draft: Data
        let dirty: Bool
        let loaded: String
        let info: String
        let error: String
        let recovery: Data
    }

    func snapshot() -> Snapshot {
        let payload = (store.payloads(ownerUserId: owner)["b"] ?? [:]).filter { $0.key != "savedAt" }
        let data = try! JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        return .init(project: model.selectedProjectID, selectedProject: model.selectedProject?.id,
            version: model.latestVersionID, draft: Data(model.fountainDraft.utf8), dirty: model.hasUnsavedDraftChanges,
            loaded: model.debugLoadedDraftProjectID,
            info: model.infoText, error: model.errorText, recovery: data)
    }

    func close() {
        peer.close(); session.invalidateAndCancel()
        SaveCompletionProtocol.uninstall(peer)
        let queue = queue, replyOutbox = replyOutbox
        Task { await queue.stopNetworkMonitoring(); await replyOutbox.stopNetworkMonitoring() }
        defaults.removePersistentDomain(forName: suite)
        try? FileManager.default.removeItem(at: directory)
        let bridge = ScreenplayLiveDraftBridge.shared
        environment.restore()
        bridge.reconcileAccountStorage()
        SaveCompletionEnvironmentSnapshot.removeOwnerScopedValues(owner: owner)
        bridge.projectBinding = priorBinding
        _ = bridge.adoptLoadedProjectDraft(priorDraft, projectID: priorProject, versionID: priorVersion, owner: .current())
    }
}

private enum SaveCompletionFixtureError: Error {
    case environmentNotInstalled
}

@MainActor
private struct SaveCompletionEnvironmentSnapshot {
    private static let keys = [
        "auth_user_payload", "auth_signed_in", "auth_session_token_deletion_pending",
    ]
    private let values: [Any?]

    init() { values = Self.keys.map { UserDefaults.standard.object(forKey: $0) } }

    func install(owner: String) throws {
        let user = BackendAuthUser(userId: owner, email: "save-completion@example.invalid",
            authProvider: nil, emailVerified: true, emailVerifiedAt: nil, createdAt: nil, updatedAt: nil)
        UserDefaults.standard.set(try JSONEncoder().encode(user), forKey: "auth_user_payload")
        UserDefaults.standard.set(true, forKey: "auth_signed_in")
        UserDefaults.standard.set(false, forKey: "auth_session_token_deletion_pending")
    }

    func restore() {
        for (index, key) in Self.keys.enumerated() {
            if let value = values[index] { UserDefaults.standard.set(value, forKey: key) }
            else { UserDefaults.standard.removeObject(forKey: key) }
        }
    }

    static func removeOwnerScopedValues(owner: String) {
        let probe = "save-completion-owner-probe"
        let marker = ScreenplayOwnerScopedStoragePolicy.storageKey(baseKey: probe, ownerUserID: owner)
        let suffix = String(marker.dropFirst(probe.count))
        for key in UserDefaults.standard.dictionaryRepresentation().keys where key.hasSuffix(suffix) {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }
}

private nonisolated final class SaveCompletionPeer: @unchecked Sendable {
    enum Outcome: Equatable { case success, conflict, matchingConflict, offline, versionIDOnly, wrongReceipt, nestedExactReceipt, replayedSuperseded }
    struct Write {
        let project: String; let base: String; let draft: String; let id: String
        let phase: String; let source: String; let notes: String
        let anchors: [BackendScreenplayWriteAnchor]; let bindings: [BackendScreenplayBindingRecord]
    }
    private let lock = NSLock()
    private var recorded: [Write] = []
    private var held: (SaveCompletionProtocol, Write)?
    private let started: XCTestExpectation
    init(started: XCTestExpectation) { self.started = started }
    var writes: [Write] { lock.lock(); defer { lock.unlock() }; return recorded }

    func accept(_ transport: SaveCompletionProtocol, request: URLRequest) {
        do {
            let path = request.url!.path
            if path == "/screenplay/revision-colors" {
                transport.respond(status: 200, payload: ["ranges": []])
                return
            }
            if request.httpMethod == "GET", path == "/screenplay/projects/a" {
                transport.respond(status: 200, payload: ["project": ["id": "a", "title": "A",
                    "active_version_id": "a-remote", "versions": [["id": "a-remote", "draft": "Server page"]]]])
                return
            }
            guard path.hasSuffix("/version") else {
                transport.respond(status: 503, payload: ["error": "fixture endpoint unavailable"])
                return
            }
            var data = request.httpBody ?? Data()
            if data.isEmpty, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while true {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }; data.append(contentsOf: buffer.prefix(count))
                }
            }
            let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase
            let anchors = try decoder.decode([BackendScreenplayWriteAnchor].self,
                from: JSONSerialization.data(withJSONObject: payload["studio_write_anchors"] ?? []))
            let bindings = try decoder.decode([BackendScreenplayBindingRecord].self,
                from: JSONSerialization.data(withJSONObject: payload["screenplay_bindings"] ?? []))
            let write = Write(project: path.split(separator: "/").dropLast().last.map(String.init) ?? "",
                base: payload["base_version_id"] as? String ?? "", draft: try XCTUnwrap(payload["draft"] as? String),
                id: payload["client_request_id"] as? String ?? "",
                phase: payload["phase"] as? String ?? "", source: payload["source"] as? String ?? "",
                notes: payload["notes"] as? String ?? "", anchors: anchors, bindings: bindings)
            lock.lock(); recorded.append(write); let count = recorded.count
            if count == 1 { held = (transport, write) }; lock.unlock()
            if count == 1 { started.fulfill() }
            else { respond(transport, write: write, outcome: .success, number: count) }
        } catch { transport.fail(error) }
    }

    func releaseFirst(_ outcome: Outcome) {
        lock.lock(); let pending = held; held = nil; lock.unlock()
        if let (transport, write) = pending { respond(transport, write: write, outcome: outcome, number: 1) }
    }

    private func respond(_ transport: SaveCompletionProtocol, write: Write, outcome: Outcome, number: Int) {
        switch outcome {
        case .offline: transport.fail(URLError(.notConnectedToInternet))
        case .conflict:
            transport.respond(status: 409, payload: ["status": "conflict", "conflict": true,
                "project_id": write.project, "base_version_id": write.base, "server_version_id": "a-remote",
                "server_version": ["id": "a-remote", "draft": "Other A words"]])
        case .replayedSuperseded:
            transport.respond(status: 409, payload: ["status": "replayed_superseded", "conflict": true,
                "replayed": true, "replay_proof": "full_request_hash_v1", "project_id": write.project,
                "base_version_id": write.base, "server_version_id": "newer-version", "version_id": "saved-version"])
        case .matchingConflict:
            do {
                let anchors = try JSONSerialization.jsonObject(with: JSONEncoder().encode(write.anchors))
                let bindings = try JSONSerialization.jsonObject(with: JSONEncoder().encode(write.bindings))
                transport.respond(status: 200, payload: ["status": "conflict", "conflict": true,
                    "project_id": write.project, "server_version_id": "a-remote",
                    "project": ["id": write.project, "title": write.project.uppercased(), "active_version_id": "a-remote"],
                    "server_version": ["id": "a-remote", "project_id": write.project,
                        "draft": write.draft, "phase": write.phase,
                        "studio_write_anchors": anchors, "screenplay_bindings": bindings]])
            } catch { transport.fail(error) }
        case .success, .versionIDOnly, .wrongReceipt, .nestedExactReceipt:
            let version = "\(write.project)-ack-\(number)"
            do {
                let anchors = try JSONSerialization.jsonObject(with: JSONEncoder().encode(write.anchors))
                let bindings = try JSONSerialization.jsonObject(with: JSONEncoder().encode(write.bindings))
                if outcome == .versionIDOnly {
                    transport.respond(status: 200, payload: ["status": "saved", "version_id": version])
                    return
                }
                let echoedRequestID = outcome == .wrongReceipt ? "another-request" : write.id
                var payload: [String: Any] = ["status": "saved",
                    "project": ["id": write.project, "title": write.project.uppercased()],
                    "version": ["id": version, "project_id": write.project, "client_request_id": echoedRequestID,
                        "draft": write.draft, "phase": write.phase, "source": write.source, "notes": write.notes,
                        "studio_write_anchors": anchors, "screenplay_bindings": bindings]]
                if outcome != .nestedExactReceipt {
                    payload["project_id"] = write.project
                    payload["version_id"] = version
                }
                transport.respond(status: 200, payload: payload)
            } catch { transport.fail(error) }
        }
    }

    func close() {
        lock.lock(); let pending = held; held = nil; lock.unlock()
        pending?.0.fail(URLError(.cancelled))
    }
}

private nonisolated final class SaveCompletionProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var installed: SaveCompletionPeer?
    private var peer: SaveCompletionPeer?
    private let callbackLock = NSRecursiveLock()
    private var closed = false
    static func install(_ peer: SaveCompletionPeer) { lock.lock(); installed = peer; lock.unlock() }
    static func uninstall(_ peer: SaveCompletionPeer) {
        lock.lock(); defer { lock.unlock() }
        if installed === peer { installed = nil }
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock(); peer = Self.installed; Self.lock.unlock()
        peer?.accept(self, request: request)
    }
    override func stopLoading() { callbackLock.lock(); closed = true; callbackLock.unlock() }
    func fail(_ error: Error) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        guard !closed else { return }; closed = true
        client?.urlProtocol(self, didFailWithError: error)
    }
    func respond(status: Int, payload: [String: Any]) {
        callbackLock.lock(); defer { callbackLock.unlock() }
        guard !closed else { return }
        do {
            let data = try JSONSerialization.data(withJSONObject: payload)
            closed = true
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { fail(error) }
    }
}
