import { test, expect, afterEach } from "bun:test";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";
import type { Provider } from "./types";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function collect(p: Provider): Promise<string[]> {
  const out: string[] = [];
  for await (const d of p.streamChat({ messages: [{ role: "user", content: "hi" }] })) {
    out.push(d.text);
  }
  return out;
}

test("both adapters yield the same normalized deltas for an equivalent stream", async () => {
  globalThis.fetch = (async () =>
    new Response(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""),
      { headers: { "content-type": "text/event-stream" } },
    )) as unknown as typeof fetch;
  const openai = new OpenAICompatProvider({
    kind: "openai-compat",
    baseUrl: "http://localhost:11434/v1",
    model: "m",
  });

  const fakeAnthropic = {
    messages: {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } };
          yield { type: "content_block_delta", delta: { type: "text_delta", text: "lo" } };
        },
        abort() {},
      }),
    },
  } as any;
  const anthropic = new AnthropicProvider(
    { kind: "anthropic", model: "m", apiKey: "k" },
    fakeAnthropic,
  );

  expect(await collect(openai)).toEqual(["Hel", "lo"]);
  expect(await collect(anthropic)).toEqual(["Hel", "lo"]);
});
