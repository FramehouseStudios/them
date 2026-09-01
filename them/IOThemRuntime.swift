import Foundation

nonisolated enum IOThemRuntime {
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
        isStudioAutomationArguments(ProcessInfo.processInfo.arguments)
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

    static func value(
        forKey key: String,
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> Any? {
        guard IOThemRuntime.isStudioAutomationArguments(arguments) else { return nil }
        let url = valueURL(forKey: key)
        guard let data = try? Data(contentsOf: url),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object["value"]
    }

    static func write(
        _ value: Any,
        forKey key: String,
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) {
        guard IOThemRuntime.isStudioAutomationArguments(arguments) else { return }
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

    static func removeValue(forKey key: String) {
        try? FileManager.default.removeItem(at: valueURL(forKey: key))
    }

    private static func valueURL(forKey key: String) -> URL {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._"))
        let filename = key.addingPercentEncoding(withAllowedCharacters: allowed) ?? key
        return directoryURL.appendingPathComponent("\(filename).json")
    }
}
#endif
