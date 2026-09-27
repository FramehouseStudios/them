import Foundation

/// The provenance lines under a beat in the Studio Beats tab.
///
/// A beat the writer typed read "Created from Manual · just now" and "Last
/// refreshed from Manual · just now": the source enum's internal name, and a
/// second line that only repeated the first. A typed beat now reads "Added by
/// you · just now", and the refresh line only appears once the beat has
/// actually been refreshed.
enum BeatProvenanceText {
    struct Lines: Equatable {
        let created: String
        let refreshed: String
        let accessibilityLabel: String
    }

    static func lines(
        for history: BeatProvenanceHistoryEntry,
        createdWhen: String,
        refreshedWhen: String
    ) -> Lines {
        let created = history.createdFrom == .manual
            ? "Added by you · \(createdWhen)"
            : "Created from \(history.createdFrom.title.lowercased()) · \(createdWhen)"
        let wasRefreshed = history.lastRefreshedFrom != history.createdFrom
            || abs(history.lastRefreshedAt - history.createdAt) >= 1
        let refreshed: String
        if !wasRefreshed {
            refreshed = ""
        } else if history.lastRefreshedFrom == .manual {
            refreshed = "Edited · \(refreshedWhen)"
        } else {
            refreshed = "Refreshed from \(history.lastRefreshedFrom.title.lowercased()) · \(refreshedWhen)"
        }
        return Lines(
            created: created,
            refreshed: refreshed,
            accessibilityLabel: [created, refreshed].filter { !$0.isEmpty }.joined(separator: ", ")
        )
    }
}
