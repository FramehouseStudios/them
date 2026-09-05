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

    // MARK: - Recovery of unfinished transactions

    private static func balance(alreadyCredited: Bool = false) -> BackendIapCreditResult {
        BackendIapCreditResult(
            ok: true,
            companionTurnsLeft: 140,
            pageTurnsLeft: 25,
            approxConversationsLeft: 7,
            lowBalance: false,
            alreadyCredited: alreadyCredited,
            transactionId: "txn-test",
            packId: "starter_evening",
            productId: "io.them.clementine.pack.starter_evening"
        )
    }

    private final class FinishRecorder: @unchecked Sendable {
        private let lock = NSLock()
        private var ids: [String] = []
        func record(_ id: String) { lock.lock(); ids.append(id); lock.unlock() }
        var finished: [String] { lock.lock(); defer { lock.unlock() }; return ids }
    }

    private static func pending(_ id: String, recorder: FinishRecorder) -> PendingSignedTransaction {
        PendingSignedTransaction(
            transactionId: id,
            productId: "io.them.clementine.pack.starter_evening",
            jws: "jws-\(id)",
            finish: { recorder.record(id) }
        )
    }

    private static func makeStore(
        credit: @escaping (String) async throws -> BackendIapCreditResult,
        pending: [PendingSignedTransaction] = [],
        updates: (() -> AsyncStream<PendingSignedTransaction>)? = nil
    ) -> ClementinePackStore {
        var dependencies = ClementinePackStore.Dependencies(
            creditIapPack: credit,
            loadProducts: { _ in [] },
            purchase: { _ in throw BackendError.stage("iap_purchase", "unused") }
        )
        dependencies.pendingTransactions = { pending }
        if let updates { dependencies.transactionUpdates = updates }
        return ClementinePackStore(dependencies: dependencies)
    }

    func testRecoveryCreditsThenFinishesEachUnfinishedTransaction() async throws {
        let recorder = FinishRecorder()
        var credited: [String] = []
        let store = Self.makeStore(
            credit: { jws in credited.append(jws); return Self.balance() },
            pending: [Self.pending("t1", recorder: recorder), Self.pending("t2", recorder: recorder)]
        )

        let count = await store.recoverUnfinishedTransactions()

        XCTAssertEqual(count, 2)
        XCTAssertEqual(credited, ["jws-t1", "jws-t2"])
        XCTAssertEqual(recorder.finished, ["t1", "t2"], "finish only after the backend credited")
        XCTAssertEqual(store.recoveredTransactionCount, 2)
        XCTAssertEqual(store.lastBalance?.companionTurnsLeft, 140)
        XCTAssertTrue(store.statusMessage.hasPrefix("Pack applied."))
    }

    func testRefusedCreditLeavesTransactionUnfinishedAndTellsTheWriter() async throws {
        let recorder = FinishRecorder()
        let refused = #"{"ok":false,"error":"iap_verify_not_configured","message":"App Store transaction verification is not configured; refusing to credit","failClosed":true}"#
        let store = Self.makeStore(
            credit: { _ in throw BackendError.http(503, refused) },
            pending: [Self.pending("t1", recorder: recorder)]
        )

        let count = await store.recoverUnfinishedTransactions()

        XCTAssertEqual(count, 0)
        XCTAssertEqual(recorder.finished, [], "a refused credit must never finish the transaction")
        XCTAssertEqual(store.recoveredTransactionCount, 0)
        XCTAssertEqual(
            store.statusMessage,
            "Purchases are temporarily unavailable. Your purchase is saved and will be applied automatically."
        )
        XCTAssertFalse(store.statusMessage.contains("iap_verify"))
        XCTAssertFalse(store.statusMessage.contains("503"))
    }

    func testAlreadyCreditedTransactionIsFinishedAndReported() async throws {
        let recorder = FinishRecorder()
        let store = Self.makeStore(
            credit: { _ in Self.balance(alreadyCredited: true) },
            pending: [Self.pending("dup", recorder: recorder)]
        )

        let count = await store.recoverUnfinishedTransactions()

        XCTAssertEqual(count, 1)
        XCTAssertEqual(recorder.finished, ["dup"], "server idempotency means a duplicate is safe to finish")
        XCTAssertTrue(store.statusMessage.hasPrefix("Pack already applied."))
    }

    func testTransactionUpdatesListenerCreditsRedeliveredTransactions() async throws {
        let recorder = FinishRecorder()
        var continuation: AsyncStream<PendingSignedTransaction>.Continuation?
        let stream = AsyncStream<PendingSignedTransaction> { continuation = $0 }
        let store = Self.makeStore(
            credit: { _ in Self.balance() },
            updates: { stream }
        )

        store.startTransactionListener()
        store.startTransactionListener() // idempotent
        continuation?.yield(Self.pending("late", recorder: recorder))
        continuation?.finish()

        let deadline = Date().addingTimeInterval(2)
        while store.recoveredTransactionCount == 0, Date() < deadline {
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTAssertEqual(store.recoveredTransactionCount, 1)
        XCTAssertEqual(recorder.finished, ["late"])
        store.stopTransactionListener()
    }

    func testUserFacingMessagesNeverEchoRawPurchaseCodes() {
        XCTAssertEqual(
            ClementinePackStore.userFacingMessage(for: BackendError.stage("iap_credit", "iap_verify_failed")),
            "We couldn't apply that purchase yet. You won't be charged again; we'll keep retrying."
        )
        let unknown = ClementinePackStore.userFacingMessage(for: BackendError.http(402, #"{"ok":false,"error":"iap_unknown_product"}"#))
        XCTAssertEqual(unknown, "That pack isn't available in this version. Please update the app.")
        let offline = ClementinePackStore.userFacingMessage(for: URLError(.notConnectedToInternet))
        XCTAssertTrue(offline.contains("saved"))
        XCTAssertFalse(offline.contains("NSURLError"))
    }

    func testLaunchRecoveryIsSkippedInsideTestAndAutomationProcesses() {
        // Must not touch StoreKit or the network from a unit-test host.
        ClementinePackStore.startLaunchRecoveryIfNeeded(
            environment: ["XCTestConfigurationFilePath": "/tmp/x"],
            arguments: []
        )
        ClementinePackStore.startLaunchRecoveryIfNeeded(environment: [:], arguments: ["--ui-testing"])
        // Reaching here without a StoreKit call is the contract; the real
        // process path is exercised by the app, not by tests.
    }
}
