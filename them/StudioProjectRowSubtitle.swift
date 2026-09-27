import Foundation

/// The one-line subtitle under a project in the Studio drawer.
///
/// It used to read "Scenes 0 • Beats 0" for every project whose outline was
/// empty, including projects with written pages, which looked broken. The row
/// now leads with when the pages were last saved, then shows the outline shape
/// when there is one, otherwise the page's opening words.
enum StudioProjectRowSubtitle {
    static let excerptLimit = 60

    static func text(for project: BackendScreenplayProjectSummary, now: Date = .now) -> String {
        var parts: [String] = []
        if let savedAt = themOptionalDateFromEpoch(project.lastVersionAt) {
            parts.append("Saved \(RelativeDateFormatter.shortString(for: savedAt, relativeTo: now))")
        }
        parts.append(shape(for: project))
        return parts.joined(separator: " · ")
    }

    private static func shape(for project: BackendScreenplayProjectSummary) -> String {
        let scenes = max(0, project.sceneCount ?? 0)
        let beats = max(0, project.beatCount ?? 0)
        if scenes > 0 || beats > 0 {
            return [count(scenes, "scene"), count(beats, "beat")].compactMap { $0 }.joined(separator: " · ")
        }
        let excerpt = (project.latestExcerpt ?? "")
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !excerpt.isEmpty else { return "Blank page" }
        guard excerpt.count > excerptLimit else { return excerpt }
        return String(excerpt.prefix(excerptLimit)).trimmingCharacters(in: .whitespaces) + "…"
    }

    private static func count(_ value: Int, _ noun: String) -> String? {
        guard value > 0 else { return nil }
        return value == 1 ? "1 \(noun)" : "\(value) \(noun)s"
    }
}
