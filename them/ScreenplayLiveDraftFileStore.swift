import Foundation
import OSLog

nonisolated struct ScreenplayLiveDraftFileStore {
    private static let directoryName = "io.them"
    private static let fileName = "live-screenplay-draft.fountain"

    static func restoredDraft(
        ownerUserID: String? = nil,
        fileManager: FileManager = .default
    ) -> String {
        guard let data = try? Data(contentsOf: draftURL(ownerUserID: ownerUserID, fileManager: fileManager)),
              let draft = String(data: data, encoding: .utf8) else {
            return ""
        }
        return ScreenplayLiveDraftTextPersistencePolicy.restoredDraft(from: draft)
    }

    /// True only after a nonempty draft's atomic write succeeds. Empty-input
    /// cleanup retains its existing behavior and is not a stored draft.
    @discardableResult
    static func persist(
        _ draft: String?,
        ownerUserID: String? = nil,
        fileManager: FileManager = .default
    ) -> Bool {
        let url = draftURL(ownerUserID: ownerUserID, fileManager: fileManager)
        guard let draft = ScreenplayLiveDraftTextPersistencePolicy.draftForStorage(draft ?? "") else {
            try? fileManager.removeItem(at: url)
            return false
        }
        do {
            try fileManager.createDirectory(
                at: url.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try Data(draft.utf8).write(to: url, options: .atomic)
            return true
        } catch {
            Logger(subsystem: "io.them.them", category: "ui")
                .error("Live screenplay draft journal write failed: \(error.localizedDescription)")
            return false
        }
    }

    static func remove(ownerUserID: String? = nil, fileManager: FileManager = .default) {
        try? fileManager.removeItem(at: draftURL(ownerUserID: ownerUserID, fileManager: fileManager))
    }

    #if DEBUG
    /// Deletes every live draft journal, including the owner-scoped files that
    /// `remove()` cannot name without knowing each owner. The UI-test reset
    /// must use this: a signed-out run writes the anonymous-owner journal, and
    /// leaving it behind seeds the next launch's "empty" Studio with the
    /// previous test's page.
    nonisolated static func removeAllForUITesting(fileManager: FileManager = .default) {
        removeAllForUITesting(
            in: storageDirectory(fileManager: fileManager),
            fileManager: fileManager
        )
    }

    nonisolated static func removeAllForUITesting(in directory: URL, fileManager: FileManager = .default) {
        guard let entries = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else { return }
        for entry in entries where isLiveDraftJournal(entry) {
            try? fileManager.removeItem(at: entry)
        }
    }

    nonisolated static func isLiveDraftJournal(_ url: URL) -> Bool {
        let name = url.lastPathComponent
        let baseName = fileName.replacingOccurrences(of: ".fountain", with: "")
        return name.hasSuffix(".fountain")
            && (name == fileName || name.hasPrefix(baseName + "."))
    }
    #endif

    static func migrateDraftIfNeeded(
        from sourceOwnerUserID: String?,
        to destinationOwnerUserID: String,
        fileManager: FileManager = .default
    ) {
        let destinationURL = draftURL(ownerUserID: destinationOwnerUserID, fileManager: fileManager)
        guard !fileManager.fileExists(atPath: destinationURL.path) else { return }
        let sourceDraft = restoredDraft(ownerUserID: sourceOwnerUserID, fileManager: fileManager)
        guard !sourceDraft.isEmpty else { return }
        guard persist(sourceDraft, ownerUserID: destinationOwnerUserID, fileManager: fileManager) else { return }
        if sourceOwnerUserID == nil {
            remove(fileManager: fileManager)
        }
    }

    private static func storageDirectory(fileManager: FileManager) -> URL {
        let applicationSupport = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? fileManager.temporaryDirectory
        return applicationSupport.appendingPathComponent(directoryName, isDirectory: true)
    }

    private static func draftURL(ownerUserID: String?, fileManager: FileManager) -> URL {
        let resolvedFileName: String
        if let ownerUserID {
            resolvedFileName = ScreenplayOwnerScopedStoragePolicy.storageKey(
                baseKey: "live-screenplay-draft",
                ownerUserID: ownerUserID
            ) + ".fountain"
        } else {
            resolvedFileName = fileName
        }
        return storageDirectory(fileManager: fileManager)
            .appendingPathComponent(resolvedFileName, isDirectory: false)
    }
}
