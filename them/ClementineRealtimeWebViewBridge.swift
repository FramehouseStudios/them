import Foundation
import SwiftUI
import Combine
import WebKit

struct ClementineRealtimeLatencyEvent: Equatable {
    enum Kind: Equatable {
        case turnStarted
        case firstText
        case firstAudio
        case bargeInStarted
        case bargeInAcknowledged
        case networkProfile
    }

    let kind: Kind
    let turnID: String
    let elapsedMilliseconds: Double?
    let networkClass: ClementineSpeechNetworkClass?

    static func parse(eventType: String, payload: [String: Any]) -> ClementineRealtimeLatencyEvent? {
        let kind: Kind
        switch eventType {
        case "latency_turn_started":
            kind = .turnStarted
        case "latency_first_text":
            kind = .firstText
        case "latency_first_audio":
            kind = .firstAudio
        case "latency_barge_in_started":
            kind = .bargeInStarted
        case "latency_barge_in_ack":
            kind = .bargeInAcknowledged
        case "network_profile":
            kind = .networkProfile
        default:
            return nil
        }

        let turnID = String(describing: payload["turnID"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !turnID.isEmpty else { return nil }
        let elapsedMilliseconds = doubleValue(payload["elapsedMs"])
        let networkRaw = String(describing: payload["networkClass"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return ClementineRealtimeLatencyEvent(
            kind: kind,
            turnID: turnID,
            elapsedMilliseconds: elapsedMilliseconds,
            networkClass: ClementineSpeechNetworkClass(rawValue: networkRaw)
        )
    }

    private static func doubleValue(_ value: Any?) -> Double? {
        if let number = value as? NSNumber { return number.doubleValue }
        guard let value else { return nil }
        return Double(String(describing: value))
    }
}

@MainActor
final class ClementineRealtimeWebViewBridge: NSObject, ObservableObject {
    enum Status: Equatable {
        case idle
        case loadingBridge
        case ready
        case connecting
        case live
        case failed(String)
    }

    enum Activity: Equatable {
        case idle
        case listening
        case thinking
        case speaking

        var label: String {
            switch self {
            case .idle:
                return "Standby"
            case .listening:
                return "Listening"
            case .thinking:
                return "Thinking"
            case .speaking:
                return "Speaking"
            }
        }
    }

    @Published private(set) var status: Status = .idle
    @Published private(set) var activity: Activity = .idle

    var onUserTranscriptPartial: ((String) -> Void)?
    var onUserTranscriptFinal: ((String) -> Void)?
    var onAssistantTranscriptFinal: ((String) -> Void)?
    var onAssistantTextFinal: ((String) -> Void)?
    var onAssistantSpeakingChanged: ((Bool) -> Void)?
    var onUserSpeechStarted: ((String) -> Void)?
    var onLatencyEvent: ((ClementineRealtimeLatencyEvent) -> Void)?

    private weak var webView: WKWebView?
    private var bridgeRequest: URLRequest?
    private var bridgeReady = false
    private var pendingBootstrap: BackendRealtimeBootstrap?
    private var shouldStartWhenReady = false
    private var cancelledResponseOrdinal = 0

    var isLive: Bool {
        if case .live = status {
            return true
        }
        return false
    }

    var isBusy: Bool {
        switch status {
        case .loadingBridge, .connecting:
            return true
        case .idle, .ready, .live, .failed:
            return false
        }
    }

    var statusText: String {
        switch status {
        case .idle:
            return "Realtime preview standby"
        case .loadingBridge:
            return "Loading live voice bridge…"
        case .ready:
            return "Live voice bridge ready"
        case .connecting:
            return "Connecting live voice…"
        case .live:
            return "Live voice connected · \(activity.label)"
        case let .failed(message):
            return message.isEmpty ? "Realtime bridge unavailable" : "Realtime bridge unavailable · \(message)"
        }
    }

    var isAssistantSpeaking: Bool {
        activity == .speaking
    }

    func attach(webView: WKWebView) {
        self.webView = webView
        if let bridgeRequest {
            loadBridgeIfNeeded(request: bridgeRequest)
        }
    }

    func loadBridgeIfNeeded(request: URLRequest) {
        bridgeRequest = request
        guard let webView else {
            status = .loadingBridge
            return
        }

        let requestURL = request.url
        let needsReload = webView.url?.absoluteString != requestURL?.absoluteString || !bridgeReady
        guard needsReload else {
            if case .idle = status {
                status = .ready
            }
            return
        }

        bridgeReady = false
        status = .loadingBridge
        webView.load(request)
    }

    func connect(bootstrap: BackendRealtimeBootstrap, bridgeRequest: URLRequest) {
        pendingBootstrap = bootstrap
        shouldStartWhenReady = true
        cancelledResponseOrdinal = 0
        loadBridgeIfNeeded(request: bridgeRequest)
        startIfPossible()
    }

    func disconnect() {
        shouldStartWhenReady = false
        pendingBootstrap = nil
        guard bridgeReady else {
            status = .idle
            activity = .idle
            cancelledResponseOrdinal = 0
            onAssistantSpeakingChanged?(false)
            return
        }
        evaluate(script: "window.clementineRealtime && window.clementineRealtime.stop && window.clementineRealtime.stop();")
        status = .ready
        activity = .idle
        cancelledResponseOrdinal = 0
        onAssistantSpeakingChanged?(false)
    }

    func clear() {
        disconnect()
        bridgeRequest = nil
        bridgeReady = false
        onUserTranscriptPartial = nil
        onUserTranscriptFinal = nil
        onAssistantTranscriptFinal = nil
        onAssistantTextFinal = nil
        onAssistantSpeakingChanged = nil
        onUserSpeechStarted = nil
        onLatencyEvent = nil
        status = .idle
        activity = .idle
        cancelledResponseOrdinal = 0
    }

    func interruptAssistant() {
        evaluate(
            script: "window.clementineRealtime && window.clementineRealtime.interrupt && window.clementineRealtime.interrupt();"
        )
    }

    private func startIfPossible() {
        guard shouldStartWhenReady, bridgeReady, let pendingBootstrap else { return }
        shouldStartWhenReady = false
        status = .connecting

        var inputAudio: [String: Any] = [
            "turn_detection": [
                "type": "server_vad",
                "threshold": 0.45,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 360,
                "create_response": true,
                "interrupt_response": true
            ]
        ]
        let transcriptionModel = pendingBootstrap.session.inputTranscriptionModel?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !transcriptionModel.isEmpty {
            inputAudio["transcription"] = ["model": transcriptionModel]
        }

        let payload: [String: Any] = [
            "clientSecret": pendingBootstrap.clientSecret.value,
            "assistantName": pendingBootstrap.assistantName,
            "session": [
                "type": pendingBootstrap.session.type,
                "model": pendingBootstrap.session.model,
                "instructions": pendingBootstrap.session.instructions,
                "output_modalities": pendingBootstrap.session.outputModalities,
                "audio": [
                    "input": inputAudio,
                    "output": [
                        "voice": pendingBootstrap.session.voice
                    ]
                ]
            ]
        ]

        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: jsonData, encoding: .utf8) else {
            status = .failed("Could not serialize Realtime session config.")
            return
        }

        let script = "window.clementineRealtime && window.clementineRealtime.start && window.clementineRealtime.start(\(json));"
        evaluate(script: script)
    }

    private func evaluate(script: String) {
        guard let webView else {
            status = .failed("Realtime bridge is not attached.")
            return
        }
        webView.evaluateJavaScript(script) { _, error in
            guard let error else { return }
            Task { @MainActor in
                self.status = .failed(error.localizedDescription)
            }
        }
    }

    func receiveBridgeMessage(_ body: Any) {
        let payload: [String: Any]
        if let dict = body as? [String: Any] {
            payload = dict
        } else if let text = body as? String,
                  let data = text.data(using: .utf8),
                  let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            payload = dict
        } else {
            return
        }

        let eventType = String(describing: payload["type"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let text = String(describing: payload["text"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let message = String(describing: payload["message"] ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let responseOrdinal = Int(String(describing: payload["responseOrdinal"] ?? "")) ?? 0

        if let latencyEvent = ClementineRealtimeLatencyEvent.parse(
            eventType: eventType,
            payload: payload
        ) {
            onLatencyEvent?(latencyEvent)
        }

        switch eventType {
        case "bridge_ready":
            bridgeReady = true
            if case .loadingBridge = status {
                status = .ready
            } else if case .idle = status {
                status = .ready
            }
            activity = .idle
            startIfPossible()
        case "connecting":
            cancelledResponseOrdinal = 0
            status = .connecting
            activity = .idle
        case "connected":
            status = .live
            activity = .listening
        case "disconnected":
            status = bridgeReady ? .ready : .idle
            activity = .idle
            onAssistantSpeakingChanged?(false)
        case "assistant_thinking":
            guard responseOrdinal == 0 || responseOrdinal > cancelledResponseOrdinal else { return }
            activity = .thinking
            onAssistantSpeakingChanged?(false)
        case "assistant_speaking":
            guard responseOrdinal == 0 || responseOrdinal > cancelledResponseOrdinal else { return }
            activity = .speaking
            onAssistantSpeakingChanged?(true)
        case "assistant_idle":
            guard responseOrdinal == 0 || responseOrdinal > cancelledResponseOrdinal else { return }
            activity = .listening
            onAssistantSpeakingChanged?(false)
        case "assistant_interrupted":
            cancelledResponseOrdinal = max(cancelledResponseOrdinal, responseOrdinal)
            activity = .listening
            onAssistantSpeakingChanged?(false)
        case "user_speech_started":
            let turnID = String(describing: payload["turnID"] ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            activity = .listening
            onAssistantSpeakingChanged?(false)
            onUserSpeechStarted?(turnID)
        case "user_transcript_partial":
            guard !text.isEmpty else { return }
            activity = .listening
            onUserTranscriptPartial?(text)
        case "user_transcript_final":
            guard !text.isEmpty else { return }
            activity = .thinking
            onUserTranscriptFinal?(text)
        case "assistant_transcript_final":
            guard !text.isEmpty else { return }
            guard responseOrdinal == 0 || responseOrdinal > cancelledResponseOrdinal else { return }
            if activity != .speaking {
                activity = .listening
                onAssistantSpeakingChanged?(false)
            }
            onAssistantTranscriptFinal?(text)
        case "assistant_text_final":
            guard !text.isEmpty else { return }
            guard responseOrdinal == 0 || responseOrdinal > cancelledResponseOrdinal else { return }
            if activity != .speaking {
                activity = .listening
                onAssistantSpeakingChanged?(false)
            }
            onAssistantTextFinal?(text)
        case "error":
            status = .failed(message.isEmpty ? "Unknown Realtime bridge error." : message)
            activity = .idle
            onAssistantSpeakingChanged?(false)
        default:
            break
        }
    }
}

extension ClementineRealtimeWebViewBridge: WKScriptMessageHandler {
    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        Task { @MainActor in
            self.receiveBridgeMessage(message.body)
        }
    }
}

extension ClementineRealtimeWebViewBridge: WKNavigationDelegate {
    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            if !self.bridgeReady {
                self.status = .loadingBridge
            }
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in
            self.status = .failed(error.localizedDescription)
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        Task { @MainActor in
            self.status = .failed(error.localizedDescription)
        }
    }
}

struct ClementineRealtimeTransportHost: View {
    @ObservedObject var bridge: ClementineRealtimeWebViewBridge
    let bridgeRequest: URLRequest?

    var body: some View {
        ClementineRealtimeTransportPlatformHost(bridge: bridge, bridgeRequest: bridgeRequest)
            .frame(width: 1, height: 1)
            .opacity(0.01)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

#if os(macOS)
private struct ClementineRealtimeTransportPlatformHost: NSViewRepresentable {
    @ObservedObject var bridge: ClementineRealtimeWebViewBridge
    let bridgeRequest: URLRequest?

    func makeNSView(context: Context) -> WKWebView {
        let configuration = makeConfiguration(for: bridge)
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = bridge
        webView.setValue(false, forKey: "drawsBackground")
        bridge.attach(webView: webView)
        if let bridgeRequest {
            bridge.loadBridgeIfNeeded(request: bridgeRequest)
        }
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        bridge.attach(webView: webView)
        if let bridgeRequest {
            bridge.loadBridgeIfNeeded(request: bridgeRequest)
        }
    }
}
#else
private struct ClementineRealtimeTransportPlatformHost: UIViewRepresentable {
    @ObservedObject var bridge: ClementineRealtimeWebViewBridge
    let bridgeRequest: URLRequest?

    func makeUIView(context: Context) -> WKWebView {
        let configuration = makeConfiguration(for: bridge)
        configuration.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = bridge
        bridge.attach(webView: webView)
        if let bridgeRequest {
            bridge.loadBridgeIfNeeded(request: bridgeRequest)
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        bridge.attach(webView: webView)
        if let bridgeRequest {
            bridge.loadBridgeIfNeeded(request: bridgeRequest)
        }
    }
}
#endif

private func makeConfiguration(for bridge: ClementineRealtimeWebViewBridge) -> WKWebViewConfiguration {
    let configuration = WKWebViewConfiguration()
    let controller = WKUserContentController()
    controller.add(bridge, name: "realtimeEvent")
    configuration.userContentController = controller
    configuration.websiteDataStore = .nonPersistent()
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    configuration.mediaTypesRequiringUserActionForPlayback = []
    return configuration
}
