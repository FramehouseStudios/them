import XCTest
@testable import them

final class ScreenplayPromptBuilderTests: XCTestCase {
    func testBuildModelPromptRoutesThroughBackendWithSessionAndCraftContext() async {
        let backend = PromptBackendSpy(response: BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: "BACKEND PROMPT",
            memoryApplied: true,
            sessionContextApplied: true,
            craftContextApplied: true,
            craftFrameworkId: "story-circle"
        ))
        let builder = ScreenplayPromptBuilder()

        let result = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                userInput: "Write the midpoint reversal.",
                projectId: "proj-7",
                versionId: "v2",
                scene: "INT. MOTEL - NIGHT",
                phase: "scene_draft",
                pack: "Feature Sprint",
                draftExcerpt: "INT. MOTEL - NIGHT\n\nJUNE closes the blinds.",
                act: "Act II",
                sceneObjective: "June must decide whether to burn the evidence.",
                currentBeat: "The receipt exposes the lie.",
                beatSequence: ["Receipt reveal", "Marcus lies badly"],
                unresolvedSetups: ["The missing cassette has not paid off."],
                continuityNotes: ["Trust is turning into suspicion."],
                pageCount: 47,
                targetPages: 110,
                isScreenplayMode: true,
                shouldWriteToPage: true,
                craftFrameworkId: "story-circle"
            )
        )

        XCTAssertEqual(result.prompt, "BACKEND PROMPT")
        XCTAssertTrue(result.usedBackendAssembly)
        XCTAssertEqual(result.fallbackReason, "")
        XCTAssertEqual(result.screenplayTaskIntent, "")
        XCTAssertEqual(result.screenplayTaskLabel, "")
        XCTAssertEqual(backend.capturedRequest?.persona, "LOCAL PERSONA")
        XCTAssertEqual(backend.capturedRequest?.userInput, "Write the midpoint reversal.")
        XCTAssertEqual(backend.capturedRequest?.screenplayTaskHint, "Write the midpoint reversal.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.projectId, "proj-7")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.versionId, "v2")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.scene, "INT. MOTEL - NIGHT")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.phase, "scene_draft")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.pack, "Feature Sprint")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.draftExcerpt, "INT. MOTEL - NIGHT\n\nJUNE closes the blinds.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.act, "Act II")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.sceneObjective, "June must decide whether to burn the evidence.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.currentBeat, "The receipt exposes the lie.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.beatSequence, ["Receipt reveal", "Marcus lies badly"])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.unresolvedSetups, ["The missing cassette has not paid off."])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.continuityNotes, ["Trust is turning into suspicion."])
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.pageCount, 47)
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.targetPages, 110)
        XCTAssertEqual(backend.capturedRequest?.includeCraftContext, true)
        XCTAssertEqual(backend.capturedRequest?.craftFrameworkId, "story-circle")
    }

    func testBuildModelPromptCanSendTaskHintWithoutEmbeddingUserInput() async {
        let backend = PromptBackendSpy(response: BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: "TASK ROUTED PROMPT",
            memoryApplied: false,
            sessionContextApplied: false,
            craftContextApplied: false,
            craftFrameworkId: "",
            screenplayTaskIntent: "continue_script",
            screenplayTaskLabel: "Continue Script"
        ))
        let builder = ScreenplayPromptBuilder()

        let result = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                userInput: "",
                screenplayTaskHint: "Continue the diner scene.",
                isScreenplayMode: true,
                shouldWriteToPage: true
            )
        )

        XCTAssertEqual(result.screenplayTaskIntent, "continue_script")
        XCTAssertEqual(result.screenplayTaskLabel, "Continue Script")
        XCTAssertEqual(backend.capturedRequest?.userInput, "")
        XCTAssertEqual(backend.capturedRequest?.screenplayTaskHint, "Continue the diner scene.")
    }

    func testBuildModelPromptDisablesCraftContextWhenNotWritingToPage() async {
        let backend = PromptBackendSpy(response: BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: "COLLABORATION PROMPT",
            memoryApplied: false,
            sessionContextApplied: false,
            craftContextApplied: false,
            craftFrameworkId: ""
        ))
        let builder = ScreenplayPromptBuilder()

        _ = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                isScreenplayMode: true,
                shouldWriteToPage: false,
                craftFrameworkId: "hero-journey"
            )
        )

        XCTAssertEqual(backend.capturedRequest?.includeCraftContext, false)
        XCTAssertEqual(backend.capturedRequest?.sessionContext, nil)
    }

    func testBuildModelPromptFallsBackToLocalPersonaWhenBackendFails() async {
        let backend = PromptBackendSpy(error: PromptBackendSpy.Error.offline)
        let builder = ScreenplayPromptBuilder()

        let result = await builder.buildModelPrompt(
            backend: backend,
            request: ScreenplayPromptBuilder.Request(
                persona: "LOCAL PERSONA",
                userInput: "Keep going.",
                act: "Act II",
                currentBeat: "Mara realizes the witness has been lying.",
                unresolvedSetups: ["The courthouse key has not paid off."],
                pageCount: 62,
                targetPages: 110,
                isScreenplayMode: true,
                shouldWriteToPage: true
            )
        )

        XCTAssertTrue(result.prompt.contains("LOCAL PERSONA"))
        XCTAssertTrue(result.prompt.contains("LOCAL FEATURE-FILM CONTINUITY FALLBACK"))
        XCTAssertTrue(result.prompt.contains("Act II: tests, reversals, midpoint truth"))
        XCTAssertTrue(result.prompt.contains("Act bridge ladder: Act I choice -> Act II pressure"))
        XCTAssertTrue(result.prompt.contains("Feature completion method: track current sequence, next three turns"))
        XCTAssertTrue(result.prompt.contains("For Act I -> Act II -> Act III requests"))
        XCTAssertTrue(result.prompt.contains("Active act: Act II"))
        XCTAssertTrue(result.prompt.contains("Estimated position: p62 / 110"))
        XCTAssertTrue(result.prompt.contains("Current beat: Mara realizes the witness has been lying."))
        XCTAssertTrue(result.prompt.contains("Next page moves: name the active structural obligation"))
        XCTAssertTrue(result.prompt.contains("Unresolved setups: The courthouse key has not paid off."))
        XCTAssertFalse(result.usedBackendAssembly)
        XCTAssertFalse(result.fallbackReason.isEmpty)
    }
}

private final class PromptBackendSpy: ScreenplayPromptBackendBuilding {
    enum Error: Swift.Error {
        case offline
    }

    private let response: BackendScreenplayPromptBuildResponse?
    private let error: Swift.Error?
    private(set) var capturedRequest: BackendScreenplayPromptBuildRequest?

    init(response: BackendScreenplayPromptBuildResponse? = nil, error: Swift.Error? = nil) {
        self.response = response
        self.error = error
    }

    func buildScreenplayModelPrompt(
        _ request: BackendScreenplayPromptBuildRequest
    ) async throws -> BackendScreenplayPromptBuildResponse {
        capturedRequest = request
        if let error {
            throw error
        }
        return response ?? BackendScreenplayPromptBuildResponse(
            ok: true,
            action: "screenplay_prompt_build",
            schemaVersion: 1,
            source: "buildModelPrompt",
            prompt: request.persona,
            memoryApplied: false,
            sessionContextApplied: false,
            craftContextApplied: false,
            craftFrameworkId: ""
        )
    }
}
