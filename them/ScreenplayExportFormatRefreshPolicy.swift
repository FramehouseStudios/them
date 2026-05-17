nonisolated enum ScreenplayExportFormatRefreshPolicy {
    static func shouldAutoRefresh(
        projectListLoadedFromBackend: Bool,
        isRunningTests: Bool = IOThemRuntime.isRunningTests
    ) -> Bool {
        projectListLoadedFromBackend && !isRunningTests
    }
}
