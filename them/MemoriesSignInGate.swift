import Foundation

/// A guest opening Memories is not an error. Seen live on 2026-09-24: the
/// screen said "I am having trouble recalling that right now." with a Retry
/// button that could only fail again, while the real state was that the
/// memory routes need a signed-in writer.
nonisolated enum MemoriesSignInGate {
    static let headline = "Sign in to see what I remember about you."
    static let body = "Your memories, characters and story preferences are kept with your account."

    static func isSignInRequired(_ error: Error) -> Bool {
        if let backendError = error as? BackendError {
            return backendError.requiresUserAuthentication
        }
        if let apiError = error as? BackendMemoryAPIError {
            return apiError.requiresUserAuthentication
        }
        return false
    }
}
