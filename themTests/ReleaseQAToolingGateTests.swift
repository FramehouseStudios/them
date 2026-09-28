import XCTest
@testable import them

final class ReleaseQAToolingGateTests: XCTestCase {
    func testHiddenChoicesFallBackToWriterDefaults() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "ReleaseQAToolingGateTests"))
        defaults.removePersistentDomain(forName: "ReleaseQAToolingGateTests")
        defaults.set("stub", forKey: ClementineRealtimeSupplierMode.storageKey)
        defaults.set("realtime_preview", forKey: ClementineVoiceTransportMode.storageKey)

        ReleaseQAToolingGate.resetHiddenChoices(defaults: defaults)

        XCTAssertEqual(defaults.string(forKey: ClementineRealtimeSupplierMode.storageKey), "server_default")
        XCTAssertEqual(defaults.string(forKey: ClementineVoiceTransportMode.storageKey), "turn_based")
        defaults.removePersistentDomain(forName: "ReleaseQAToolingGateTests")
    }

    func testUnsetChoicesStayUnset() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "ReleaseQAToolingGateTests.unset"))
        defaults.removePersistentDomain(forName: "ReleaseQAToolingGateTests.unset")
        ReleaseQAToolingGate.resetHiddenChoices(defaults: defaults)
        XCTAssertNil(defaults.string(forKey: ClementineRealtimeSupplierMode.storageKey))
        XCTAssertNil(defaults.string(forKey: ClementineVoiceTransportMode.storageKey))
    }
}
