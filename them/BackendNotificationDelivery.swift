import Foundation

nonisolated private struct BackendNotificationPayload: @unchecked Sendable {
    let name: Notification.Name
    let userInfo: [AnyHashable: Any]
}

nonisolated func postBackendNotificationOnMain(
    name: Notification.Name,
    userInfo: [AnyHashable: Any],
    shouldDeliver: @escaping @Sendable () -> Bool = { true }
) {
    let payload = BackendNotificationPayload(name: name, userInfo: userInfo)
    // Always enqueue. Several identity mutations intentionally hold a serial
    // state lock while publishing durable Keychain/defaults state; a
    // synchronous observer must never be able to re-enter that lock.
    DispatchQueue.main.async {
        guard shouldDeliver() else { return }
        NotificationCenter.default.post(name: payload.name, object: nil, userInfo: payload.userInfo)
    }
}
