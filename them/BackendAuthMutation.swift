import Foundation

// Native preferences KVO may synchronously enter SwiftUI before our explicit
// notification is queued. Enter MainActor before taking the auth-state queue;
// never dispatch individual writes out of the crash-safe token transaction.
nonisolated enum BackendAuthMutationExecutor {
    static func run<Result: Sendable>(
        _ mutation: @escaping @MainActor @Sendable () -> Result
    ) async -> Result {
        await MainActor.run(body: mutation)
    }
}

nonisolated enum BackendUserDefaultsStore {
    private static let liveUIKeys: Set<String> = [
        "auth_signed_in",
        "auth_user_email",
        "auth_user_verified",
        "auth_session_token_deletion_pending",
    ]

    @discardableResult
    static func set(
        _ value: Any,
        forKey key: String,
        defaults: UserDefaults = .standard
    ) -> Bool {
#if os(iOS)
        if defaults === UserDefaults.standard {
            if valuesAreEqual(defaults.object(forKey: key), value) {
                return CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
            }
            CFPreferencesSetAppValue(
                key as CFString,
                value as CFPropertyList,
                kCFPreferencesCurrentApplication
            )
            guard CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication) else {
                return false
            }
            publishLiveUIChangeIfNeeded(forKey: key)
            return true
        }
#endif
        defaults.set(value, forKey: key)
        return defaults.synchronize()
    }

    @discardableResult
    static func removeObject(
        forKey key: String,
        defaults: UserDefaults = .standard
    ) -> Bool {
#if os(iOS)
        if defaults === UserDefaults.standard {
            if defaults.object(forKey: key) == nil {
                return CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
            }
            CFPreferencesSetAppValue(
                key as CFString,
                nil,
                kCFPreferencesCurrentApplication
            )
            guard CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication) else {
                return false
            }
            publishLiveUIChangeIfNeeded(forKey: key)
            return true
        }
#endif
        defaults.removeObject(forKey: key)
        return defaults.synchronize()
    }

    @discardableResult
    static func synchronize(_ defaults: UserDefaults = .standard) -> Bool {
#if os(iOS)
        if defaults === UserDefaults.standard {
            return CFPreferencesAppSynchronize(kCFPreferencesCurrentApplication)
        }
#endif
        return defaults.synchronize()
    }

    private static func valuesAreEqual(_ lhs: Any?, _ rhs: Any?) -> Bool {
        switch (lhs, rhs) {
        case (nil, nil):
            return true
        case let (left as NSObject, right as NSObject):
            return left.isEqual(right)
        default:
            return false
        }
    }

    private static func publishLiveUIChangeIfNeeded(forKey key: String) {
        guard liveUIKeys.contains(key) else { return }
        BackendAuthClient.publishLiveUserDefaultsChangeAfterAuthMutation()
    }
}

nonisolated enum BackendLiveDefaultsNotificationScheduler {
    static func enqueue(
        after mutationQueue: DispatchQueue,
        deliveryQueue: DispatchQueue = .main,
        publish: @escaping @Sendable () -> Void
    ) {
        mutationQueue.async {
            deliveryQueue.async(execute: publish)
        }
    }
}
