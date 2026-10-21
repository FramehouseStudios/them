import XCTest
@testable import them

final class ScreenplayProjectPromotionTests: XCTestCase {
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
