import { createWalletStore } from "./wallet.js";
import { createAdapterWalletPersistence, createPostgresWalletPersistence } from "./wallet_persistence.js";

// One boot owner selects the canonical backend and hydrates before routes can
// serve. Storage failure must not masquerade as a writer with zero paid turns.
export async function bootstrapClementineWallet({ persistence, logger = console } = {}) {
  const walletPersistence = persistence?.kind === "postgres"
    ? createPostgresWalletPersistence({ client: persistence })
    : createAdapterWalletPersistence({ persistence });
  const store = createWalletStore({ persistence: walletPersistence });
  try {
    const hydrated = await store.hydrate();
    logger.log?.(`[wallet] persistence=${store.persistenceKind} balances=${hydrated.balances} iapTxns=${hydrated.transactions}`);
    return store;
  } catch (cause) {
    const error = new Error("wallet_store_unavailable", { cause });
    error.code = "WALLET_STORE_UNAVAILABLE";
    logger.error?.("[wallet] canonical balance hydration failed; refusing startup");
    throw error;
  }
}
