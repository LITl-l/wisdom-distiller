import { Hono } from "hono";
import { resolveProvider } from "../providers/registry";
import { ProviderError } from "../providers/errors";
import { buildAnalyzeParams } from "../modes/socratic";
import type { AnalyzeRequest } from "../types";

const app = new Hono();

app.post("/", async (c) => {
  const { text, provider } = await c.req.json<AnalyzeRequest>();
  if (!text) return c.json({ error: "text is required" }, 400);
  if (!provider) return c.json({ error: "provider is required" }, 400);

  try {
    const p = resolveProvider(provider);
    const analysis = await p.complete(buildAnalyzeParams(text));
    return c.json(analysis);
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Analysis failed";
    return c.json({ error: message }, status as any);
  }
});

export default app;
