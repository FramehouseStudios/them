import Foundation
import SwiftUI
import Combine
import WebKit

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

    @Published private(set) var status: Status = .idle

    var onUserTranscriptPartial: ((String) -> Void)?
    var onUserTranscriptFinal: ((String) -> Void)?
    var onAssistantTranscriptFinal: ((String) -> Void)?
    var onAssistantTextFinal: ((String) -> Void)?

    private weak var webView: WKWebView?
    private var bridgeRequest: URLRequest?
    private var bridgeReady = false
    private var pendingBootstrap: BackendRealtimeBootstrap?
    private var shouldStartWhenReady = false

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
            return "Live voice connected"
        case let .failed(message):
            return message.isEmpty ? "Realtime bridge unavailable" : "Realtime bridge unavailable · \(message)"
        }
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
        loadBridgeIfNeeded(request: bridgeRequest)
        startIfPossible()
    }

    func disconnect() {
        shouldStartWhenReady = false
        pendingBootstrap = nil
        guard bridgeReady else {
            status = .idle
            return
        }
        evaluate(script: "window.clementineRealtime && window.clementineRealtime.stop && window.clementineRealtime.stop();")
        status = .ready
    }

    func clear() {
        disconnect()
        bridgeRequest = nil
        bridgeReady = false
        onUserTranscriptPartial = nil
        onUserTranscriptFinal = nil
        onAssistantTranscriptFinal = nil
        onAssistantTextFinal = nil
        status = .idle
    }

    private func startIfPossible() {
        guard shouldStartWhenReady, bridgeReady, let pendingBootstrap else { return }
        shouldStartWhenReady = false
        status = .connecting

        let payload: [String: Any] = [
            "clientSecret": pendingBootstrap.clientSecret.value,
            "assistantName": pendingBootstrap.assistantName,
            "session": [
                "type": pendingBootstrap.session.type,
                "model": pendingBootstrap.session.model,
                "instructions": pendingBootstrap.session.instructions,
                "output_modalities": pendingBootstrap.session.outputModalities,
                "audio": [
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

    private func handleScriptMessageBody(_ body: Any) {
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

        switch eventType {
        case "bridge_ready":
            bridgeReady = true
            if case .loadingBridge = status {
                status = .ready
            } else if case .idle = status {
                status = .ready
            }
            startIfPossible()
        case "connecting":
            status = .connecting
        case "connected":
            status = .live
        case "disconnected":
            status = bridgeReady ? .ready : .idle
        case "user_transcript_partial":
            guard !text.isEmpty else { return }
            onUserTranscriptPartial?(text)
        case "user_transcript_final":
            guard !text.isEmpty else { return }
            onUserTranscriptFinal?(text)
        case "assistant_transcript_final":
            guard !text.isEmpty else { return }
            onAssistantTranscriptFinal?(text)
        case "assistant_text_final":
            guard !text.isEmpty else { return }
            onAssistantTextFinal?(text)
        case "error":
            status = .failed(message.isEmpty ? "Unknown Realtime bridge error." : message)
        default:
            break
        }
    }
}

extension ClementineRealtimeWebViewBridge: WKScriptMessageHandler {
    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        Task { @MainActor in
            self.handleScriptMessageBody(message.body)
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
