import Combine
import Foundation
import StoreKit
import SwiftUI
import os

/// D011 — StoreKit 2 purchase → server verify+credit for Clementine turn packs.
/// Kept out of RootExperienceView / Studio god files (D009). Networking goes
/// through `BackendClient.creditIapPack` with Keychain session (Authorization).
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
    }

    @Published private(set) var products: [Product] = []
    @Published private(set) var lastBalance: BackendIapCreditResult?
    @Published private(set) var statusMessage: String = ""
    @Published private(set) var isBusy: Bool = false

    private let dependencies: Dependencies

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
                }
            )
        )
    }

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

    /// Purchase a StoreKit product, then send the signed transaction to the API host.
    /// Returns the calm wallet balance from `POST /billing/iap/credit`.
    @discardableResult
    func purchaseAndCredit(_ product: Product) async throws -> BackendIapCreditResult {
        isBusy = true
        defer { isBusy = false }

        let result = try await dependencies.purchase(product)
        switch result {
        case .success(let verification):
            let transaction = try Self.unwrapVerified(verification)
            let jws = verification.jwsRepresentation
            let balance = try await dependencies.creditIapPack(jws)
            await transaction.finish()
            lastBalance = balance
            statusMessage = balance.alreadyCredited
                ? "Pack already applied. Companion \(Int(balance.companionTurnsLeft)), Page \(Int(balance.pageTurnsLeft))."
                : "Pack applied. Companion \(Int(balance.companionTurnsLeft)), Page \(Int(balance.pageTurnsLeft))."
            return balance
        case .userCancelled:
            statusMessage = "Purchase cancelled."
            throw BackendError.stage("iap_purchase", "user_cancelled")
        case .pending:
            statusMessage = "Purchase pending approval."
            throw BackendError.stage("iap_purchase", "pending")
        @unknown default:
            statusMessage = "Purchase failed."
            throw BackendError.stage("iap_purchase", "unknown_result")
        }
    }

    /// Test / recovery path: credit an already-held signed transaction JWS.
    @discardableResult
    func creditSignedTransaction(_ jws: String) async throws -> BackendIapCreditResult {
        let balance = try await dependencies.creditIapPack(jws)
        lastBalance = balance
        return balance
    }

    private static func unwrapVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let value):
            return value
        }
    }
}

/// Thin Settings hook for D011 packs (not wired into god-file networking).
struct ClementinePackStoreSettingsSection: View {
    @StateObject private var store = ClementinePackStore(backend: BackendClient())
    @State private var appearTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Clementine turn packs")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.86))

            Text("Buy Companion + Page turns in-app (StoreKit). Credits apply only after the live API verifies the App Store transaction — never TPM.")
                .font(.system(size: 11, weight: .regular))
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
                                // statusMessage already set for cancel/pending; keep quiet otherwise
                            }
                        }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(product.displayName)
                                    .foregroundStyle(.white.opacity(0.9))
                                Text(product.description)
                                    .font(.system(size: 11))
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
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.white.opacity(0.55))
                    .accessibilityIdentifier("wallet.packs.status")
            }
        }
        .onAppear {
            appearTask?.cancel()
            appearTask = Task { await store.refreshProducts() }
        }
        .onDisappear {
            appearTask?.cancel()
        }
    }
}
