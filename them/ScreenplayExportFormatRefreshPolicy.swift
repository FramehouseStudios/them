import Foundation

nonisolated enum ScreenplayStudioRuntime {
    static var isRunningTests: Bool {
        let environment = ProcessInfo.processInfo.environment
        return environment["XCTestConfigurationFilePath"] != nil ||
            environment["XCTestBundlePath"] != nil ||
            NSClassFromString("XCTest.XCTestCase") != nil
    }
}

nonisolated enum ScreenplayExportFormatRefreshPolicy {
    static func shouldAutoRefresh(
        projectListLoadedFromBackend: Bool,
        isRunningTests: Bool = ScreenplayStudioRuntime.isRunningTests
    ) -> Bool {
        projectListLoadedFromBackend && !isRunningTests
    }
}
