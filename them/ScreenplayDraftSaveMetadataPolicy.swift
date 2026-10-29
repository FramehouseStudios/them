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
        guard let confirmedAnchors, let confirmedBindings,
              let canonicalRequestedAnchors = canonicalAnchors(requestedAnchors),
              let canonicalConfirmedAnchors = canonicalAnchors(confirmedAnchors),
              let canonicalRequestedBindings = canonicalBindings(requestedBindings),
              let canonicalConfirmedBindings = canonicalBindings(confirmedBindings) else {
            return false
        }
        return canonicalRequestedAnchors == canonicalConfirmedAnchors &&
            canonicalRequestedBindings == canonicalConfirmedBindings
    }

    private struct Anchor: Equatable {
        let writeID: ExactText
        let line: Int
        let endLine: Int
        let sceneLabel: ExactText
        let excerpt: ExactText
        let insertedText: ExactText
        let updatedAt: TimeInterval
    }

    private struct Binding: Equatable {
        let draftSceneID: ExactText
        let draftLine: Int
        let draftEndLine: Int
        let draftSlugline: ExactText
        let draftShortLabel: ExactText
        let outlineSceneID: ExactText
        let outlineSceneTitle: ExactText
        let outlineSceneSlugline: ExactText
        let outlineBeatIDs: [ExactText]
        let outlineBeatLabels: [ExactText]
        let actTitle: ExactText
        let matchedBy: ExactText
        let updatedAt: TimeInterval
    }

    /// Swift String equality is canonically equivalent; the backend's JS Map,
    /// Set and equality operations compare exact UTF-16 code units instead.
    private struct ExactText: Hashable {
        let codeUnits: [UInt16]

        var isEmpty: Bool { codeUnits.isEmpty }
    }

    private static func canonicalAnchors(
        _ anchors: [BackendScreenplayWriteAnchor]
    ) -> [Anchor]? {
        var order: [ExactText] = []
        var byID: [ExactText: Anchor] = [:]
        for anchor in anchors {
            guard let writeID = snippet(anchor.writeId, limit: 72),
                  let sceneLabel = snippet(anchor.anchorSceneLabel, limit: 140),
                  let excerpt = snippet(anchor.anchorExcerpt, limit: 320),
                  let insertedText = snippet(anchor.insertedText, limit: 6_000) else {
                return nil
            }
            guard !writeID.isEmpty else { continue }
            if byID[writeID] == nil { order.append(writeID) }
            byID[writeID] = Anchor(
                writeID: writeID,
                line: max(0, anchor.anchorLine ?? 0),
                endLine: max(0, anchor.anchorEndLine ?? 0),
                sceneLabel: sceneLabel,
                excerpt: excerpt,
                insertedText: insertedText,
                updatedAt: max(0, anchor.updatedAt ?? 0)
            )
        }
        return order.prefix(48).compactMap { byID[$0] }
    }

    private static func canonicalBindings(
        _ bindings: [BackendScreenplayBindingRecord]
    ) -> [Binding]? {
        var order: [ExactText] = []
        var byID: [ExactText: Binding] = [:]
        for binding in bindings {
            guard let draftSceneID = snippet(binding.draftSceneId, limit: 96),
                  let draftSlugline = snippet(binding.draftSlugline, limit: 180),
                  let draftShortLabel = snippet(binding.draftShortLabel, limit: 140),
                  let outlineSceneID = snippet(binding.outlineSceneId, limit: 96),
                  let outlineSceneTitle = snippet(binding.outlineSceneTitle, limit: 180),
                  let outlineSceneSlugline = snippet(binding.outlineSceneSlugline, limit: 180),
                  let outlineBeatIDs = stringList(binding.outlineBeatIds, limit: 64, itemLimit: 96),
                  let outlineBeatLabels = stringList(binding.outlineBeatLabels, limit: 64, itemLimit: 180),
                  let actTitle = snippet(binding.actTitle, limit: 140),
                  let matchedBy = snippet(binding.matchedBy, limit: 48) else {
                return nil
            }
            guard !draftSceneID.isEmpty else { continue }
            if byID[draftSceneID] == nil { order.append(draftSceneID) }
            byID[draftSceneID] = Binding(
                draftSceneID: draftSceneID,
                draftLine: max(0, binding.draftLine ?? 0),
                draftEndLine: max(0, binding.draftEndLine ?? 0),
                draftSlugline: draftSlugline,
                draftShortLabel: draftShortLabel,
                outlineSceneID: outlineSceneID,
                outlineSceneTitle: outlineSceneTitle,
                outlineSceneSlugline: outlineSceneSlugline,
                outlineBeatIDs: outlineBeatIDs,
                outlineBeatLabels: outlineBeatLabels,
                actTitle: actTitle,
                matchedBy: matchedBy,
                updatedAt: max(0, binding.updatedAt ?? 0)
            )
        }
        return order.prefix(128).compactMap { byID[$0] }
    }

    private static func stringList(
        _ values: [String]?,
        limit: Int,
        itemLimit: Int
    ) -> [ExactText]? {
        var result: [ExactText] = []
        for value in values ?? [] {
            guard let clean = snippet(value, limit: itemLimit) else { return nil }
            guard !clean.isEmpty, !result.contains(clean) else { continue }
            result.append(clean)
            if result.count >= limit { break }
        }
        return result
    }

    private static func snippet(_ value: String?, limit: Int) -> ExactText? {
        let clean = collapseECMAScriptWhitespace(value ?? "")
        let codeUnits = Array(clean.utf16)
        guard !codeUnits.isEmpty, codeUnits.count > limit else {
            return ExactText(codeUnits: codeUnits)
        }
        let boundary = max(1, limit - 1)
        guard boundary < codeUnits.count else { return ExactText(codeUnits: codeUnits) }
        if isHighSurrogate(codeUnits[boundary - 1]), isLowSurrogate(codeUnits[boundary]) {
            // JavaScript preserves a lone surrogate here. Swift cannot represent
            // that stored value exactly, so comparison must fail closed.
            return nil
        }
        var prefix = Array(codeUnits[..<boundary])
        while prefix.last == UInt16(0x0020) { prefix.removeLast() }
        prefix.append(0x2026)
        return ExactText(codeUnits: prefix)
    }

    private static func collapseECMAScriptWhitespace(_ value: String) -> String {
        var result = ""
        var pendingSpace = false
        for scalar in value.unicodeScalars {
            if isECMAScriptWhitespace(scalar.value) {
                if !result.isEmpty { pendingSpace = true }
                continue
            }
            if pendingSpace {
                result.append(" ")
                pendingSpace = false
            }
            result.unicodeScalars.append(scalar)
        }
        return result
    }

    private static func isECMAScriptWhitespace(_ value: UInt32) -> Bool {
        switch value {
        case 0x0009...0x000D, 0x0020, 0x00A0, 0x1680,
             0x2000...0x200A, 0x2028, 0x2029, 0x202F,
             0x205F, 0x3000, 0xFEFF:
            return true
        default:
            return false
        }
    }

    private static func isHighSurrogate(_ value: UInt16) -> Bool {
        (0xD800...0xDBFF).contains(value)
    }

    private static func isLowSurrogate(_ value: UInt16) -> Bool {
        (0xDC00...0xDFFF).contains(value)
    }
}
