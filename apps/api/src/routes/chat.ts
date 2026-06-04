import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { resolveProvider } from "../providers/registry";
import { buildSessionSystem } from "../modes/socratic";
import type { ChatRequest } from "../types";

const app = new Hono();

app.post("/", async (c) => {
  const { analysis, history, provider } = await c.req.json<ChatRequest>();
  if (!analysis || !history) {
    return c.json({ error: "analysis and history are required" }, 400);
  }
  if (!provider) {
    return c.json({ error: "provider is required" }, 400);
  }

  return streamSSE(c, async (sse) => {
    try {
      const p = resolveProvider(provider);
      const system = buildSessionSystem(analysis);
      for await (const delta of p.streamChat(
        { system, messages: history, maxTokens: 512 },
        c.req.raw.signal,
      )) {
        await sse.writeSSE({ data: JSON.stringify({ delta: delta.text }) });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Chat failed";
      await sse.writeSSE({ data: JSON.stringify({ error: message }) });
    } finally {
      await sse.writeSSE({ data: "[DONE]" });
    }
  });
});

export default app;
