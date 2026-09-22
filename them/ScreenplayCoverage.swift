import Foundation
import SwiftUI

/// Clementine's read of a script: grade, verdict, five pillars, what works,
/// what's missing, the move, and the spoken version. Produced by
/// `POST /screenplay/coverage` (deterministic; same draft, same read).
nonisolated struct BackendScreenplayCoveragePillar: Decodable, Hashable {
    let score: Double
    let notes: [String]
}

nonisolated struct BackendScreenplayCoverageTurn: Decodable, Hashable {
    let id: String
    let label: String
    let sceneBoundaryNearby: Bool
}

nonisolated struct BackendScreenplayCoverageFormatIssues: Decodable, Hashable {
    let hard: Int
    let medium: Int
}

nonisolated struct BackendScreenplayCoverageReport: Decodable, Hashable {
    let schemaVersion: Int
    let title: String
    let pageCount: Int
    let sceneCount: Int
    let overall: Double
    let grade: String
    let verdict: String
    let pillars: [String: BackendScreenplayCoveragePillar]
    let structureTurns: [BackendScreenplayCoverageTurn]
    let works: [String]
    let missing: [String]
    let move: String
    let spoken: String
    let formatIssues: BackendScreenplayCoverageFormatIssues?
}

extension Notification.Name {
    /// Ask the home voice to say something in Clementine's audition voice
    /// (used for the coverage read after an import).
    static let themClementineSpeakRequested = Notification.Name("io.them.them.clementineSpeakRequested")
}

/// When her read should follow the draft on its own. She re-reads silently
/// after typing settles when the printed page count or the scene count moved;
/// a word-level edit inside a page does not trigger a new read.
enum ScreenplayCoverageRefreshPolicy {
    struct Shape: Equatable {
        let pageCount: Int
        let sceneCount: Int
    }

    static func shape(of draft: String) -> Shape? {
        let normalized = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else { return nil }
        let lines = normalized.components(separatedBy: "\n")
        let scenes = ScreenplayPageLayout.classify(lines).filter { $0 == .sceneHeading }.count
        return Shape(pageCount: ScreenplayPageLayout.pageCount(for: normalized), sceneCount: scenes)
    }

    static func shouldRefresh(
        current: BackendScreenplayCoverageReport?,
        draft: String,
        isRefreshing: Bool,
        isStreaming: Bool
    ) -> Bool {
        guard !isRefreshing, !isStreaming else { return false }
        guard let shape = shape(of: draft) else { return false }
        guard let current else { return true }
        return current.pageCount != shape.pageCount || current.sceneCount != shape.sceneCount
    }
}

enum ScreenplayCoveragePresentation {
    static let pillarOrder = ["structure", "pacing", "dialogue", "character", "format"]

    static func title(for pillar: String) -> String {
        switch pillar {
        case "structure": return "Structure"
        case "pacing": return "Pacing"
        case "dialogue": return "Dialogue"
        case "character": return "Character"
        case "format": return "Format"
        default: return pillar.capitalized
        }
    }

    /// Bar fraction on a 1–10 scale, so a 1 still shows a sliver.
    static func fraction(for score: Double) -> Double {
        max(0.04, min(1, score / 10))
    }

    static func verdictLine(_ report: BackendScreenplayCoverageReport) -> String {
        "\(report.grade) · \(report.verdict.capitalized) · \(report.pageCount) page\(report.pageCount == 1 ? "" : "s"), \(report.sceneCount) scene\(report.sceneCount == 1 ? "" : "s")"
    }

    static func scoreText(_ score: Double) -> String {
        score == score.rounded() ? String(Int(score)) : String(format: "%.1f", score)
    }

    static func requestSpeech(_ text: String, center: NotificationCenter = .default) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        center.post(name: .themClementineSpeakRequested, object: nil, userInfo: ["text": clean])
    }

    static func speechText(from notification: Notification) -> String? {
        (notification.userInfo?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
