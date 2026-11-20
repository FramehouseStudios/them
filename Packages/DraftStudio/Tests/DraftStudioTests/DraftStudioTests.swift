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

@Test(arguments: [
    "Write the opening scene. Two astronauts discover their spacecraft is a film set.",
    "Clementine, could you please draft the first scene?",
    "Please write an opening scene:"
])
func openingSceneCommandsRouteToPage(_ prompt: String) {
    #expect(DraftStudioPromptRouter.shouldRouteToPage(prompt))
    #expect(!DraftStudioPromptRouter.shouldRouteToPage(prompt, preferredTarget: .voicePin))
}

@Test(arguments: [
    "How do I write the opening scene?",
    "Let's talk about how to draft the first scene.",
    "Do not write the opening scene."
])
func openingSceneDiscussionDoesNotRouteToPage(_ prompt: String) {
    #expect(!DraftStudioPromptRouter.shouldRouteToPage(prompt))
}
