import Foundation

/// Current confirmed words are the only authority for a Home -> Studio handoff.
/// The opener retains the existing authentication policy; preparation observes
/// the actual surface afterward, never an optimistic request to open it.
enum ConfirmedStudioTurnPreparation {
    @MainActor
    static func configureSyncedInsertion(enabled: Bool, requestID: String, bridge: ScreenplayLiveDraftBridge) {
        if enabled {
            bridge.prepareSyncedVoiceTurn(requestID: requestID, renderContract: .pageWritePreview)
        } else {
            bridge.resetSyncedVoiceTurnTracking()
        }
    }

    static func currentTranscript(clientOverride: String?, serverTranscript: String? = nil) -> String {
        let server = (serverTranscript ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return server.isEmpty
            ? (clientOverride ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            : server
    }

    static func prepare<Prepared>(
        transcript: String,
        isStudioActive: () -> Bool,
        openStudio: () -> Void,
        build: (String, Bool) -> Prepared
    ) -> Prepared {
        let clean = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty, !isStudioActive(), ScreenplayIntentClassifier.hasExplicitScriptIntent(clean) {
            openStudio()
        }
        return build(clean, isStudioActive())
    }

    static func authoritativePageWriteText(from screenplayOutput: BackendTalkScreenplayOutput?) -> String {
        guard let screenplayOutput, screenplayOutput.writesToPage else { return "" }
        return screenplayOutput.text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func resolvedPendingSyncedVoiceInsertTimingSource(
        _ rawSource: String?,
        cues: [ScreenplayVoiceCue]
    ) -> String {
        let cleanSource = (rawSource ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cues.isEmpty else { return "estimated" }
        return cleanSource.isEmpty ? "backend_cues" : cleanSource
    }
}
