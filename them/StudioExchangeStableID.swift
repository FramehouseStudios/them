import Foundation
import CryptoKit

/// A Studio exchange rebuilt from a backend thread gets the same id every
/// time. It used to get `UUID()`: every history restore produced "new"
/// entries, the history re-persisted to the project, the saved project was
/// applied, the restore ran again — about one project upsert a second while
/// the Studio was open (seen live 2026-09-28).
nonisolated enum StudioExchangeStableID {
    static func uuid(threadID: String, turn: Int) -> UUID {
        var bytes = Array(SHA256.hash(data: Data("studio-exchange|\(threadID)|\(turn)".utf8)).prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50 // version 5 layout (name-based)
        bytes[8] = (bytes[8] & 0x3F) | 0x80 // RFC 4122 variant
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }
}
