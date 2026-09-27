import XCTest
@testable import them

final class StudioVersionTimeLabelTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar
    }
    private let locale = Locale(identifier: "en_US")
    private func date(_ day: Int, _ hour: Int, _ minute: Int) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 9, day: day, hour: hour, minute: minute))!
    }

    func testRecentSavesStayRelative() {
        let now = date(27, 13, 30)
        XCTAssertEqual(StudioVersionTimeLabel.text(for: date(27, 13, 25), now: now, calendar: calendar, locale: locale), RelativeDateFormatter.shortString(for: date(27, 13, 25), relativeTo: now))
    }

    func testSameDaySavesShowTheirClockTime() {
        let now = date(27, 13, 30)
        let a = StudioVersionTimeLabel.text(for: date(27, 5, 7), now: now, calendar: calendar, locale: locale)
        let b = StudioVersionTimeLabel.text(for: date(27, 5, 12), now: now, calendar: calendar, locale: locale)
        XCTAssertTrue(a.hasPrefix("Today "), a)
        XCTAssertNotEqual(a, b, "two saves minutes apart must read differently")
    }

    func testYesterdayAndOlder() {
        let now = date(27, 13, 30)
        XCTAssertTrue(StudioVersionTimeLabel.text(for: date(26, 22, 0), now: now, calendar: calendar, locale: locale).hasPrefix("Yesterday "))
        XCTAssertTrue(StudioVersionTimeLabel.text(for: date(20, 9, 0), now: now, calendar: calendar, locale: locale).hasPrefix("Sep 20, "))
    }
}
