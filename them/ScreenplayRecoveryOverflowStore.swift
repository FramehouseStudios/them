import CryptoKit
import Foundation

nonisolated struct ScreenplayRecoveryOverflowSnapshot: Codable, Equatable, Sendable {
    static let schemaVersion = 1

    let schemaVersion: Int
    let recordID: String
    let ownerUserID: String
    let projectID: String
    let draft: String
    let baseVersionID: String
    let savedAt: TimeInterval
    let savedAtBits: UInt64
    let contentDigest: String
}

nonisolated enum ScreenplayRecoveryOverflowLoadResult: Equatable, Sendable {
    case missing
    case present(ScreenplayRecoveryOverflowSnapshot)
    case unconfirmed
}

nonisolated enum ScreenplayRecoveryOverflowWriteResult: Equatable, Sendable {
    case present(ScreenplayRecoveryOverflowSnapshot)
    case stored(ScreenplayRecoveryOverflowSnapshot)
    case occupied(ScreenplayRecoveryOverflowSnapshot)
    case unconfirmed
}

nonisolated enum ScreenplayRecoveryOverflowDeletionResult: Equatable, Sendable {
    case deleted
    case missing
    case changed
    case unconfirmed
}

/// A bounded third recovery slot that older builds do not know how to remove.
///
/// The canonical file is never replaced. A distinct valid file, a corrupt file,
/// or a temporarily unreadable protected file all block reuse. Writes use a
/// same-directory candidate and a vacant-only move so a racing writer cannot
/// replace an already committed recovery copy.
@MainActor
struct ScreenplayRecoveryOverflowStore {
    static let maximumDraftBytes = 2 * 1024 * 1024
    static let maximumIdentityBytes = 64 * 1024

    private static let digestDomain = Data("io.them.screenplay-recovery-overflow.content.v1".utf8)
    private static let ownerPathDomain = Data("io.them.screenplay-recovery-overflow.owner-path.v1".utf8)
    private static let projectPathDomain = Data("io.them.screenplay-recovery-overflow.project-path.v1".utf8)

    private let rootDirectory: URL?
    private let fileManager: FileManager
    private let fileProtectionEnforcer: ((URL) throws -> Void)?

    init(
        fileManager: FileManager = .default,
        fileProtectionEnforcer: ((URL) throws -> Void)? = nil
    ) {
        self.rootDirectory = Self.defaultRootDirectory(fileManager: fileManager)
        self.fileManager = fileManager
        self.fileProtectionEnforcer = fileProtectionEnforcer
    }

    init(
        rootDirectory: URL,
        fileManager: FileManager = .default,
        fileProtectionEnforcer: ((URL) throws -> Void)? = nil
    ) {
        self.rootDirectory = rootDirectory
        self.fileManager = fileManager
        self.fileProtectionEnforcer = fileProtectionEnforcer
    }

    func load(ownerUserID: String, projectID: String) -> ScreenplayRecoveryOverflowLoadResult {
        guard let scope = scope(ownerUserID: ownerUserID, projectID: projectID) else {
            return .unconfirmed
        }
        return load(scope: scope)
    }

    func saveIfVacant(
        ownerUserID: String,
        projectID: String,
        draft: String,
        baseVersionID: String,
        savedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> ScreenplayRecoveryOverflowWriteResult {
        guard let scope = scope(ownerUserID: ownerUserID, projectID: projectID),
              Self.validFieldSizes(
                ownerUserID: scope.ownerUserID,
                projectID: scope.projectID,
                draft: draft,
                baseVersionID: baseVersionID
              ),
              savedAt.isFinite else {
            return .unconfirmed
        }

        switch load(scope: scope) {
        case .present(let existing):
            return Self.samePage(existing, draft: draft, baseVersionID: baseVersionID)
                ? .present(existing)
                : .occupied(existing)
        case .unconfirmed:
            return .unconfirmed
        case .missing:
            break
        }

        let recordID = UUID().uuidString.lowercased()
        let savedAtBits = savedAt.bitPattern
        let digest = Self.contentDigest(
            ownerUserID: scope.ownerUserID,
            projectID: scope.projectID,
            recordID: recordID,
            draft: draft,
            baseVersionID: baseVersionID,
            savedAtBits: savedAtBits
        )
        let snapshot = ScreenplayRecoveryOverflowSnapshot(
            schemaVersion: ScreenplayRecoveryOverflowSnapshot.schemaVersion,
            recordID: recordID,
            ownerUserID: scope.ownerUserID,
            projectID: scope.projectID,
            draft: draft,
            baseVersionID: baseVersionID,
            savedAt: savedAt,
            savedAtBits: savedAtBits,
            contentDigest: digest
        )

        do {
            let data = try Self.encode(snapshot)
            try fileManager.createDirectory(at: scope.directoryURL, withIntermediateDirectories: true)
            try enforceCompleteFileProtection(at: scope.rootURL)
            try enforceCompleteFileProtection(at: scope.directoryURL)

            let candidateURL = scope.directoryURL.appendingPathComponent(
                ".overflow-\(UUID().uuidString.lowercased()).json",
                isDirectory: false
            )
            defer { try? fileManager.removeItem(at: candidateURL) }

            #if os(iOS)
            try data.write(to: candidateURL, options: [.atomic, .completeFileProtection])
            #else
            try data.write(to: candidateURL, options: .atomic)
            #endif
            try enforceCompleteFileProtection(at: candidateURL)
            let candidateData = try Data(contentsOf: candidateURL, options: .mappedIfSafe)
            guard candidateData == data,
                  let decoded = try? JSONDecoder().decode(
                    ScreenplayRecoveryOverflowSnapshot.self,
                    from: candidateData
                  ),
                  Self.validate(decoded, expectedScope: scope),
                  Self.exactlyMatches(decoded, snapshot) else {
                return .unconfirmed
            }

            do {
                // moveItem is intentionally used instead of replaceItemAt: a
                // committed recovery copy must never be overwritten.
                try fileManager.moveItem(at: candidateURL, to: scope.fileURL)
            } catch {
                return resultAfterContendedWrite(
                    scope: scope,
                    draft: draft,
                    baseVersionID: baseVersionID
                )
            }

            switch load(scope: scope) {
            case .present(let stored) where Self.exactlyMatches(stored, snapshot):
                return .stored(stored)
            case .present:
                return .unconfirmed
            case .missing, .unconfirmed:
                return .unconfirmed
            }
        } catch {
            return .unconfirmed
        }
    }

    /// Deletes only the exact record previously presented to the writer.
    /// Main-actor isolation serializes all in-process operations; this is not
    /// a cross-process file-locking protocol.
    func deleteIfMatching(
        ownerUserID: String,
        projectID: String,
        expected: ScreenplayRecoveryOverflowSnapshot
    ) -> ScreenplayRecoveryOverflowDeletionResult {
        guard let scope = scope(ownerUserID: ownerUserID, projectID: projectID),
              Self.validate(expected, expectedScope: scope) else {
            return .changed
        }

        switch load(scope: scope) {
        case .missing:
            return .missing
        case .unconfirmed:
            return .unconfirmed
        case .present(let stored):
            guard Self.exactlyMatches(stored, expected) else { return .changed }
        }

        do {
            try fileManager.removeItem(at: scope.fileURL)
        } catch {
            return Self.isMissingFileError(error) ? .missing : .unconfirmed
        }

        switch load(scope: scope) {
        case .missing:
            return .deleted
        case .present:
            return .changed
        case .unconfirmed:
            return .unconfirmed
        }
    }

    private func resultAfterContendedWrite(
        scope: Scope,
        draft: String,
        baseVersionID: String
    ) -> ScreenplayRecoveryOverflowWriteResult {
        switch load(scope: scope) {
        case .present(let existing):
            return Self.samePage(existing, draft: draft, baseVersionID: baseVersionID)
                ? .present(existing)
                : .occupied(existing)
        case .missing, .unconfirmed:
            return .unconfirmed
        }
    }

    private func load(scope: Scope) -> ScreenplayRecoveryOverflowLoadResult {
        do {
            let attributes = try fileManager.attributesOfItem(atPath: scope.fileURL.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular else {
                return .unconfirmed
            }
            try enforceCompleteFileProtection(at: scope.rootURL)
            try enforceCompleteFileProtection(at: scope.directoryURL)
            try enforceCompleteFileProtection(at: scope.fileURL)
            let data = try Data(contentsOf: scope.fileURL, options: .mappedIfSafe)
            let snapshot = try JSONDecoder().decode(ScreenplayRecoveryOverflowSnapshot.self, from: data)
            guard Self.validate(snapshot, expectedScope: scope) else { return .unconfirmed }
            return .present(snapshot)
        } catch {
            return Self.isMissingFileError(error) ? .missing : .unconfirmed
        }
    }

    private func scope(ownerUserID: String, projectID: String) -> Scope? {
        guard let rootDirectory else { return nil }
        let owner = ScreenplayOwnerScopedStoragePolicy.normalizedOwnerID(ownerUserID)
        let project = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !project.isEmpty,
              owner.utf8.count <= Self.maximumIdentityBytes,
              project.utf8.count <= Self.maximumIdentityBytes else {
            return nil
        }
        let ownerDigest = Self.pathDigest(domain: Self.ownerPathDomain, value: owner)
        let projectDigest = Self.pathDigest(domain: Self.projectPathDomain, value: project)
        let directoryURL = rootDirectory.appendingPathComponent(ownerDigest, isDirectory: true)
        return Scope(
            ownerUserID: owner,
            projectID: project,
            rootURL: rootDirectory,
            directoryURL: directoryURL,
            fileURL: directoryURL.appendingPathComponent("\(projectDigest).json", isDirectory: false)
        )
    }

    private func enforceCompleteFileProtection(at url: URL) throws {
        if let fileProtectionEnforcer {
            try fileProtectionEnforcer(url)
            return
        }

        #if os(iOS) && !targetEnvironment(simulator) && !targetEnvironment(macCatalyst)
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: url.path
        )
        let attributes = try fileManager.attributesOfItem(atPath: url.path)
        let protection = (attributes[.protectionKey] as? FileProtectionType)?.rawValue
            ?? attributes[.protectionKey] as? String
        guard protection == FileProtectionType.complete.rawValue else {
            throw CocoaError(.fileWriteUnknown, userInfo: [
                NSFilePathErrorKey: url.path,
                NSLocalizedDescriptionKey: "Complete file protection could not be verified.",
            ])
        }
        #endif
    }

    private static func validate(
        _ snapshot: ScreenplayRecoveryOverflowSnapshot,
        expectedScope: Scope
    ) -> Bool {
        guard snapshot.schemaVersion == ScreenplayRecoveryOverflowSnapshot.schemaVersion,
              let recordUUID = UUID(uuidString: snapshot.recordID),
              snapshot.recordID == recordUUID.uuidString.lowercased(),
              exactString(snapshot.ownerUserID, expectedScope.ownerUserID),
              exactString(snapshot.projectID, expectedScope.projectID),
              snapshot.savedAt.isFinite,
              snapshot.savedAt.bitPattern == snapshot.savedAtBits,
              validFieldSizes(
                ownerUserID: snapshot.ownerUserID,
                projectID: snapshot.projectID,
                draft: snapshot.draft,
                baseVersionID: snapshot.baseVersionID
              ) else {
            return false
        }
        return snapshot.contentDigest == contentDigest(
            ownerUserID: snapshot.ownerUserID,
            projectID: snapshot.projectID,
            recordID: snapshot.recordID,
            draft: snapshot.draft,
            baseVersionID: snapshot.baseVersionID,
            savedAtBits: snapshot.savedAtBits
        )
    }

    private static func validFieldSizes(
        ownerUserID: String,
        projectID: String,
        draft: String,
        baseVersionID: String
    ) -> Bool {
        ownerUserID.utf8.count <= maximumIdentityBytes &&
            projectID.utf8.count <= maximumIdentityBytes &&
            draft.utf8.count <= maximumDraftBytes &&
            baseVersionID.utf8.count <= maximumIdentityBytes
    }

    private static func samePage(
        _ snapshot: ScreenplayRecoveryOverflowSnapshot,
        draft: String,
        baseVersionID: String
    ) -> Bool {
        exactString(snapshot.draft, draft) && exactString(snapshot.baseVersionID, baseVersionID)
    }

    private static func exactlyMatches(
        _ lhs: ScreenplayRecoveryOverflowSnapshot,
        _ rhs: ScreenplayRecoveryOverflowSnapshot
    ) -> Bool {
        lhs.schemaVersion == rhs.schemaVersion &&
            exactString(lhs.recordID, rhs.recordID) &&
            exactString(lhs.ownerUserID, rhs.ownerUserID) &&
            exactString(lhs.projectID, rhs.projectID) &&
            exactString(lhs.draft, rhs.draft) &&
            exactString(lhs.baseVersionID, rhs.baseVersionID) &&
            lhs.savedAt.bitPattern == rhs.savedAt.bitPattern &&
            lhs.savedAtBits == rhs.savedAtBits &&
            exactString(lhs.contentDigest, rhs.contentDigest)
    }

    private static func exactString(_ lhs: String, _ rhs: String) -> Bool {
        lhs.utf8.elementsEqual(rhs.utf8)
    }

    private static func encode(_ snapshot: ScreenplayRecoveryOverflowSnapshot) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(snapshot)
    }

    private static func contentDigest(
        ownerUserID: String,
        projectID: String,
        recordID: String,
        draft: String,
        baseVersionID: String,
        savedAtBits: UInt64
    ) -> String {
        var input = Data()
        appendLengthPrefixed(digestDomain, to: &input)
        for value in [ownerUserID, projectID, recordID, draft, baseVersionID] {
            appendLengthPrefixed(Data(value.utf8), to: &input)
        }
        var bits = savedAtBits.bigEndian
        withUnsafeBytes(of: &bits) { input.append(contentsOf: $0) }
        return hexDigest(input)
    }

    private static func pathDigest(domain: Data, value: String) -> String {
        var input = Data()
        appendLengthPrefixed(domain, to: &input)
        appendLengthPrefixed(Data(value.utf8), to: &input)
        return hexDigest(input)
    }

    private static func appendLengthPrefixed(_ value: Data, to output: inout Data) {
        var count = UInt64(value.count).bigEndian
        withUnsafeBytes(of: &count) { output.append(contentsOf: $0) }
        output.append(value)
    }

    private static func hexDigest(_ value: Data) -> String {
        SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined()
    }

    private static func isMissingFileError(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSCocoaErrorDomain &&
            [CocoaError.Code.fileNoSuchFile.rawValue, CocoaError.Code.fileReadNoSuchFile.rawValue]
                .contains(nsError.code)
    }

    private static func defaultRootDirectory(fileManager: FileManager) -> URL? {
        fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("io.them", isDirectory: true)
            .appendingPathComponent("ScreenplayRecoveryOverflow", isDirectory: true)
            .appendingPathComponent("v1", isDirectory: true)
    }

    private nonisolated struct Scope: Sendable {
        let ownerUserID: String
        let projectID: String
        let rootURL: URL
        let directoryURL: URL
        let fileURL: URL
    }
}
