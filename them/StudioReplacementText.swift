import Foundation

/// Canonical formatting for an existing replacement range; no UI or request state.
@MainActor
enum StudioReplacementText {
    static func normalizedStudioReplacementInsertionText(
        rawReply: String,
        formattedReply: String,
        replacementTarget: ScreenplayPendingReplacementTarget
    ) -> String {
        let targetText = replacementTarget.currentText.trimmingCharacters(in: .whitespacesAndNewlines)
        let targetIncludesHeading = studioBlockContainsSceneHeading(targetText)
        var candidate = FountainFormatter.normalizePastedScreenplayBlock(
            rawReply,
            existingDraft: targetText
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)

        if candidate.isEmpty {
            candidate = formattedReply.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if !targetIncludesHeading {
            candidate = studioStrippingLeadingSceneHeading(from: candidate)
        }

        if !candidate.isEmpty {
            candidate = FountainFormatter.normalizePastedScreenplayBlock(
                candidate,
                existingDraft: targetText
            )
            .trimmingCharacters(in: .whitespacesAndNewlines)
        }

        if candidate.isEmpty {
            candidate = formattedReply.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        if !targetIncludesHeading {
            candidate = studioStrippingLeadingSceneHeading(from: candidate)
        }
        return candidate.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func studioBlockContainsSceneHeading(_ text: String) -> Bool {
        let lines = text
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return lines.contains(where: studioLooksLikeSceneHeading)
    }

    static func studioLooksLikeSceneHeading(_ line: String) -> Bool {
        let upper = line.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !upper.isEmpty else { return false }
        return upper.hasPrefix("INT.")
            || upper.hasPrefix("EXT.")
            || upper.hasPrefix("INT/EXT.")
            || upper.hasPrefix("I/E.")
    }

    static func studioStrippingLeadingSceneHeading(from text: String) -> String {
        let lines = text.components(separatedBy: "\n")
        guard let firstContentIndex = lines.firstIndex(where: {
            !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard studioLooksLikeSceneHeading(lines[firstContentIndex]) else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        var startIndex = firstContentIndex + 1
        while startIndex < lines.count,
              lines[startIndex].trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            startIndex += 1
        }
        guard startIndex < lines.count else {
            return text.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return lines[startIndex...]
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

}

