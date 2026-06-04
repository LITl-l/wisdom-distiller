import { test, expect, afterEach } from "bun:test";
import app from "./analyze";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const provider = { kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "m" };

function post(body: unknown) {
  return app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("400 when text is missing", async () => {
  const res = await post({ provider });
  expect(res.status).toBe(400);
});

test("400 when provider is missing", async () => {
  const res = await post({ text: "hello" });
  expect(res.status).toBe(400);
});

test("returns validated analysis JSON on success", async () => {
  const analysis = {
    title: "T",
    pain_points: ["p"],
    cognitive_traps: ["c"],
    turning_point: "t",
    first_question: "q",
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis) } }] }), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

  const res = await post({ text: "article", provider });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(analysis);
});

test("surfaces a normalized provider error status (401 → 401, no key leak)", async () => {
  globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as unknown as typeof fetch;
  const res = await post({ text: "article", provider: { ...provider, apiKey: "sk-leak" } });
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain("sk-leak");
});
