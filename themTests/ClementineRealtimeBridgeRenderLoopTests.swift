import Combine
import WebKit
import XCTest
@testable import them

@MainActor
final class ClementineRealtimeBridgeRenderLoopTests: XCTestCase {
    func testRepeatedRenderWithTheSameRequestPublishesNothing() {
        let bridge = ClementineRealtimeWebViewBridge()
        let webView = WKWebView(frame: .zero)
        let request = URLRequest(url: URL(string: "http://127.0.0.1:9/realtime/bridge")!)
        bridge.attach(webView: webView)
        bridge.loadBridgeIfNeeded(request: request)
        XCTAssertEqual(bridge.status, .loadingBridge)

        var changes = 0
        let subscription = bridge.objectWillChange.sink { changes += 1 }
        // What updateUIView does on every render while the page loads.
        for _ in 0..<5 {
            bridge.attach(webView: webView)
            bridge.loadBridgeIfNeeded(request: request)
        }
        subscription.cancel()
        XCTAssertEqual(changes, 0, "A render must not publish, or it renders again")
    }
}
