import Foundation

/// When a saved version was made, precise enough to tell rows apart.
///
/// The Saved and Snapshots lists showed "9 hr. ago" on every autosave from
/// one sitting, so a writer could not tell which one to restore. Recent saves
/// keep the relative phrase; anything an hour or older shows its clock time.
enum StudioVersionTimeLabel {
    /// `absolute` is for text that is stored (a saved note). Any phrase tied to
    /// the moment of writing ("13 min. ago", "Today") is wrong by the time it
    /// is read, so the date is always spelled out.
    static func text(for date: Date, now: Date = .now, calendar: Calendar = .current, locale: Locale = .current, absolute: Bool = false) -> String {
        if !absolute, now.timeIntervalSince(date) < 3600 {
            return RelativeDateFormatter.shortString(for: date, relativeTo: now)
        }
        let time = DateFormatter()
        time.locale = locale
        time.calendar = calendar
        time.timeZone = calendar.timeZone
        time.dateStyle = .none
        time.timeStyle = .short
        let clock = time.string(from: date)
        if !absolute, calendar.isDate(date, inSameDayAs: now) { return "Today \(clock)" }
        if !absolute, let yesterday = calendar.date(byAdding: .day, value: -1, to: now),
           calendar.isDate(date, inSameDayAs: yesterday) {
            return "Yesterday \(clock)"
        }
        let day = DateFormatter()
        day.locale = locale
        day.calendar = calendar
        day.timeZone = calendar.timeZone
        day.setLocalizedDateFormatFromTemplate("MMMd")
        return "\(day.string(from: date)), \(clock)"
    }
}
