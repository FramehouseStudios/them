import CoreFoundation
import CryptoKit
import Foundation

nonisolated struct UnassignedLegacyDefaultsRecord: Equatable, Sendable {
    let inventoryID: String
    let storageKey: String
    let projectKey: String?
    let slot: UnassignedLegacyRecoverySlot
    let source: UnassignedLegacyRecoverySource
    /// Malformed whole-key/project evidence is preserved but never removed by
    /// a slot migration because there is no exact slot boundary to retire.
    let supportsExactSlotRemoval: Bool
}

nonisolated struct UnassignedLegacyDefaultsInventory: Equatable, Sendable {
    let records: [UnassignedLegacyDefaultsRecord]
    /// Values that could not be represented exactly remain in UserDefaults.
    let unconfirmedEvidenceCount: Int

    var evidenceState: UnassignedLegacyDefaultsEvidenceState {
        switch (records.isEmpty, unconfirmedEvidenceCount == 0) {
        case (true, true): return .confirmedEmpty
        case (false, true): return .recordsAvailable
        case (true, false): return .unconfirmedEvidenceOnly
        case (false, false): return .recordsAndUnconfirmedEvidence
        }
    }

    /// This only proves the active v1 source is empty. UI must also require a
    /// non-unconfirmed empty vault result before displaying "No copies".
    var canReportActiveSourceEmpty: Bool { evidenceState == .confirmedEmpty }
}

nonisolated enum UnassignedLegacyDefaultsEvidenceState: Equatable, Sendable {
    case confirmedEmpty
    case recordsAvailable
    case unconfirmedEvidenceOnly
    case recordsAndUnconfirmedEvidence
}

nonisolated enum UnassignedLegacySourceDisposition: Equatable, Sendable {
    /// Custody is verified; source intentionally remains active.
    case retained
    /// Custody is verified, but the source changed before exact retirement.
    case retainedChanged
    /// Custody and the exact per-slot source removal were both reread-verified.
    case removed
    /// Vault custody is verified, but UserDefaults persistence/readback did not
    /// prove the expected post-removal state. Never claim removal in this case.
    case removalUnconfirmed
}

nonisolated enum UnassignedLegacyDefaultsMigrationResult: Equatable, Sendable {
    case verified(
        UnassignedLegacyRecoveryDescriptor,
        sourceDisposition: UnassignedLegacySourceDisposition
    )
    /// The inventory choice was stale before vault custody began.
    case sourceChanged
    case unconfirmed
}

/// Standalone adapter for `screenplay.studio.localDraftRecovery.v1` and its
/// owner-scoped variants. It never supplies backend/document provenance and it
/// never removes malformed whole-source evidence.
@MainActor
struct UnassignedLegacyRecoveryDefaultsAdapter {
    nonisolated static let defaultBaseKey = "screenplay.studio.localDraftRecovery.v1"

    private let defaults: UserDefaults
    private let baseKey: String
    private let vault: UnassignedLegacyRecoveryVault
    private let synchronizePersistence: () -> Bool
    private let afterCustodyVerification: (() -> Void)?

    init(
        defaults: UserDefaults = .standard,
        baseKey: String = Self.defaultBaseKey,
        vault: UnassignedLegacyRecoveryVault? = nil,
        synchronizePersistence: (() -> Bool)? = nil,
        afterCustodyVerification: (() -> Void)? = nil
    ) {
        self.defaults = defaults
        self.baseKey = baseKey
        self.vault = vault ?? UnassignedLegacyRecoveryVault()
        // UserDefaults has no fsync-style durability receipt; `synchronize()`
        // is deprecated and can return false despite exact logical readback.
        // Integration may inject a stronger confirmation when its store has one.
        self.synchronizePersistence = synchronizePersistence ?? { true }
        self.afterCustodyVerification = afterCustodyVerification
    }

    func inventory(unscopedOnly: Bool = false) -> UnassignedLegacyDefaultsInventory {
        let representation = defaults.dictionaryRepresentation()
        let keys = representation.keys.filter {
            $0 == baseKey || (!unscopedOnly && $0.hasPrefix("\(baseKey).owner."))
        }.sorted()
        var records: [UnassignedLegacyDefaultsRecord] = []
        var unconfirmed = 0
        for storageKey in keys {
            guard let value = representation[storageKey] else { continue }
            let result = recordsForStorageValue(value, storageKey: storageKey)
            records.append(contentsOf: result.records)
            unconfirmed += result.unconfirmedEvidenceCount
        }
        return UnassignedLegacyDefaultsInventory(
            records: records.sorted(by: { $0.inventoryID < $1.inventoryID }),
            unconfirmedEvidenceCount: unconfirmed
        )
    }

    /// Copies and verifies the selected source without changing UserDefaults.
    func preserve(
        _ record: UnassignedLegacyDefaultsRecord,
        capturedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> UnassignedLegacyDefaultsMigrationResult {
        migrate(record, capturedAt: capturedAt, removeSource: false)
    }

    /// Copies into the vault, verifies custody, rereads the unchanged source,
    /// removes only the selected slot, synchronizes, and rereads the entire
    /// storage-key value. Any uncertainty is reported without a success claim.
    #if DEBUG
    // UserDefaults cannot provide a cross-process compare-and-swap or durable
    // deletion receipt. This experimental path is unavailable in release.
    func preserveAndRemoveIfUnchanged(
        _ record: UnassignedLegacyDefaultsRecord,
        capturedAt: TimeInterval = Date().timeIntervalSince1970
    ) -> UnassignedLegacyDefaultsMigrationResult {
        migrate(record, capturedAt: capturedAt, removeSource: true)
    }

    #endif

    private func migrate(
        _ selected: UnassignedLegacyDefaultsRecord,
        capturedAt: TimeInterval,
        removeSource: Bool
    ) -> UnassignedLegacyDefaultsMigrationResult {
        guard let beforeCustody = currentRecord(matching: selected),
              beforeCustody == selected else { return .sourceChanged }
        let custodyResult = vault.preserve(selected.source, capturedAt: capturedAt)
        let descriptor: UnassignedLegacyRecoveryDescriptor
        switch custodyResult {
        case .verified(let value), .alreadyVerified(let value):
            descriptor = value
        case .unconfirmed:
            return .unconfirmed
        }

        guard removeSource else {
            return .verified(descriptor, sourceDisposition: .retained)
        }
        afterCustodyVerification?()
        guard selected.supportsExactSlotRemoval else {
            return .verified(descriptor, sourceDisposition: .retained)
        }
        guard let afterCustody = currentRecord(matching: selected),
              afterCustody == selected else {
            return .verified(descriptor, sourceDisposition: .retainedChanged)
        }
        guard let currentValue = defaults.object(forKey: selected.storageKey),
              let currentDictionary = currentValue as? [String: Any],
              let expected = removingExactSlot(selected, from: currentDictionary) else {
            return .verified(descriptor, sourceDisposition: .retainedChanged)
        }

        if expected.isEmpty {
            defaults.removeObject(forKey: selected.storageKey)
        } else {
            defaults.set(expected, forKey: selected.storageKey)
        }
        let persistenceConfirmed = synchronizePersistence()
        let storedValue = defaults.object(forKey: selected.storageKey)
        let readbackConfirmed: Bool
        if expected.isEmpty {
            readbackConfirmed = storedValue == nil
        } else if let storedValue {
            readbackConfirmed = Self.canonicalData(storedValue) == Self.canonicalData(expected)
        } else {
            readbackConfirmed = false
        }
        guard persistenceConfirmed, readbackConfirmed else {
            return .verified(descriptor, sourceDisposition: .removalUnconfirmed)
        }
        return .verified(descriptor, sourceDisposition: .removed)
    }

    private func currentRecord(
        matching selected: UnassignedLegacyDefaultsRecord
    ) -> UnassignedLegacyDefaultsRecord? {
        guard let value = defaults.object(forKey: selected.storageKey) else { return nil }
        return recordsForStorageValue(value, storageKey: selected.storageKey).records.first {
            $0.projectKey == selected.projectKey && $0.slot == selected.slot
        }
    }

    private func removingExactSlot(
        _ selected: UnassignedLegacyDefaultsRecord,
        from root: [String: Any]
    ) -> [String: Any]? {
        guard let projectKey = selected.projectKey,
              var project = root[projectKey] as? [String: Any] else { return nil }
        switch selected.slot {
        case .ordinary:
            let ordinaryKeys = ["draft", "baseVersionId", "dirty", "savedAt"]
            guard ordinaryKeys.contains(where: { project[$0] != nil }) else { return nil }
            for key in ordinaryKeys { project.removeValue(forKey: key) }
        case .preservedConflict:
            guard project["preservedConflict"] != nil else { return nil }
            project.removeValue(forKey: "preservedConflict")
        case .malformedSource, .draftSaveOutbox:
            return nil
        }
        var expected = root
        if project.isEmpty {
            expected.removeValue(forKey: projectKey)
        } else {
            expected[projectKey] = project
        }
        return expected
    }

    private func recordsForStorageValue(
        _ value: Any,
        storageKey: String
    ) -> InventoryFragment {
        let ownerHint = Self.ownerHint(storageKey: storageKey, baseKey: baseKey)
        guard let root = value as? [String: Any] else {
            guard let payload = Self.canonicalData(value) else {
                return InventoryFragment(records: [], unconfirmedEvidenceCount: 1)
            }
            let source = UnassignedLegacyRecoverySource(
                ownerHint: ownerHint,
                projectHint: "",
                legacyStorageKeyHint: storageKey,
                slot: .malformedSource,
                encoding: .opaque,
                payload: payload
            )
            return InventoryFragment(
                records: [makeRecord(source: source, storageKey: storageKey,
                    projectKey: nil, supportsExactSlotRemoval: false)],
                unconfirmedEvidenceCount: 0
            )
        }

        var records: [UnassignedLegacyDefaultsRecord] = []
        var unconfirmed = 0
        for projectKey in root.keys.sorted() {
            guard let rawProject = root[projectKey] else { continue }
            guard let project = rawProject as? [String: Any] else {
                if let payload = Self.canonicalData(rawProject) {
                    let source = UnassignedLegacyRecoverySource(
                        ownerHint: ownerHint,
                        projectHint: projectKey,
                        legacyStorageKeyHint: storageKey,
                        slot: .malformedSource,
                        encoding: .opaque,
                        payload: payload
                    )
                    records.append(makeRecord(source: source, storageKey: storageKey,
                        projectKey: projectKey, supportsExactSlotRemoval: false))
                } else {
                    unconfirmed += 1
                }
                continue
            }

            let ordinaryKeys = Set(["draft", "baseVersionId", "dirty", "savedAt"])
            let hasOrdinary = ordinaryKeys.contains(where: { project[$0] != nil })
            if hasOrdinary {
                var ordinary = project
                ordinary.removeValue(forKey: "preservedConflict")
                if let source = sourceForCandidate(
                    ordinary,
                    ownerHint: ownerHint,
                    projectHint: projectKey,
                    storageKey: storageKey,
                    slot: .ordinary
                ) {
                    records.append(makeRecord(source: source, storageKey: storageKey,
                        projectKey: projectKey, supportsExactSlotRemoval: true))
                } else {
                    unconfirmed += 1
                }
            }

            if let preserved = project["preservedConflict"] {
                if let source = sourceForCandidate(
                    preserved,
                    ownerHint: ownerHint,
                    projectHint: projectKey,
                    storageKey: storageKey,
                    slot: .preservedConflict
                ) {
                    records.append(makeRecord(source: source, storageKey: storageKey,
                        projectKey: projectKey, supportsExactSlotRemoval: true))
                } else {
                    unconfirmed += 1
                }
            }

            if !hasOrdinary, project["preservedConflict"] == nil, !project.isEmpty {
                if let payload = Self.canonicalData(project) {
                    let source = UnassignedLegacyRecoverySource(
                        ownerHint: ownerHint,
                        projectHint: projectKey,
                        legacyStorageKeyHint: storageKey,
                        slot: .malformedSource,
                        encoding: .opaque,
                        payload: payload
                    )
                    records.append(makeRecord(source: source, storageKey: storageKey,
                        projectKey: projectKey, supportsExactSlotRemoval: false))
                } else {
                    unconfirmed += 1
                }
            }
        }
        return InventoryFragment(records: records, unconfirmedEvidenceCount: unconfirmed)
    }

    private func sourceForCandidate(
        _ value: Any,
        ownerHint: String,
        projectHint: String,
        storageKey: String,
        slot: UnassignedLegacyRecoverySlot
    ) -> UnassignedLegacyRecoverySource? {
        if let candidate = value as? [String: Any],
           let source = try? UnassignedLegacyRecoverySource.propertyList(
            ownerHint: ownerHint,
            projectHint: projectHint,
            legacyStorageKeyHint: storageKey,
            slot: slot,
            candidate: candidate
           ) {
            return source
        }
        guard let payload = Self.canonicalData(value) else { return nil }
        return UnassignedLegacyRecoverySource(
            ownerHint: ownerHint,
            projectHint: projectHint,
            legacyStorageKeyHint: storageKey,
            slot: slot,
            encoding: .opaque,
            payload: payload
        )
    }

    private func makeRecord(
        source: UnassignedLegacyRecoverySource,
        storageKey: String,
        projectKey: String?,
        supportsExactSlotRemoval: Bool
    ) -> UnassignedLegacyDefaultsRecord {
        UnassignedLegacyDefaultsRecord(
            inventoryID: Self.inventoryID(source),
            storageKey: storageKey,
            projectKey: projectKey,
            slot: source.slot,
            source: source,
            supportsExactSlotRemoval: supportsExactSlotRemoval
        )
    }

    private static func inventoryID(_ source: UnassignedLegacyRecoverySource) -> String {
        var data = Data("io.them.unassigned-legacy-recovery.defaults-inventory.v1".utf8)
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
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private static func ownerHint(storageKey: String, baseKey: String) -> String {
        guard storageKey != baseKey else { return "" }
        let prefix = "\(baseKey).owner."
        guard storageKey.hasPrefix(prefix) else { return "" }
        var encoded = String(storageKey.dropFirst(prefix.count))
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = encoded.count % 4
        if remainder != 0 { encoded.append(String(repeating: "=", count: 4 - remainder)) }
        guard let data = Data(base64Encoded: encoded),
              let value = String(data: data, encoding: .utf8) else { return "" }
        return value
    }

    private static func canonicalData(_ value: Any) -> Data? {
        guard let canonical = CanonicalPropertyListValue(value) else { return nil }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try? encoder.encode(canonical)
    }

    private static func appendLengthPrefixed(_ value: Data, to output: inout Data) {
        var count = UInt64(value.count).bigEndian
        withUnsafeBytes(of: &count) { output.append(contentsOf: $0) }
        output.append(value)
    }

    private struct InventoryFragment {
        let records: [UnassignedLegacyDefaultsRecord]
        let unconfirmedEvidenceCount: Int
    }
}

private nonisolated struct CanonicalPropertyListEntry: Codable, Equatable, Sendable {
    let key: String
    let value: CanonicalPropertyListValue
}

private nonisolated struct CanonicalPropertyListValue: Codable, Equatable, Sendable {
    let kind: String
    let string: String?
    let numberType: String?
    let numberValue: String?
    let bits: UInt64?
    let data: Data?
    let entries: [CanonicalPropertyListEntry]?
    let items: [CanonicalPropertyListValue]?

    init?(_ value: Any) {
        if let value = value as? String {
            self.init(kind: "string", string: value)
            return
        }
        if let value = value as? NSNumber {
            if CFGetTypeID(value) == CFBooleanGetTypeID() {
                self.init(kind: "bool", string: value.boolValue ? "true" : "false")
                return
            }
            let type = String(cString: value.objCType)
            if ["f", "d"].contains(type) {
                self.init(kind: "float", numberType: type, bits: value.doubleValue.bitPattern)
            } else {
                self.init(kind: "integer", numberType: type, numberValue: value.stringValue)
            }
            return
        }
        if let value = value as? Data {
            self.init(kind: "data", data: value)
            return
        }
        if let value = value as? Date {
            self.init(kind: "date", bits: value.timeIntervalSinceReferenceDate.bitPattern)
            return
        }
        if let value = value as? [Any] {
            var converted: [CanonicalPropertyListValue] = []
            for item in value {
                guard let canonical = CanonicalPropertyListValue(item) else { return nil }
                converted.append(canonical)
            }
            self.init(kind: "array", items: converted)
            return
        }
        if let value = value as? [String: Any] {
            var converted: [CanonicalPropertyListEntry] = []
            for key in value.keys.sorted() {
                guard let raw = value[key],
                      let canonical = CanonicalPropertyListValue(raw) else { return nil }
                converted.append(CanonicalPropertyListEntry(key: key, value: canonical))
            }
            self.init(kind: "dictionary", entries: converted)
            return
        }
        return nil
    }

    private init(
        kind: String,
        string: String? = nil,
        numberType: String? = nil,
        numberValue: String? = nil,
        bits: UInt64? = nil,
        data: Data? = nil,
        entries: [CanonicalPropertyListEntry]? = nil,
        items: [CanonicalPropertyListValue]? = nil
    ) {
        self.kind = kind
        self.string = string
        self.numberType = numberType
        self.numberValue = numberValue
        self.bits = bits
        self.data = data
        self.entries = entries
        self.items = items
    }
}
