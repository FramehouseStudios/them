import Foundation

#if DEBUG
extension ScreenplayLiveDraftFileStore {
    nonisolated static func resetStoredDraftsForUITesting(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        fileManager: FileManager = .default
    ) throws {
        guard arguments.contains("--ui-testing"),
              arguments.contains("--ui-reset-state"),
              !arguments.contains("--ui-preserve-state") else { return }
        let directory = draftURL(ownerUserID: nil, fileManager: fileManager).deletingLastPathComponent()
        guard fileManager.fileExists(atPath: directory.path) else { return }
        let files = try fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey]
        )
        for file in files {
            let name = file.lastPathComponent
            let isOwnerScopedJournal = name.range(
                of: #"^live-screenplay-draft\.owner\.[A-Za-z0-9_-]+\.fountain$"#,
                options: .regularExpression
            ) != nil
            guard name == fileName || isOwnerScopedJournal else { continue }
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true else { continue }
            try fileManager.removeItem(at: file)
        }
    }
}
#endif
