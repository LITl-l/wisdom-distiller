import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { ANALYZE_PROMPT } from "../prompts";
import type { AnalyzeRequest, Analysis } from "../types";

const app = new Hono();

app.post("/", async (c) => {
  const { text } = await c.req.json<AnalyzeRequest>();

  if (!text) {
    return c.json({ error: "text is required" }, 400);
  }

  const client = new Anthropic();

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `${ANALYZE_PROMPT}\n\n---\n\n${text}`,
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== "text") {
    return c.json({ error: "Unexpected response type" }, 500);
  }

  try {
    const analysis: Analysis = JSON.parse(content.text);
    return c.json(analysis);
  } catch {
    return c.json({ error: "Failed to parse analysis", raw: content.text }, 500);
  }
});

export default app;
