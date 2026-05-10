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
                isScreenplayMode: true,
                shouldWriteToPage: true,
                craftFrameworkId: "story-circle"
            )
        )

        XCTAssertEqual(result.prompt, "BACKEND PROMPT")
        XCTAssertTrue(result.usedBackendAssembly)
        XCTAssertEqual(result.fallbackReason, "")
        XCTAssertEqual(backend.capturedRequest?.persona, "LOCAL PERSONA")
        XCTAssertEqual(backend.capturedRequest?.userInput, "Write the midpoint reversal.")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.projectId, "proj-7")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.versionId, "v2")
        XCTAssertEqual(backend.capturedRequest?.sessionContext?.scene, "INT. MOTEL - NIGHT")
        XCTAssertEqual(backend.capturedRequest?.includeCraftContext, true)
        XCTAssertEqual(backend.capturedRequest?.craftFrameworkId, "story-circle")
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
                isScreenplayMode: true,
                shouldWriteToPage: true
            )
        )

        XCTAssertEqual(result.prompt, "LOCAL PERSONA")
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
