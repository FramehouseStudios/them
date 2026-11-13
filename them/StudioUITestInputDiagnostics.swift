import SwiftUI

enum StudioUITestInspectorTabPhase: String {
    case appeared, entered, applied, observed, routed
}

enum StudioUITestSidebarTogglePhase: String {
    case entered, applied
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

    static func installIfRequested() {
        guard requested, !installed,
              let original = class_getInstanceMethod(UIApplication.self, #selector(UIApplication.sendEvent(_:))),
              let traced = class_getInstanceMethod(UIApplication.self, #selector(UIApplication.studioTraceSendEvent(_:))) else { return }
        method_exchangeImplementations(original, traced)
        installed = true
        record(["kind": "installed"])
    }

    static func inspectorFrame(
        tab: ScreenplayStudioScreen.DirectionOneRightPanelTab, frame: CGRect
    ) {
        guard requested else { return }
        record(["kind": "inspector_frame", "space": "tabs", "tab": tab.rawValue,
                "x": frame.minX, "y": frame.minY, "width": frame.width, "height": frame.height])
    }

    static func inspectorTab(
        _ phase: StudioUITestInspectorTabPhase,
        requestedTab: ScreenplayStudioScreen.DirectionOneRightPanelTab,
        selection: ScreenplayStudioScreen.DirectionOneRightPanelTab
    ) {
        guard requested else { return }
        record(["kind": "inspector_tab", "phase": phase.rawValue,
                "requested": requestedTab.rawValue, "selection": selection.rawValue])
    }

    static func sidebarToggle(_ phase: StudioUITestSidebarTogglePhase, visible: Bool) {
        guard requested else { return }
        record(["kind": "sidebar_toggle", "phase": phase.rawValue, "visible": visible])
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
                "x": point.x, "y": point.y, "touch_major_radius": touch.majorRadius,
                "touch_radius_tolerance": touch.majorRadiusTolerance, "window_key": touch.window?.isKeyWindow ?? false,
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

    override var accessibilityValue: String? {
        get { StudioUITestInputDiagnostics.snapshot }
        set {}
    }
}

struct StudioUITestInputDiagnosticsView: UIViewRepresentable {
    var identifier = "studio.debug.input.trace"
    func makeUIView(context: Context) -> UIView {
        let view = StudioInputTraceView()
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
    static func sidebarToggle(_ phase: StudioUITestSidebarTogglePhase, visible: Bool) {}
    static func installIfRequested() {}
    static func inspectorFrame(tab: ScreenplayStudioScreen.DirectionOneRightPanelTab, frame: CGRect) {}
    static func inspectorTab(
        _ phase: StudioUITestInspectorTabPhase,
        requestedTab: ScreenplayStudioScreen.DirectionOneRightPanelTab,
        selection: ScreenplayStudioScreen.DirectionOneRightPanelTab
    ) {}
}
struct StudioUITestInputDiagnosticsView: View {
    var identifier = "studio.debug.input.trace"
    var body: some View { EmptyView() }
}
#endif

#if DEBUG
/// Keep UI-test observations available when either compact drawer is closed.
struct StudioUITestDiagnosticsOverlay: View {
    let restoreSnapshot: String

    var body: some View {
        ZStack(alignment: .topLeading) {
            Text(restoreSnapshot)
                .font(.system(size: 1))
                .frame(width: 1, height: 1)
                .opacity(0.01)
                .accessibilityIdentifier("studio.restore.snapshot")
            StudioUITestInputDiagnosticsView()
                .frame(width: 12, height: 12)
                .allowsHitTesting(false)
        }
        .onAppear {
            StudioUITestInputDiagnostics.installIfRequested()
        }
    }
}
#endif
