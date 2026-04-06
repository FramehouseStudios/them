import Foundation
import AVFoundation
import Combine
import os

/// Manages a WebRTC-style realtime session with the OpenAI Realtime API.
///
/// This is a simplified bridge that uses the backend's /realtime/call endpoint
/// for SDP negotiation. In a full implementation, this would use a native
/// WebRTC framework (like GoogleWebRTC). For now, it provides the session
/// lifecycle and hooks for audio/text events that the orchestrator needs.
@MainActor
final class WebRTCRealtimeSession: ObservableObject {
    enum SessionState: Equatable {
        case idle
        case connecting
        case connected
        case speaking
        case listening
        case failed(String)
    }

    @Published private(set) var state: SessionState = .idle
    @Published private(set) var isAssistantSpeaking: Bool = false

    // Callbacks for the orchestrator
    var onAssistantAudioChunk: ((Data) -> Void)?
    var onAssistantTranscript: ((String) -> Void)?
    var onAssistantSpeakingChanged: ((Bool) -> Void)?
    var onUserTranscriptPartial: ((String) -> Void)?
    var onUserTranscriptFinal: ((String) -> Void)?

    private var bootstrap: BackendRealtimeBootstrap?
    private var sessionTask: Task<Void, Never>?

    func connect(bootstrap: BackendRealtimeBootstrap) async throws {
        self.bootstrap = bootstrap
        state = .connecting

        // In a full implementation, this would:
        // 1. Create RTCPeerConnection
        // 2. Add local audio track (microphone)
        // 3. Create SDP offer
        // 4. Send offer to backend /realtime/call
        // 5. Receive SDP answer
        // 6. Set remote description
        // 7. Wait for ICE connection
        // 8. Handle data channel events for text
        // 9. Handle remote audio track for Clementine's voice

        // For now, mark as connected and use the turn-based path with
        // streaming text as a bridge until native WebRTC is integrated
        state = .connected

        HerLog.realtime.info("WebRTC session ready (bridge mode)")
        HerLog.realtime.info("Model: \(bootstrap.model), Voice: \(bootstrap.voice)")
        HerLog.realtime.info("Secret expires: \(bootstrap.expiresAtDate)")
    }

    func disconnect() {
        sessionTask?.cancel()
        sessionTask = nil
        state = .idle
        isAssistantSpeaking = false
        bootstrap = nil

        HerLog.realtime.info("WebRTC session disconnected")
    }

    func notifyAssistantSpeaking(_ speaking: Bool) {
        isAssistantSpeaking = speaking
        state = speaking ? .speaking : .connected
        onAssistantSpeakingChanged?(speaking)
    }

    func feedAssistantAudio(_ data: Data) {
        onAssistantAudioChunk?(data)
    }

    func feedAssistantTranscript(_ text: String) {
        onAssistantTranscript?(text)
    }

    var isConnected: Bool {
        switch state {
        case .connected, .speaking, .listening: return true
        default: return false
        }
    }

    var isExpiringSoon: Bool {
        guard let bootstrap else { return true }
        return bootstrap.expiresAtDate.timeIntervalSinceNow < 20
    }
}
