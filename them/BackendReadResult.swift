import Foundation

/// The actual HTTP response origin is optional for older/non-HTTP producers.
/// It must never be reconstructed from a subsequently selected backend.
nonisolated struct BackendReadResult<Payload> {
    let payload: Payload
    let sync: BackendSyncState
    let notModified: Bool
    var responseURL: URL? = nil
}
