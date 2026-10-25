import Foundation

// Verbatim move from BackendMemoryAPI.swift (D009 god-file compensation).
nonisolated struct BackendMemoryStatsCounts: Decodable, Hashable {
    let characters: Int
    let charactersWithVoice: Int
    let charactersWithTraits: Int
    let toneSignals: Int
    let habitSignals: Int
}

nonisolated struct BackendMemoryStatsResponse: Decodable, Hashable {
    let schemaVersion: Int
    let hasMemory: Bool
    let counts: BackendMemoryStatsCounts
    let lastUpdatedMs: TimeInterval?
    let error: String?

    var lastUpdatedDate: Date? {
        guard let lastUpdatedMs, lastUpdatedMs > 0 else { return nil }
        return Date(timeIntervalSince1970: lastUpdatedMs / 1000.0)
    }

    var diagnosticsSummary: String {
        guard hasMemory else { return "No companion memory yet." }
        return [
            "\(counts.characters) characters",
            "\(counts.charactersWithVoice) voices",
            "\(counts.charactersWithTraits) trait sets",
            "\(counts.toneSignals) tone signals",
            "\(counts.habitSignals) habit signals",
        ].joined(separator: " · ")
    }
}
