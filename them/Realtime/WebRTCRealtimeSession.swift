import Foundation
import AVFoundation
import Combine
import os

/// Disabled native WebRTC prototype.
///
/// The production realtime preview is ClementineRealtimeCoordinator +
/// ClementineRealtimeWebViewBridge. This type remains only as a tombstone so
/// old references fail at compile time instead of silently using a fake session.
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

    @available(*, unavailable, message: "Use ClementineRealtimeWebViewBridge; native WebRTC is not a production transport.")
    init() {}

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
        // 9. Handle remote audio track for io.them voice

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
