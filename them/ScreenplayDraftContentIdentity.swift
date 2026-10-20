import CryptoKit
import Foundation

/// Exact local draft identity. Revision IDs cannot detect unsaved edits;
/// normalization would collapse meaningful whitespace or Unicode bytes.
nonisolated struct ScreenplayDraftContentIdentity: Codable, Hashable, Sendable {
    let sha256: String
    let utf8ByteCount: Int
    let utf16Count: Int

    init(draft: String) {
        let bytes = Data(draft.utf8)
        sha256 = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        utf8ByteCount = bytes.count
        utf16Count = draft.utf16.count
    }

    func matches(_ draft: String) -> Bool {
        self == Self(draft: draft)
    }
}
