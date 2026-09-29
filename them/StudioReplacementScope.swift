import Foundation

/// The scope line added to rewrite and replace requests, so a rewrite of one
/// block does not grow a scene heading or pull in the surrounding scene.
nonisolated enum StudioReplacementScope {
    static func instruction(for text: String) -> String {
        includesSceneHeading(text)
            ? "Keep the rewrite scoped to this exact block. Only include the scene heading if it is already part of the block."
            : "Keep the rewrite scoped to this exact block. Do not add the scene heading or surrounding scene text."
    }

    static func includesSceneHeading(_ text: String) -> Bool {
        text
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
            .contains { line in
                !line.isEmpty &&
                (line.hasPrefix("INT.") || line.hasPrefix("EXT.") || line.hasPrefix("INT/EXT.") || line.hasPrefix("I/E."))
            }
    }
}
