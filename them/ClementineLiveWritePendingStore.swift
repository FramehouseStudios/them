import CryptoKit
import Foundation

/// Crash-recovery journal for raw spoken passages that have not yet reached
/// the authoritative screenplay draft. Files are owner/project scoped, kept
/// out of backups, and use complete file protection on iOS.
struct ClementineLiveWritePendingStore {
    private let directoryURL: URL
    private let fileManager: FileManager

    init(directoryURL: URL? = nil, fileManager: FileManager = .default) {
        self.fileManager = fileManager
        self.directoryURL = directoryURL ?? Self.defaultDirectory(fileManager: fileManager)
    }

    func load(scope: ClementineLiveWriteScope) -> [ClementineLiveWriteRenderQueue.Chunk] {
        guard let url = fileURL(scope: scope), let data = try? Data(contentsOf: url) else { return [] }
        return (try? JSONDecoder().decode([ClementineLiveWriteRenderQueue.Chunk].self, from: data)) ?? []
    }

    @discardableResult
    func save(_ chunks: [ClementineLiveWriteRenderQueue.Chunk], scope: ClementineLiveWriteScope) -> Bool {
        guard let url = fileURL(scope: scope) else { return false }
        guard !chunks.isEmpty else {
            guard fileManager.fileExists(atPath: url.path) else { return true }
            do { try fileManager.removeItem(at: url); return true } catch { return false }
        }
        guard let data = try? JSONEncoder().encode(chunks) else { return false }
        do {
            try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)
            var options: Data.WritingOptions = [.atomic]
            #if os(iOS)
            options.insert(.completeFileProtection)
            #endif
            try data.write(to: url, options: options)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var protectedURL = url
            try protectedURL.setResourceValues(values)
            return true
        } catch {
            // The in-memory queue remains authoritative when journaling fails.
            return false
        }
    }

    private func fileURL(scope: ClementineLiveWriteScope) -> URL? {
        guard let suffix = scope.storageKeySuffix else { return nil }
        let digest = SHA256.hash(data: Data(suffix.utf8)).map { String(format: "%02x", $0) }.joined()
        return directoryURL.appendingPathComponent("pending-\(digest).json", isDirectory: false)
    }

    private static func defaultDirectory(fileManager: FileManager) -> URL {
        let base = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        return base.appendingPathComponent("io.them/LiveWritePending", isDirectory: true)
    }
}
