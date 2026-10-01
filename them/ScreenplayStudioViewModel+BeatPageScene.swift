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

    /// The page's scenes that have no outline scene yet, in page order, once each.
    nonisolated static func pageScenesMissingFromOutline(_ headings: [String], outline: [BackendScreenplayScene]) -> [String] {
        var seen = Set<String>()
        return headings.compactMap { raw in
            let heading = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !heading.isEmpty, seen.insert(heading.lowercased()).inserted,
                  outlineScene(matching: heading, in: outline) == nil else { return nil }
            return heading
        }
    }

    /// Choose scene → From the page: the scene joins the outline and becomes
    /// the beat's scene in the form.
    func selectPageSceneForNewBeat(_ rawSlugline: String) async {
        let slugline = rawSlugline.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !slugline.isEmpty else { return }
        if Self.outlineScene(matching: slugline, in: outline.scenes) == nil {
            if let error = await addSceneFromNavigator(slugline: slugline) {
                infoText = "Couldn't add \(slugline) to the outline: \(error)"
                return
            }
            cancelEditingScene()
        }
        guard let scene = Self.outlineScene(matching: slugline, in: outline.scenes) else { return }
        newBeatSceneID = scene.id
        newBeatActID = (scene.actId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        infoText = "Beat scene: \(slugline)."
    }
}
