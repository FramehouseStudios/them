import Foundation

nonisolated enum IOThemRuntime {
    static let studioAutomationSessionIDEnvironmentKey = "THEM_STUDIO_AUTOMATION_SESSION_ID"

    static var isRunningTests: Bool {
        isTestProcessEnvironment(ProcessInfo.processInfo.environment)
    }

    static func isTestProcessEnvironment(_ environment: [String: String]) -> Bool {
        environment["XCTestConfigurationFilePath"] != nil ||
            environment["XCTestBundlePath"] != nil
    }

    static var isRunningUITests: Bool {
        ProcessInfo.processInfo.arguments.contains("--ui-testing")
    }

    static var isStudioEvalSession: Bool {
        #if DEBUG
        isStudioEvalArguments(ProcessInfo.processInfo.arguments)
        #else
        false
        #endif
    }

    static func isStudioEvalArguments(_ arguments: [String]) -> Bool {
        arguments.contains("--studio-eval")
    }

    static func isStudioAutomationArguments(_ arguments: [String]) -> Bool {
        isStudioEvalArguments(arguments) || arguments.contains("--ui-testing")
    }

    static func studioAutomationSessionID(
        arguments: [String],
        environment: [String: String]
    ) -> String? {
        guard isStudioAutomationArguments(arguments) else { return nil }
        let value = environment[studioAutomationSessionIDEnvironmentKey]?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !value.isEmpty, value.count <= 128 else { return nil }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._"))
        guard value.unicodeScalars.allSatisfy(allowed.contains) else { return nil }
        return value
    }

    static func studioAutomationTargetMatches(
        _ targetSessionID: String,
        arguments: [String],
        environment: [String: String]
    ) -> Bool {
        guard isStudioAutomationArguments(arguments) else { return false }
        let target = targetSessionID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !target.isEmpty else { return true }
        return studioAutomationSessionID(arguments: arguments, environment: environment) == target
    }

    static func studioAutomationProcessCanConsumeCommands(
        targetSessionID: String,
        arguments: [String],
        environment: [String: String]
    ) -> Bool {
        guard isStudioAutomationArguments(arguments) else { return false }
        if isStudioEvalArguments(arguments),
           studioAutomationSessionID(arguments: arguments, environment: environment) != nil {
            return true
        }
        return studioAutomationTargetMatches(
            targetSessionID,
            arguments: arguments,
            environment: environment
        )
    }

    static var currentStudioAutomationTargetMatches: Bool {
        #if DEBUG
        return isStudioAutomationSession
        #else
        return false
        #endif
    }

    static func automationOutboxRootURL(
        arguments: [String],
        environment: [String: String],
        temporaryRoot: URL = URL(fileURLWithPath: "/tmp", isDirectory: true)
    ) -> URL? {
        guard isStudioAutomationArguments(arguments) else { return nil }
        let fallback = arguments.contains("--ui-testing") ? "ui-testing" : "studio-eval"
        let sessionID = studioAutomationSessionID(arguments: arguments, environment: environment)
            ?? fallback
        return temporaryRoot
            .appendingPathComponent("io.them-automation", isDirectory: true)
            .appendingPathComponent(sessionID, isDirectory: true)
    }

    static var currentAutomationOutboxRootURL: URL? {
        #if DEBUG
        automationOutboxRootURL(
            arguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment
        )
        #else
        nil
        #endif
    }

    static func explicitPreferenceArgumentValue(
        forKey key: String,
        arguments: [String]
    ) -> String? {
        let cleanKey = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanKey.isEmpty else { return nil }
        let flag = "-\(cleanKey)"
        let assignmentPrefix = "\(flag)="

        for index in arguments.indices.reversed() {
            let argument = arguments[index]
            if argument.hasPrefix(assignmentPrefix) {
                return String(argument.dropFirst(assignmentPrefix.count))
            }
            guard argument == flag else { continue }
            let valueIndex = arguments.index(after: index)
            guard valueIndex < arguments.endIndex else { return "" }
            let value = arguments[valueIndex]
            return value.hasPrefix("-") ? "" : value
        }
        return nil
    }

    static var isStudioAutomationSession: Bool {
        #if DEBUG
        #if os(macOS)
        let target = (StudioDebugPreferenceFileBridge.value(
            forKey: "studio_debug_target_session_id"
        ) as? String) ?? ""
        return studioAutomationProcessCanConsumeCommands(
            targetSessionID: target,
            arguments: ProcessInfo.processInfo.arguments,
            environment: ProcessInfo.processInfo.environment
        )
        #else
        return isStudioAutomationArguments(ProcessInfo.processInfo.arguments)
        #endif
        #else
        false
        #endif
    }
}

#if DEBUG
nonisolated enum StudioDebugPreferenceFileBridge {
    private static let directoryURL = URL(
        fileURLWithPath: "/tmp/them_studio_debug_preferences_v1",
        isDirectory: true
    )

    static func value(forKey key: String) -> Any? {
        let url = valueURL(forKey: key)
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object["value"]
    }

    static func write(_ value: Any, forKey key: String) {
        guard JSONSerialization.isValidJSONObject(["value": value]),
              let data = try? JSONSerialization.data(withJSONObject: ["value": value]) else {
            return
        }
        try? FileManager.default.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: true
        )
        try? data.write(to: valueURL(forKey: key), options: .atomic)
    }

    private static func valueURL(forKey key: String) -> URL {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._"))
        let filename = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
        return directoryURL.appendingPathComponent("\(filename).json")
    }
}
#endif
