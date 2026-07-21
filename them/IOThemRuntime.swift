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
