import XCTest
@testable import them

final class RelativeDateFormatterTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    func testSaveStampedSlightlyInTheFutureReadsJustNow() {
        // Server clock skew or millisecond rounding put the save after "now".
        let saved = now.addingTimeInterval(0.4)
        XCTAssertEqual(RelativeDateFormatter.shortString(for: saved, relativeTo: now), "just now")
        XCTAssertEqual(RelativeDateFormatter.relativeString(for: saved, relativeTo: now), "just now")
    }

    func testFreshSaveReadsJustNow() {
        XCTAssertEqual(RelativeDateFormatter.shortString(for: now, relativeTo: now), "just now")
        XCTAssertEqual(
            RelativeDateFormatter.shortString(for: now.addingTimeInterval(-4.9), relativeTo: now),
            "just now"
        )
    }

    func testOlderTimesUseTheLocalizedPastPhrase() {
        let nineMinutesAgo = now.addingTimeInterval(-9 * 60)
        XCTAssertEqual(
            RelativeDateFormatter.shortString(for: nineMinutesAgo, relativeTo: now),
            RelativeDateFormatter.short.localizedString(for: nineMinutesAgo, relativeTo: now)
        )
        XCTAssertEqual(
            RelativeDateFormatter.relativeString(for: nineMinutesAgo, relativeTo: now),
            RelativeDateFormatter.shared.localizedString(for: nineMinutesAgo, relativeTo: now)
        )
    }

    func testNoPhraseEverReadsAsTheFuture() {
        for offset in stride(from: -2.0, through: 120.0, by: 0.5) {
            let text = RelativeDateFormatter.shortString(for: now.addingTimeInterval(offset), relativeTo: now)
            XCTAssertFalse(text.hasPrefix("in "), "offset \(offset) produced \(text)")
        }
    }
}

final class ScreenplayLineRangeTextTests: XCTestCase {
    func testSingleLineReadsAsOneLine() {
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.lineRangeText(start: 10, end: 10), "Line 10")
    }

    func testRangeUsesAnEnDash() {
        XCTAssertEqual(ScreenplayStudioDraftToolsPresentationPlanner.lineRangeText(start: 4, end: 9), "Lines 4–9")
    }
}
