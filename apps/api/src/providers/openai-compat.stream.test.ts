import { test, expect, afterEach } from "bun:test";
import { OpenAICompatProvider } from "./openai-compat";
import type { ProviderConfig } from "./types";

const cfg: ProviderConfig = {
  kind: "openai-compat",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function sseResponse(frames: string[]): Response {
  const body = frames.map((f) => `data: ${f}\n\n`).join("");
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

test("streamChat yields each delta's content in order", async () => {
  globalThis.fetch = (async () =>
    sseResponse([
      JSON.stringify({ choices: [{ delta: { content: "Hel" } }] }),
      JSON.stringify({ choices: [{ delta: { content: "lo" } }] }),
      "[DONE]",
    ])) as typeof fetch;

  const p = new OpenAICompatProvider(cfg);
  const out: string[] = [];
  for await (const d of p.streamChat({ messages: [{ role: "user", content: "hi" }] })) {
    out.push(d.text);
  }
  expect(out).toEqual(["Hel", "lo"]);
});

test("streamChat throws a normalized error on HTTP 401 without leaking the key", async () => {
  globalThis.fetch = (async () =>
    new Response("Unauthorized", { status: 401 })) as typeof fetch;

  const p = new OpenAICompatProvider({ ...cfg, apiKey: "sk-leak-me" });
  await expect(async () => {
    for await (const _ of p.streamChat({ messages: [{ role: "user", content: "hi" }] })) {
      // drain
    }
  }).toThrow(/api key/i);
});

test("streamChat maps a refused connection to a friendly error", async () => {
  globalThis.fetch = (async () => {
    throw { code: "ECONNREFUSED" };
  }) as typeof fetch;

  const p = new OpenAICompatProvider(cfg);
  await expect(async () => {
    for await (const _ of p.streamChat({ messages: [{ role: "user", content: "hi" }] })) {
      // drain
    }
  }).toThrow(/running/i);
});
