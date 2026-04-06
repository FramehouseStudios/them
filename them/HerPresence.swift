import Foundation

// HerPresence is the single source of truth for conversation state.
// AssistantState.swift has been removed - it was a duplicate of this enum
// that was never wired into the UI.
enum HerPresence {
    case idle
    case listening
    case thinking
    case speaking

    /// Convenience label for debug overlays or accessibility.
    var label: String {
        switch self {
        case .idle:      return "Idle"
        case .listening: return "Listening…"
        case .thinking:  return "Thinking…"
        case .speaking:  return "Speaking…"
        }
    }

    var isBusy: Bool {
        self == .thinking || self == .speaking
    }
}

func presence(from mode: HerVoiceController.Mode) -> HerPresence {
    switch mode {
    case .idle:              return .idle
    case .armedListening:    return .idle
    case .capturingSpeech:   return .listening
    case .assistantSpeaking: return .speaking
    case .muted:             return .idle
    }
}
