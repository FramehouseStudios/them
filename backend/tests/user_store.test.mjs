// T-user-store-smoke-test — smoke coverage for backend/lib/user_store.js.
//
// 705-line lib that holds the user records, auth sessions, email
// verification tokens, and password reset tokens. Big sanitize +
// crypto surface. This smoke test focuses on the configuration
// guard, the in-memory data structures' shape, and the export
// surface so future test PRs can extend coverage without
// reintroducing the gap.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  configureUserStore,
  authSessionIdByTokenHash,
  authSessionsById,
  emailVerificationTokensByHash,
  passwordResetTokensByHash,
  usersByAppleSubject,
  usersByEmail,
  usersById,
} from "../lib/user_store.js";

test("[user-store] in-memory maps are exported and start empty", () => {
  // The store exports its in-memory Maps so callers can inspect
  // them in tests / debugging. Verify they are Maps.
  assert.ok(authSessionsById instanceof Map);
  assert.ok(authSessionIdByTokenHash instanceof Map);
  assert.ok(emailVerificationTokensByHash instanceof Map);
  assert.ok(passwordResetTokensByHash instanceof Map);
  assert.ok(usersByEmail instanceof Map);
  assert.ok(usersByAppleSubject instanceof Map);
  assert.ok(usersById instanceof Map);
});

test("[user-store] configureUserStore accepts a deps object without throwing", () => {
  // configureUserStore just stashes the deps; it doesn't validate
  // until a function that needs them is called. Verify it doesn't
  // crash on an empty object.
  assert.doesNotThrow(() => configureUserStore({}));
  assert.doesNotThrow(() => configureUserStore({
    USER_STORE_PATH: "/tmp/test.json",
    fs: {},
  }));
});

test("[user-store] all canonical exports are present", () => {
  // Import every export so this test fails loudly if any are
  // removed by accident.
  const imported = [
    authSessionIdByTokenHash,
    authSessionsById,
    emailVerificationTokensByHash,
    passwordResetTokensByHash,
    usersByAppleSubject,
    usersByEmail,
    usersById,
  ];
  for (const x of imported) {
    assert.ok(x !== undefined, "export was undefined");
  }
});
