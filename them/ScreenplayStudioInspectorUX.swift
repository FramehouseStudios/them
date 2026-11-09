import SwiftUI

// ScreenplayStudio Inspector UX shim — D009 strangler
// Keeps ScreenplayStudioScreen.swift at 17438 lines; no edits to god file.
// Provides inspector tabs provenance payload consumed by
// ScreenplayStudioScreen via InspectorUX. Mirrors backend/lib/clementine/inspector_ux.js
// which wires studio_actions + coverage to inspector tabs provenance.

// MARK: - Models

public enum InspectorTab: String, Equatable, CaseIterable {
    case editor, coverage, beats, mentor, outline, page, studio
}

public enum ProvenanceKind: String, Equatable, CaseIterable {
    case user, clementine, system, coverage, beat, `import`
    public static var `default`: ProvenanceKind { .user }
}

public struct InspectorTabState: Equatable {
    public let selectedTab: InspectorTab
    public let provenance: ProvenanceKind
    public let provenanceHistory: [ProvenanceKind]
    public let hasAction: Bool
    public var tabForProvenance: InspectorTab { InspectorUX.tab(for: provenance) }
}

public struct InspectorUXPayload: Equatable {
    public let projectId: String
    public let selectedTab: InspectorTab
    public let provenance: ProvenanceKind
    public let provenanceHistory: [ProvenanceKind]
    public let hasCoverage: Bool
    public let hasAction: Bool
    public let timestamp: TimeInterval
    public let isCoverageTab: Bool
    public let isBeatsTab: Bool
    public let isEditorTab: Bool
}

// MARK: - Helper

public enum InspectorUX {
    public static let provenanceKinds: [String] = ["user","clementine","system","coverage","beat","import"]
    public static let defaultProvenance: ProvenanceKind = .user

    public static func normalizeTab(_ raw: String) -> InspectorTab? {
        InspectorTab(rawValue: raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines))
    }
    public static func isValidTab(_ raw: String) -> Bool { normalizeTab(raw) != nil }

    public static func normalizeProvenance(_ raw: String) -> ProvenanceKind {
        let t = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if let k = ProvenanceKind(rawValue: t) { return k }
        if t == "beat_composer" || t == "beatcomposer" { return .beat }
        if t == "coverage_refresh" { return .coverage }
        return .user
    }
    public static func isValidProvenance(_ raw: String) -> Bool {
        ProvenanceKind(rawValue: raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)) != nil
    }

    public static func provenance(forStudioAction type: String, tab: String? = nil) -> ProvenanceKind {
        switch type {
        case "refreshCoverage": return .coverage
        case "selectBeat": return .beat
        case "openStudio":
            if let tab = tab?.lowercased(), tab == "coverage" { return .coverage }
            if let tab = tab?.lowercased(), tab == "beats" || tab == "outline" { return .beat }
            return .user
        default: return .user
        }
    }

    public static func tab(for provenance: ProvenanceKind) -> InspectorTab {
        switch provenance {
        case .coverage: return .coverage
        case .beat: return .beats
        case .clementine: return .mentor
        default: return .editor
        }
    }

    public static func buildTabState(selectedTab: String = "editor", provenance provenanceName: String = "user", history: [String] = [], studioActionType: String? = nil, studioActionTab: String? = nil) -> InspectorTabState {
        let tab = normalizeTab(selectedTab) ?? .editor
        var prov = normalizeProvenance(provenanceName)
        if let t = studioActionType { prov = provenance(forStudioAction: t, tab: studioActionTab) }
        var hist = history.map { normalizeProvenance($0) }
        // dedup consecutive
        var dedup: [ProvenanceKind] = []
        for k in hist { if dedup.last != k { dedup.append(k) } }
        hist = dedup
        if hist.last != prov { hist.append(prov) }
        if hist.count > 20 { hist.removeFirst(hist.count - 20) }
        return InspectorTabState(selectedTab: tab, provenance: prov, provenanceHistory: hist, hasAction: studioActionType != nil)
    }

    public static func buildPayload(projectId: String = "", selectedTab: String = "editor", provenance: String = "user", history: [String] = [], studioActionType: String? = nil, studioActionTab: String? = nil, hasCoverage: Bool = false, timestamp: TimeInterval = Date().timeIntervalSince1970) -> InspectorUXPayload {
        let state = buildTabState(selectedTab: selectedTab, provenance: provenance, history: history, studioActionType: studioActionType, studioActionTab: studioActionTab)
        var finalTab = state.selectedTab
        var finalProv = state.provenance
        if studioActionType == "refreshCoverage" { finalTab = .coverage; finalProv = .coverage }
        else if studioActionType == "selectBeat" { finalTab = .beats; finalProv = .beat }
        else if let t = studioActionTab, let nt = normalizeTab(t) { finalTab = nt }
        var hist = state.provenanceHistory
        if hist.last != finalProv { hist.append(finalProv) }
        return InspectorUXPayload(projectId: projectId, selectedTab: finalTab, provenance: finalProv, provenanceHistory: hist, hasCoverage: hasCoverage, hasAction: state.hasAction, timestamp: timestamp, isCoverageTab: finalTab == .coverage, isBeatsTab: finalTab == .beats, isEditorTab: finalTab == .editor)
    }
}
