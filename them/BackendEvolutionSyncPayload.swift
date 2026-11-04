import Foundation

/// One payload builder for relationship sync; identity and transport stay in BackendMemoryAPI.
nonisolated enum BackendEvolutionSyncPayload {
    static func make(stage: Int, depthScore: Double, romanceTension: Double, sessionCount: Int,
        reassuranceNeed: Double, boundaryNeed: Double, playfulMomentum: Double, trustSignal: Double,
        lastThemeCue: String, preferredName: String, isScreenwriter: Bool, latestUserMessage: String?) -> [String: Any] {
        var payload: [String: Any] = [
            "stage": stage,
            "depth_score": round(depthScore * 100) / 100,
            "romance_tension": round(romanceTension * 100) / 100,
            "session_count": sessionCount,
            "reassurance_need": round(reassuranceNeed * 1000) / 1000,
            "boundary_need": round(boundaryNeed * 1000) / 1000,
            "playful_momentum": round(playfulMomentum * 1000) / 1000,
            "trust_signal": round(trustSignal * 1000) / 1000,
        ]
        let trimmedCue = lastThemeCue.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedCue.isEmpty { payload["last_theme_cue"] = trimmedCue }
        let trimmedName = preferredName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty { payload["preferred_name"] = String(trimmedName.prefix(64)) }
        payload["is_screenwriter"] = isScreenwriter
        let latestMessage = (latestUserMessage ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if !latestMessage.isEmpty {
            payload["latest_user_message"] = String(latestMessage.prefix(220))
        }

        let loweredMessage = latestMessage.lowercased()
        let loveTopicActive = loweredMessage.contains("love") ||
            loweredMessage.contains("relationship") ||
            loweredMessage.contains("romance") ||
            loweredMessage.contains("dating") ||
            loweredMessage.contains("miss you") ||
            loweredMessage.contains("heart")
        if loveTopicActive {
            payload["love_topic_active"] = true
        }
        let reassuranceStyleHint: String = {
            if loweredMessage.contains("be direct") ||
                loweredMessage.contains("straight up") ||
                loweredMessage.contains("no sugarcoat") {
                return "direct"
            }
            if loweredMessage.contains("hype me") ||
                loweredMessage.contains("pep talk") {
                return "hype"
            }
            if loweredMessage.contains("gentle") ||
                loweredMessage.contains("comfort me") ||
                loweredMessage.contains("hold space") {
                return "motherly"
            }
            return reassuranceNeed > 0.62 ? "soft" : "direct"
        }()
        payload["reassurance_style_hint"] = reassuranceStyleHint

        let affectionStyleHint: String = {
            if loveTopicActive {
                if playfulMomentum > 0.62 { return "playful" }
                if trustSignal > 0.68 && romanceTension > 2.2 { return "tender" }
                if romanceTension > 4.2 { return "intimate" }
            }
            return "casual"
        }()
        payload["affection_style_hint"] = affectionStyleHint
        payload["romance_depth_hint"] = round(min(max(romanceTension / 10.0, 0), 1) * 1000) / 1000
        payload["support_intent_hint"] = reassuranceNeed > 0.58 ? "comfort_first" : "clarity_then_comfort"

        return payload
    }
}
