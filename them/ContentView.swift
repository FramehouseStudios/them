import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

struct ContentView: View {
    var body: some View {
        RootExperienceView()
            .modifier(RememberedLoginKeychainCleanupModifier())
    }
}

private struct RememberedLoginKeychainCleanupModifier: ViewModifier {
    func body(content: Content) -> some View {
#if os(iOS)
        content
            .onAppear(perform: handleKeychainAvailability)
            .onReceive(
                NotificationCenter.default.publisher(
                    for: UIApplication.protectedDataDidBecomeAvailableNotification
                )
            ) { _ in
                handleKeychainAvailability()
            }
#elseif os(macOS)
        content
            .onAppear(perform: handleKeychainAvailability)
            .onReceive(
                NSWorkspace.shared.notificationCenter.publisher(
                    for: NSWorkspace.sessionDidBecomeActiveNotification
                )
            ) { _ in
                handleKeychainAvailability()
            }
#else
        content.onAppear(perform: handleKeychainAvailability)
#endif
    }

    private func handleKeychainAvailability() {
        BackendAuthClient.retryPendingAuthSessionTokenDeletion()
        BackendAuthClient.retryPendingRememberedLoginDeletion()
        NotificationCenter.default.post(
            name: .themRememberedLoginKeychainAvailable,
            object: nil
        )
    }
}
