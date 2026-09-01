import SwiftUI
import Combine
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
            .onAppear(perform: scheduleKeychainAvailabilityHandling)
            .onReceive(
                NotificationCenter.default.publisher(
                    for: UIApplication.protectedDataDidBecomeAvailableNotification
                )
                .receive(on: DispatchQueue.main)
            ) { _ in
                scheduleKeychainAvailabilityHandling()
            }
#elseif os(macOS)
        content
            .onAppear(perform: scheduleKeychainAvailabilityHandling)
            .onReceive(
                NSWorkspace.shared.notificationCenter.publisher(
                    for: NSWorkspace.sessionDidBecomeActiveNotification
                )
                .receive(on: DispatchQueue.main)
            ) { _ in
                scheduleKeychainAvailabilityHandling()
            }
#else
        content.onAppear(perform: scheduleKeychainAvailabilityHandling)
#endif
    }

    private func scheduleKeychainAvailabilityHandling() {
        Task { @MainActor in
            await Task.yield()
            handleKeychainAvailability()
        }
    }

    @MainActor
    private func handleKeychainAvailability() {
        BackendAuthClient.retryPendingAuthSessionTokenDeletion()
        BackendAuthClient.retryPendingRememberedLoginDeletion()
        NotificationCenter.default.post(
            name: .themRememberedLoginKeychainAvailable,
            object: nil
        )
    }
}
