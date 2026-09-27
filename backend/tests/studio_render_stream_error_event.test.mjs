import assert from "node:assert/strict";
import test from "node:test";

import { studioRenderStreamErrorEvent } from "../lib/realtime_studio_render_routes.js";

const QUOTA_BODY = JSON.stringify({
  error: {
    message: "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
    type: "insufficient_quota",
    code: "credit_balance_exhausted",
  },
}, null, 4);

test("[studio_render] a provider quota failure is classified and never forwards the provider body", () => {
  const event = studioRenderStreamErrorEvent({ rid: "0d29fcf07f406137", error: new Error(QUOTA_BODY) });
  assert.equal(event.error_class, "provider_quota");
  assert.equal(event.stage, "studio_render");
  assert.equal(event.error, "Studio render failed during response generation (provider_quota). Reference 0d29fcf0.");
  assert.doesNotMatch(event.error, /openai|billing|credits/i);
});

test("[studio_render] timeouts and rate limits are classified too", () => {
  assert.equal(studioRenderStreamErrorEvent({ rid: "r", error: new Error("request timed out") }).error_class, "provider_timeout");
  const limited = Object.assign(new Error("Too Many Requests"), { status: 429 });
  assert.equal(studioRenderStreamErrorEvent({ rid: "r", error: limited }).error_class, "provider_rate_limited");
});

test("[studio_render] non-provider failures keep their own message", () => {
  const validation = Object.assign(new Error("Draft is too long for a Studio render."), { stage: "studio_validation", status: 400 });
  const event = studioRenderStreamErrorEvent({ rid: "r", error: validation });
  assert.equal(event.error, "Draft is too long for a Studio render.");
  assert.equal(event.stage, "studio_validation");
  assert.equal(event.error_class, undefined);
});
