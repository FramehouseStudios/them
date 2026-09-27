import XCTest
@testable import them

final class ScreenplayRestoreNoteTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar
    }

    func testNoteUsesAClockTimeEvenForARecentVersion() {
        let now = calendar.date(from: DateComponents(year: 2026, month: 9, day: 27, hour: 14, minute: 50))!
        let savedAt = now.addingTimeInterval(-600)
        let note = ScreenplayRestoreNote.text(restoredFrom: savedAt, now: now, calendar: calendar, locale: Locale(identifier: "en_US"))
        XCTAssertTrue(note.hasPrefix("Restored from Today "), note)
        XCTAssertFalse(note.contains("ago"), "a stored note must not go stale: \(note)")
    }

    func testNoteWithoutADate() {
        XCTAssertEqual(ScreenplayRestoreNote.text(restoredFrom: nil), "Restored an earlier version")
    }
}
