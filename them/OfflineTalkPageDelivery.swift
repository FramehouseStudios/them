import Foundation
import CryptoKit

/// This intent stays in the existing received-result record. Persist it before
/// changing the page; an uncertain retry may finish a save, never append again.
nonisolated struct OfflineTalkPageDeliveryPlan: Codable, Equatable {
    let id: UUID
    let receiptID: String
    let projectID: String
    let documentID: String?
    let beforeDraft: String
    let afterDraft: String

    func validate(response: OfflineTalkStoredResponse) throws {
        guard receiptID == response.id, !projectID.isEmpty,
              beforeDraft.utf8.count <= 2 * 1024 * 1024, afterDraft.utf8.count <= 2 * 1024 * 1024,
              !afterDraft.utf8.elementsEqual(beforeDraft.utf8), afterDraft.utf8.starts(with: beforeDraft.utf8) else {
            throw BackendError.stage("offline_outbox", "Recovery page identity could not be verified. Its files were kept.")
        }
    }

    func integrityDigest() throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        return Data(SHA256.hash(data: try encoder.encode(self)))
    }

    func permitsInsertion(project: String, document: String?, draft: String) -> Bool {
        projectID == project && (documentID == nil || documentID == document)
            && beforeDraft.utf8.elementsEqual(draft.utf8)
    }
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
