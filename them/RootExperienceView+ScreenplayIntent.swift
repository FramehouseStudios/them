// Script-intent detection for the home orb. The pure policy is shared with
// speculative preparation and contract tests, rather than inferred from memory.
import Foundation

extension RootExperienceView {
    #if DEBUG
    /// Injects confirmed words at the Home ingress only; real auth, prompt,
    /// talk, quality, insertion and save paths still run. Never a mic/model proof.
    func consumeUITestHomeVoiceTurnIfNeeded() -> Bool {
        guard IOThemRuntime.isRunningUITests, !isStudioSurfaceActive,
              let prompt = ProcessInfo.processInfo.environment["THEM_UITEST_HOME_VOICE_PROMPT"],
              !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        handleStudioDebugVoiceTurnCommand(token: 949, promptOverride: prompt, projectIDOverride: nil)
        return true
    }
    #endif

    func prepareConfirmedTurnPrompt(
        _ text: String,
        allowOpeningStudio: Bool = true,
        turnKeyNamespace: String = "voice"
    ) -> PreparedTurnPrompt {
        ConfirmedStudioTurnPreparation.prepare(
            transcript: text,
            isStudioActive: { isStudioSurfaceActive },
            openStudio: { if allowOpeningStudio { openStudio() } },
            build: { clean, active in
                buildPreparedTurnPrompt(
                    confirmedTranscript: clean, partialHint: clean,
                    isScreenplayModeOverride: active, turnKeyNamespace: turnKeyNamespace
                )
            }
        )
    }

    func shouldAutoOpenStudioForScriptIntent(_ text: String) -> Bool {
        ScreenplayIntentClassifier.hasExplicitScriptIntent(text)
    }

    func containsStudioOpenCommand(_ text: String) -> Bool {
        let normalized = " \(text.lowercased()) "
        guard normalized.contains("studio") else { return false }
        return ["open", "go to", "take me to", "switch to", "bring up", "launch"].contains { normalized.contains($0) }
    }
}
