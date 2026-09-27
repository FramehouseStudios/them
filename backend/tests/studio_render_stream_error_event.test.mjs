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

test("[studio_render] plain-text credit exhaustion is quota and hides the provider text", () => {
  // Seen live 2026-09-27: the provider error reached the stream as plain text
  // with no type/code, was classified provider_chat_failed, and its billing
  // URL was forwarded; the app then said the service "didn't answer in time".
  const plain = new Error("You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/account/billing.");
  const event = studioRenderStreamErrorEvent({ rid: "bbe2cd1275f02f3a", error: plain });
  assert.equal(event.error_class, "provider_quota");
  assert.doesNotMatch(event.error, /openai|billing|credits|https?:/i);
});

test("[studio_render] an unclassified provider failure never forwards provider text", () => {
  const odd = new Error("Weird upstream thing at https://api.example.invalid/v1 org=org_123");
  const event = studioRenderStreamErrorEvent({ rid: "r1234567", error: odd });
  assert.match(event.error, /^Studio render failed during response generation \(provider_chat_failed\)\. Reference r1234567\.$/);
  assert.doesNotMatch(event.error, /https?:|org_/);
});

test("[studio_render] non-provider failures keep their own message", () => {
  const validation = Object.assign(new Error("Draft is too long for a Studio render."), { stage: "studio_validation", status: 400 });
  const event = studioRenderStreamErrorEvent({ rid: "r", error: validation });
  assert.equal(event.error, "Draft is too long for a Studio render.");
  assert.equal(event.stage, "studio_validation");
  assert.equal(event.error_class, undefined);
});
