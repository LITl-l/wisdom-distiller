import { test, expect, afterEach } from "bun:test";
import app from "./provider";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const provider = { kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "m" };

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("/models returns model ids from /v1/models", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: "llama3.1" }, { id: "qwen2.5" }] }), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  const res = await post("/models", { provider });
  expect(await res.json()).toEqual({ models: ["llama3.1", "qwen2.5"] });
});

test("/test returns ok:true with models on success", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: "llama3.1" }] }), {
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  const res = await post("/test", { provider });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, models: ["llama3.1"] });
});

test("/test returns ok:false with a friendly message on refusal (no key leak)", async () => {
  globalThis.fetch = (async () => {
    throw { code: "ECONNREFUSED" };
  }) as unknown as typeof fetch;
  const res = await post("/test", { provider: { ...provider, apiKey: "sk-leak" } });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.error).toMatch(/running/i);
  expect(JSON.stringify(body)).not.toContain("sk-leak");
});
