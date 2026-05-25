import Foundation

#if DEBUG
nonisolated enum UITestLaunchConfiguration {
    static func applyIfNeeded(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        defaults: UserDefaults = .standard
    ) {
        guard arguments.contains("--ui-testing") else { return }

        if arguments.contains("--ui-reset-state"),
           let bundleID = Bundle.main.bundleIdentifier {
            defaults.removePersistentDomain(forName: bundleID)
        }

        defaults.set("stub", forKey: "studio_debug_submit_transport_mode")
        defaults.set("turn_based", forKey: "clementine_voice_transport_mode")

        if arguments.contains("--ui-realtime-stub") {
            defaults.set("realtime_preview", forKey: "clementine_voice_transport_mode")
            defaults.set("stub", forKey: "clementine_realtime_supplier_mode")
        }

        if arguments.contains("--ui-route-page") {
            defaults.set("page", forKey: "studio.prompt.routing.mode")
        } else if arguments.contains("--ui-route-voice-pin") {
            defaults.set("voicePin", forKey: "studio.prompt.routing.mode")
        }

        if arguments.contains("--ui-skip-onboarding") {
            defaults.set("UITest Writer", forKey: "her.preferredName")
            defaults.set(true, forKey: "her.isScreenwriter")
            defaults.set("screenwriter", forKey: "her.creativeIdentity")
            defaults.set(0.98, forKey: "her.creativeIdentityStrength")
        }

        copyLaunchArgumentValue("studio_debug_seed_structural_token", from: arguments, to: defaults)
        copyLaunchArgumentValue("studio_auto_insert", from: arguments, to: defaults)
        defaults.synchronize()
    }

    private static func copyLaunchArgumentValue(
        _ key: String,
        from arguments: [String],
        to defaults: UserDefaults
    ) {
        guard let index = arguments.firstIndex(of: "-\(key)") else { return }
        let valueIndex = arguments.index(after: index)
        guard arguments.indices.contains(valueIndex) else { return }
        defaults.set(arguments[valueIndex], forKey: key)
    }
}
#endif
