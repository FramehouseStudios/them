import Foundation

/// D010 — Routes companion spoken output by provider preference.
///
/// Architecture (v1 slice):
/// - `default` → existing server mp3 path (talk_handler → createTtsSupplier → OrbAudioDriver)
/// - `elevenlabs` → server BYOK lane via per-request headers (user key never stored in DB);
///   `ElevenLabsTtsClient` remains available for voice listing + optional client-side stream.
///
/// Barge-in: `CompanionTtsPlaybackSession.shared.abort()` from existing
/// `stopAssistantPlayback` / `inFlightTalkTask?.cancel()` — do not fork RootExperienceView interrupt.
@MainActor
final class CompanionTtsRouter: ObservableObject {
    static let shared = CompanionTtsRouter()

    private let client: ElevenLabsTtsClient

    init(client: ElevenLabsTtsClient = ElevenLabsTtsClient()) {
        self.client = client
    }

    var activeProvider: CompanionTtsProvider {
        CompanionTtsProviderSettings.provider()
    }

    var isElevenLabsConnected: Bool {
        activeProvider == .elevenlabs && ElevenLabsByokKeychain.hasApiKey()
    }

    /// Headers for `/talk` when BYOK is active. Empty for default provider.
    nonisolated func talkByokHeaders() -> [String: String] {
        CompanionTtsProviderSettings.talkByokHeaders()
    }

    func listVoices() async throws -> [ElevenLabsTtsClient.Voice] {
        guard let apiKey = ElevenLabsByokKeychain.loadApiKey() else {
            throw ElevenLabsTtsClient.ClientError.missingApiKey
        }
        return try await client.listVoices(apiKey: apiKey)
    }

    /// Optional client-side speak path (mp3 Data). Prefer server BYOK headers for companion turns.
    /// TODO(D010): wire OrbAudioDriver playback for pure client stream when server proxy is unavailable.
    func speakClientSide(text: String) async throws -> Data {
        guard activeProvider == .elevenlabs else {
            throw ElevenLabsTtsClient.ClientError.http(400, "Provider is not elevenlabs")
        }
        guard let apiKey = ElevenLabsByokKeychain.loadApiKey() else {
            throw ElevenLabsTtsClient.ClientError.missingApiKey
        }
        let voiceId = CompanionTtsProviderSettings.selectedVoiceId()
        guard !voiceId.isEmpty else {
            throw ElevenLabsTtsClient.ClientError.missingVoiceId
        }
        CompanionTtsPlaybackSession.shared.noteActiveClient(client)
        defer { CompanionTtsPlaybackSession.shared.clearClient(client) }
        return try await client.speak(text: text, voiceId: voiceId, apiKey: apiKey)
    }

    func abortInFlight() {
        client.abort()
        CompanionTtsPlaybackSession.shared.abort()
    }
}

/// Tracks in-flight ElevenLabs client streams so barge-in can cancel without
/// growing RootExperienceView networking.
final class CompanionTtsPlaybackSession: @unchecked Sendable {
    static let shared = CompanionTtsPlaybackSession()

    private let lock = NSLock()
    private weak var activeClient: ElevenLabsTtsClient?

    func noteActiveClient(_ client: ElevenLabsTtsClient) {
        lock.lock()
        activeClient = client
        lock.unlock()
    }

    func clearClient(_ client: ElevenLabsTtsClient) {
        lock.lock()
        if activeClient === client {
            activeClient = nil
        }
        lock.unlock()
    }

    func abort() {
        lock.lock()
        let client = activeClient
        activeClient = nil
        lock.unlock()
        client?.abort()
    }
}
