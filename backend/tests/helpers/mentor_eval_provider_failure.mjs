// Subprocess transport fixture: never sends network requests or uses real keys.
import { CASES } from "../../evals/mentor_conversation/cases.mjs";
globalThis.fetch = async input => {
  console.log("mentor-eval-fixture-provider-call");
  if (process.env.MENTOR_EVAL_FIXTURE_SUCCESS === "1") {
    const reply = CASES.find(item => item.id === "pitch-talk-to-me").golden;
    return Response.json(String(input?.url || input).endsWith("/responses")
      ? { output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: reply }] }] }
      : { choices: [{ message: { content: reply } }] });
  }
  return Response.json({ error: { message: "fixture-error-secret-canary", code: "invalid_api_key" } }, { status: 401 });
};
