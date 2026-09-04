enum RootExperienceUtilitySheet: String, CaseIterable {
    case memories
    case notes
    case tasks
    case recap
    case voiceSettings
    case companionControls
    case dataControls
}

enum RootExperienceSheetExitIntent: Equatable {
    case dismiss(RootExperienceUtilitySheet)
    case startTalking

    var shouldStartConversation: Bool {
        switch self {
        case .dismiss:
            return false
        case .startTalking:
            return true
        }
    }
}
