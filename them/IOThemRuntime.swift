import Foundation

nonisolated enum IOThemRuntime {
    static var isRunningTests: Bool {
        let environment = ProcessInfo.processInfo.environment
        return environment["XCTestConfigurationFilePath"] != nil ||
            environment["XCTestBundlePath"] != nil ||
            NSClassFromString("XCTest.XCTestCase") != nil
    }
}
