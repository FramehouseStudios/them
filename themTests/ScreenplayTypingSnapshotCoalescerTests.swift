import XCTest
@testable import them

/// Typing in a 51-page script rebuilt the structured draft on every keystroke
/// (~70 ms each); the rebuild now waits for a typing pause (2026-09-30).
final class ScreenplayTypingSnapshotCoalescerTests: XCTestCase {
    func testAPendingRebuildOnlyAppliesToTheTextStillOnThePage() {
        XCTAssertTrue(ScreenplayTypingSnapshotCoalescer.appliesPending(typed: "INT. HALL - NIGHT\n\nNora waits.", current: "INT. HALL - NIGHT\n\nNora waits."))
        XCTAssertTrue(ScreenplayTypingSnapshotCoalescer.appliesPending(typed: "Nora waits.", current: ""), "nothing published yet")
        XCTAssertFalse(ScreenplayTypingSnapshotCoalescer.appliesPending(typed: "Nora waits.", current: "Nora waits.\n\nA page Clementine wrote."), "a page write since wins")
    }
}
