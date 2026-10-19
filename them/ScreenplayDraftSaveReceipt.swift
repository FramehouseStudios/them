import CryptoKit
import Foundation

nonisolated enum ScreenplayDraftSaveReceiptOutcome: String, Codable, Equatable, Sendable {
    case accepted
    case conflict
    case superseded
    case rejected
}

nonisolated struct ScreenplayDraftSaveReceiptKey: Codable, Equatable, Hashable, Sendable {
    let ownerUserId: String
    let projectId: String
    let clientRequestId: String
    let rawDraftSHA256: String

    init(ownerUserId: String, projectId: String, clientRequestId: String, draft: String) {
        self.ownerUserId = ownerUserId.trimmingCharacters(in: .whitespacesAndNewlines)
        self.projectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        self.clientRequestId = clientRequestId.trimmingCharacters(in: .whitespacesAndNewlines)
        rawDraftSHA256 = ScreenplayDraftSaveCanonicalization.rawSHA256(draft)
    }
}

nonisolated struct ScreenplayDraftSaveReceipt: Codable, Equatable, Sendable {
    let key: ScreenplayDraftSaveReceiptKey
    let outcome: ScreenplayDraftSaveReceiptOutcome
    let serverVersionId: String
    let serverDraftSHA256: String
    let reasonCode: String
    let completedAt: TimeInterval
}

nonisolated struct ScreenplayDraftSaveOutboxManifest: Codable, Equatable, Sendable {
    static let currentSchemaVersion = 2

    let schemaVersion: Int
    let entries: [ScreenplayDraftSaveOutboxEntry]
    let receipts: [ScreenplayDraftSaveReceipt]

    init(
        schemaVersion: Int = Self.currentSchemaVersion,
        entries: [ScreenplayDraftSaveOutboxEntry],
        receipts: [ScreenplayDraftSaveReceipt]
    ) {
        self.schemaVersion = schemaVersion
        self.entries = entries
        self.receipts = receipts
    }
}

nonisolated enum ScreenplayDraftSaveCanonicalization {
    static let hashVersion = "screenplay-draft-sha256-v1"
    // Mirrors JavaScript String.prototype.trim(), which the screenplay version
    // route applies after converting CRLF to LF. Lone CR characters are not
    // rewritten by the server and therefore remain significant here.
    private static let ecmaScriptTrimSet = CharacterSet(charactersIn:
        "\u{0009}\u{000B}\u{000C}\u{0020}\u{00A0}\u{1680}" +
        "\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}" +
        "\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}" +
        "\u{205F}\u{3000}\u{FEFF}\u{000A}\u{000D}"
    )

    static func serverDraft(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: ecmaScriptTrimSet)
    }

    static func rawSHA256(_ value: String) -> String {
        sha256(Data(value.utf8))
    }

    static func serverSHA256(_ value: String) -> String {
        sha256(Data(serverDraft(value).utf8))
    }

    private static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data)
            .map { String(format: "%02x", $0) }
            .joined()
    }
}

nonisolated struct ScreenplayDraftSaveServerProof: Equatable, Sendable {
    let versionId: String
    let committedDraft: String
    let canonicalDraftSHA256: String
}

nonisolated struct ScreenplayDraftSaveReceiptPersistenceError: LocalizedError, Sendable {
    let message: String

    var errorDescription: String? {
        "The save reached a terminal result, but its local receipt could not be secured: \(message)"
    }
}

nonisolated enum ScreenplayDraftSaveAcknowledgementError: LocalizedError, Equatable, Sendable {
    case invalidStatus
    case conflict
    case missingVersion
    case versionMismatch
    case projectMismatch
    case requestMismatch
    case draftMismatch

    var errorDescription: String? {
        switch self {
        case .invalidStatus: "The save response did not confirm a committed write."
        case .conflict: "The save response reported a conflict."
        case .missingVersion: "The save response did not include a committed version."
        case .versionMismatch: "The save response returned inconsistent version identifiers."
        case .projectMismatch: "The save response belonged to a different project."
        case .requestMismatch: "The save response belonged to a different request."
        case .draftMismatch: "The committed draft did not match the requested draft."
        }
    }
}

nonisolated enum ScreenplayDraftSaveAcknowledgement {
    static func validate(
        _ response: BackendScreenplayVersionMutationResponse,
        projectId: String,
        clientRequestId: String,
        requestedDraft: String
    ) throws -> ScreenplayDraftSaveServerProof {
        let stage = response.stage?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        guard stage == "screenplay_version" else {
            throw ScreenplayDraftSaveAcknowledgementError.invalidStatus
        }
        guard response.conflict == false else { throw ScreenplayDraftSaveAcknowledgementError.conflict }
        let status = response.status?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        guard status == "saved" || status == "replayed" else {
            throw ScreenplayDraftSaveAcknowledgementError.invalidStatus
        }
        guard status == "replayed" ? response.replayed == true : response.replayed == false else {
            throw ScreenplayDraftSaveAcknowledgementError.invalidStatus
        }
        guard let version = response.version, let serverVersion = response.serverVersion else {
            throw ScreenplayDraftSaveAcknowledgementError.missingVersion
        }
        let versionId = response.versionId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let nestedVersionId = version.id.trimmingCharacters(in: .whitespacesAndNewlines)
        let serverVersionId = response.serverVersionId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !versionId.isEmpty,
              versionId == nestedVersionId,
              serverVersionId == nestedVersionId,
              serverVersion.id.trimmingCharacters(in: .whitespacesAndNewlines) == nestedVersionId else {
            throw ScreenplayDraftSaveAcknowledgementError.versionMismatch
        }
        let expectedProjectId = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
        let responseProjectId = response.projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let versionProjectId = version.projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let serverVersionProjectId = serverVersion.projectId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard responseProjectId == expectedProjectId,
              versionProjectId == expectedProjectId,
              serverVersionProjectId == expectedProjectId else {
            throw ScreenplayDraftSaveAcknowledgementError.projectMismatch
        }
        let expectedRequestId = clientRequestId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !expectedRequestId.isEmpty,
              response.clientRequestId?.trimmingCharacters(in: .whitespacesAndNewlines) == expectedRequestId,
              version.clientRequestId?.trimmingCharacters(in: .whitespacesAndNewlines) == expectedRequestId,
              serverVersion.clientRequestId?.trimmingCharacters(in: .whitespacesAndNewlines) == expectedRequestId else {
            throw ScreenplayDraftSaveAcknowledgementError.requestMismatch
        }
        guard let committedDraft = version.draft, let serverCommittedDraft = serverVersion.draft else {
            throw ScreenplayDraftSaveAcknowledgementError.missingVersion
        }
        let expectedHash = ScreenplayDraftSaveCanonicalization.serverSHA256(requestedDraft)
        let committedHash = ScreenplayDraftSaveCanonicalization.serverSHA256(committedDraft)
        let serverCommittedHash = ScreenplayDraftSaveCanonicalization.serverSHA256(serverCommittedDraft)
        guard response.draftHashVersion == ScreenplayDraftSaveCanonicalization.hashVersion,
              response.draftHash == expectedHash,
              expectedHash == committedHash,
              committedHash == serverCommittedHash else {
            throw ScreenplayDraftSaveAcknowledgementError.draftMismatch
        }
        return ScreenplayDraftSaveServerProof(
            versionId: nestedVersionId,
            committedDraft: committedDraft,
            canonicalDraftSHA256: committedHash
        )
    }
}
