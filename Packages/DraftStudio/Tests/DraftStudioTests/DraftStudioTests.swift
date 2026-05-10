import Testing
@testable import DraftStudio

@Test func forcedPageSignalRoutesAutomaticPromptToPage() {
    let result = DraftStudioPromptRouter.shouldRouteToPage(
        "write the next beat",
        signals: DraftStudioPromptSignals(isForcedPageWrite: true)
    )

    #expect(result == true)
}

@Test func explicitAdviceStaysInVoicePinWhenAutomatic() {
    let result = DraftStudioPromptRouter.shouldRouteToPage(
        "what is weak in this scene?",
        signals: DraftStudioPromptSignals(isExplicitStoryAdvice: true, isForcedPageWrite: true)
    )

    #expect(result == false)
}

@Test func manualTargetsOverrideSignals() {
    #expect(DraftStudioPromptRouter.shouldRouteToPage("notes", preferredTarget: .page) == true)
    #expect(DraftStudioPromptRouter.shouldRouteToPage("write it", preferredTarget: .voicePin, signals: DraftStudioPromptSignals(isForcedPageWrite: true)) == false)
}
