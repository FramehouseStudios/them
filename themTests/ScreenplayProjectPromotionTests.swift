import XCTest
@testable import them

final class ScreenplayProjectPromotionTests: XCTestCase {
    @MainActor
    func testCommittedPageWaitsForExactEditorBindingInEitherPublicationOrder() {
        let owner = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 4)
        let draft = "INT. ROOM - NIGHT\r\n\r\nCafe\u{0301}. \t "
        let write = committedPage(draft, owner: owner)
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: nil, draft: draft, auth: owner))
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: write, draft: "Previous binding", auth: owner))
        XCTAssertTrue(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: write, draft: draft, auth: owner))
        let canonicallyEqual = draft.precomposedStringWithCanonicalMapping
        XCTAssertEqual(draft, canonicallyEqual)
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: write, draft: canonicallyEqual, auth: owner))
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: write, draft: draft.trimmingCharacters(in: .whitespacesAndNewlines), auth: owner))
    }

    @MainActor
    func testSameWriteIDCanCarryAFinalCommittedPage() {
        let owner = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 4)
        let id = UUID()
        let partial = committedPage("First part", owner: owner, id: id)
        let final = committedPage("First part\n\nFinal words.", owner: owner, id: id)
        XCTAssertEqual(partial.id, final.id)
        XCTAssertNotEqual(partial, final)
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: partial, draft: final.committedDraft, auth: owner))
        XCTAssertTrue(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: final, draft: final.committedDraft, auth: owner))
    }

    @MainActor
    func testASettledPageCannotPromoteUnderAnotherLoginOrFromAPlaceholder() {
        let owner = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 4)
        let write = committedPage("Exact words", owner: owner)
        for other in [ScreenplayStudioAuthContext(userID: "writer-b", sessionIntentGeneration: 4),
                      .init(userID: "writer-a", sessionIntentGeneration: 5),
                      .init(userID: "", sessionIntentGeneration: 4)] {
            XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: write, draft: write.committedDraft, auth: other))
        }
        let placeholder = committedPage("Exact words", owner: owner, writeID: "stub-write")
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: placeholder, draft: placeholder.committedDraft, auth: owner))
        let bound = committedPage("Exact words", owner: owner, projectID: "existing-project")
        XCTAssertFalse(ScreenplayRestoredLiveDraftProjectPromotionPolicy.committedDraftIsReady(write: bound, draft: bound.committedDraft, auth: owner))
    }

    @MainActor
    private func committedPage(_ draft: String, owner: ScreenplayStudioAuthContext,
                               id: UUID = UUID(), writeID: String = "write-a", projectID: String = "") -> ScreenplayCommittedWrite {
        .init(id: id, writeID: writeID, projectID: projectID, previousDraft: "", committedDraft: draft,
              insertedText: draft, replacementApplied: false, replacedWriteID: nil,
              startLine: 1, endLine: 3, committedAt: Date(timeIntervalSince1970: 0), authContext: owner)
    }

    @MainActor
    func testEmptyProjectListPreservesUnboundPageButDetachesPreviouslyLoadedProject() throws {
        let suite = "them.promotion-hydration.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore:
            ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery"))
        let restored = "Title: My Story\r\n\r\nINT. ROOM - NIGHT\r\n\r\nCafe\u{0301}. \t "
        model.selectedProjectID = ""
        model.fountainDraft = restored
        model.clearBoundDraftForEmptyProjectSelection()
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(restored.utf8))
        model.selectedProjectID = "previous-project"
        model.applyStructuralUITestDraft("Previous project's text", versionID: "saved-version")
        model.selectedProjectID = ""
        model.clearBoundDraftForEmptyProjectSelection()
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertEqual(model.latestVersionID, "")
    }

    @MainActor
    func testOnlyTheInitiatingAuthenticatedUnboundPageMayContinue() {
        let auth = ScreenplayStudioAuthContext(userID: "writer-a", sessionIntentGeneration: 4)
        let initiating = StudioActionDocumentContext(auth: auth, projectID: "", draft: "Café\n ", isAuthenticated: true)
        func allowed(_ current: StudioActionDocumentContext, active: Bool = true, cancelled: Bool = false) -> Bool {
            ScreenplayRestoredLiveDraftProjectPromotionPolicy.canContinue(initiating: initiating, current: current,
                isStudioActive: active, isCancelled: cancelled)
        }
        XCTAssertTrue(allowed(initiating))
        XCTAssertFalse(allowed(initiating, active: false))
        XCTAssertFalse(allowed(initiating, cancelled: true))
        for changed in [
            StudioActionDocumentContext(auth: .init(userID: "writer-b", sessionIntentGeneration: 4), projectID: "", draft: initiating.draft, isAuthenticated: true),
            StudioActionDocumentContext(auth: .init(userID: "writer-a", sessionIntentGeneration: 5), projectID: "", draft: initiating.draft, isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "chosen-project", draft: initiating.draft, isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "", draft: "Cafe\u{0301}\n ", isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "", draft: "Café\n", isAuthenticated: true),
            StudioActionDocumentContext(auth: auth, projectID: "", draft: initiating.draft, isAuthenticated: false),
        ] { XCTAssertFalse(allowed(changed)) }
    }
}
