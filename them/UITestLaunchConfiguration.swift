import Foundation

#if DEBUG
nonisolated enum UITestLaunchConfiguration {
    static func applyIfNeeded(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        defaults: UserDefaults = .standard
    ) {
        guard arguments.contains("--ui-testing") else { return }

        if arguments.contains("--ui-reset-state"),
           !arguments.contains("--ui-preserve-state"),
           let bundleID = Bundle.main.bundleIdentifier {
            defaults.removePersistentDomain(forName: bundleID)
            ScreenplayLiveDraftFileStore.remove()
        }

        defaults.set("stub", forKey: "studio_debug_submit_transport_mode")
        defaults.set("turn_based", forKey: "clementine_voice_transport_mode")

        if arguments.contains("--ui-realtime-stub") {
            defaults.set("realtime_preview", forKey: "clementine_voice_transport_mode")
            defaults.set("stub", forKey: "clementine_realtime_supplier_mode")
        }

        if arguments.contains("--ui-realtime-network-fault") {
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
        copyLaunchArgumentValue("studio_debug_load_project_id", from: arguments, to: defaults)
        copyLaunchArgumentValue("studio_debug_load_project_version_id", from: arguments, to: defaults)
        copyLaunchArgumentInt("studio_debug_load_project_token", from: arguments, to: defaults)
        copyLaunchArgumentInt("studio_debug_load_project_ack_token", from: arguments, to: defaults)

        copyEnvironmentValue("THEM_UITEST_BACKEND_BASE_URL", from: environment, to: "backend_base_url", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_APP_TOKEN", from: environment, to: "app_token", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_USER_ID", from: environment, to: "user_id", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_CLIENT_TOKEN", from: environment, to: "client_token", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_CLIENT_TOKEN_BASE_URL", from: environment, to: "client_token_base_url", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_CLIENT_TOKEN_EXPIRY", from: environment, to: "client_token_expiry", defaults: defaults)
        copyEnvironmentDouble("THEM_UITEST_CLIENT_TOKEN_CACHED_AT", from: environment, to: "client_token_cached_at", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN", from: environment, to: "auth_debug_access_token", defaults: defaults)
        copyEnvironmentBool("THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED", from: environment, to: "auth_debug_access_token_enabled", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_AUTH_DEBUG_REFRESH_TOKEN", from: environment, to: "auth_debug_refresh_token", defaults: defaults)
        copyEnvironmentBool("THEM_UITEST_AUTH_SIGNED_IN", from: environment, to: "auth_signed_in", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_STUDIO_FULL_THREAD_STATE_JSON", from: environment, to: "studio.full.thread.state.v1", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_STUDIO_ASK_NOTE_HISTORY_JSON", from: environment, to: "studio.ask.note.history.v2", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_JSON", from: environment, to: "studio.diff.keep-current.v1", defaults: defaults)
        copyEnvironmentValue("THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_WRITEIDS_JSON", from: environment, to: "studio.diff.keep-current.writeids.v1", defaults: defaults)
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

    private static func copyLaunchArgumentInt(
        _ key: String,
        from arguments: [String],
        to defaults: UserDefaults
    ) {
        guard let index = arguments.firstIndex(of: "-\(key)") else { return }
        let valueIndex = arguments.index(after: index)
        guard arguments.indices.contains(valueIndex),
              let value = Int(arguments[valueIndex].trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
        defaults.set(value, forKey: key)
    }

    private static func copyEnvironmentValue(
        _ environmentKey: String,
        from environment: [String: String],
        to defaultsKey: String,
        defaults: UserDefaults
    ) {
        guard let value = normalizedEnvironmentValue(environment[environmentKey]) else { return }
        defaults.set(value, forKey: defaultsKey)
    }

    private static func copyEnvironmentDouble(
        _ environmentKey: String,
        from environment: [String: String],
        to defaultsKey: String,
        defaults: UserDefaults
    ) {
        guard let raw = normalizedEnvironmentValue(environment[environmentKey]),
              let value = Double(raw) else { return }
        defaults.set(value, forKey: defaultsKey)
    }

    private static func copyEnvironmentBool(
        _ environmentKey: String,
        from environment: [String: String],
        to defaultsKey: String,
        defaults: UserDefaults
    ) {
        guard let raw = normalizedEnvironmentValue(environment[environmentKey]) else { return }
        let normalized = raw.lowercased()
        let value = ["1", "true", "yes", "on"].contains(normalized)
        defaults.set(value, forKey: defaultsKey)
    }

    private static func normalizedEnvironmentValue(_ raw: String?) -> String? {
        let value = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
#endif
