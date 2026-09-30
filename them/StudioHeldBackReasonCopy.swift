import Foundation

/// Why a page was held back, in a writer's words. The notice only said the
/// page "did not pass the screenplay quality check", which a writer cannot act
/// on (74-page run, 2026-09-30). Reasons the gate may add later fall back to
/// the plain notice.
nonisolated enum StudioHeldBackReasonCopy {
    static func why(reason: String) -> String? {
        switch reason.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "missing_act_one_commitment":
            return "it didn't push toward the choice Act I is building to"
        case "missing_act_two_reversal":
            return "it didn't turn the pressure Act II is carrying"
        case "missing_act_three_payoff", "missing_act_three_changed_behavior":
            return "it didn't pay off what Act III owes"
        case "underfilled_page_text", "thin_long_page_batch", "thin_scene_turn_batch":
            return "it was too thin for the pages you asked for"
        case "empty", "empty_page_text", "empty_page_lines":
            return "it came back empty"
        case "placeholder_page_text", "outline_or_craft_artifact", "missing_screenplay_shape":
            return "it read like notes, not screenplay pages"
        case "summary_like_page_batch":
            return "it summarized the scene instead of playing it"
        case "static_dialogue_batch", "flat_dialogue_no_tactics", "dialogue_tactic_lock":
            return "nobody changed tactics; the dialogue never pushed or turned"
        case "on_the_nose_dialogue":
            return "people said exactly what they meant"
        case "expository_dialogue_dump":
            return "the dialogue explained the plot instead of playing the scene"
        case "interchangeable_dialogue_voice", "missing_character_voice_fingerprint":
            return "the characters sounded alike"
        case "missing_character_arc_pressure", "missing_character_arc_memory", "insufficient_character_arc_memory":
            return "it lost the pressure on your lead"
        case "low_dramatic_density", "missing_playable_content":
            return "nothing happened that an actor could play"
        case "weak_first_page_opening":
            return "the opening didn't hook"
        case "accepted_canon_contradiction":
            return "it contradicted something already on your pages"
        case "missing_next_scene_execution_brief", "missing_next_scene_assignment",
             "insufficient_execution_brief", "missing_next_turn_continuation":
            return "it didn't continue from where your page left off"
        case "missing_batch_scene_anchor":
            return "it started without a scene heading"
        default:
            return nil
        }
    }

    /// "Page held back: <why>. Your draft is unchanged."
    static func notice(reason: String) -> String {
        guard let why = why(reason: reason) else { return "Page held back. Your draft is unchanged." }
        return "Page held back: \(why). Your draft is unchanged."
    }

    static func message(reason: String) -> String {
        guard let why = why(reason: reason) else {
            return "Clementine held this page back because it did not pass the screenplay quality check. Your draft is unchanged."
        }
        return "Clementine held this page back: \(why). Your draft is unchanged."
    }
}
