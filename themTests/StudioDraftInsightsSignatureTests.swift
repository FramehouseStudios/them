import XCTest
@testable import them

final class StudioDraftInsightsSignatureTests: XCTestCase {
    private func signature(draft: String = "INT. PIER - NIGHT\n\nFog.", linesPerPage: Int = 55, color: String = "blue") -> Int {
        StudioDraftInsightsSignature.make(
            draft: draft,
            title: "Nora Scene",
            phase: "scene_draft",
            linesPerPage: linesPerPage,
            revisionBaseDraft: "INT. PIER - NIGHT",
            revisionColor: color,
            frameworkID: ""
        )
    }

    func testSameDraftAfterLoadSkipsTheDebouncedPass() {
        let loaded = signature()
        XCTAssertFalse(StudioDraftInsightsSignature.shouldRecompute(last: loaded, current: signature(), hasVisibleError: false))
    }

    func testTrailingWhitespaceDoesNotCountAsAnEdit() {
        XCTAssertEqual(signature(draft: "INT. PIER - NIGHT\n\nFog.\n\n"), signature())
    }

    func testEditsAndSettingChangesRecompute() {
        let loaded = signature()
        XCTAssertTrue(StudioDraftInsightsSignature.shouldRecompute(last: loaded, current: signature(draft: "INT. PIER - NIGHT\n\nFog rolls."), hasVisibleError: false))
        XCTAssertTrue(StudioDraftInsightsSignature.shouldRecompute(last: loaded, current: signature(linesPerPage: 50), hasVisibleError: false))
        XCTAssertTrue(StudioDraftInsightsSignature.shouldRecompute(last: loaded, current: signature(color: "pink"), hasVisibleError: false))
    }

    func testAVisibleErrorAlwaysRetries() {
        let loaded = signature()
        XCTAssertTrue(StudioDraftInsightsSignature.shouldRecompute(last: loaded, current: loaded, hasVisibleError: true))
    }

    func testFirstPassAlwaysRuns() {
        XCTAssertTrue(StudioDraftInsightsSignature.shouldRecompute(last: nil, current: signature(), hasVisibleError: false))
    }
}
