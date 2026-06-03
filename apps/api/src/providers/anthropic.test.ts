import { test, expect } from "bun:test";
import { z } from "zod";
import { AnthropicProvider } from "./anthropic";
import type { ProviderConfig } from "./types";

const cfg: ProviderConfig = { kind: "anthropic", model: "claude-sonnet-4-20250514", apiKey: "sk-x" };

function fakeClient(opts: {
  streamEvents?: any[];
  toolInput?: unknown;
  createImpl?: () => any;
}) {
  return {
    messages: {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          for (const ev of opts.streamEvents ?? []) yield ev;
        },
        abort() {},
      }),
      create:
        opts.createImpl ??
        (async () => ({ content: [{ type: "tool_use", input: opts.toolInput }] })),
    },
  } as any;
}

test("streamChat yields text_delta events", async () => {
  const client = fakeClient({
    streamEvents: [
      { type: "content_block_delta", delta: { type: "text_delta", text: "Ab" } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "c" } },
      { type: "message_stop" },
    ],
  });
  const p = new AnthropicProvider(cfg, client);
  const out: string[] = [];
  for await (const d of p.streamChat({ messages: [{ role: "user", content: "hi" }] })) {
    out.push(d.text);
  }
  expect(out).toEqual(["Ab", "c"]);
});

test("complete returns validated tool_use input", async () => {
  const schema = z.object({ title: z.string() });
  const client = fakeClient({ toolInput: { title: "ok" } });
  const p = new AnthropicProvider(cfg, client);
  expect(await p.complete({ prompt: "x", schema, schemaName: "thing" })).toEqual({ title: "ok" });
});

test("complete throws 422 when tool input fails schema", async () => {
  const schema = z.object({ title: z.string() });
  const client = fakeClient({ toolInput: { title: 123 } });
  const p = new AnthropicProvider(cfg, client);
  await expect(p.complete({ prompt: "x", schema, schemaName: "thing" })).rejects.toThrow(/validation/i);
});

test("complete maps an SDK HTTP error to a normalized ProviderError", async () => {
  const schema = z.object({ title: z.string() });
  const client = fakeClient({
    createImpl: async () => {
      throw { status: 401, message: "bad key" };
    },
  });
  const p = new AnthropicProvider(cfg, client);
  await expect(p.complete({ prompt: "x", schema, schemaName: "thing" })).rejects.toThrow(/api key/i);
});

test("complete throws 422 when the model returns no tool_use block", async () => {
  const schema = z.object({ title: z.string() });
  const client = fakeClient({
    createImpl: async () => ({ content: [{ type: "text", text: "I won't use the tool." }] }),
  });
  const p = new AnthropicProvider(cfg, client);
  await expect(p.complete({ prompt: "x", schema, schemaName: "thing" })).rejects.toThrow(
    /structured tool output/i,
  );
});

test("streamChat maps an SDK HTTP error to a normalized ProviderError", async () => {
  const client = {
    messages: {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          throw { status: 401, message: "bad key" };
        },
        abort() {},
      }),
    },
  } as any;
  const p = new AnthropicProvider(cfg, client);
  await expect(async () => {
    for await (const _ of p.streamChat({ messages: [{ role: "user", content: "hi" }] })) {
      // drain
    }
  }).toThrow(/api key/i);
});
