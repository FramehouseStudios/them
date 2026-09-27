import XCTest
@testable import them

final class BeatProvenanceTextTests: XCTestCase {
    func testATypedBeatReadsAddedByYouWithNoRepeatLine() {
        let entry = BeatProvenanceHistoryEntry(createdFromRaw: "manual", createdAt: 100, lastRefreshedFromRaw: "manual", lastRefreshedAt: 100)
        let lines = BeatProvenanceText.lines(for: entry, createdWhen: "just now", refreshedWhen: "just now")
        XCTAssertEqual(lines.created, "Added by you · just now")
        XCTAssertEqual(lines.refreshed, "")
        XCTAssertEqual(lines.accessibilityLabel, "Added by you · just now")
    }

    func testARefreshedBeatShowsWhereTheRefreshCameFrom() {
        let entry = BeatProvenanceHistoryEntry(createdFromRaw: "selection", createdAt: 100, lastRefreshedFromRaw: "current_scene", lastRefreshedAt: 400)
        let lines = BeatProvenanceText.lines(for: entry, createdWhen: "5 min. ago", refreshedWhen: "just now")
        XCTAssertEqual(lines.created, "Created from selection · 5 min. ago")
        XCTAssertEqual(lines.refreshed, "Refreshed from current scene · just now")
    }

    func testAnEditedTypedBeatSaysEdited() {
        let entry = BeatProvenanceHistoryEntry(createdFromRaw: "manual", createdAt: 100, lastRefreshedFromRaw: "manual", lastRefreshedAt: 900)
        XCTAssertEqual(BeatProvenanceText.lines(for: entry, createdWhen: "a", refreshedWhen: "b").refreshed, "Edited · b")
    }

    func testNoLineUsesTheInternalManualName() {
        let entry = BeatProvenanceHistoryEntry(createdFromRaw: "manual", createdAt: 1, lastRefreshedFromRaw: "manual", lastRefreshedAt: 50)
        let lines = BeatProvenanceText.lines(for: entry, createdWhen: "x", refreshedWhen: "y")
        XCTAssertFalse((lines.created + lines.refreshed).contains("Manual"))
    }
}
