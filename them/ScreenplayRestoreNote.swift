import Foundation

/// The note saved with a version created by restoring an older one. It is
/// stored, so it names a dated clock time ("Restored from Sep 27, 4:22 AM"),
/// never "13 min. ago" or "Today", which go stale.
enum ScreenplayRestoreNote {
    static func text(restoredFrom savedAt: Date?, now: Date = .now, calendar: Calendar = .current, locale: Locale = .current) -> String {
        guard let savedAt else { return "Restored an earlier version" }
        return "Restored from \(StudioVersionTimeLabel.text(for: savedAt, now: now, calendar: calendar, locale: locale, absolute: true))"
    }
}
