import CryptoKit
import Darwin
import Foundation

nonisolated struct ScreenplayRecoveryOverflowSnapshot: Codable, Equatable, Sendable {
    static let schemaVersion = 2

    let schemaVersion: Int
    let recordID: String
    let ownerUserID: String
    let projectID: String
    let backendOrigin: String
    let documentID: String
    let draft: String
    let baseVersionID: String
    let savedAt: TimeInterval
    let savedAtBits: UInt64
    let contentDigest: String
}

private nonisolated struct ScreenplayRecoveryOverflowLocator: Codable, Equatable, Sendable {
    static let schemaVersion = 1

    let schemaVersion: Int
    let ownerUserID: String
    let projectID: String
    let backendOrigin: String
    let documentID: String
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

nonisolated enum ScreenplayRecoveryExclusivePromotionResult: Equatable, Sendable {
    case promoted
    case destinationExists
    case failed(Int32)
}

nonisolated enum ScreenplayRecoveryExclusiveCreationResult: Equatable, Sendable {
    case created
    case destinationExists
    case failed(Int32)
}

/// Creates and durably writes one file without ever replacing an existing
/// destination. This is also the no-clobber primitive used by the locator.
nonisolated enum ScreenplayRecoveryExclusiveFileCreation {
    static func create(_ data: Data, at url: URL) -> ScreenplayRecoveryExclusiveCreationResult {
        let descriptor = url.path.withCString { path in
            Darwin.open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, S_IRUSR | S_IWUSR)
        }
        guard descriptor >= 0 else {
            let code = errno
            return code == EEXIST ? .destinationExists : .failed(code)
        }
        defer { Darwin.close(descriptor) }

        let writeCode: Int32? = data.withUnsafeBytes { bytes in
            guard let baseAddress = bytes.baseAddress else { return nil }
            var written = 0
            while written < bytes.count {
                let count = Darwin.write(
                    descriptor,
                    baseAddress.advanced(by: written),
                    bytes.count - written
                )
                if count < 0 {
                    if errno == EINTR { continue }
                    return errno
                }
                guard count > 0 else { return EIO }
                written += count
            }
            return nil
        }
        if let writeCode { return .failed(writeCode) }
        return Darwin.fsync(descriptor) == 0 ? .created : .failed(errno)
    }
}

/// Darwin's exclusive rename is the canonical promotion primitive. Unlike
/// FileManager.moveItem, it cannot replace a destination that appears during
/// a competing rename.
nonisolated enum ScreenplayRecoveryExclusiveFilePromotion {
    static func promote(source: URL, destination: URL) -> ScreenplayRecoveryExclusivePromotionResult {
        let result = source.path.withCString { sourcePath in
            destination.path.withCString { destinationPath in
                renameatx_np(
                    AT_FDCWD,
                    sourcePath,
                    AT_FDCWD,
                    destinationPath,
                    UInt32(RENAME_EXCL)
                )
            }
        }
        guard result != 0 else { return .promoted }
        let code = errno
        return code == EEXIST ? .destinationExists : .failed(code)
    }
}

/// A bounded third recovery slot that older builds do not know how to remove.
///
/// Interrupted writes remain in origin-scope-addressable pending files. Relaunch
/// validates and promotes one logical record, while multiple distinct or
/// unreadable records block reuse without deleting any bytes.
@MainActor
struct ScreenplayRecoveryOverflowStore {
    static let maximumDraftBytes = 2 * 1024 * 1024
    static let maximumIdentityBytes = 64 * 1024

    private static let digestDomain = Data("io.them.screenplay-recovery-overflow.content.v2".utf8)
    private static let ownerPathDomain = Data("io.them.screenplay-recovery-overflow.owner-path.v1".utf8)
    private static let scopePathDomain = Data("io.them.screenplay-recovery-overflow.scope-path.v2".utf8)
    private static let locatorPathDomain = Data("io.them.screenplay-recovery-overflow.locator-path.v1".utf8)
    private static let locatorContentDomain = Data("io.them.screenplay-recovery-overflow.locator-content.v1".utf8)

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

    func load(
        ownerUserID: String,
        projectID: String,
        backendURL: URL,
        documentID: String
    ) -> ScreenplayRecoveryOverflowLoadResult {
        guard let scope = scope(
            ownerUserID: ownerUserID,
            projectID: projectID,
            backendURL: backendURL,
            documentID: documentID
        ) else {
            return .unconfirmed
        }
        switch existingScopeAvailability(scope) {
        case .missing:
            return .missing
        case .unconfirmed:
            return .unconfirmed
        case .available:
            return withProjectLock(scope.projectScope) {
                loadExactUnlocked(scope: scope, backfillLocator: true)
            } ?? .unconfirmed
        }
    }

    /// Finds the one overflow record for an owner/project/backend even when a
    /// later accepted project load rotated the local document identifier.
    func discover(
        ownerUserID: String,
        projectID: String,
        backendURL: URL
    ) -> ScreenplayRecoveryOverflowLoadResult {
        guard let projectScope = projectScope(
            ownerUserID: ownerUserID,
            projectID: projectID,
            backendURL: backendURL
        ) else { return .unconfirmed }
        switch existingScopeAvailability(projectScope) {
        case .missing:
            return .missing
        case .unconfirmed:
            return .unconfirmed
        case .available:
            return withProjectLock(projectScope) {
                discoverUnlocked(projectScope: projectScope, cleanStaleLocator: true)
            } ?? .unconfirmed
        }
    }

    func saveIfVacant(
        ownerUserID: String,
        projectID: String,
        backendURL: URL,
        documentID: String,
        draft: String,
        baseVersionID: String,
        savedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> ScreenplayRecoveryOverflowWriteResult {
        guard let scope = scope(
            ownerUserID: ownerUserID,
            projectID: projectID,
            backendURL: backendURL,
            documentID: documentID
        ),
              Self.validFieldSizes(
                ownerUserID: scope.ownerUserID,
                projectID: scope.projectID,
                backendOrigin: scope.backendOrigin,
                documentID: scope.documentID,
                draft: draft,
                baseVersionID: baseVersionID
              ),
              savedAt.isFinite else {
            return .unconfirmed
        }
        do {
            try fileManager.createDirectory(at: scope.directoryURL, withIntermediateDirectories: true)
            try enforceCompleteFileProtection(at: scope.rootURL)
            try enforceCompleteFileProtection(at: scope.directoryURL)
        } catch {
            return .unconfirmed
        }

        return withProjectLock(scope.projectScope) { () -> ScreenplayRecoveryOverflowWriteResult in
            switch prepareLocatorForSaveUnlocked(scope: scope) {
            case .ready:
                break
            case .occupied(let existing):
                return .occupied(existing)
            case .unconfirmed:
                return .unconfirmed
            }
            switch resolveUnlocked(scope: scope, attemptPromotion: true) {
            case .present(let existing):
                return Self.samePage(existing, draft: draft, baseVersionID: baseVersionID)
                    ? .present(existing)
                    : .occupied(existing)
            case .unconfirmed:
                return .unconfirmed
            case .missing:
                break
            }

            let snapshot = Self.makeSnapshot(
                scope: scope,
                draft: draft,
                baseVersionID: baseVersionID,
                savedAt: savedAt
            )
            let candidateURL = scope.candidateURL(recordID: snapshot.recordID)
            do {
                let data = try Self.encode(snapshot)
                try Self.writeExclusively(data, to: candidateURL)
                try enforceCompleteFileProtection(at: candidateURL)
                guard case .present(_, let decoded) = readState(
                    at: candidateURL,
                    scope: scope,
                    expectedRecordID: snapshot.recordID
                ), Self.exactlyMatches(decoded, snapshot) else {
                    return .unconfirmed
                }
            } catch {
                // A partial or valid candidate is project-addressable evidence.
                // Never delete it automatically; relaunch must inspect it.
                return .unconfirmed
            }

            switch resolveUnlocked(scope: scope, attemptPromotion: true) {
            case .present(let stored) where Self.exactlyMatches(stored, snapshot):
                return .stored(stored)
            case .present(let existing):
                return .occupied(existing)
            case .missing, .unconfirmed:
                return .unconfirmed
            }
        } ?? .unconfirmed
    }

    /// Deletes only the exact logical record previously presented. If any
    /// unreadable or distinct record shares the scope, every file is retained.
    func deleteIfMatching(
        ownerUserID: String,
        projectID: String,
        backendURL: URL,
        documentID: String,
        expected: ScreenplayRecoveryOverflowSnapshot
    ) -> ScreenplayRecoveryOverflowDeletionResult {
        guard let scope = scope(
            ownerUserID: ownerUserID,
            projectID: projectID,
            backendURL: backendURL,
            documentID: documentID
        ),
              Self.validate(expected, expectedScope: scope) else {
            return .changed
        }
        switch existingScopeAvailability(scope) {
        case .missing:
            return .missing
        case .unconfirmed:
            return .unconfirmed
        case .available:
            break
        }

        return withProjectLock(scope.projectScope) { () -> ScreenplayRecoveryOverflowDeletionResult in
            switch locatorState(projectScope: scope.projectScope) {
            case .missing:
                switch resolveUnlocked(scope: scope, attemptPromotion: true) {
                case .missing:
                    return .missing
                case .unconfirmed:
                    return .unconfirmed
                case .present:
                    guard createLocatorUnlocked(scope: scope) else { return .unconfirmed }
                }
            case .present(let locator):
                guard Self.exactString(locator.documentID, scope.documentID) else { return .changed }
            case .unreadable:
                return .unconfirmed
            }
            guard let currentInventory = inventory(scope: scope) else { return .unconfirmed }
            let states = currentInventory.allStates
            guard !states.contains(where: { $0.isUnreadable }) else { return .unconfirmed }
            let records = states.compactMap(\.record)
            guard !records.isEmpty else { return .missing }
            let matching = records.filter { Self.exactlyMatches($0.snapshot, expected) }
            guard !matching.isEmpty else { return .changed }
            guard matching.count == records.count else { return .changed }

            // Reopen and validate every path under the project lock immediately
            // before explicit deletion. Exact physical duplicates of the same
            // record are one logical writer choice and are removed together.
            let deletionOrder = matching.sorted {
                if $0.url == scope.fileURL { return false }
                if $1.url == scope.fileURL { return true }
                return $0.url.lastPathComponent < $1.url.lastPathComponent
            }
            for record in deletionOrder {
                guard case .present(_, let current) = readState(
                    at: record.url,
                    scope: scope,
                    expectedRecordID: record.url == scope.fileURL ? nil : expected.recordID
                ), Self.exactlyMatches(current, expected) else {
                    return .unconfirmed
                }
            }
            for record in deletionOrder {
                do {
                    try fileManager.removeItem(at: record.url)
                } catch {
                    return .unconfirmed
                }
            }

            guard let remaining = inventory(scope: scope) else { return .unconfirmed }
            if remaining.allStates.contains(where: { $0.isUnreadable }) { return .unconfirmed }
            guard remaining.allStates.compactMap(\.record).isEmpty else { return .changed }
            return removeLocatorIfMatchingUnlocked(scope: scope) ? .deleted : .unconfirmed
        } ?? .unconfirmed
    }

    private func loadExactUnlocked(
        scope: Scope,
        backfillLocator: Bool
    ) -> ScreenplayRecoveryOverflowLoadResult {
        let result = resolveUnlocked(scope: scope, attemptPromotion: true)
        guard case .present = result, backfillLocator else { return result }
        switch locatorState(projectScope: scope.projectScope) {
        case .missing:
            return createLocatorUnlocked(scope: scope) ? result : .unconfirmed
        case .present(let locator):
            if Self.exactString(locator.documentID, scope.documentID) { return result }
            switch locatedRecordUnlocked(projectScope: scope.projectScope, locator: locator) {
            case .missing:
                guard removeLocatorIfMatchingUnlocked(projectScope: scope.projectScope, locator: locator),
                      createLocatorUnlocked(scope: scope) else { return .unconfirmed }
                return result
            case .present, .unconfirmed:
                return .unconfirmed
            }
        case .unreadable:
            return .unconfirmed
        }
    }

    private func discoverUnlocked(
        projectScope: ProjectScope,
        cleanStaleLocator: Bool
    ) -> ScreenplayRecoveryOverflowLoadResult {
        switch locatorState(projectScope: projectScope) {
        case .missing:
            return .missing
        case .unreadable:
            return .unconfirmed
        case .present(let locator):
            let result = locatedRecordUnlocked(projectScope: projectScope, locator: locator)
            if case .missing = result, cleanStaleLocator {
                return removeLocatorIfMatchingUnlocked(projectScope: projectScope, locator: locator)
                    ? .missing
                    : .unconfirmed
            }
            return result
        }
    }

    private func locatedRecordUnlocked(
        projectScope: ProjectScope,
        locator: ScreenplayRecoveryOverflowLocator
    ) -> ScreenplayRecoveryOverflowLoadResult {
        guard let locatedScope = scope(projectScope: projectScope, documentID: locator.documentID) else {
            return .unconfirmed
        }
        return resolveUnlocked(scope: locatedScope, attemptPromotion: true)
    }

    private func prepareLocatorForSaveUnlocked(scope: Scope) -> LocatorPreparationResult {
        switch locatorState(projectScope: scope.projectScope) {
        case .missing:
            return createLocatorUnlocked(scope: scope) ? .ready : .unconfirmed
        case .unreadable:
            return .unconfirmed
        case .present(let locator):
            if Self.exactString(locator.documentID, scope.documentID) { return .ready }
            switch locatedRecordUnlocked(projectScope: scope.projectScope, locator: locator) {
            case .present(let existing):
                return .occupied(existing)
            case .unconfirmed:
                return .unconfirmed
            case .missing:
                guard removeLocatorIfMatchingUnlocked(projectScope: scope.projectScope, locator: locator),
                      createLocatorUnlocked(scope: scope) else { return .unconfirmed }
                return .ready
            }
        }
    }

    private func locatorState(projectScope: ProjectScope) -> LocatorState {
        do {
            let attributes = try fileManager.attributesOfItem(atPath: projectScope.locatorURL.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular else { return .unreadable }
            try enforceCompleteFileProtection(at: projectScope.locatorURL)
            let data = try Data(contentsOf: projectScope.locatorURL, options: .mappedIfSafe)
            let locator = try JSONDecoder().decode(ScreenplayRecoveryOverflowLocator.self, from: data)
            guard Self.validate(locator, expectedProjectScope: projectScope) else { return .unreadable }
            return .present(locator)
        } catch {
            return Self.isMissingFileError(error) ? .missing : .unreadable
        }
    }

    private func createLocatorUnlocked(scope: Scope) -> Bool {
        let locator = Self.makeLocator(scope: scope)
        do {
            let data = try Self.encode(locator)
            try Self.writeExclusively(data, to: scope.projectScope.locatorURL)
            try enforceCompleteFileProtection(at: scope.projectScope.locatorURL)
            try Self.synchronizeDirectory(scope.projectScope.directoryURL)
        } catch {
            guard case .present(let current) = locatorState(projectScope: scope.projectScope) else {
                return false
            }
            return Self.exactlyMatches(current, locator)
        }
        guard case .present(let current) = locatorState(projectScope: scope.projectScope) else {
            return false
        }
        return Self.exactlyMatches(current, locator)
    }

    private func removeLocatorIfMatchingUnlocked(scope: Scope) -> Bool {
        guard case .present(let locator) = locatorState(projectScope: scope.projectScope),
              Self.exactString(locator.documentID, scope.documentID) else { return false }
        return removeLocatorIfMatchingUnlocked(projectScope: scope.projectScope, locator: locator)
    }

    private func removeLocatorIfMatchingUnlocked(
        projectScope: ProjectScope,
        locator: ScreenplayRecoveryOverflowLocator
    ) -> Bool {
        guard case .present(let current) = locatorState(projectScope: projectScope),
              Self.exactlyMatches(current, locator) else { return false }
        do {
            try fileManager.removeItem(at: projectScope.locatorURL)
        } catch {
            return false
        }
        if case .missing = locatorState(projectScope: projectScope) { return true }
        return false
    }

    private func resolveUnlocked(
        scope: Scope,
        attemptPromotion: Bool
    ) -> ScreenplayRecoveryOverflowLoadResult {
        guard let inventory = inventory(scope: scope) else { return .unconfirmed }
        guard !inventory.allStates.contains(where: { $0.isUnreadable }) else {
            return .unconfirmed
        }
        let candidates = inventory.candidates.compactMap(\.record)

        if let canonical = inventory.canonical.record {
            guard candidates.allSatisfy({ Self.exactlyMatches($0.snapshot, canonical.snapshot) }) else {
                return .unconfirmed
            }
            return .present(canonical.snapshot)
        }

        guard let first = candidates.first else { return .missing }
        guard candidates.allSatisfy({ Self.exactlyMatches($0.snapshot, first.snapshot) }) else {
            return .unconfirmed
        }
        guard attemptPromotion else { return .present(first.snapshot) }

        switch ScreenplayRecoveryExclusiveFilePromotion.promote(
            source: first.url,
            destination: scope.fileURL
        ) {
        case .promoted, .destinationExists:
            return resolveUnlocked(scope: scope, attemptPromotion: false)
        case .failed:
            // The validated pending record remains directly recoverable even
            // when promotion is temporarily unavailable.
            return .present(first.snapshot)
        }
    }

    private func inventory(scope: Scope) -> Inventory? {
        let urls: [URL]
        do {
            urls = try fileManager.contentsOfDirectory(
                at: scope.directoryURL,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: []
            )
        } catch {
            return nil
        }

        let canonical: StoredFileState
        if urls.contains(where: { $0.lastPathComponent == scope.fileURL.lastPathComponent }) {
            canonical = readState(at: scope.fileURL, scope: scope, expectedRecordID: nil)
        } else {
            canonical = .missing
        }

        var candidates: [StoredFileState] = []
        for url in urls.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            guard url.lastPathComponent.hasPrefix(scope.candidatePrefix),
                  url.lastPathComponent.hasSuffix(".json") else { continue }
            guard let recordID = scope.candidateRecordID(from: url) else {
                candidates.append(.unreadable(url))
                continue
            }
            candidates.append(readState(at: url, scope: scope, expectedRecordID: recordID))
        }
        return Inventory(canonical: canonical, candidates: candidates)
    }

    private func readState(
        at url: URL,
        scope: Scope,
        expectedRecordID: String?
    ) -> StoredFileState {
        do {
            let attributes = try fileManager.attributesOfItem(atPath: url.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular else {
                return .unreadable(url)
            }
            try enforceCompleteFileProtection(at: url)
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            let snapshot = try JSONDecoder().decode(ScreenplayRecoveryOverflowSnapshot.self, from: data)
            guard Self.validate(snapshot, expectedScope: scope),
                  expectedRecordID.map({ Self.exactString(snapshot.recordID, $0) }) ?? true else {
                return .unreadable(url)
            }
            return .present(url, snapshot)
        } catch {
            return .unreadable(url)
        }
    }

    private func existingScopeAvailability(_ scope: Scope) -> ScopeAvailability {
        existingScopeAvailability(scope.projectScope)
    }

    private func existingScopeAvailability(_ scope: ProjectScope) -> ScopeAvailability {
        for url in [scope.rootURL, scope.directoryURL] {
            do {
                let attributes = try fileManager.attributesOfItem(atPath: url.path)
                guard attributes[.type] as? FileAttributeType == .typeDirectory else {
                    return .unconfirmed
                }
                try enforceCompleteFileProtection(at: url)
            } catch {
                return Self.isMissingFileError(error) ? .missing : .unconfirmed
            }
        }
        return .available
    }

    private func withProjectLock<T>(_ scope: ProjectScope, body: () -> T) -> T? {
        let descriptor = scope.lockURL.path.withCString { path in
            Darwin.open(path, O_RDWR | O_CREAT | O_CLOEXEC, S_IRUSR | S_IWUSR)
        }
        guard descriptor >= 0 else { return nil }
        defer { Darwin.close(descriptor) }
        guard Darwin.lockf(descriptor, F_TLOCK, 0) == 0 else { return nil }
        defer { _ = Darwin.lockf(descriptor, F_ULOCK, 0) }
        do {
            try enforceCompleteFileProtection(at: scope.lockURL)
        } catch {
            return nil
        }
        return body()
    }

    private func scope(
        ownerUserID: String,
        projectID: String,
        backendURL: URL,
        documentID: String
    ) -> Scope? {
        guard let projectScope = projectScope(
            ownerUserID: ownerUserID,
            projectID: projectID,
            backendURL: backendURL
        ) else { return nil }
        let document = documentID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !document.isEmpty, document.utf8.count <= Self.maximumIdentityBytes else { return nil }
        return scope(projectScope: projectScope, documentID: document)
    }

    private func scope(projectScope: ProjectScope, documentID: String) -> Scope? {
        let document = documentID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !document.isEmpty, document.utf8.count <= Self.maximumIdentityBytes else { return nil }
        let scopeDigest = Self.pathDigest(
            domain: Self.scopePathDomain,
            values: [projectScope.projectID, projectScope.backendOrigin, document]
        )
        return Scope(
            projectScope: projectScope,
            documentID: document,
            scopeDigest: scopeDigest,
            fileURL: projectScope.directoryURL.appendingPathComponent("\(scopeDigest).json", isDirectory: false)
        )
    }

    private func projectScope(
        ownerUserID: String,
        projectID: String,
        backendURL: URL
    ) -> ProjectScope? {
        guard let rootDirectory else { return nil }
        let owner = ScreenplayOwnerScopedStoragePolicy.normalizedOwnerID(ownerUserID)
        let project = projectID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let backendOrigin = Self.canonicalBackendOrigin(backendURL),
              !project.isEmpty,
              owner.utf8.count <= Self.maximumIdentityBytes,
              project.utf8.count <= Self.maximumIdentityBytes,
              backendOrigin.utf8.count <= Self.maximumIdentityBytes else { return nil }
        let ownerDigest = Self.pathDigest(domain: Self.ownerPathDomain, value: owner)
        let locatorDigest = Self.pathDigest(
            domain: Self.locatorPathDomain,
            values: [project, backendOrigin]
        )
        let directoryURL = rootDirectory.appendingPathComponent(ownerDigest, isDirectory: true)
        return ProjectScope(
            ownerUserID: owner,
            projectID: project,
            backendOrigin: backendOrigin,
            locatorDigest: locatorDigest,
            rootURL: rootDirectory,
            directoryURL: directoryURL,
            locatorURL: directoryURL.appendingPathComponent(".\(locatorDigest).locator.json", isDirectory: false),
            lockURL: directoryURL.appendingPathComponent(".\(locatorDigest).lock", isDirectory: false)
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

    private static func makeSnapshot(
        scope: Scope,
        draft: String,
        baseVersionID: String,
        savedAt: TimeInterval
    ) -> ScreenplayRecoveryOverflowSnapshot {
        let recordID = UUID().uuidString.lowercased()
        let savedAtBits = savedAt.bitPattern
        return ScreenplayRecoveryOverflowSnapshot(
            schemaVersion: ScreenplayRecoveryOverflowSnapshot.schemaVersion,
            recordID: recordID,
            ownerUserID: scope.ownerUserID,
            projectID: scope.projectID,
            backendOrigin: scope.backendOrigin,
            documentID: scope.documentID,
            draft: draft,
            baseVersionID: baseVersionID,
            savedAt: savedAt,
            savedAtBits: savedAtBits,
            contentDigest: contentDigest(
                ownerUserID: scope.ownerUserID,
                projectID: scope.projectID,
                backendOrigin: scope.backendOrigin,
                documentID: scope.documentID,
                recordID: recordID,
                draft: draft,
                baseVersionID: baseVersionID,
                savedAtBits: savedAtBits
            )
        )
    }

    private static func makeLocator(scope: Scope) -> ScreenplayRecoveryOverflowLocator {
        ScreenplayRecoveryOverflowLocator(
            schemaVersion: ScreenplayRecoveryOverflowLocator.schemaVersion,
            ownerUserID: scope.ownerUserID,
            projectID: scope.projectID,
            backendOrigin: scope.backendOrigin,
            documentID: scope.documentID,
            contentDigest: locatorDigest(
                ownerUserID: scope.ownerUserID,
                projectID: scope.projectID,
                backendOrigin: scope.backendOrigin,
                documentID: scope.documentID
            )
        )
    }

    private static func writeExclusively(_ data: Data, to url: URL) throws {
        switch ScreenplayRecoveryExclusiveFileCreation.create(data, at: url) {
        case .created:
            return
        case .destinationExists:
            throw posixError(EEXIST, path: url.path)
        case .failed(let code):
            throw posixError(code, path: url.path)
        }
    }

    private static func synchronizeDirectory(_ url: URL) throws {
        let descriptor = url.path.withCString { path in
            Darwin.open(path, O_RDONLY | O_CLOEXEC)
        }
        guard descriptor >= 0 else { throw posixError(errno, path: url.path) }
        defer { Darwin.close(descriptor) }
        guard Darwin.fsync(descriptor) == 0 else { throw posixError(errno, path: url.path) }
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
              exactString(snapshot.backendOrigin, expectedScope.backendOrigin),
              exactString(snapshot.documentID, expectedScope.documentID),
              snapshot.savedAt.isFinite,
              snapshot.savedAt.bitPattern == snapshot.savedAtBits,
              validFieldSizes(
                ownerUserID: snapshot.ownerUserID,
                projectID: snapshot.projectID,
                backendOrigin: snapshot.backendOrigin,
                documentID: snapshot.documentID,
                draft: snapshot.draft,
                baseVersionID: snapshot.baseVersionID
              ) else {
            return false
        }
        return exactString(snapshot.contentDigest, contentDigest(
            ownerUserID: snapshot.ownerUserID,
            projectID: snapshot.projectID,
            backendOrigin: snapshot.backendOrigin,
            documentID: snapshot.documentID,
            recordID: snapshot.recordID,
            draft: snapshot.draft,
            baseVersionID: snapshot.baseVersionID,
            savedAtBits: snapshot.savedAtBits
        ))
    }

    private static func validate(
        _ locator: ScreenplayRecoveryOverflowLocator,
        expectedProjectScope: ProjectScope
    ) -> Bool {
        guard locator.schemaVersion == ScreenplayRecoveryOverflowLocator.schemaVersion,
              exactString(locator.ownerUserID, expectedProjectScope.ownerUserID),
              exactString(locator.projectID, expectedProjectScope.projectID),
              exactString(locator.backendOrigin, expectedProjectScope.backendOrigin),
              !locator.documentID.isEmpty,
              locator.documentID.utf8.count <= maximumIdentityBytes else { return false }
        return exactString(locator.contentDigest, locatorDigest(
            ownerUserID: locator.ownerUserID,
            projectID: locator.projectID,
            backendOrigin: locator.backendOrigin,
            documentID: locator.documentID
        ))
    }

    private static func validFieldSizes(
        ownerUserID: String,
        projectID: String,
        backendOrigin: String,
        documentID: String,
        draft: String,
        baseVersionID: String
    ) -> Bool {
        ownerUserID.utf8.count <= maximumIdentityBytes &&
            projectID.utf8.count <= maximumIdentityBytes &&
            backendOrigin.utf8.count <= maximumIdentityBytes &&
            documentID.utf8.count <= maximumIdentityBytes &&
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
            exactString(lhs.backendOrigin, rhs.backendOrigin) &&
            exactString(lhs.documentID, rhs.documentID) &&
            exactString(lhs.draft, rhs.draft) &&
            exactString(lhs.baseVersionID, rhs.baseVersionID) &&
            lhs.savedAt.bitPattern == rhs.savedAt.bitPattern &&
            lhs.savedAtBits == rhs.savedAtBits &&
            exactString(lhs.contentDigest, rhs.contentDigest)
    }

    private static func exactlyMatches(
        _ lhs: ScreenplayRecoveryOverflowLocator,
        _ rhs: ScreenplayRecoveryOverflowLocator
    ) -> Bool {
        lhs.schemaVersion == rhs.schemaVersion &&
            exactString(lhs.ownerUserID, rhs.ownerUserID) &&
            exactString(lhs.projectID, rhs.projectID) &&
            exactString(lhs.backendOrigin, rhs.backendOrigin) &&
            exactString(lhs.documentID, rhs.documentID) &&
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

    private static func encode(_ locator: ScreenplayRecoveryOverflowLocator) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(locator)
    }

    private static func contentDigest(
        ownerUserID: String,
        projectID: String,
        backendOrigin: String,
        documentID: String,
        recordID: String,
        draft: String,
        baseVersionID: String,
        savedAtBits: UInt64
    ) -> String {
        var input = Data()
        appendLengthPrefixed(digestDomain, to: &input)
        for value in [ownerUserID, projectID, backendOrigin, documentID, recordID, draft, baseVersionID] {
            appendLengthPrefixed(Data(value.utf8), to: &input)
        }
        var bits = savedAtBits.bigEndian
        withUnsafeBytes(of: &bits) { input.append(contentsOf: $0) }
        return hexDigest(input)
    }

    private static func locatorDigest(
        ownerUserID: String,
        projectID: String,
        backendOrigin: String,
        documentID: String
    ) -> String {
        var input = Data()
        appendLengthPrefixed(locatorContentDomain, to: &input)
        for value in [ownerUserID, projectID, backendOrigin, documentID] {
            appendLengthPrefixed(Data(value.utf8), to: &input)
        }
        return hexDigest(input)
    }

    private static func pathDigest(domain: Data, value: String) -> String {
        pathDigest(domain: domain, values: [value])
    }

    private static func pathDigest(domain: Data, values: [String]) -> String {
        var input = Data()
        appendLengthPrefixed(domain, to: &input)
        for value in values {
            appendLengthPrefixed(Data(value.utf8), to: &input)
        }
        return hexDigest(input)
    }

    private static func canonicalBackendOrigin(_ url: URL) -> String? {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let rawScheme = components.scheme,
              let rawHost = components.host,
              components.user == nil,
              components.password == nil else { return nil }
        let scheme = rawScheme.lowercased()
        guard scheme == "http" || scheme == "https", !rawHost.isEmpty else { return nil }
        components.scheme = scheme
        components.host = rawHost.lowercased()
        if (scheme == "http" && components.port == 80) ||
            (scheme == "https" && components.port == 443) {
            components.port = nil
        }
        components.path = ""
        components.query = nil
        components.fragment = nil
        guard let origin = components.url?.absoluteString, !origin.isEmpty else { return nil }
        return origin
    }

    private static func appendLengthPrefixed(_ value: Data, to output: inout Data) {
        var count = UInt64(value.count).bigEndian
        withUnsafeBytes(of: &count) { output.append(contentsOf: $0) }
        output.append(value)
    }

    private static func hexDigest(_ value: Data) -> String {
        SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined()
    }

    private static func posixError(_ code: Int32, path: String) -> NSError {
        NSError(
            domain: NSPOSIXErrorDomain,
            code: Int(code),
            userInfo: [NSFilePathErrorKey: path]
        )
    }

    private static func isMissingFileError(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSCocoaErrorDomain &&
            [CocoaError.Code.fileNoSuchFile.rawValue, CocoaError.Code.fileReadNoSuchFile.rawValue]
                .contains(nsError.code)
    }

    #if DEBUG
    nonisolated static func removeAllForUITesting(fileManager: FileManager = .default) {
        guard let root = defaultRootDirectory(fileManager: fileManager) else { return }
        try? fileManager.removeItem(at: root)
    }
    #endif

    private nonisolated static func defaultRootDirectory(fileManager: FileManager) -> URL? {
        fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("io.them", isDirectory: true)
            .appendingPathComponent("ScreenplayRecoveryOverflow", isDirectory: true)
            .appendingPathComponent("v2", isDirectory: true)
    }

    private enum ScopeAvailability {
        case available
        case missing
        case unconfirmed
    }

    private enum LocatorState {
        case missing
        case present(ScreenplayRecoveryOverflowLocator)
        case unreadable
    }

    private enum LocatorPreparationResult {
        case ready
        case occupied(ScreenplayRecoveryOverflowSnapshot)
        case unconfirmed
    }

    private enum StoredFileState {
        case missing
        case present(URL, ScreenplayRecoveryOverflowSnapshot)
        case unreadable(URL)

        var record: StoredRecord? {
            guard case .present(let url, let snapshot) = self else { return nil }
            return StoredRecord(url: url, snapshot: snapshot)
        }

        var isUnreadable: Bool {
            if case .unreadable = self { return true }
            return false
        }
    }

    private struct StoredRecord {
        let url: URL
        let snapshot: ScreenplayRecoveryOverflowSnapshot
    }

    private struct Inventory {
        let canonical: StoredFileState
        let candidates: [StoredFileState]

        var allStates: [StoredFileState] { [canonical] + candidates }
    }

    private nonisolated struct ProjectScope: Sendable {
        let ownerUserID: String
        let projectID: String
        let backendOrigin: String
        let locatorDigest: String
        let rootURL: URL
        let directoryURL: URL
        let locatorURL: URL
        let lockURL: URL
    }

    private nonisolated struct Scope: Sendable {
        let projectScope: ProjectScope
        let documentID: String
        let scopeDigest: String
        let fileURL: URL

        var ownerUserID: String { projectScope.ownerUserID }
        var projectID: String { projectScope.projectID }
        var backendOrigin: String { projectScope.backendOrigin }
        var rootURL: URL { projectScope.rootURL }
        var directoryURL: URL { projectScope.directoryURL }

        var candidatePrefix: String { ".\(scopeDigest).pending." }

        func candidateURL(recordID: String) -> URL {
            directoryURL.appendingPathComponent("\(candidatePrefix)\(recordID).json", isDirectory: false)
        }

        func candidateRecordID(from url: URL) -> String? {
            let name = url.lastPathComponent
            guard name.hasPrefix(candidatePrefix), name.hasSuffix(".json") else { return nil }
            let start = name.index(name.startIndex, offsetBy: candidatePrefix.count)
            let end = name.index(name.endIndex, offsetBy: -".json".count)
            let value = String(name[start..<end])
            guard let uuid = UUID(uuidString: value), value == uuid.uuidString.lowercased() else { return nil }
            return value
        }
    }
}
