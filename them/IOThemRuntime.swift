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
