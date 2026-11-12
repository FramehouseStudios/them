import SwiftUI

enum StudioUITestHeldPreviewPhase: String {
    case callback, tokenConfirmed, tokenRejected, appeared
    case projectInvalidated, documentInvalidated, identityInvalidated, contextInvalidated
}

enum StudioUITestPartnerPagePhase: String {
    case buttonActivated = "button_activated"
    case handlerEntered = "handler_entered"
    case exchangeMissing = "exchange_missing"
    case wrongTarget = "wrong_target"
    case exchangeResolved = "exchange_resolved"
    case composerReturned = "composer_returned"
}

private enum StudioUITestPromptRoutingValue: String {
    case automatic, page, voicePin, invalid

    init(_ storageValue: String) {
        self = Self(rawValue: storageValue) ?? .invalid
    }
}

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

    static func heldPreview(_ phase: StudioUITestHeldPreviewPhase, owner: AnyObject) {
        guard requested else { return }
        record(["kind": "held_preview", "phase": phase.rawValue,
                "owner": ObjectIdentifier(owner).hashValue])
    }

    static func partnerPage(_ phase: StudioUITestPartnerPagePhase) {
        guard requested else { return }
        record(["kind": "partner_page", "phase": phase.rawValue])
    }

    static func promptRoutingBinding(_ original: Binding<String>) -> Binding<String> {
        guard requested else { return original }
        return Binding(get: { original.wrappedValue }, set: { new in
            let old = StudioUITestPromptRoutingValue(original.wrappedValue)
            original.wrappedValue = new
            record(["kind": "prompt_routing", "old": old.rawValue,
                    "requested": StudioUITestPromptRoutingValue(new).rawValue,
                    "readback": StudioUITestPromptRoutingValue(original.wrappedValue).rawValue])
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
            if let scroll = ancestors.compactMap({ $0 as? UIScrollView }).first {
                // Observed after UIKit dispatch; motion may have stopped during delivery.
                entry["scroll_dragging"] = scroll.isDragging
                entry["scroll_tracking"] = scroll.isTracking
                entry["scroll_decelerating"] = scroll.isDecelerating
                entry["scroll_delays_content_touches"] = scroll.delaysContentTouches
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

    static var snapshot: String? { serialize(records) }

    static var partnerPageSnapshot: String? {
        // This surface excludes unrelated traces that carry object-owner hashes.
        serialize(records.filter {
            guard let kind = $0["kind"] as? String else { return false }
            return ["installed", "touch", "partner_page", "prompt_routing"].contains(kind)
        })
    }

    private static func serialize(_ entries: [[String: Any]]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: entries, options: [.sortedKeys]) else { return nil }
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
    var partnerPageOnly = false

    override var accessibilityValue: String? {
        get {
            partnerPageOnly
                ? StudioUITestInputDiagnostics.partnerPageSnapshot
                : StudioUITestInputDiagnostics.snapshot
        }
        set {}
    }
}

struct StudioUITestInputDiagnosticsView: UIViewRepresentable {
    var identifier = "studio.debug.input.trace"
    var partnerPageOnly = false
    func makeUIView(context: Context) -> UIView {
        let view = StudioInputTraceView()
        view.partnerPageOnly = partnerPageOnly
        view.isUserInteractionEnabled = false
        view.isAccessibilityElement = StudioUITestInputDiagnostics.requested
        view.accessibilityIdentifier = identifier
        view.accessibilityLabel = "Studio input delivery diagnostics"
        return view
    }
    func updateUIView(_ view: UIView, context: Context) {}
}
#else
@MainActor
enum StudioUITestInputDiagnostics {
    static func installIfRequested() {}
    static func heldPreview(_ phase: StudioUITestHeldPreviewPhase, owner: AnyObject) {}
    static func binding(_ original: Binding<Bool>, owner: AnyObject) -> Binding<Bool> { original }
    static func partnerPage(_ phase: StudioUITestPartnerPagePhase) {}
    static func promptRoutingBinding(_ original: Binding<String>) -> Binding<String> { original }
}
struct StudioUITestInputDiagnosticsView: View {
    var identifier = "studio.debug.input.trace"
    var partnerPageOnly = false
    var body: some View { EmptyView() }
}
#endif
