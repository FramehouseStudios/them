import XCTest
@testable import them

final class StudioRenderTimeoutCopyTests: XCTestCase {
    func testASlowStudioPageSaysSoInTheWritersTerms() {
        // 2026-09-30: the first-page card read "Studio render error: Studio render timed out."
        let error = BackendError.stage("studio_render", "Studio render timed out.")
        XCTAssertEqual(error.localizedDescription, "Clementine took too long to write that page. Your scene is safe. Try again in a moment.")
        XCTAssertEqual(
            MagicMomentSignInDeferral.failureMessage(error.localizedDescription),
            "Your first page wasn't written yet. Clementine took too long to write that page. Your scene is safe. Try again in a moment."
        )
    }

    func testOtherStudioRenderStagesKeepTheirMessage() {
        XCTAssertNil(BackendTalkFailureCopy.studioRenderMessage(stage: "studio_render", message: "Studio render stream response was empty."))
        XCTAssertNil(BackendTalkFailureCopy.studioRenderMessage(stage: "chat", message: "timed out"))
    }
}
