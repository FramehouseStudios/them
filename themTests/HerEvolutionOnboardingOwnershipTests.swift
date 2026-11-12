import Foundation
import XCTest
@testable import them

@MainActor
final class HerEvolutionOnboardingOwnershipTests: XCTestCase {
    private func withStore(_ body: (HerEvolutionStore) throws -> Void) rethrows {
        let domain = "them-onboarding-name-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: domain)!
        defer { defaults.removePersistentDomain(forName: domain) }
        try body(HerEvolutionStore(defaults: defaults))
    }

    private func accountSnapshot() throws -> BackendEvolutionSyncSnapshot {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(BackendEvolutionSyncSnapshot.self,
            from: Data(#"{"preferred_name":"Existing Account Writer","last_theme_cue":"Account hydration witness"}"#.utf8))
    }

    func testUntouchedFormStillRestoresExistingAccountName() throws {
        try withStore { store in
            store.seedFromBackend(try accountSnapshot())
            XCTAssertEqual(store.preferredName, "Existing Account Writer")
            XCTAssertFalse(store.needsOnboardingName)
            XCTAssertEqual(store.lastThemeCue, "Account hydration witness")
        }
    }

    func testEditedInputKeepsOnboardingVisibleWhileOtherAccountFieldsHydrate() throws {
        try withStore { store in
            let owner = NSObject()
            store.preservePreferredNameWhileEditingOnboarding(owner: owner)
            store.seedFromBackend(try accountSnapshot())
            XCTAssertEqual(store.preferredName, "")
            XCTAssertTrue(store.needsOnboardingName)
            XCTAssertEqual(store.lastThemeCue, "Account hydration witness")
            withExtendedLifetime(owner) {}
        }
    }

    func testExplicitWriterCompletionWinsOverRemoteName() throws {
        try withStore { store in
            let owner = NSObject()
            store.preservePreferredNameWhileEditingOnboarding(owner: owner)
            store.seedFromBackend(try accountSnapshot())
            store.setPreferredName("Chosen Writer")
            store.seedFromBackend(try accountSnapshot())
            XCTAssertEqual(store.preferredName, "Chosen Writer")
            XCTAssertFalse(store.needsOnboardingName)
            withExtendedLifetime(owner) {}
        }
    }

    func testOldFormReleaseCannotEndNewOwnershipAndAbandonmentDoesNotStick() throws {
        try withStore { store in
            weak var releasedOwner: NSObject?
            try autoreleasepool {
                let replacement = NSObject()
                try autoreleasepool {
                    let oldOwner = NSObject()
                    releasedOwner = oldOwner
                    store.preservePreferredNameWhileEditingOnboarding(owner: oldOwner)
                    store.preservePreferredNameWhileEditingOnboarding(owner: replacement)
                    store.preservePreferredNameWhileEditingOnboarding(owner: replacement)
                    store.seedFromBackend(try accountSnapshot())
                    XCTAssertTrue(store.needsOnboardingName)
                    withExtendedLifetime(oldOwner) {}
                }
                XCTAssertNil(releasedOwner)
                store.seedFromBackend(try accountSnapshot())
                XCTAssertTrue(store.needsOnboardingName, "Releasing the old form must not retire its replacement")
                withExtendedLifetime(replacement) {}
            }
            store.seedFromBackend(try accountSnapshot())
            XCTAssertEqual(store.preferredName, "Existing Account Writer")
            XCTAssertFalse(store.needsOnboardingName)
        }
    }
}
