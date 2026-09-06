import XCTest

final class DesignSystemGuardTests: XCTestCase {
    func testNewSwiftFilesDoNotBypassDesignSystemTokens() throws {
        let root = try repositoryRoot()
        let rawStylePatterns: [(name: String, pattern: String)] = [
            ("raw Color initializers", #"Color\s*\(\s*(red|white)\s*:"#),
            ("raw SwiftUI system fonts", #"\.font\s*\(\s*\.(system|custom)\s*\("#),
            ("raw Font.system tokens", #"Font\.system\s*\("#),
            ("new local chrome/theme enums", #"(?m)^\s*(private\s+)?enum\s+\w*(Chrome|Theme)\b"#)
        ]
        let allowedRawStyleFiles: Set<String> = [
            "Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemColors.swift",
            "Packages/ScreenplayStudio/Sources/ScreenplayStudio/DesignSystem/IOThemTypography.swift",
            "Packages/ScreenplayStudio/Sources/ScreenplayStudio/Views/FountainTypography.swift",
            "them/AppShell.swift",
            "them/ConversationHistoryScreen.swift",
            "them/DataControlsScreen.swift",
            "them/MemoriesScreen.swift",
            "them/NumberedChoiceViews.swift",
            "them/RootExperienceView.swift",
            // D009 I4 moves out of RootExperienceView: verbatim, not new styling.
            "them/NotesPanel.swift",
            "them/CompanionControlsPanel.swift",
            "them/ScreenplayCraftRailView.swift",
            "them/ScreenplayStudioScreen.swift"
        ]

        let files = try swiftFiles(
            under: root,
            scopedTo: [
                "Packages/ScreenplayStudio/Sources/ScreenplayStudio",
                "them"
            ]
        )
        var violations: [String] = []

        for file in files {
            let relative = relativePath(for: file, root: root)
            guard !allowedRawStyleFiles.contains(relative) else { continue }
            let source = try String(contentsOf: file, encoding: .utf8)
            for pattern in rawStylePatterns where source.range(of: pattern.pattern, options: .regularExpression) != nil {
                violations.append("\(relative): \(pattern.name)")
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            """
            New Swift files must use IOThemColors, IOThemTypography, and IOThemSpacing instead of raw local styling.
            Violations:
            \(violations.sorted().joined(separator: "\n"))
            """
        )
    }

    func testStudioDoesNotReferenceUnavailableSFSymbols() throws {
        let root = try repositoryRoot()
        let unavailableSymbols = [
            "square.stack.badge.plus"
        ]
        let files = try swiftFiles(
            under: root,
            scopedTo: [
                "Packages/ScreenplayStudio/Sources/ScreenplayStudio",
                "them"
            ]
        )
        var violations: [String] = []

        for file in files {
            let relative = relativePath(for: file, root: root)
            let source = try String(contentsOf: file, encoding: .utf8)
            for symbol in unavailableSymbols where source.contains(symbol) {
                violations.append("\(relative): \(symbol)")
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            """
            SwiftUI logs invalid-configuration warnings when an unavailable SF Symbol is requested.
            Violations:
            \(violations.sorted().joined(separator: "\n"))
            """
        )
    }

    func testAppDoesNotOpenDefaultsSuiteWithAppBundleIdentifier() throws {
        let root = try repositoryRoot()
        let forbiddenPatterns: [(name: String, pattern: String)] = [
            ("literal app-domain suite", #"UserDefaults\s*\(\s*suiteName:\s*"io\.them\.them"\s*\)"#),
            ("unguarded domain suite write", #"UserDefaults\s*\(\s*suiteName:\s*domain\s*\)\?\.(set|synchronize)"#),
            ("unguarded domain suite binding", #"if\s+let\s+suite\s*=\s*UserDefaults\s*\(\s*suiteName:\s*domain\s*\)"#)
        ]
        let files = try swiftFiles(
            under: root,
            scopedTo: [
                "them"
            ]
        )
        var violations: [String] = []

        for file in files {
            let relative = relativePath(for: file, root: root)
            let source = try String(contentsOf: file, encoding: .utf8)
            for pattern in forbiddenPatterns where source.range(of: pattern.pattern, options: .regularExpression) != nil {
                violations.append("\(relative): \(pattern.name)")
            }
        }

        XCTAssertTrue(
            violations.isEmpty,
            """
            Opening UserDefaults suites with the app bundle identifier logs a runtime warning.
            Use UserDefaults.standard for the app domain, and only open suite defaults after guarding mirror domains.
            Violations:
            \(violations.sorted().joined(separator: "\n"))
            """
        )
    }

    private func repositoryRoot() throws -> URL {
        var cursor = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        while cursor.path != cursor.deletingLastPathComponent().path {
            if FileManager.default.fileExists(atPath: cursor.appendingPathComponent("AGENTS.md").path),
               FileManager.default.fileExists(atPath: cursor.appendingPathComponent("TASKS.md").path) {
                return cursor
            }
            cursor.deleteLastPathComponent()
        }
        throw XCTSkip("Repository root not found from \(#filePath).")
    }

    private func swiftFiles(under root: URL, scopedTo directories: [String]) throws -> [URL] {
        let fileManager = FileManager.default
        var files: [URL] = []
        for directory in directories {
            let base = root.appendingPathComponent(directory)
            guard let enumerator = fileManager.enumerator(
                at: base,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: [.skipsHiddenFiles]
            ) else {
                continue
            }
            for case let file as URL in enumerator where file.pathExtension == "swift" {
                let values = try file.resourceValues(forKeys: [.isRegularFileKey])
                if values.isRegularFile == true {
                    files.append(file)
                }
            }
        }
        return files
    }

    private func relativePath(for file: URL, root: URL) -> String {
        let rootPath = root.standardizedFileURL.path
        let filePath = file.standardizedFileURL.path
        guard filePath.hasPrefix(rootPath + "/") else { return filePath }
        return String(filePath.dropFirst(rootPath.count + 1))
    }
}
