import Foundation

extension ScreenplayStudioViewModel {
    /// "Pick Scene" on a beat when the outline has no scenes yet: the scene the
    /// writer is on is added to the outline from its heading and the beat is
    /// linked to it. The button used to say "Pick a scene in Outline…" and do
    /// nothing, and the picker offered only "No scene link" while the script
    /// had scenes (2026-09-30).
    func linkBeatToPageScene(_ beat: BackendScreenplayBeat, slugline rawSlugline: String) async {
        let slugline = rawSlugline.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !slugline.isEmpty else { return }
        var scene = Self.outlineScene(matching: slugline, in: outline.scenes)
        if scene == nil {
            if let error = await addSceneFromNavigator(slugline: slugline) {
                infoText = "Couldn't add \(slugline) to the outline: \(error)"
                return
            }
            cancelEditingScene()
            scene = Self.outlineScene(matching: slugline, in: outline.scenes)
        }
        guard let scene else {
            infoText = "Couldn't find \(slugline) in the outline. Try again."
            return
        }
        await linkBeat(beat, to: scene)
        if errorText.isEmpty { infoText = "Linked \u{201C}\(beat.label)\u{201D} to \(slugline)." }
    }

    nonisolated static func outlineScene(matching slugline: String, in scenes: [BackendScreenplayScene]) -> BackendScreenplayScene? {
        let key = slugline.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return scenes.first {
            ($0.slugline ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == key
                || $0.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == key
        }
    }
}
