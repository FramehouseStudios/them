import Foundation
import CryptoKit

/// Read the initiating project from the existing integrity-checked request,
/// never from a later response or a text search through binary audio. This is
/// recovery-only: it does not rebuild, send, or alter the original request.
nonisolated func offlineTalkRequestProjectID(body: Data, headers: [String: String]) throws -> String? {
    let contentType = headers.first { $0.key.caseInsensitiveCompare("Content-Type") == .orderedSame }?.value ?? ""
    let parameters = contentType.components(separatedBy: ";").map { $0.trimmingCharacters(in: .whitespaces) }
    guard parameters.first?.lowercased() == "multipart/form-data" else { return nil }
    func invalid() -> BackendError {
        .stage("offline_outbox", "The original project could not be verified. The reply is kept for review and export.")
    }
    let boundaries = parameters.dropFirst().filter { $0.lowercased().hasPrefix("boundary=") }
    guard boundaries.count == 1 else { throw invalid() }
    var boundary = String(boundaries[0].dropFirst("boundary=".count))
    if boundary.hasPrefix("\""), boundary.hasSuffix("\""), boundary.count >= 2 {
        boundary.removeFirst(); boundary.removeLast()
    }
    guard !boundary.isEmpty, boundary.utf8.count <= 70,
          boundary.utf8.allSatisfy({ $0 >= 32 && $0 < 127 && $0 != 34 }),
          !boundary.hasSuffix(" ") else { throw invalid() }
    let opening = Data("--\(boundary)\r\n".utf8)
    let separator = Data("\r\n--\(boundary)".utf8)
    let headerEnd = Data("\r\n\r\n".utf8)
    guard body.starts(with: opening) else { throw invalid() }
    var cursor = body.index(body.startIndex, offsetBy: opening.count)
    var project: String?
    for _ in 0..<256 {
        guard let headerRange = body.range(of: headerEnd, in: cursor..<body.endIndex),
              body.distance(from: cursor, to: headerRange.lowerBound) <= 8_192,
              let fields = String(data: body[cursor..<headerRange.lowerBound], encoding: .utf8),
              let next = body.range(of: separator, in: headerRange.upperBound..<body.endIndex) else { throw invalid() }
        let dispositions = fields.components(separatedBy: "\r\n").filter { $0.lowercased().hasPrefix("content-disposition:") }
        guard dispositions.count == 1 else { throw invalid() }
        let attributes = dispositions[0].components(separatedBy: ";").dropFirst()
            .map { $0.trimmingCharacters(in: .whitespaces) }
        let names = attributes.filter { $0.lowercased().hasPrefix("name=") }
        guard names.count == 1 else { throw invalid() }
        let name = String(names[0].dropFirst(5)).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
        if name == "screenplay_project_id" {
            guard project == nil,
                  body.distance(from: headerRange.upperBound, to: next.lowerBound) <= 1_024,
                  let value = String(data: body[headerRange.upperBound..<next.lowerBound], encoding: .utf8) else { throw invalid() }
            let id = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !id.isEmpty, id.count <= 96,
                  id.rangeOfCharacter(from: .controlCharacters) == nil else { throw invalid() }
            project = id
        }
        cursor = next.upperBound
        let tail = body[cursor...]
        if tail.starts(with: Data("--".utf8)) {
            let trailing = tail.dropFirst(2)
            guard trailing.isEmpty || trailing.elementsEqual(Data("\r\n".utf8)) else { throw invalid() }
            return project
        }
        guard tail.starts(with: Data("\r\n".utf8)) else { throw invalid() }
        cursor = body.index(cursor, offsetBy: 2)
    }
    throw invalid()
}

/// This intent stays in the existing received-result record. Persist it before
/// changing the page; an uncertain retry may finish a save, never append again.
nonisolated struct OfflineTalkLiveMutation: Codable, Equatable, Sendable {
    let entryID: String
    let requestID: String
    let sourceProjectID: String
    let documentID: String
    let location: Int
    let length: Int
    let insertion: String
    var promotedProjectID: String? = nil
    var initialProjectReceiptID: String? = nil
    var initialProjectVersionID: String? = nil

    func validate(projectID: String, documentID: String?, before: String, after: String) throws {
        guard UUID(uuidString: entryID) != nil, !requestID.isEmpty, requestID.utf8.count <= 128,
              !self.documentID.isEmpty, self.documentID == documentID,
              self.documentID.utf8.count <= 128, insertion.utf8.count <= 2 * 1024 * 1024,
              sourceProjectID == projectID || (sourceProjectID.isEmpty && promotedProjectID == projectID
                && !(initialProjectReceiptID ?? "").isEmpty && !(initialProjectVersionID ?? "").isEmpty) else {
            throw BackendMemoryAPIError.invalidResponse
        }
        let original = before as NSString
        guard location >= 0, length >= 0, location <= original.length,
              length <= original.length - location else { throw BackendMemoryAPIError.invalidResponse }
        let expected = original.replacingCharacters(in: NSRange(location: location, length: length), with: insertion)
        guard expected.utf8.elementsEqual(after.utf8) else { throw BackendMemoryAPIError.invalidResponse }
    }
}

nonisolated struct OfflineTalkPageDeliveryPlan: Codable, Equatable, Sendable {
    let id: UUID
    var receiptID: String
    var projectID: String
    let documentID: String?
    let beforeDraft: String
    let afterDraft: String
    var liveMutation: OfflineTalkLiveMutation? = nil

    func validate(response: OfflineTalkStoredResponse?) throws {
        guard beforeDraft.utf8.count <= 2 * 1024 * 1024, afterDraft.utf8.count <= 2 * 1024 * 1024 else {
            throw BackendError.stage("offline_outbox", "Recovery page identity could not be verified. Its files were kept.")
        }
        if let liveMutation {
            try liveMutation.validate(projectID: projectID, documentID: documentID, before: beforeDraft, after: afterDraft)
            guard receiptID == (response?.id ?? Self.pendingReceiptID(entryID: liveMutation.entryID)) else {
                throw BackendMemoryAPIError.invalidResponse
            }
        } else {
            guard let response, receiptID == response.id, !projectID.isEmpty,
                  !afterDraft.utf8.elementsEqual(beforeDraft.utf8), afterDraft.utf8.starts(with: beforeDraft.utf8) else {
                throw BackendError.stage("offline_outbox", "Recovery page identity could not be verified. Its files were kept.")
            }
        }
    }

    static func pendingReceiptID(entryID: String) -> String { "live-pending:\(entryID)" }

    func integrityDigest() throws -> Data {
        try offlineTalkDeliveryEvidenceDigest(self)
    }

    func permitsInsertion(project: String, document: String?, draft: String) -> Bool {
        projectID == project && (documentID == nil || documentID == document)
            && beforeDraft.utf8.elementsEqual(draft.utf8)
    }

    func liveRecoveryDisposition(project: String, document: String?, draft: String,
                                 saved: OfflineTalkSavedPageEvidence?) throws -> OfflineTalkLiveRecoveryDisposition {
        guard liveMutation != nil, projectID == project, documentID == document else { throw OfflineTalkPreviousOwnerError() }
        if let saved {
            guard saved.planID == id, saved.projectID == projectID, saved.documentID == documentID,
                  saved.draftSHA256 == Data(SHA256.hash(data: Data(afterDraft.utf8))) else { throw BackendMemoryAPIError.invalidResponse }
            return .finishConfirmedSave
        }
        if afterDraft.utf8.elementsEqual(draft.utf8) { return .saveCurrentPage }
        if beforeDraft.utf8.elementsEqual(draft.utf8) { return .applyOriginalMutation }
        throw BackendError.stage("offline_outbox", "This page has changed since the kept reply. Your current words are preserved. Review or export the original change before applying it.")
    }

    var liveMutationLineRange: (start: Int, end: Int)? {
        guard let liveMutation else { return nil }
        let before = beforeDraft as NSString, after = afterDraft as NSString
        guard liveMutation.location >= 0, liveMutation.location <= before.length,
              liveMutation.location <= after.length else { return nil }
        let end = min(after.length, liveMutation.location + (liveMutation.insertion as NSString).length)
        return (before.substring(to: liveMutation.location).components(separatedBy: "\n").count,
                after.substring(to: end).components(separatedBy: "\n").count)
    }
}

nonisolated enum OfflineTalkLiveRecoveryDisposition: Equatable { case applyOriginalMutation, saveCurrentPage, finishConfirmedSave }

/// Evidence lives with the original mutation, including when an early page is
/// saved before its audio response finishes. It is not permission to replay it.
nonisolated struct OfflineTalkSavedPageEvidence: Codable, Equatable {
    let planID: UUID
    let requestID: String
    let ownerUserID: String
    let projectID: String
    let documentID: String
    let versionID: String
    let backendURL: URL
    let draftSHA256: Data

    func validate(plan: OfflineTalkPageDeliveryPlan?, entry: OfflineTalkOutboxEntry) throws {
        guard let plan, plan.liveMutation != nil, plan.id == planID,
              !requestID.isEmpty, requestID.utf8.count <= 128,
              !versionID.isEmpty, versionID.utf8.count <= 512,
              !ownerUserID.isEmpty,
              entry.headers.first(where: { $0.key.caseInsensitiveCompare("X-User-Id") == .orderedSame })?.value == ownerUserID,
              let originalURL = URL(string: entry.urlString), OfflineTalkRecoveryScope.sameBackend(originalURL, backendURL),
              plan.projectID == projectID, !projectID.isEmpty, plan.documentID == documentID,
              draftSHA256 == Data(SHA256.hash(data: Data(plan.afterDraft.utf8))) else {
            throw BackendMemoryAPIError.invalidResponse
        }
    }
}

nonisolated struct OfflineTalkPlaybackEvidence: Codable, Equatable {
    var responseID: String
    let requiresPageSave: Bool
}

nonisolated func offlineTalkDeliveryEvidenceDigest<Value: Encodable>(_ value: Value) throws -> Data {
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    return Data(SHA256.hash(data: try encoder.encode(value)))
}

/// The same paragraph separators used by both native editors. Recovery only
/// appends, so existing writer bytes (including trailing whitespace) stay intact.
func screenplayEditorInsertionText(for raw: String, existing: String, selection: NSRange) -> String {
    let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return "" }
    let length = (existing as NSString).length
    guard selection.location >= 0, selection.length >= 0, selection.location <= length,
          selection.length <= length - selection.location else { return "" }
    let affixes = screenplayEditorInsertionAffixes(existing: existing, selection: selection)
    return affixes.prefix + trimmed + affixes.suffix
}

func screenplayEditorInsertionAffixes(existing: String, selection: NSRange) -> (prefix: String, suffix: String) {
    guard !existing.isEmpty else { return ("", "") }
    let ns = existing as NSString
    guard selection.location >= 0, selection.length >= 0,
          selection.location <= ns.length, selection.length <= ns.length - selection.location else { return ("", "") }
    let before = selection.location > 0 ? ns.substring(with: NSRange(location: selection.location - 1, length: 1)) : ""
    let end = selection.location + selection.length
    let after = end < ns.length ? ns.substring(with: NSRange(location: end, length: 1)) : ""
    let prefix = before.isEmpty ? "" : (before == "\n" ? "\n" : "\n\n")
    let suffix = after.isEmpty ? "" : (after == "\n" ? "\n" : "\n\n")
    return (prefix, suffix)
}
