import { Hono } from "hono";
import Anthropic from "@anthropic-ai/sdk";
import { httpToProviderError, networkToProviderError, ProviderError } from "../providers/errors";
import type { ProviderConfig } from "../providers/types";

const app = new Hono();

async function listModels(provider: ProviderConfig): Promise<string[]> {
  if (provider.kind === "anthropic") {
    const client = new Anthropic({ apiKey: provider.apiKey });
    const res = await client.models.list({ limit: 20 });
    return res.data.map((m) => m.id);
  }
  let res: Response;
  try {
    res = await fetch(`${provider.baseUrl}/models`, {
      headers: provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {},
    });
  } catch (e) {
    throw networkToProviderError(e, provider);
  }
  if (!res.ok) {
    throw httpToProviderError(res.status, await res.text().catch(() => ""), provider);
  }
  const json = await res.json();
  return (json.data ?? []).map((m: { id: string }) => m.id);
}

app.post("/models", async (c) => {
  const { provider } = await c.req.json<{ provider: ProviderConfig }>();
  try {
    return c.json({ models: await listModels(provider) });
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 502;
    return c.json({ error: e instanceof Error ? e.message : "Failed to list models" }, status as any);
  }
});

app.post("/test", async (c) => {
  const { provider } = await c.req.json<{ provider: ProviderConfig }>();
  try {
    const models = await listModels(provider);
    return c.json({ ok: true, models });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : "Connection failed" });
  }
});

export default app;
