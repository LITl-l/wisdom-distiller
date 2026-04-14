import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { ANALYZE_PROMPT } from "../prompts";
import type { AnalyzeRequest, Analysis } from "../types";

const app = new Hono();

// Claude sometimes wraps JSON in ```json fences or adds a short preamble.
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  try {
    return JSON.parse(candidate);
  } catch {}
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  throw new Error("No JSON object found");
}

app.post("/", async (c) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return c.json({ error: "ANTHROPIC_API_KEY is not set" }, 500);
  }

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
    const analysis = extractJson(content.text) as Analysis;
    return c.json(analysis);
  } catch {
    return c.json({ error: "Failed to parse analysis", raw: content.text }, 500);
  }
});

export default app;
