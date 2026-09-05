import Foundation

struct VoiceSettingsHeaderSignal: Equatable, Identifiable {
    let id: String
    let title: String
    let systemImage: String
}

struct VoiceSettingsRelationshipMetric: Equatable, Identifiable {
    let id: String
    let label: String
    let value: String
}

enum VoiceSettingsPresentation {
    static let companionName = "Clementine"
    static let title = "Voice & Studio"
    static let subtitle = "Tune how Clementine listens, responds, and works with your screenplay."

    static func headerSignals(isScreenwriter: Bool) -> [VoiceSettingsHeaderSignal] {
        [
            VoiceSettingsHeaderSignal(
                id: "relationship",
                title: "Relationship-aware",
                systemImage: "heart.text.square.fill"
            ),
            VoiceSettingsHeaderSignal(
                id: "creative-context",
                title: isScreenwriter ? "Writer mode remembered" : "Creative context ready",
                systemImage: isScreenwriter ? "film.fill" : "sparkles"
            ),
            VoiceSettingsHeaderSignal(
                id: "live-controls",
                title: "Live controls",
                systemImage: "slider.horizontal.3"
            ),
        ]
    }

    static func relationshipStageTitle(_ stage: Int) -> String {
        "Relationship stage \(stage) of 5"
    }

    static func stageDescription(_ stage: Int) -> String {
        switch stage {
        case 1: return "Just meeting. Keep it warm."
        case 2: return "Pattern-aware. Gentle personal tone."
        case 3: return "Emotionally precise. Going deeper."
        case 4: return "Challenging patterns with care."
        default: return "Deep trust. Mature. Restrained."
        }
    }

    static func screenwriterIdentity(isScreenwriter: Bool) -> String {
        isScreenwriter
            ? "Clementine remembers that you're a screenwriter"
            : "Screenwriter identity not established yet"
    }

    static func relationshipMetrics(
        sessionCount: Int,
        messageCount: Int,
        depthScore: Double,
        romanceTension: Double
    ) -> [VoiceSettingsRelationshipMetric] {
        [
            VoiceSettingsRelationshipMetric(
                id: "sessions",
                label: "Sessions",
                value: "\(sessionCount)"
            ),
            VoiceSettingsRelationshipMetric(
                id: "messages",
                label: "Messages",
                value: "\(messageCount)"
            ),
            VoiceSettingsRelationshipMetric(
                id: "depth",
                label: "Depth",
                value: String(format: "%.1f", depthScore)
            ),
            VoiceSettingsRelationshipMetric(
                id: "tension",
                label: "Creative tension",
                value: String(format: "%.1f", romanceTension)
            ),
        ]
    }
}
