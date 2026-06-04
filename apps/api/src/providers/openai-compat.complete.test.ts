import { test, expect, afterEach } from "bun:test";
import { z } from "zod";
import { OpenAICompatProvider } from "./openai-compat";
import type { ProviderCapabilities, ProviderConfig } from "./types";

const cfg: ProviderConfig = {
  kind: "openai-compat",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
};
const schema = z.object({ title: z.string(), n: z.number() });
const params = { prompt: "give me json", schema, schemaName: "thing" };

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function chatJson(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    headers: { "content-type": "application/json" },
  });
}

test("complete returns validated data on clean JSON", async () => {
  globalThis.fetch = (async () =>
    chatJson(JSON.stringify({ title: "ok", n: 1 }))) as unknown as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  expect(await p.complete(params)).toEqual({ title: "ok", n: 1 });
});

test("complete strips ```json fences and surrounding prose", async () => {
  globalThis.fetch = (async () =>
    chatJson('Sure!\n```json\n{"title":"x","n":2}\n```')) as unknown as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  expect(await p.complete(params)).toEqual({ title: "x", n: 2 });
});

test("complete repairs once: bad first response, good retry", async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    return call === 1 ? chatJson("not json at all") : chatJson('{"title":"y","n":3}');
  }) as unknown as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  expect(await p.complete(params)).toEqual({ title: "y", n: 3 });
  expect(call).toBe(2);
});

test("complete throws a 422 after the repair also fails", async () => {
  globalThis.fetch = (async () => chatJson("never json")) as unknown as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  await expect(p.complete(params)).rejects.toThrow(/valid JSON/i);
});

test("json_schema capability sends response_format.json_schema", async () => {
  let sentBody: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(init.body as string);
    return chatJson('{"title":"z","n":4}');
  }) as unknown as typeof fetch;
  const caps: ProviderCapabilities = {
    structuredOutput: "json_schema",
    promptCaching: false,
    streaming: true,
  };
  const p = new OpenAICompatProvider(cfg, caps);
  await p.complete(params);
  expect(sentBody.response_format.type).toBe("json_schema");
  expect(sentBody.response_format.json_schema.name).toBe("thing");
});

test("complete does not retry on an auth error (single fetch call)", async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    return new Response("Unauthorized", { status: 401 });
  }) as unknown as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  await expect(p.complete(params)).rejects.toThrow(/api key/i);
  expect(call).toBe(1);
});
