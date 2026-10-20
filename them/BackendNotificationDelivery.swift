import Foundation

nonisolated private struct BackendNotificationPayload: @unchecked Sendable {
    let name: Notification.Name
    let userInfo: [AnyHashable: Any]
}

nonisolated func postBackendNotificationOnMain(name: Notification.Name, userInfo: [AnyHashable: Any]) {
    let payload = BackendNotificationPayload(name: name, userInfo: userInfo)
    // Identity mutations can hold a serial state lock. Never synchronously
    // re-enter that lock through an observer. Committed turns also cannot
    // leak through an event queued just before the writer changes accounts.
    let owner = name == .themTurnCommitted
        ? BackendAuthClient.currentAuthSessionState().user?.userId ?? "" : nil
    DispatchQueue.main.async {
        if let owner, owner != (BackendAuthClient.currentAuthSessionState().user?.userId ?? "") { return }
        NotificationCenter.default.post(name: payload.name, object: nil, userInfo: payload.userInfo)
    }
}
