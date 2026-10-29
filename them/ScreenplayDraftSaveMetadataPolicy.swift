import Foundation

/// Compares a draft-save request with the metadata shape the canonical backend
/// stores and echoes. Missing response collections are not proof of emptiness.
nonisolated enum ScreenplayDraftSaveMetadataPolicy {
    static func matchesServerEcho(
        requestedAnchors: [BackendScreenplayWriteAnchor],
        confirmedAnchors: [BackendScreenplayWriteAnchor]?,
        requestedBindings: [BackendScreenplayBindingRecord],
        confirmedBindings: [BackendScreenplayBindingRecord]?
    ) -> Bool {
        guard let confirmedAnchors, let confirmedBindings else { return false }
        return canonicalAnchors(requestedAnchors) == canonicalAnchors(confirmedAnchors) &&
            canonicalBindings(requestedBindings) == canonicalBindings(confirmedBindings)
    }

    private struct Anchor: Equatable {
        let writeID: String
        let line: Int
        let endLine: Int
        let sceneLabel: String
        let excerpt: String
        let insertedText: String
        let updatedAt: TimeInterval
    }

    private struct Binding: Equatable {
        let draftSceneID: String
        let draftLine: Int
        let draftEndLine: Int
        let draftSlugline: String
        let draftShortLabel: String
        let outlineSceneID: String
        let outlineSceneTitle: String
        let outlineSceneSlugline: String
        let outlineBeatIDs: [String]
        let outlineBeatLabels: [String]
        let actTitle: String
        let matchedBy: String
        let updatedAt: TimeInterval
    }

    private static func canonicalAnchors(
        _ anchors: [BackendScreenplayWriteAnchor]
    ) -> [Anchor] {
        var order: [String] = []
        var byID: [String: Anchor] = [:]
        for anchor in anchors {
            let writeID = snippet(anchor.writeId, limit: 72)
            guard !writeID.isEmpty else { continue }
            if byID[writeID] == nil { order.append(writeID) }
            byID[writeID] = Anchor(
                writeID: writeID,
                line: max(0, anchor.anchorLine ?? 0),
                endLine: max(0, anchor.anchorEndLine ?? 0),
                sceneLabel: snippet(anchor.anchorSceneLabel, limit: 140),
                excerpt: snippet(anchor.anchorExcerpt, limit: 320),
                insertedText: snippet(anchor.insertedText, limit: 6_000),
                updatedAt: max(0, anchor.updatedAt ?? 0)
            )
        }
        return order.prefix(48).compactMap { byID[$0] }
    }

    private static func canonicalBindings(
        _ bindings: [BackendScreenplayBindingRecord]
    ) -> [Binding] {
        var order: [String] = []
        var byID: [String: Binding] = [:]
        for binding in bindings {
            let draftSceneID = snippet(binding.draftSceneId, limit: 96)
            guard !draftSceneID.isEmpty else { continue }
            if byID[draftSceneID] == nil { order.append(draftSceneID) }
            byID[draftSceneID] = Binding(
                draftSceneID: draftSceneID,
                draftLine: max(0, binding.draftLine ?? 0),
                draftEndLine: max(0, binding.draftEndLine ?? 0),
                draftSlugline: snippet(binding.draftSlugline, limit: 180),
                draftShortLabel: snippet(binding.draftShortLabel, limit: 140),
                outlineSceneID: snippet(binding.outlineSceneId, limit: 96),
                outlineSceneTitle: snippet(binding.outlineSceneTitle, limit: 180),
                outlineSceneSlugline: snippet(binding.outlineSceneSlugline, limit: 180),
                outlineBeatIDs: stringList(binding.outlineBeatIds, limit: 64, itemLimit: 96),
                outlineBeatLabels: stringList(binding.outlineBeatLabels, limit: 64, itemLimit: 180),
                actTitle: snippet(binding.actTitle, limit: 140),
                matchedBy: snippet(binding.matchedBy, limit: 48),
                updatedAt: max(0, binding.updatedAt ?? 0)
            )
        }
        return order.prefix(128).compactMap { byID[$0] }
    }

    private static func stringList(
        _ values: [String]?,
        limit: Int,
        itemLimit: Int
    ) -> [String] {
        var result: [String] = []
        for value in values ?? [] {
            let clean = snippet(value, limit: itemLimit)
            guard !clean.isEmpty, !result.contains(clean) else { continue }
            result.append(clean)
            if result.count >= limit { break }
        }
        return result
    }

    private static func snippet(_ value: String?, limit: Int) -> String {
        let clean = (value ?? "")
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty, clean.count > limit else { return clean }
        return String(clean.prefix(max(1, limit - 1)))
            .trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }
}
