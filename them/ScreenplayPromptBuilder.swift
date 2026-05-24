import Foundation

struct BackendScreenplayPromptSessionContext: Codable, Equatable {
    var projectId: String
    var versionId: String
    var scene: String
    var phase: String = ""
    var pack: String = ""
    var draftExcerpt: String = ""

    enum CodingKeys: String, CodingKey {
        case projectId = "project_id"
        case versionId = "version_id"
        case scene
        case phase
        case pack
        case draftExcerpt = "draft_excerpt"
    }
}

struct BackendScreenplayPromptBuildRequest: Codable, Equatable {
    var persona: String
    var userInput: String
    var screenplayTaskHint: String = ""
    var sessionContext: BackendScreenplayPromptSessionContext?
    var includeCraftContext: Bool
    var craftFrameworkId: String

    enum CodingKeys: String, CodingKey {
        case persona
        case userInput = "user_input"
        case screenplayTaskHint = "screenplay_task_hint"
        case sessionContext = "session_context"
        case includeCraftContext = "include_craft_context"
        case craftFrameworkId = "craft_framework_id"
    }
}

struct BackendScreenplayPromptBuildResponse: Codable, Equatable {
    var ok: Bool
    var action: String
    var schemaVersion: Int
    var source: String
    var prompt: String
    var memoryApplied: Bool
    var sessionContextApplied: Bool
    var craftContextApplied: Bool
    var craftFrameworkId: String
    var screenplayTaskIntent: String = ""
    var screenplayTaskLabel: String = ""

    enum CodingKeys: String, CodingKey {
        case ok
        case action
        case schemaVersion = "schema_version"
        case source
        case prompt
        case memoryApplied = "memory_applied"
        case sessionContextApplied = "session_context_applied"
        case craftContextApplied = "craft_context_applied"
        case craftFrameworkId = "craft_framework_id"
        case screenplayTaskIntent = "screenplay_task_intent"
        case screenplayTaskLabel = "screenplay_task_label"
    }
}

protocol ScreenplayPromptBackendBuilding {
    func buildScreenplayModelPrompt(
        _ request: BackendScreenplayPromptBuildRequest
    ) async throws -> BackendScreenplayPromptBuildResponse
}

struct ScreenplayPromptBuilder {
    struct Request: Equatable {
        var persona: String
        var userInput: String = ""
        var projectId: String = ""
        var versionId: String = ""
        var scene: String = ""
        var phase: String = ""
        var pack: String = ""
        var draftExcerpt: String = ""
        var screenplayTaskHint: String = ""
        var isScreenplayMode: Bool = false
        var shouldWriteToPage: Bool = false
        var craftFrameworkId: String = ""
    }

    struct Result: Equatable {
        var prompt: String
        var usedBackendAssembly: Bool
        var fallbackReason: String
        var screenplayTaskIntent: String = ""
        var screenplayTaskLabel: String = ""
    }

    static func makeLocalPersonaPrompt(
        context: HerVoiceSpec.Context,
        speakingPace: Double,
        memoryDomain: StudioMemoryDomain,
        shouldWriteToPage: Bool,
        companionInstruction: String,
        companionSignals: CreativeCompanionSignalState
    ) -> String {
        let base = applySpeakingPace(
            to: HerVoiceSpec.makeSystemPrompt(context),
            speakingPace: speakingPace
        )
        let routed = appendStudioMemoryDomainInstruction(
            to: base,
            memoryDomain: memoryDomain,
            shouldWriteToPage: shouldWriteToPage,
            companionInstruction: companionInstruction
        )
        return appendCreativeIntentInstruction(
            to: routed,
            signalState: companionSignals
        )
    }

    func buildModelPrompt(
        backend: ScreenplayPromptBackendBuilding,
        request: Request
    ) async -> Result {
        let persona = request.persona.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !persona.isEmpty else {
            return Result(prompt: "", usedBackendAssembly: false, fallbackReason: "empty_persona")
        }

        let promptRequest = BackendScreenplayPromptBuildRequest(
            persona: persona,
            userInput: request.userInput.trimmingCharacters(in: .whitespacesAndNewlines),
            screenplayTaskHint: screenplayTaskHint(from: request),
            sessionContext: sessionContext(from: request),
            includeCraftContext: request.isScreenplayMode && request.shouldWriteToPage,
            craftFrameworkId: request.craftFrameworkId.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        var lastError: Error?
        for attempt in 0..<2 {
            if attempt > 0 {
                try? await Task.sleep(nanoseconds: 180_000_000)
            }
            do {
                let response = try await backend.buildScreenplayModelPrompt(
                    promptRequest
                )
                let prompt = response.prompt.trimmingCharacters(in: .whitespacesAndNewlines)
                if !prompt.isEmpty {
                    return Result(
                        prompt: prompt,
                        usedBackendAssembly: true,
                        fallbackReason: "",
                        screenplayTaskIntent: response.screenplayTaskIntent,
                        screenplayTaskLabel: response.screenplayTaskLabel
                    )
                }
                return Result(prompt: persona, usedBackendAssembly: false, fallbackReason: "empty_backend_prompt")
            } catch {
                lastError = error
            }
        }
        return Result(prompt: persona, usedBackendAssembly: false, fallbackReason: lastError?.localizedDescription ?? "prompt_build_failed")
    }

    private func screenplayTaskHint(from request: Request) -> String {
        let explicit = request.screenplayTaskHint.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
        if !explicit.isEmpty { return explicit }
        return request.userInput.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
    }

    private func sessionContext(from request: Request) -> BackendScreenplayPromptSessionContext? {
        let projectId = request.projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let versionId = request.versionId.trimmingCharacters(in: .whitespacesAndNewlines)
        let scene = request.scene.trimmingCharacters(in: .whitespacesAndNewlines)
        let phase = request.phase.trimmingCharacters(in: .whitespacesAndNewlines)
        let pack = request.pack.trimmingCharacters(in: .whitespacesAndNewlines)
        let draftExcerpt = request.draftExcerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !projectId.isEmpty || !versionId.isEmpty || !scene.isEmpty || !phase.isEmpty || !pack.isEmpty || !draftExcerpt.isEmpty else { return nil }
        return BackendScreenplayPromptSessionContext(
            projectId: projectId,
            versionId: versionId,
            scene: scene,
            phase: phase,
            pack: pack,
            draftExcerpt: String(draftExcerpt.suffix(6_000))
        )
    }

    private static func applySpeakingPace(to systemPrompt: String, speakingPace: Double) -> String {
        let clampedPace = min(max(speakingPace, 0.7), 1.5)
        guard abs(clampedPace - 1.0) > 0.001 else { return systemPrompt }

        let instruction: String
        switch clampedPace {
        case ..<0.95:
            instruction = "SPEAKING PACE: Slower. Speak more slowly and deliberately than usual, with a little more space between thoughts."
        case ..<1.15:
            instruction = "SPEAKING PACE: Natural. Keep a natural conversational pace, clear and unforced."
        case ..<1.32:
            instruction = "SPEAKING PACE: Brisk. Keep the pace a bit quicker than natural, efficient but still clear."
        default:
            instruction = "SPEAKING PACE: Fast. Speak quickly and efficiently, keep momentum high, and avoid lingering."
        }

        return systemPrompt + "\n\n" + instruction
    }

    private static func appendStudioMemoryDomainInstruction(
        to systemPrompt: String,
        memoryDomain: StudioMemoryDomain,
        shouldWriteToPage: Bool,
        companionInstruction: String
    ) -> String {
        let instruction: String
        switch memoryDomain {
        case .project:
            instruction = shouldWriteToPage
                ? "MEMORY ROUTE: Treat this as project memory. Prioritize screenplay continuity, story facts, and draft state over companion chat."
                : "MEMORY ROUTE: Treat this as project memory. Respond as a focused screenwriting collaborator, not as a romantic or dependency-seeking companion."
        case .companion:
            instruction = "MEMORY ROUTE: Treat this as companion memory. Stay relational and supportive. Do not change the screenplay page unless the user explicitly asks. If you suggest screenplay language, frame it as optional support and do not describe yourself in page mode or tool-state language.\n\(companionInstruction)"
        case .mixed:
            instruction = "MEMORY ROUTE: This is mixed. Acknowledge the user's emotional state briefly, then return to the screenplay problem with concrete craft help. If you draft lines, present them as a grounded suggestion rather than generic page-mode status copy.\n\(companionInstruction)"
        }
        return systemPrompt + "\n\n" + instruction
    }

    private static func appendCreativeIntentInstruction(
        to systemPrompt: String,
        signalState: CreativeCompanionSignalState
    ) -> String {
        guard signalState.hasContent else { return systemPrompt }
        return systemPrompt + "\n\n" + signalState.promptGuidance()
    }
}

extension BackendClient: ScreenplayPromptBackendBuilding {}
