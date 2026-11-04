import Foundation

nonisolated extension Notification.Name {
    static let themTurnCommitted = Notification.Name("io.them.them.turnCommitted")
    static let themBackendSyncUpdated = Notification.Name("io.them.them.backendSyncUpdated")
    static let themBackendIdentityPartitionChanged = Notification.Name(
        "io.them.them.backendIdentityPartitionChanged"
    )
    static let themRememberedLoginKeychainAvailable = Notification.Name(
        "io.them.them.rememberedLoginKeychainAvailable"
    )
    static let themScreenplayQuestionResolved = Notification.Name("io.them.them.screenplayQuestionResolved")
}

nonisolated private struct BackendNotificationPayload: @unchecked Sendable {
    let name: Notification.Name
    let userInfo: [AnyHashable: Any]
}

nonisolated func postBackendNotificationOnMain(
    name: Notification.Name,
    userInfo: [AnyHashable: Any],
    initiatingIdentity owner: BackendAuthRequestIdentity? = nil,
    identityProvider: @escaping @Sendable (Bool) -> BackendAuthRequestIdentity = {
        BackendAuthClient.requestIdentitySnapshot(generateUserIDIfMissing: $0)
    },
    deliveryCondition: @escaping @Sendable () -> Bool = { true }
) {
    let payload = BackendNotificationPayload(name: name, userInfo: userInfo)
    // Always enqueue: observers must not re-enter a serial auth mutation lock.
    // A request can finish while its UI delivery is still queued. Check again
    // at delivery, not just when the network response was accepted.
    DispatchQueue.main.async {
        guard deliveryCondition() else { return }
        if let owner {
            do { try owner.requireCurrentOwner(identityProvider(false)) }
            catch { return }
        }
        NotificationCenter.default.post(name: payload.name, object: nil, userInfo: payload.userInfo)
    }
}
