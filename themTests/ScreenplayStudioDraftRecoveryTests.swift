import XCTest
@testable import them

final class ScreenplayStudioDraftRecoveryTests: XCTestCase {
    private let recoveryKey = "screenplay.studio.localDraftRecovery.tests"
    private var defaults: UserDefaults!
    private var store: ScreenplayLocalDraftRecoveryStore!

    override func setUp() {
        super.setUp()
        defaults = UserDefaults(suiteName: "io.them.ScreenplayStudioDraftRecoveryTests")!
        defaults.removeObject(forKey: recoveryKey)
        store = ScreenplayLocalDraftRecoveryStore(defaults: defaults, key: recoveryKey)
    }

    override func tearDown() {
        defaults.removeObject(forKey: recoveryKey)
        store = nil
        defaults = nil
        super.tearDown()
    }

    func testSaveWritesLocalRecoverySnapshot() {
        let draft = """
        INT. MOTEL ROOM - NIGHT

        CLEMENTINE watches the rain make tiny rivers down the glass.
        """

        store.save(
            projectId: " project-recovery ",
            draft: draft,
            baseVersionId: "version-before-edit",
            dirty: true,
            savedAt: 1_700_000_000
        )

        let payload = store.payloads()["project-recovery"]
        XCTAssertEqual(payload?["draft"] as? String, draft)
        XCTAssertEqual(payload?["baseVersionId"] as? String, "version-before-edit")
        XCTAssertEqual(payload?["dirty"] as? Bool, true)
        XCTAssertEqual(payload?["savedAt"] as? TimeInterval, 1_700_000_000)
    }

    func testClearRemovesOnlyRequestedProjectRecoverySnapshot() {
        store.save(projectId: "project-a", draft: "A", baseVersionId: "v-a", dirty: true)
        store.save(projectId: "project-b", draft: "B", baseVersionId: "v-b", dirty: true)

        store.clear(projectId: " project-a ")

        let payloads = store.payloads()
        XCTAssertNil(payloads["project-a"])
        XCTAssertEqual(payloads["project-b"]?["draft"] as? String, "B")
    }
}
