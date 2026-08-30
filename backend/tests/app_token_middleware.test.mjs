import assert from "node:assert/strict";
import test from "node:test";

import { isAppTokenBypassPath } from "../middleware/auth.js";

test("[app-token-middleware] readiness endpoints bypass the app token gate", () => {
  assert.equal(isAppTokenBypassPath("/health"), true);
  assert.equal(isAppTokenBypassPath("/healthz"), true);
  assert.equal(isAppTokenBypassPath("/bridge"), true);
});

test("[app-token-middleware] production API endpoints stay behind the app token gate", () => {
  assert.equal(isAppTokenBypassPath("/api/version"), false);
  assert.equal(isAppTokenBypassPath("/realtime/health"), false);
  assert.equal(isAppTokenBypassPath("/talk"), false);
  assert.equal(isAppTokenBypassPath(""), false);
});
