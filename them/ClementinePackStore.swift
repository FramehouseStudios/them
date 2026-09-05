import Combine
import Foundation
import ScreenplayStudio
import StoreKit
import SwiftUI
import os

/// A signed StoreKit transaction the app still owes the backend a credit for.
/// Wraps the two things recovery needs — the JWS to send and a way to finish
/// the transaction — so the store can be driven without real StoreKit types.
nonisolated struct PendingSignedTransaction: Sendable {
    let transactionId: String
    let productId: String
    let jws: String
    let finish: @Sendable () async -> Void
}

/// D011 — StoreKit 2 purchase → server verify+credit for Clementine turn packs.
/// Kept out of RootExperienceView / Studio god files (D009). Networking goes
/// through `BackendClient.creditIapPack` with Keychain session (Authorization).
///
/// Invariant: a transaction is finished only after the backend confirms the
/// credit. A refused credit leaves the transaction unfinished so StoreKit
/// redelivers it, and `recoverUnfinishedTransactions` / the updates listener
/// retry through the same idempotent (transactionId-keyed) credit route.
@MainActor
final class ClementinePackStore: ObservableObject {
    enum PackProductID {
        static let all: [String] = [
            "io.them.clementine.pack.starter_evening",
            "io.them.clementine.pack.writer_fortnight",
            "io.them.clementine.pack.page_boost",
        ]
    }

    struct Dependencies {
        var creditIapPack: (String) async throws -> BackendIapCreditResult
        var loadProducts: ([String]) async throws -> [Product]
        var purchase: (Product) async throws -> Product.PurchaseResult
        /// Transactions StoreKit still holds because we never finished them.
        var pendingTransactions: () async -> [PendingSignedTransaction] = { [] }
        /// Live stream of transactions arriving outside a purchase call
        /// (redelivery after a refused credit, Ask to Buy approval, restores).
        var transactionUpdates: () -> AsyncStream<PendingSignedTransaction> = {
            AsyncStream { $0.finish() }
        }
    }

    @Published private(set) var products: [Product] = []
    @Published private(set) var lastBalance: BackendIapCreditResult?
    @Published private(set) var statusMessage: String = ""
    @Published private(set) var isBusy: Bool = false
    /// Count of transactions credited by recovery (not by a direct purchase).
    @Published private(set) var recoveredTransactionCount: Int = 0

    private let dependencies: Dependencies
    private var updatesTask: Task<Void, Never>?

    init(dependencies: Dependencies) {
        self.dependencies = dependencies
    }

    convenience init(backend: BackendClient) {
        self.init(
            dependencies: Dependencies(
                creditIapPack: { signed in
                    try await backend.creditIapPack(signedTransaction: signed)
                },
                loadProducts: { ids in
                    try await Product.products(for: ids)
                },
                purchase: { product in
                    try await product.purchase()
                },
                pendingTransactions: {
                    var pending: [PendingSignedTransaction] = []
                    for await result in StoreKit.Transaction.unfinished {
                        if let item = Self.pendingTransaction(from: result) {
                            pending.append(item)
                        }
                    }
                    return pending
                },
                transactionUpdates: {
                    AsyncStream { continuation in
                        let task = Task {
                            for await result in StoreKit.Transaction.updates {
                                if let item = Self.pendingTransaction(from: result) {
                                    continuation.yield(item)
                                }
                            }
                            continuation.finish()
                        }
                        continuation.onTermination = { _ in task.cancel() }
                    }
                }
            )
        )
    }

    deinit {
        updatesTask?.cancel()
    }

    // MARK: - Launch recovery

    private static var launchStore: ClementinePackStore?

    /// Start crediting unfinished pack transactions as soon as the app is up,
    /// so a writer who paid while the backend refused the credit does not
    /// have to find the packs screen to get their turns. Skipped in test and
    /// UI-automation processes, which never hold real transactions.
    static func startLaunchRecoveryIfNeeded(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) {
        guard launchStore == nil,
              !IOThemRuntime.isTestProcessEnvironment(environment),
              !arguments.contains("--ui-testing"),
              !IOThemRuntime.isStudioAutomationArguments(arguments) else {
            return
        }
        let store = ClementinePackStore(backend: BackendClient())
        launchStore = store
        store.startTransactionListener()
        Task { await store.recoverUnfinishedTransactions() }
    }

    // MARK: - Products

    func refreshProducts() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let loaded = try await dependencies.loadProducts(PackProductID.all)
            products = loaded.sorted { $0.id < $1.id }
            statusMessage = loaded.isEmpty
                ? "No packs available yet. Configure App Store Connect product IDs."
                : "\(loaded.count) pack(s) ready."
        } catch {
            statusMessage = "Could not load packs: \(error.localizedDescription)"
            HerLog.talk.error(
                "ClementinePackStore refreshProducts failed error=\(error.localizedDescription, privacy: .public)"
            )
        }
    }

    // MARK: - Purchase

    /// Purchase a StoreKit product, then send the signed transaction to the API host.
    /// Returns the calm wallet balance from `POST /billing/iap/credit`.
    /// On a refused credit the transaction is left unfinished on purpose and the
    /// writer is told the purchase is saved; recovery retries it.
    @discardableResult
    func purchaseAndCredit(_ product: Product) async throws -> BackendIapCreditResult {
        isBusy = true
        defer { isBusy = false }

        let result = try await dependencies.purchase(product)
        switch result {
        case .success(let verification):
            let transaction = try Self.unwrapVerified(verification)
            let jws = verification.jwsRepresentation
            let balance: BackendIapCreditResult
            do {
                balance = try await dependencies.creditIapPack(jws)
            } catch {
                statusMessage = Self.userFacingMessage(for: error)
                HerLog.talk.error(
                    "ClementinePackStore credit refused transaction=\(String(transaction.id), privacy: .public) error=\(error.localizedDescription, privacy: .public)"
                )
                throw error
            }
            await transaction.finish()
            lastBalance = balance
            statusMessage = Self.appliedMessage(balance)
            return balance
        case .userCancelled:
            statusMessage = "Purchase cancelled."
            throw BackendError.stage("iap_purchase", "user_cancelled")
        case .pending:
            statusMessage = "Purchase pending approval. We'll apply it automatically once approved."
            throw BackendError.stage("iap_purchase", "pending")
        @unknown default:
            statusMessage = "Purchase failed."
            throw BackendError.stage("iap_purchase", "unknown_result")
        }
    }

    // MARK: - Recovery

    /// Credit every transaction StoreKit still holds. Returns how many were
    /// credited (and finished) this pass. Failures leave the transaction
    /// unfinished for the next pass and surface one user-facing line.
    @discardableResult
    func recoverUnfinishedTransactions() async -> Int {
        let pending = await dependencies.pendingTransactions()
        var credited = 0
        for item in pending {
            if await credit(pending: item) {
                credited += 1
            }
        }
        return credited
    }

    /// Listen for transactions that arrive outside a purchase call. Idempotent.
    func startTransactionListener() {
        guard updatesTask == nil else { return }
        let stream = dependencies.transactionUpdates()
        updatesTask = Task { [weak self] in
            for await item in stream {
                guard let self else { return }
                _ = await self.credit(pending: item)
            }
        }
    }

    func stopTransactionListener() {
        updatesTask?.cancel()
        updatesTask = nil
    }

    /// Test / recovery path: credit an already-held signed transaction JWS.
    @discardableResult
    func creditSignedTransaction(_ jws: String) async throws -> BackendIapCreditResult {
        let balance = try await dependencies.creditIapPack(jws)
        lastBalance = balance
        return balance
    }

    private func credit(pending item: PendingSignedTransaction) async -> Bool {
        do {
            let balance = try await creditSignedTransaction(item.jws)
            await item.finish()
            recoveredTransactionCount += 1
            statusMessage = Self.appliedMessage(balance)
            return true
        } catch {
            statusMessage = Self.userFacingMessage(for: error)
            HerLog.talk.error(
                "ClementinePackStore recovery credit refused transaction=\(item.transactionId, privacy: .public) error=\(error.localizedDescription, privacy: .public)"
            )
            return false
        }
    }

    // MARK: - Messages

    static func appliedMessage(_ balance: BackendIapCreditResult) -> String {
        balance.alreadyCredited
            ? "Pack already applied. Companion \(Int(balance.companionTurnsLeft)), Page \(Int(balance.pageTurnsLeft))."
            : "Pack applied. Companion \(Int(balance.companionTurnsLeft)), Page \(Int(balance.pageTurnsLeft))."
    }

    /// One sentence the writer can act on. Never the raw stage:error pair,
    /// never HTML. Purchase-specific codes come from the shared mapper.
    static func userFacingMessage(for error: Error) -> String {
        switch error {
        case let BackendError.http(status, raw):
            return BackendUserFacingErrorMapper.displayMessage(from: Data(raw.utf8), status: status)
        case let BackendError.stage(stage, code):
            return BackendUserFacingErrorMapper.message(forStage: stage, error: code)
        default:
            return "We couldn't reach the server. Your purchase is saved and will be applied automatically."
        }
    }

    // MARK: - StoreKit adapters

    private static func unwrapVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let value):
            return value
        }
    }

    /// Only verified transactions for our pack products become recovery work.
    /// Unverified results are never sent to the backend and never finished here.
    nonisolated private static func pendingTransaction(
        from result: VerificationResult<StoreKit.Transaction>
    ) -> PendingSignedTransaction? {
        guard case .verified(let transaction) = result,
              PackProductID.all.contains(transaction.productID) else {
            return nil
        }
        return PendingSignedTransaction(
            transactionId: String(transaction.id),
            productId: transaction.productID,
            jws: result.jwsRepresentation,
            finish: { await transaction.finish() }
        )
    }
}

/// Thin Settings hook for D011 packs (not wired into god-file networking).
struct ClementinePackStoreSettingsSection: View {
    @StateObject private var store = ClementinePackStore(backend: BackendClient())
    @State private var appearTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Clementine turn packs")
                .font(IOThemTypography.UI.calloutStrong)
                .foregroundStyle(.white.opacity(0.86))

            Text("Buy Companion + Page turns in-app (StoreKit). Credits apply only after the live API verifies the App Store transaction — never TPM.")
                .font(IOThemTypography.UI.labelRegular)
                .foregroundStyle(.white.opacity(0.46))

            if store.products.isEmpty {
                Button("Load packs") {
                    Task { await store.refreshProducts() }
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("wallet.packs.reload")
            } else {
                ForEach(store.products, id: \.id) { product in
                    Button {
                        Task {
                            do {
                                _ = try await store.purchaseAndCredit(product)
                            } catch {
                                // purchaseAndCredit sets statusMessage for every failure path.
                            }
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(product.displayName)
                                    .foregroundStyle(.white.opacity(0.9))
                                Text(product.description)
                                    .font(IOThemTypography.UI.labelRegular)
                                    .foregroundStyle(.white.opacity(0.45))
                            }
                            Spacer()
                            Text(product.displayPrice)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                    .disabled(store.isBusy)
                    .accessibilityIdentifier("wallet.packs.buy.\(product.id)")
                }
            }

            if !store.statusMessage.isEmpty {
                Text(store.statusMessage)
                    .font(IOThemTypography.UI.labelRegular)
                    .foregroundStyle(.white.opacity(0.55))
                    .accessibilityIdentifier("wallet.packs.status")
            }
        }
        .onAppear {
            appearTask?.cancel()
            store.startTransactionListener()
            appearTask = Task {
                await store.refreshProducts()
                await store.recoverUnfinishedTransactions()
            }
        }
        .onDisappear {
            appearTask?.cancel()
        }
    }
}
