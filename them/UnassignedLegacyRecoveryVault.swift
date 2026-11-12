import CryptoKit
import Darwin
import Foundation

nonisolated enum UnassignedLegacyRecoverySlot: String, Codable, Equatable, Sendable {
    case ordinary
    case preservedConflict = "preserved_conflict"
    case malformedSource = "malformed_source"
    case draftSaveOutbox = "draft_save_outbox"
}

nonisolated enum UnassignedLegacyRecoveryEncoding: String, Codable, Equatable, Sendable {
    case binaryPropertyList = "binary_property_list"
    case opaque
    case draftSaveJSON = "draft_save_json_v1"
}

/// Input is deliberately origin-free. Owner, project, and storage-key values
/// are historical hints for inventory only; none grants backend authority.
nonisolated struct UnassignedLegacyRecoverySource: Equatable, Sendable {
    let ownerHint: String
    let projectHint: String
    let legacyStorageKeyHint: String
    let slot: UnassignedLegacyRecoverySlot
    let encoding: UnassignedLegacyRecoveryEncoding
    let payload: Data

    init(
        ownerHint: String,
        projectHint: String,
        legacyStorageKeyHint: String,
        slot: UnassignedLegacyRecoverySlot,
        encoding: UnassignedLegacyRecoveryEncoding,
        payload: Data
    ) {
        self.ownerHint = ownerHint
        self.projectHint = projectHint
        self.legacyStorageKeyHint = legacyStorageKeyHint
        self.slot = slot
        self.encoding = encoding
        self.payload = payload
    }

    static func propertyList(
        ownerHint: String,
        projectHint: String,
        legacyStorageKeyHint: String,
        slot: UnassignedLegacyRecoverySlot,
        candidate: [String: Any]
    ) throws -> Self {
        let expectedKeys = Set(["draft", "baseVersionId", "dirty", "savedAt"])
        guard Set(candidate.keys) == expectedKeys,
              let draft = candidate["draft"] as? String,
              let baseVersionID = candidate["baseVersionId"] as? String,
              let dirty = candidate["dirty"] as? Bool,
              let savedAt = candidate["savedAt"] as? TimeInterval,
              savedAt.isFinite else { throw UnassignedLegacyRecoverySourceError.invalidCandidate }
        let encoder = PropertyListEncoder()
        encoder.outputFormat = .binary
        let payload = try encoder.encode(CanonicalUnassignedLegacyCandidate(
            draft: draft,
            baseVersionId: baseVersionID,
            dirty: dirty,
            savedAt: savedAt
        ))
        return Self(
            ownerHint: ownerHint,
            projectHint: projectHint,
            legacyStorageKeyHint: legacyStorageKeyHint,
            slot: slot,
            encoding: .binaryPropertyList,
            payload: payload
        )
    }
}

private nonisolated struct CanonicalUnassignedLegacyCandidate: Codable, Sendable {
    let draft: String
    let baseVersionId: String
    let dirty: Bool
    let savedAt: TimeInterval
}

private nonisolated enum UnassignedLegacyRecoverySourceError: Error {
    case invalidCandidate
}

nonisolated struct UnassignedLegacyRecoveryDescriptor: Codable, Equatable, Sendable {
    let recordID: String
    let provenance: String
    let ownerHint: String
    let projectHint: String
    let legacyStorageKeyHint: String
    let slot: UnassignedLegacyRecoverySlot
    let encoding: UnassignedLegacyRecoveryEncoding
    let capturedAt: TimeInterval
    let sourceByteCount: Int
    let contentDigest: String
}

nonisolated enum UnassignedDeviceRecoveryPolicy {
    static func allows(slot: UnassignedLegacyRecoverySlot, ownerHint: String, storageKey: String) -> Bool {
        guard ownerHint.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        if slot == .draftSaveOutbox { return storageKey == "screenplay-draft-save-outbox" }
        return storageKey == "screenplay.studio.localDraftRecovery.v1"
    }

    static func allows(_ descriptor: UnassignedLegacyRecoveryDescriptor) -> Bool {
        allows(slot: descriptor.slot, ownerHint: descriptor.ownerHint, storageKey: descriptor.legacyStorageKeyHint)
    }

    static func allows(_ source: UnassignedLegacyRecoverySource) -> Bool {
        allows(slot: source.slot, ownerHint: source.ownerHint, storageKey: source.legacyStorageKeyHint)
    }
}

nonisolated struct UnassignedLegacyRecoveryDecodedFields: Equatable, Sendable {
    let draftUTF8: Data
    let baseVersionUTF8: Data
    let dirty: Bool
    let savedAt: TimeInterval
    let savedAtBits: UInt64
}

nonisolated struct UnassignedLegacyRecoveryRecord: Equatable, Sendable {
    let descriptor: UnassignedLegacyRecoveryDescriptor
    let sourcePayload: Data
    let decodedFields: UnassignedLegacyRecoveryDecodedFields?
}

nonisolated struct UnassignedLegacyRecoveryInventory: Equatable, Sendable {
    let records: [UnassignedLegacyRecoveryDescriptor]
    /// Includes interrupted candidates, corrupt JSON, and unexpected files.
    /// They are retained and must not be interpreted as absence.
    let unconfirmedEvidenceCount: Int
}

nonisolated struct UnassignedLegacyRecoveryExportArtifact: Equatable, Sendable {
    let recordID: String
    let filename: String
    let mimeType: String
    let data: Data
    let contentDigest: String
}

nonisolated enum UnassignedLegacyRecoveryPreservationResult: Equatable, Sendable {
    /// The vault copy was created, reopened, and byte-verified. The caller may
    /// now make its own exact source-removal decision; this store never does.
    case verified(UnassignedLegacyRecoveryDescriptor)
    case alreadyVerified(UnassignedLegacyRecoveryDescriptor)
    case unconfirmed
}

nonisolated enum UnassignedLegacyRecoveryInventoryResult: Equatable, Sendable {
    case missing
    case available(UnassignedLegacyRecoveryInventory)
    case unconfirmed
}

nonisolated enum UnassignedLegacyRecoveryRevealResult: Equatable, Sendable {
    case missing
    case present(UnassignedLegacyRecoveryRecord)
    case unconfirmed
}

nonisolated enum UnassignedLegacyRecoveryExportResult: Equatable, Sendable {
    case missing
    case available(UnassignedLegacyRecoveryExportArtifact)
    case unconfirmed
}

private nonisolated struct UnassignedLegacyRecoveryEnvelope: Codable, Equatable, Sendable {
    static let schemaVersion = 1
    static let provenance = "unassigned_legacy_origin"

    let schemaVersion: Int
    let recordID: String
    let provenance: String
    let ownerHint: String
    let projectHint: String
    let legacyStorageKeyHint: String
    let slot: UnassignedLegacyRecoverySlot
    let encoding: UnassignedLegacyRecoveryEncoding
    let sourcePayload: Data
    let capturedAt: TimeInterval
    let capturedAtBits: UInt64
    let contentDigest: String
}

private nonisolated struct UnassignedLegacyRecoveryExportEnvelope: Codable, Sendable {
    static let schemaVersion = 1

    let schemaVersion: Int
    let provenance: String
    let warning: String
    let recordID: String
    let ownerHint: String
    let projectHint: String
    let legacyStorageKeyHint: String
    let slot: UnassignedLegacyRecoverySlot
    let encoding: UnassignedLegacyRecoveryEncoding
    let sourcePayload: Data
    let sourceByteCount: Int
    let capturedAt: TimeInterval
    let capturedAtBits: UInt64
    let recordContentDigest: String
    let exportedAt: TimeInterval
    let exportedAtBits: UInt64
    let exportDigest: String
}

/// Protected, append-only custody for recovery data that has no historical
/// backend/document proof. There is intentionally no attach, send, or delete
/// API. Integration owns exact source retirement only after `.verified` or
/// `.alreadyVerified` and an independent reread of the unchanged source.
@MainActor
struct UnassignedLegacyRecoveryVault {
    static let maximumSourceBytes = 4 * 1024 * 1024
    static let maximumHintBytes = 64 * 1024

    private static let sourceDigestDomain = Data("io.them.unassigned-legacy-recovery.source.v1".utf8)
    private static let contentDigestDomain = Data("io.them.unassigned-legacy-recovery.content.v1".utf8)
    private static let exportDigestDomain = Data("io.them.unassigned-legacy-recovery.export.v1".utf8)

    private let rootDirectory: URL?
    private let fileManager: FileManager
    private let fileProtectionEnforcer: ((URL) throws -> Void)?

    init(
        fileManager: FileManager = .default,
        fileProtectionEnforcer: ((URL) throws -> Void)? = nil
    ) {
        rootDirectory = Self.defaultRootDirectory(fileManager: fileManager)
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

    func preserve(
        _ source: UnassignedLegacyRecoverySource,
        capturedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> UnassignedLegacyRecoveryPreservationResult {
        guard let rootDirectory,
              Self.valid(source: source),
              capturedAt.isFinite,
              prepareRoot(rootDirectory) else { return .unconfirmed }
        let recordID = Self.sourceDigest(source)
        let canonicalURL = rootDirectory.appendingPathComponent("\(recordID).json", isDirectory: false)
        return withVaultLock(rootDirectory) {
            switch readState(at: canonicalURL, expectedRecordID: recordID) {
            case .present(let envelope):
                return Self.matches(envelope, source: source)
                    ? .alreadyVerified(Self.descriptor(envelope))
                    : .unconfirmed
            case .unreadable:
                return .unconfirmed
            case .missing:
                break
            }

            if let recovered = recoverCandidate(
                rootDirectory: rootDirectory,
                recordID: recordID,
                source: source,
                canonicalURL: canonicalURL
            ) {
                return recovered
            }

            let envelope = Self.makeEnvelope(source: source, recordID: recordID, capturedAt: capturedAt)
            let candidateURL = rootDirectory.appendingPathComponent(
                ".\(recordID).pending.\(UUID().uuidString.lowercased()).json",
                isDirectory: false
            )
            do {
                let data = try Self.encode(envelope)
                guard ScreenplayRecoveryExclusiveFileCreation.create(data, at: candidateURL) == .created else {
                    return .unconfirmed
                }
                try enforceCompleteFileProtection(at: candidateURL)
                guard case .present(let verifiedCandidate) = readState(
                    at: candidateURL,
                    expectedRecordID: recordID
                ), Self.exactlyMatches(verifiedCandidate, envelope) else { return .unconfirmed }
            } catch {
                return .unconfirmed
            }

            switch ScreenplayRecoveryExclusiveFilePromotion.promote(
                source: candidateURL,
                destination: canonicalURL
            ) {
            case .promoted:
                do {
                    try Self.synchronizeDirectory(rootDirectory)
                } catch {
                    return .unconfirmed
                }
                guard case .present(let stored) = readState(
                    at: canonicalURL,
                    expectedRecordID: recordID
                ), Self.exactlyMatches(stored, envelope) else { return .unconfirmed }
                return .verified(Self.descriptor(stored))
            case .destinationExists:
                guard case .present(let stored) = readState(
                    at: canonicalURL,
                    expectedRecordID: recordID
                ), Self.matches(stored, source: source) else { return .unconfirmed }
                return .alreadyVerified(Self.descriptor(stored))
            case .failed:
                return .unconfirmed
            }
        } ?? .unconfirmed
    }

    func inventory() -> UnassignedLegacyRecoveryInventoryResult {
        guard let rootDirectory else { return .unconfirmed }
        switch rootAvailability(rootDirectory) {
        case .missing:
            return .missing
        case .unconfirmed:
            return .unconfirmed
        case .available:
            break
        }
        return withVaultLock(rootDirectory) {
            guard let urls = try? fileManager.contentsOfDirectory(
                at: rootDirectory,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: []
            ) else { return .unconfirmed }
            var descriptors: [UnassignedLegacyRecoveryDescriptor] = []
            var unconfirmed = 0
            for url in urls.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
                let name = url.lastPathComponent
                if name == ".vault.lock" { continue }
                guard Self.canonicalRecordID(from: name) != nil else {
                    unconfirmed += 1
                    continue
                }
                let recordID = Self.canonicalRecordID(from: name)!
                switch readState(at: url, expectedRecordID: recordID) {
                case .present(let envelope):
                    descriptors.append(Self.descriptor(envelope))
                case .missing, .unreadable:
                    unconfirmed += 1
                }
            }
            guard !descriptors.isEmpty || unconfirmed > 0 else { return .missing }
            return .available(UnassignedLegacyRecoveryInventory(
                records: descriptors,
                unconfirmedEvidenceCount: unconfirmed
            ))
        } ?? .unconfirmed
    }

    func reveal(recordID: String) -> UnassignedLegacyRecoveryRevealResult {
        guard let rootDirectory, Self.isDigest(recordID) else { return .unconfirmed }
        switch rootAvailability(rootDirectory) {
        case .missing:
            return .missing
        case .unconfirmed:
            return .unconfirmed
        case .available:
            break
        }
        return withVaultLock(rootDirectory) {
            let canonicalURL = rootDirectory.appendingPathComponent("\(recordID).json", isDirectory: false)
            switch readState(at: canonicalURL, expectedRecordID: recordID) {
            case .present(let envelope):
                return .present(Self.record(envelope))
            case .unreadable:
                return .unconfirmed
            case .missing:
                guard let urls = try? fileManager.contentsOfDirectory(
                    at: rootDirectory,
                    includingPropertiesForKeys: nil,
                    options: []
                ) else { return .unconfirmed }
                let candidatePrefix = ".\(recordID).pending."
                return urls.contains(where: {
                    $0.lastPathComponent.hasPrefix(candidatePrefix) && $0.pathExtension == "json"
                }) ? .unconfirmed : .missing
            }
        } ?? .unconfirmed
    }

    func export(
        recordID: String,
        exportedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> UnassignedLegacyRecoveryExportResult {
        guard exportedAt.isFinite else { return .unconfirmed }
        let revealResult = reveal(recordID: recordID)
        guard case .present(let record) = revealResult else {
            switch revealResult {
            case .missing: return .missing
            case .present: return .unconfirmed
            case .unconfirmed: return .unconfirmed
            }
        }
        let descriptor = record.descriptor
        let exportedAtBits = exportedAt.bitPattern
        let exportDigest = Self.exportDigest(
            recordContentDigest: descriptor.contentDigest,
            exportedAtBits: exportedAtBits
        )
        let envelope = UnassignedLegacyRecoveryExportEnvelope(
            schemaVersion: UnassignedLegacyRecoveryExportEnvelope.schemaVersion,
            provenance: descriptor.slot == .draftSaveOutbox ? "unassigned_draft_save_origin" : UnassignedLegacyRecoveryEnvelope.provenance,
            warning: "No verified delivery origin. This is device-local recovery evidence and must not be auto-attributed or sent to a backend.",
            recordID: descriptor.recordID,
            ownerHint: descriptor.ownerHint,
            projectHint: descriptor.projectHint,
            legacyStorageKeyHint: descriptor.legacyStorageKeyHint,
            slot: descriptor.slot,
            encoding: descriptor.encoding,
            sourcePayload: record.sourcePayload,
            sourceByteCount: record.sourcePayload.count,
            capturedAt: descriptor.capturedAt,
            capturedAtBits: descriptor.capturedAt.bitPattern,
            recordContentDigest: descriptor.contentDigest,
            exportedAt: exportedAt,
            exportedAtBits: exportedAtBits,
            exportDigest: exportDigest
        )
        do {
            let data = try Self.encode(envelope)
            return .available(UnassignedLegacyRecoveryExportArtifact(
                recordID: descriptor.recordID,
                filename: "them-unassigned-recovery-\(descriptor.recordID.prefix(12)).json",
                mimeType: "application/json",
                data: data,
                contentDigest: exportDigest
            ))
        } catch {
            return .unconfirmed
        }
    }

    private func recoverCandidate(
        rootDirectory: URL,
        recordID: String,
        source: UnassignedLegacyRecoverySource,
        canonicalURL: URL
    ) -> UnassignedLegacyRecoveryPreservationResult? {
        guard let urls = try? fileManager.contentsOfDirectory(
            at: rootDirectory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: []
        ) else { return .unconfirmed }
        let prefix = ".\(recordID).pending."
        let candidates = urls.filter {
            $0.lastPathComponent.hasPrefix(prefix) && $0.pathExtension == "json"
        }.sorted(by: { $0.lastPathComponent < $1.lastPathComponent })
        guard !candidates.isEmpty else { return nil }
        var matching: [(URL, UnassignedLegacyRecoveryEnvelope)] = []
        for candidateURL in candidates {
            switch readState(at: candidateURL, expectedRecordID: recordID) {
            case .present(let envelope) where Self.matches(envelope, source: source):
                matching.append((candidateURL, envelope))
            case .present, .unreadable, .missing:
                return .unconfirmed
            }
        }
        guard let selected = matching.first else { return .unconfirmed }
        switch ScreenplayRecoveryExclusiveFilePromotion.promote(
            source: selected.0,
            destination: canonicalURL
        ) {
        case .promoted:
            do {
                try Self.synchronizeDirectory(rootDirectory)
            } catch {
                return .unconfirmed
            }
            guard case .present(let stored) = readState(at: canonicalURL, expectedRecordID: recordID),
                  Self.exactlyMatches(stored, selected.1) else { return .unconfirmed }
            return .verified(Self.descriptor(stored))
        case .destinationExists:
            guard case .present(let stored) = readState(at: canonicalURL, expectedRecordID: recordID),
                  Self.matches(stored, source: source) else { return .unconfirmed }
            return .alreadyVerified(Self.descriptor(stored))
        case .failed:
            return .unconfirmed
        }
    }

    private func prepareRoot(_ rootDirectory: URL) -> Bool {
        do {
            try fileManager.createDirectory(
                at: rootDirectory,
                withIntermediateDirectories: true,
                attributes: nil
            )
            try enforceCompleteFileProtection(at: rootDirectory)
            return true
        } catch {
            return false
        }
    }

    private func rootAvailability(_ rootDirectory: URL) -> RootAvailability {
        do {
            let attributes = try fileManager.attributesOfItem(atPath: rootDirectory.path)
            guard attributes[.type] as? FileAttributeType == .typeDirectory else { return .unconfirmed }
            try enforceCompleteFileProtection(at: rootDirectory)
            return .available
        } catch {
            return Self.isMissingFileError(error) ? .missing : .unconfirmed
        }
    }

    private func withVaultLock<T>(_ rootDirectory: URL, body: () -> T) -> T? {
        let lockURL = rootDirectory.appendingPathComponent(".vault.lock", isDirectory: false)
        let descriptor = lockURL.path.withCString { path in
            Darwin.open(path, O_RDWR | O_CREAT | O_CLOEXEC, S_IRUSR | S_IWUSR)
        }
        guard descriptor >= 0 else { return nil }
        defer { Darwin.close(descriptor) }
        guard Darwin.lockf(descriptor, F_TLOCK, 0) == 0 else { return nil }
        defer { _ = Darwin.lockf(descriptor, F_ULOCK, 0) }
        do {
            try enforceCompleteFileProtection(at: lockURL)
        } catch {
            return nil
        }
        return body()
    }

    private func readState(at url: URL, expectedRecordID: String) -> StoredState {
        do {
            let attributes = try fileManager.attributesOfItem(atPath: url.path)
            guard attributes[.type] as? FileAttributeType == .typeRegular else { return .unreadable }
            try enforceCompleteFileProtection(at: url)
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            let envelope = try JSONDecoder().decode(UnassignedLegacyRecoveryEnvelope.self, from: data)
            guard Self.validate(envelope), envelope.recordID.utf8.elementsEqual(expectedRecordID.utf8) else {
                return .unreadable
            }
            return .present(envelope)
        } catch {
            return Self.isMissingFileError(error) ? .missing : .unreadable
        }
    }

    private func enforceCompleteFileProtection(at url: URL) throws {
        try Self.enforceCompleteProtection(at: url, fileManager: fileManager, enforcer: fileProtectionEnforcer)
    }

    fileprivate nonisolated static func enforceCompleteProtection(
        at url: URL, fileManager: FileManager = .default, enforcer: ((URL) throws -> Void)? = nil
    ) throws {
        if let fileProtectionEnforcer = enforcer {
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

    private static func makeEnvelope(
        source: UnassignedLegacyRecoverySource,
        recordID: String,
        capturedAt: TimeInterval
    ) -> UnassignedLegacyRecoveryEnvelope {
        let bits = capturedAt.bitPattern
        return UnassignedLegacyRecoveryEnvelope(
            schemaVersion: UnassignedLegacyRecoveryEnvelope.schemaVersion,
            recordID: recordID,
            provenance: UnassignedLegacyRecoveryEnvelope.provenance,
            ownerHint: source.ownerHint,
            projectHint: source.projectHint,
            legacyStorageKeyHint: source.legacyStorageKeyHint,
            slot: source.slot,
            encoding: source.encoding,
            sourcePayload: source.payload,
            capturedAt: capturedAt,
            capturedAtBits: bits,
            contentDigest: contentDigest(
                recordID: recordID,
                source: source,
                capturedAtBits: bits
            )
        )
    }

    private static func descriptor(
        _ envelope: UnassignedLegacyRecoveryEnvelope
    ) -> UnassignedLegacyRecoveryDescriptor {
        UnassignedLegacyRecoveryDescriptor(
            recordID: envelope.recordID,
            provenance: envelope.slot == .draftSaveOutbox ? "unassigned_draft_save_origin" : envelope.provenance,
            ownerHint: envelope.ownerHint,
            projectHint: envelope.projectHint,
            legacyStorageKeyHint: envelope.legacyStorageKeyHint,
            slot: envelope.slot,
            encoding: envelope.encoding,
            capturedAt: envelope.capturedAt,
            sourceByteCount: envelope.sourcePayload.count,
            contentDigest: envelope.contentDigest
        )
    }

    private static func record(
        _ envelope: UnassignedLegacyRecoveryEnvelope
    ) -> UnassignedLegacyRecoveryRecord {
        UnassignedLegacyRecoveryRecord(
            descriptor: descriptor(envelope),
            sourcePayload: envelope.sourcePayload,
            decodedFields: decodeFields(envelope)
        )
    }

    private static func decodeFields(
        _ envelope: UnassignedLegacyRecoveryEnvelope
    ) -> UnassignedLegacyRecoveryDecodedFields? {
        guard envelope.encoding == .binaryPropertyList,
              let object = try? PropertyListSerialization.propertyList(
                from: envelope.sourcePayload,
                options: [],
                format: nil
              ),
              let candidate = object as? [String: Any],
              let draft = candidate["draft"] as? String,
              let base = candidate["baseVersionId"] as? String,
              let dirty = candidate["dirty"] as? Bool,
              let savedAt = candidate["savedAt"] as? TimeInterval,
              savedAt.isFinite else { return nil }
        return UnassignedLegacyRecoveryDecodedFields(
            draftUTF8: Data(draft.utf8),
            baseVersionUTF8: Data(base.utf8),
            dirty: dirty,
            savedAt: savedAt,
            savedAtBits: savedAt.bitPattern
        )
    }

    private static func valid(source: UnassignedLegacyRecoverySource) -> Bool {
        source.payload.count <= maximumSourceBytes &&
            source.ownerHint.utf8.count <= maximumHintBytes &&
            source.projectHint.utf8.count <= maximumHintBytes &&
            source.legacyStorageKeyHint.utf8.count <= maximumHintBytes
    }

    private static func validate(_ envelope: UnassignedLegacyRecoveryEnvelope) -> Bool {
        guard envelope.schemaVersion == UnassignedLegacyRecoveryEnvelope.schemaVersion,
              envelope.provenance == UnassignedLegacyRecoveryEnvelope.provenance,
              isDigest(envelope.recordID),
              envelope.sourcePayload.count <= maximumSourceBytes,
              envelope.ownerHint.utf8.count <= maximumHintBytes,
              envelope.projectHint.utf8.count <= maximumHintBytes,
              envelope.legacyStorageKeyHint.utf8.count <= maximumHintBytes,
              envelope.capturedAt.isFinite,
              envelope.capturedAt.bitPattern == envelope.capturedAtBits else { return false }
        let source = UnassignedLegacyRecoverySource(
            ownerHint: envelope.ownerHint,
            projectHint: envelope.projectHint,
            legacyStorageKeyHint: envelope.legacyStorageKeyHint,
            slot: envelope.slot,
            encoding: envelope.encoding,
            payload: envelope.sourcePayload
        )
        return sourceDigest(source) == envelope.recordID &&
            contentDigest(
                recordID: envelope.recordID,
                source: source,
                capturedAtBits: envelope.capturedAtBits
            ) == envelope.contentDigest
    }

    private static func matches(
        _ envelope: UnassignedLegacyRecoveryEnvelope,
        source: UnassignedLegacyRecoverySource
    ) -> Bool {
        validate(envelope) && envelope.recordID == sourceDigest(source) &&
            envelope.ownerHint.utf8.elementsEqual(source.ownerHint.utf8) &&
            envelope.projectHint.utf8.elementsEqual(source.projectHint.utf8) &&
            envelope.legacyStorageKeyHint.utf8.elementsEqual(source.legacyStorageKeyHint.utf8) &&
            envelope.slot == source.slot && envelope.encoding == source.encoding &&
            envelope.sourcePayload == source.payload
    }

    private static func exactlyMatches(
        _ lhs: UnassignedLegacyRecoveryEnvelope,
        _ rhs: UnassignedLegacyRecoveryEnvelope
    ) -> Bool {
        lhs == rhs
    }

    private static func sourceDigest(_ source: UnassignedLegacyRecoverySource) -> String {
        var data = Data()
        appendLengthPrefixed(sourceDigestDomain, to: &data)
        for value in [
            source.ownerHint,
            source.projectHint,
            source.legacyStorageKeyHint,
            source.slot.rawValue,
            source.encoding.rawValue,
        ] {
            appendLengthPrefixed(Data(value.utf8), to: &data)
        }
        appendLengthPrefixed(source.payload, to: &data)
        return hexDigest(data)
    }

    private static func contentDigest(
        recordID: String,
        source: UnassignedLegacyRecoverySource,
        capturedAtBits: UInt64
    ) -> String {
        var data = Data()
        appendLengthPrefixed(contentDigestDomain, to: &data)
        appendLengthPrefixed(Data(recordID.utf8), to: &data)
        appendLengthPrefixed(Data(source.ownerHint.utf8), to: &data)
        appendLengthPrefixed(Data(source.projectHint.utf8), to: &data)
        appendLengthPrefixed(Data(source.legacyStorageKeyHint.utf8), to: &data)
        appendLengthPrefixed(Data(source.slot.rawValue.utf8), to: &data)
        appendLengthPrefixed(Data(source.encoding.rawValue.utf8), to: &data)
        appendLengthPrefixed(source.payload, to: &data)
        var bits = capturedAtBits.bigEndian
        withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) }
        return hexDigest(data)
    }

    private static func exportDigest(
        recordContentDigest: String,
        exportedAtBits: UInt64
    ) -> String {
        var data = Data()
        appendLengthPrefixed(exportDigestDomain, to: &data)
        appendLengthPrefixed(Data(recordContentDigest.utf8), to: &data)
        var bits = exportedAtBits.bigEndian
        withUnsafeBytes(of: &bits) { data.append(contentsOf: $0) }
        return hexDigest(data)
    }

    private static func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(value)
    }

    private static func canonicalRecordID(from filename: String) -> String? {
        guard filename.hasSuffix(".json"), !filename.hasPrefix(".") else { return nil }
        let recordID = String(filename.dropLast(5))
        return isDigest(recordID) ? recordID : nil
    }

    private static func isDigest(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy {
            ($0 >= 48 && $0 <= 57) || ($0 >= 97 && $0 <= 102)
        }
    }

    private static func appendLengthPrefixed(_ value: Data, to output: inout Data) {
        var count = UInt64(value.count).bigEndian
        withUnsafeBytes(of: &count) { output.append(contentsOf: $0) }
        output.append(value)
    }

    private static func hexDigest(_ value: Data) -> String {
        SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined()
    }

    fileprivate nonisolated static func synchronizeDirectory(_ url: URL) throws {
        let descriptor = url.path.withCString { path in
            Darwin.open(path, O_RDONLY | O_CLOEXEC)
        }
        guard descriptor >= 0 else { throw posixError(errno, path: url.path) }
        defer { Darwin.close(descriptor) }
        guard Darwin.fsync(descriptor) == 0 else { throw posixError(errno, path: url.path) }
    }

    private nonisolated static func posixError(_ code: Int32, path: String) -> NSError {
        NSError(domain: NSPOSIXErrorDomain, code: Int(code), userInfo: [NSFilePathErrorKey: path])
    }

    private static func isMissingFileError(_ error: Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSCocoaErrorDomain &&
            [CocoaError.Code.fileNoSuchFile.rawValue, CocoaError.Code.fileReadNoSuchFile.rawValue]
                .contains(nsError.code)
    }

    private nonisolated static func defaultRootDirectory(fileManager: FileManager) -> URL? {
        fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("io.them", isDirectory: true)
            .appendingPathComponent("UnassignedLegacyRecovery", isDirectory: true)
            .appendingPathComponent("v1", isDirectory: true)
    }

    private enum StoredState {
        case missing
        case present(UnassignedLegacyRecoveryEnvelope)
        case unreadable
    }

    private enum RootAvailability {
        case available
        case missing
        case unconfirmed
    }
}


// Current onboarding input is a separate, mutable domain. It never enters the
// append-only legacy inventory and carries no account, project or backend hint.
nonisolated struct OnboardingInputFields: Codable, Equatable, Sendable {
    var nameUTF8 = Data()
    var premiseUTF8 = Data()
    var nameWasEdited = false
    var premiseWasEdited = false

    var hasEdits: Bool { nameWasEdited || premiseWasEdited }
    fileprivate var valid: Bool {
        hasEdits && (nameWasEdited || nameUTF8.isEmpty) && (premiseWasEdited || premiseUTF8.isEmpty)
            && String(data: nameUTF8, encoding: .utf8) != nil && String(data: premiseUTF8, encoding: .utf8) != nil
    }
}

nonisolated struct OnboardingInputDescriptor: Equatable, Sendable {
    let revisionID: String
    let contentDigest: String
}

nonisolated struct OnboardingInputCheckpoint: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let provenance: String
    let revisionID: String
    let previousRevisionID: String?
    let previousContentDigest: String?
    let fields: OnboardingInputFields
    let contentDigest: String

    var descriptor: OnboardingInputDescriptor { .init(revisionID: revisionID, contentDigest: contentDigest) }
}

nonisolated enum OnboardingInputInventory: Equatable, Sendable {
    case missing
    case present(OnboardingInputDescriptor)
    case unconfirmed
}

nonisolated enum OnboardingInputWriteResult: Equatable, Sendable {
    case verified(OnboardingInputDescriptor)
    case occupied(OnboardingInputDescriptor)
    case tooLarge
    case unconfirmed
}

extension UnassignedLegacyRecoveryVault {
    /// One canonical custody owner, with truthful provenance and a different
    /// lifecycle from legacy evidence. The returned value is safe for utility I/O.
    nonisolated static func onboardingInputs(
        rootDirectory: URL? = nil,
        fileProtectionEnforcer: (@Sendable (URL) throws -> Void)? = nil
    ) -> OnboardingInputCustody {
        let root = rootDirectory ?? defaultRootDirectory(fileManager: .default)?
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("OnboardingInputRecovery", isDirectory: true)
            .appendingPathComponent("v1", isDirectory: true)
        return OnboardingInputCustody(root: root, protection: fileProtectionEnforcer)
    }
}

nonisolated struct OnboardingInputCustody: Sendable {
    // At most current.json and pending.json, each bounded including its envelope.
    static let maximumCheckpointBytes = 4 * 1024 * 1024
    private static let lock = NSRecursiveLock()
    private let root: URL?
    private let protection: (@Sendable (URL) throws -> Void)?

    fileprivate init(root: URL?, protection: (@Sendable (URL) throws -> Void)?) {
        self.root = root
        self.protection = protection
    }

    func inventory() -> OnboardingInputInventory {
        transaction(create: false) { directory in
            switch load(directory) {
            case .missing: return .missing
            case .present(let value): return .present(value.descriptor)
            case .unconfirmed: return .unconfirmed
            }
        } ?? .unconfirmed
    }

    func reveal(expected: OnboardingInputDescriptor) -> OnboardingInputCheckpoint? {
        transaction(create: false) { directory in
            guard case let .present(value) = load(directory), value.descriptor == expected else { return nil }
            return value
        } ?? nil
    }

    func checkpoint(_ fields: OnboardingInputFields, expected: OnboardingInputDescriptor?,
                    revisionID: String) -> OnboardingInputWriteResult {
        guard fields.valid, UUID(uuidString: revisionID) != nil, revisionID != expected?.revisionID else { return .unconfirmed }
        guard fields.nameUTF8.count <= Self.maximumCheckpointBytes - fields.premiseUTF8.count else { return .tooLarge }
        let value = Self.make(fields, previous: expected, revisionID: revisionID)
        guard let bytes = try? JSONEncoder().encode(value) else { return .unconfirmed }
        guard bytes.count <= Self.maximumCheckpointBytes else { return .tooLarge }
        return transaction(create: true) { directory in
            let existing = load(directory)
            switch existing {
            case .unconfirmed: return .unconfirmed
            case .missing:
                guard expected == nil else { return .unconfirmed }
            case .present(let current):
                // A retried, already-written request acknowledges only its exact bytes.
                if current == value { return normalize(current, in: directory) ? .verified(current.descriptor) : .unconfirmed }
                guard current.descriptor == expected else { return .occupied(current.descriptor) }
                guard normalize(current, in: directory) else { return .unconfirmed }
            }
            let pending = directory.appendingPathComponent("pending.json")
            guard ScreenplayRecoveryExclusiveFileCreation.create(bytes, at: pending) == .created else { return .unconfirmed }
            do { try protect(pending) } catch { return .unconfirmed }
            guard read(pending) == .present(value), normalize(value, in: directory),
                  read(directory.appendingPathComponent("current.json")) == .present(value) else { return .unconfirmed }
            return .verified(value.descriptor)
        } ?? .unconfirmed
    }

    /// Only the exact, explicitly selected current form can be discarded.
    func discard(expected: OnboardingInputDescriptor) -> Bool {
        transaction(create: false) { directory in
            guard case let .present(value) = load(directory), value.descriptor == expected else { return false }
            for name in ["current.json", "pending.json"] {
                let url = directory.appendingPathComponent(name)
                switch read(url) {
                case .missing: continue
                case .unconfirmed: return false
                case .present(let copy):
                    guard copy == value || (copy.revisionID == value.previousRevisionID && copy.contentDigest == value.previousContentDigest) else { return false }
                    do { try FileManager.default.removeItem(at: url); try UnassignedLegacyRecoveryVault.synchronizeDirectory(directory) }
                    catch { return false }
                }
            }
            return load(directory) == .missing
        } ?? false
    }

    private enum State: Equatable {
        case missing, present(OnboardingInputCheckpoint), unconfirmed
    }

    private func load(_ directory: URL) -> State {
        let names: [String]
        do { names = try FileManager.default.contentsOfDirectory(atPath: directory.path) }
        catch {
            let error = error as NSError
            return error.domain == NSCocoaErrorDomain && error.code == NSFileReadNoSuchFileError ? .missing : .unconfirmed
        }
        guard Set(names).isSubset(of: ["current.json", "pending.json", ".custody.lock"]) else { return .unconfirmed }
        let current = read(directory.appendingPathComponent("current.json"))
        let pending = read(directory.appendingPathComponent("pending.json"))
        switch (current, pending) {
        case (.unconfirmed, _), (_, .unconfirmed): return .unconfirmed
        case (.missing, .missing): return .missing
        case (.present(let value), .missing), (.missing, .present(let value)): return .present(value)
        case (.present(let old), .present(let next)):
            return next.previousRevisionID == old.revisionID && next.previousContentDigest == old.contentDigest ? .present(next) : .unconfirmed
        }
    }

    private func normalize(_ value: OnboardingInputCheckpoint, in directory: URL) -> Bool {
        let currentURL = directory.appendingPathComponent("current.json")
        let pendingURL = directory.appendingPathComponent("pending.json")
        if read(currentURL) == .present(value) { return read(pendingURL) == .missing }
        guard read(pendingURL) == .present(value) else { return false }
        switch read(currentURL) {
        case .unconfirmed: return false
        case .missing: break
        case .present(let old):
            guard old.revisionID == value.previousRevisionID && old.contentDigest == value.previousContentDigest else { return false }
            do { try FileManager.default.removeItem(at: currentURL); try UnassignedLegacyRecoveryVault.synchronizeDirectory(directory) }
            catch { return false }
        }
        guard ScreenplayRecoveryExclusiveFilePromotion.promote(source: pendingURL, destination: currentURL) == .promoted else { return false }
        do { try UnassignedLegacyRecoveryVault.synchronizeDirectory(directory) } catch { return false }
        return read(currentURL) == .present(value)
    }

    private func read(_ url: URL) -> State {
        do {
            let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
            guard attrs[.type] as? FileAttributeType == .typeRegular,
                  let size = attrs[.size] as? NSNumber, size.intValue <= Self.maximumCheckpointBytes else { return .unconfirmed }
            try protect(url)
            let value = try JSONDecoder().decode(OnboardingInputCheckpoint.self, from: Data(contentsOf: url))
            guard value.schemaVersion == 1, value.provenance == "unassigned_onboarding_input",
                  UUID(uuidString: value.revisionID) != nil,
                  value.previousRevisionID == nil || UUID(uuidString: value.previousRevisionID!) != nil,
                  (value.previousRevisionID == nil) == (value.previousContentDigest == nil),
                  value.previousRevisionID != value.revisionID,
                  value.fields.valid, value.contentDigest == Self.digest(value) else { return .unconfirmed }
            return .present(value)
        } catch {
            let error = error as NSError
            return error.domain == NSCocoaErrorDomain && [NSFileNoSuchFileError, NSFileReadNoSuchFileError].contains(error.code)
                ? .missing : .unconfirmed
        }
    }

    private func transaction<T>(create: Bool, _ body: (URL) -> T) -> T? {
        Self.lock.lock(); defer { Self.lock.unlock() }
        guard let root else { return nil }
        if create { do { try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true) } catch { return nil } }
        // A missing directory is an empty domain, not uncertain evidence.
        if !FileManager.default.fileExists(atPath: root.path), !create {
            // Inspecting absence still uses the same validation path without making data files.
            return body(root)
        }
        do {
            let attrs = try FileManager.default.attributesOfItem(atPath: root.path)
            guard attrs[.type] as? FileAttributeType == .typeDirectory else { return nil }
            try protect(root)
        } catch { return nil }
        let fd = root.appendingPathComponent(".custody.lock").path.withCString {
            Darwin.open($0, O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        }
        guard fd >= 0 else { return nil }; defer { Darwin.close(fd) }
        guard Darwin.lockf(fd, F_TLOCK, 0) == 0 else { return nil }
        defer { _ = Darwin.lockf(fd, F_ULOCK, 0) }
        do { try protect(root.appendingPathComponent(".custody.lock")) } catch { return nil }
        return body(root)
    }

    private func protect(_ url: URL) throws {
        try UnassignedLegacyRecoveryVault.enforceCompleteProtection(at: url, enforcer: protection)
    }

    private static func make(_ fields: OnboardingInputFields, previous: OnboardingInputDescriptor?, revisionID: String) -> OnboardingInputCheckpoint {
        let unsigned = OnboardingInputCheckpoint(schemaVersion: 1, provenance: "unassigned_onboarding_input",
            revisionID: revisionID, previousRevisionID: previous?.revisionID, previousContentDigest: previous?.contentDigest, fields: fields, contentDigest: "")
        return .init(schemaVersion: 1, provenance: unsigned.provenance, revisionID: revisionID,
            previousRevisionID: previous?.revisionID, previousContentDigest: previous?.contentDigest, fields: fields, contentDigest: digest(unsigned))
    }

    private static func digest(_ value: OnboardingInputCheckpoint) -> String {
        var bytes = Data("io.them.onboarding-input.v1".utf8)
        for field in [Data(value.revisionID.utf8), Data((value.previousRevisionID ?? "").utf8),
                      Data((value.previousContentDigest ?? "").utf8), value.fields.nameUTF8, value.fields.premiseUTF8] {
            var count = UInt64(field.count).bigEndian
            withUnsafeBytes(of: &count) { bytes.append(contentsOf: $0) }; bytes.append(field)
        }
        bytes.append(value.fields.nameWasEdited ? 1 : 0); bytes.append(value.fields.premiseWasEdited ? 1 : 0)
        return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }
}
