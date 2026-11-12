import SwiftUI

#if DEBUG && canImport(UIKit)
import UIKit
import ObjectiveC

/// Opt-in metadata only: no text, labels, keys, tokens or user content.
@MainActor
enum StudioUITestInputDiagnostics {
    static let requested = ProcessInfo.processInfo.arguments.contains("--ui-testing") &&
        ProcessInfo.processInfo.environment["THEM_UITEST_TRACE_INPUT"] == "1"
    private static var installed = false
    private static var records: [[String: Any]] = []
    private static var lastOwner: Int?

    static func installIfRequested() {
        guard requested, !installed,
              let original = class_getInstanceMethod(UIApplication.self, #selector(UIApplication.sendEvent(_:))),
              let traced = class_getInstanceMethod(UIApplication.self, #selector(UIApplication.studioTraceSendEvent(_:))) else { return }
        method_exchangeImplementations(original, traced)
        installed = true
        record(["kind": "installed"])
    }

    static func binding(_ original: Binding<Bool>, owner: AnyObject) -> Binding<Bool> {
        guard requested else { return original }
        let ownerID = ObjectIdentifier(owner).hashValue
        if lastOwner != ownerID {
            record(["kind": "autosave_owner", "owner": ownerID, "value": original.wrappedValue])
            lastOwner = ownerID
        }
        return Binding(get: { original.wrappedValue }, set: { new in
            let old = original.wrappedValue
            original.wrappedValue = new
            record(["kind": "autosave_binding", "owner": ownerID, "old": old, "new": original.wrappedValue, "requested": new])
        })
    }

    fileprivate static func capture(_ event: UIEvent) {
        guard requested, event.type == .touches, let touches = event.allTouches else { return }
        for touch in touches where [.began, .ended, .cancelled].contains(touch.phase) {
            let point = touch.location(in: touch.window)
            var ancestors: [UIView] = []
            var view = touch.view
            while let current = view, ancestors.count < 8 {
                ancestors.append(current); view = current.superview
            }
            var entry: [String: Any] = ["kind": "touch", "phase": touch.phase.rawValue,
                "x": point.x, "y": point.y, "window_key": touch.window?.isKeyWindow ?? false,
                "scene_state": touch.window?.windowScene?.activationState.rawValue ?? -1,
                "views": ancestors.map { ["class": NSStringFromClass(type(of: $0)),
                    "interaction": $0.isUserInteractionEnabled, "hidden": $0.isHidden] as [String: Any] },
                "gestures": (touch.gestureRecognizers ?? []).map {
                    ["class": NSStringFromClass(type(of: $0)), "state": $0.state.rawValue,
                     "enabled": $0.isEnabled] as [String: Any]
                }]
            if let control = ancestors.compactMap({ $0 as? UISwitch }).first {
                entry["switch_on"] = control.isOn
                entry["switch_enabled"] = control.isEnabled
                entry["switch_tracking"] = control.isTracking
            }
            record(entry)
        }
    }

    private static func record(_ entry: [String: Any]) {
        var entry = entry
        entry["time"] = Date().timeIntervalSince1970
        records.append(entry)
        if records.count > 32 { records.removeFirst(records.count - 32) }
    }

    static var snapshot: String? {
        guard let data = try? JSONSerialization.data(withJSONObject: records, options: [.sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

private extension UIApplication {
    @objc dynamic func studioTraceSendEvent(_ event: UIEvent) {
        // After exchange, this invokes UIKit's original implementation first.
        studioTraceSendEvent(event)
        StudioUITestInputDiagnostics.capture(event)
    }
}

private final class StudioInputTraceView: UIView {
    override var accessibilityValue: String? {
        get { StudioUITestInputDiagnostics.snapshot }
        set {}
    }
}

struct StudioUITestInputDiagnosticsView: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = StudioInputTraceView()
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = StudioUITestInputDiagnostics.requested
        view.accessibilityIdentifier = "studio.debug.input.trace"
        view.accessibilityLabel = "Studio input delivery diagnostics"
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {}
}
#else
@MainActor
enum StudioUITestInputDiagnostics {
    static func installIfRequested() {}
    static func binding(_ original: Binding<Bool>, owner: AnyObject) -> Binding<Bool> { original }
}
struct StudioUITestInputDiagnosticsView: View {
    var body: some View { EmptyView() }
}
#endif
