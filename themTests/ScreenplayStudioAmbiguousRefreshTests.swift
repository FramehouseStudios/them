import XCTest
@testable import them

final class ScreenplayStudioAmbiguousRefreshTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suiteName: String!
    private var store: ScreenplayLocalDraftRecoveryStore!

    override func setUp() {
        super.setUp()
        suiteName = "ambiguous-refresh-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: "recovery")
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        store = nil
        defaults = nil
        super.tearDown()
    }

    @MainActor
    private func makeModel() -> ScreenplayStudioViewModel {
        let model = ScreenplayStudioViewModel(localDraftRecoveryStore: store)
        model.autosaveEnabled = false
        model.selectedProjectID = "project-\(UUID().uuidString)"
        return model
    }

    @MainActor
    func testIdenticalUnversionedRefreshKeepsKnownSaveBase() {
        let model = makeModel()
        let page = "INT. ROOM - NIGHT\n\nA door opens.\n"
        model.applyServerDraft(page, versionId: "v1")
        model.applyServerDraft(page, versionId: "")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertEqual(model.latestVersionID, "v1")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testUnversionedProjectHydrationCannotBlankKnownPage() throws {
        let model = makeModel()
        let page = "INT. ROOM - NIGHT\n\nA door opens.\n"
        model.applyServerDraft(page, versionId: "v1")
        let payload = try JSONSerialization.data(withJSONObject: [
            "id": model.selectedProjectID, "title": "Script", "versions": []
        ])
        let project = try JSONDecoder().decode(BackendScreenplayProjectSummary.self, from: payload)
        model.hydrateDraft(from: project)
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertEqual(model.latestVersionID, "v1")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testSameVersionBlankRefreshKeepsExactWhitespace() {
        let model = makeModel()
        let page = " \r\n\t"
        model.applyServerDraft(page, versionId: "v1")
        model.applyServerDraft("\n", versionId: "v1")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertEqual(model.latestVersionID, "v1")
    }

    @MainActor
    func testUnversionedBlankRefreshKeepsExactWhitespaceAndBase() {
        let model = makeModel()
        let page = " \r\n\t"
        model.applyServerDraft(page, versionId: "v1")
        model.applyServerDraft("\n", versionId: "")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertEqual(model.latestVersionID, "v1")
    }

    @MainActor
    func testIdenticalUnversionedRefreshCannotAcknowledgeDirtyPage() {
        let model = makeModel()
        model.applyServerDraft("Earlier saved words", versionId: "v1")
        let page = "The writer's unsaved words.\n"
        model.fountainDraft = page
        model.noteManualDraftEdit()
        model.applyServerDraft(page, versionId: "")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertEqual(model.latestVersionID, "v1")
        XCTAssertTrue(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testIdenticalKnownRefreshCanEstablishUnknownBase() {
        let model = makeModel()
        let page = "INT. ROOM - NIGHT\n\nA door opens.\n"
        model.applyServerDraft(page, versionId: "")
        model.applyServerDraft(page, versionId: "v1")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertEqual(model.latestVersionID, "v1")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
    }

    @MainActor
    func testDistinctKnownVersionAdoptsExactBlankPage() {
        let model = makeModel()
        model.applyServerDraft(" \r\n\t", versionId: "v1")
        model.applyServerDraft("\n", versionId: "v2")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data("\n".utf8))
        XCTAssertEqual(model.latestVersionID, "v2")
    }

    @MainActor
    func testProjectSwitchDoesNotInheritPreviousSaveBase() {
        let model = makeModel()
        let page = "INT. ROOM - NIGHT\n\nA door opens.\n"
        model.applyServerDraft(page, versionId: "v1")
        model.selectedProjectID = "other-project-\(UUID().uuidString)"
        model.applyServerDraft(page, versionId: "")
        XCTAssertEqual(Data(model.fountainDraft.utf8), Data(page.utf8))
        XCTAssertEqual(model.latestVersionID, "")
    }

    @MainActor
    func testExplicitOverwriteCanClearKnownPageAndBase() {
        let model = makeModel()
        model.applyServerDraft("Saved words", versionId: "v1")
        model.applyServerDraft("", versionId: "", allowOverwriteDirtyLocalDraft: true)
        XCTAssertEqual(model.fountainDraft, "")
        XCTAssertEqual(model.latestVersionID, "")
        XCTAssertFalse(model.hasUnsavedDraftChanges)
    }
}
