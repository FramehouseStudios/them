import XCTest
@testable import them

@MainActor
final class ClementinePackStoreTests: XCTestCase {
    func testCatalogProductIdsMatchServerPackPrefix() {
        for id in ClementinePackStore.PackProductID.all {
            XCTAssertTrue(id.hasPrefix("io.them.clementine.pack."))
        }
        XCTAssertEqual(ClementinePackStore.PackProductID.all.count, 3)
        XCTAssertTrue(
            ClementinePackStore.PackProductID.all.contains(
                "io.them.clementine.pack.starter_evening"
            )
        )
    }

    func testCreditSignedTransactionUsesBackendSeam() async throws {
        var seenJWS: String?
        let store = ClementinePackStore(
            dependencies: ClementinePackStore.Dependencies(
                creditIapPack: { jws in
                    seenJWS = jws
                    return BackendIapCreditResult(
                        ok: true,
                        companionTurnsLeft: 140,
                        pageTurnsLeft: 25,
                        approxConversationsLeft: 7,
                        lowBalance: false,
                        alreadyCredited: false,
                        transactionId: "txn-test",
                        packId: "starter_evening",
                        productId: "io.them.clementine.pack.starter_evening"
                    )
                },
                loadProducts: { _ in [] },
                purchase: { _ in
                    throw BackendError.stage("iap_purchase", "unused")
                }
            )
        )

        let balance = try await store.creditSignedTransaction("signed.jws.payload")
        XCTAssertEqual(seenJWS, "signed.jws.payload")
        XCTAssertEqual(balance.companionTurnsLeft, 140)
        XCTAssertEqual(balance.pageTurnsLeft, 25)
        XCTAssertEqual(balance.packId, "starter_evening")
        XCTAssertFalse(balance.lowBalance)
        // Characterization: calm fields only — no TPM concept on the result type.
        XCTAssertEqual(balance.approxConversationsLeft, 7)
    }
}
