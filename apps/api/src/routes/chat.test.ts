import { test, expect, afterEach } from "bun:test";
import app from "./chat";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const provider = { kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "m" };
const analysis = {
  title: "T",
  pain_points: ["p"],
  cognitive_traps: ["c"],
  turning_point: "t",
  first_question: "q",
};

function post(body: unknown) {
  return app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("400 when analysis or history missing", async () => {
  const res = await post({ provider });
  expect(res.status).toBe(400);
});

test("streams {delta} frames then [DONE] (P1 wire format unchanged)", async () => {
  globalThis.fetch = (async () =>
    new Response(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""),
      { headers: { "content-type": "text/event-stream" } },
    )) as unknown as typeof fetch;

  const res = await post({ analysis, history: [{ role: "user", content: "hi" }], provider });
  const text = await res.text();
  expect(text).toContain('data: {"delta":"Hel"}');
  expect(text).toContain('data: {"delta":"lo"}');
  expect(text).toContain("data: [DONE]");
});

test("emits an {error} frame when the provider fails mid-resolve", async () => {
  const res = await post({
    analysis,
    history: [{ role: "user", content: "hi" }],
    provider: { kind: "openai-compat", model: "m" }, // no baseUrl → fetch throws
  });
  const text = await res.text();
  expect(text).toContain('"error"');
  expect(text).toContain("data: [DONE]");
});
