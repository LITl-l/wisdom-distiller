import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import Anthropic from "@anthropic-ai/sdk";
import { SESSION_SYSTEM_PROMPT } from "../prompts";
import type { ChatRequest } from "../types";

const app = new Hono();

app.post("/", async (c) => {
  const { analysis, history } = await c.req.json<ChatRequest>();

  if (!analysis || !history) {
    return c.json({ error: "analysis and history are required" }, 400);
  }

  const client = new Anthropic();

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 512,
    system: SESSION_SYSTEM_PROMPT(JSON.stringify(analysis)),
    messages: history,
  });

  return streamSSE(c, async (sseStream) => {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        await sseStream.writeSSE({
          data: JSON.stringify({ delta: event.delta.text }),
        });
      }
    }
    await sseStream.writeSSE({ data: "[DONE]" });
  });
});

export default app;
