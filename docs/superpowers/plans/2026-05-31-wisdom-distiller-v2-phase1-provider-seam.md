# Wisdom Distiller v2 — Phase 1: Provider Seam + BYO Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the API's hardcoded Anthropic client with a pluggable provider seam (local OpenAI-compatible servers + cloud + native Anthropic) driven by a per-request "bring-your-own" config the user sets in an in-app settings panel.

**Architecture:** The API gains `providers/` (adapters behind a `Provider` interface), capability-driven structured output (zod-validated with a repair retry), and normalized provider errors. Routes (`analyze`/`chat`) resolve a provider per request from a `ProviderConfig` sent by the client; the socratic prompts + analysis schema move into `modes/socratic.ts` as plain exports (the full mode *registry* is deferred to Phase 2). The web app gains a localStorage-backed provider config + a settings panel and forwards the config on every request. The SSE wire format (`{delta}` / `[DONE]`) is **unchanged** in P1 — the AG-UI envelope is Phase 2.

**Tech Stack:** Bun (runtime + `bun test`), Hono, `@anthropic-ai/sdk`, **`zod` (new, api-only)**, `linkedom`; Solid.js + Vite 8 + Tailwind v4 (web). OpenAI-compatible `POST /v1/chat/completions` is the universal provider surface.

**Spec:** `docs/superpowers/specs/2026-05-30-wisdom-distiller-v2-design.md` (Approach B). This plan implements **§17 P1** only.

---

## Conventions (read once)

- **All commands assume you are inside the dev shell:** run `nix develop` first (provides `bun`/`node`). Commands below are written as bare `bun ...`.
- **Version control is `jj` (Jujutsu), NOT git.** Per-task commits use `jj commit -m "..."`. Never run `git` directly. Always pass `-m`.
- **Commit message convention:** gitmoji + conventional commit with mandatory scope, e.g. `:sparkles: feat(api): add provider seam`. Append this trailer to each commit body (shown in full in Task 1; abbreviated as "…+ co-author trailer" thereafter):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Branch:** do all P1 work on bookmark `feat/provider-seam` off `main` (created in Task 1). The spec lives in PR #4 and can merge independently.
- **TDD loop every task:** write failing test → run it red → minimal impl → run it green → commit. `bun test` discovers `*.test.ts`.
- **Secrets rule (load-bearing):** API keys must **never** appear in logs, thrown error messages, or echoed responses. Tests assert this.

### Intentional deviations from the spec

- **No server-side env-default provider.** Spec §7 lists precedence "per-request override → env default." P1 implements **only** the per-request provider from the settings panel; a missing provider yields an actionable error, not a silent server-key fallback. Rationale: a server-held default key contradicts the BYO/local-personal model and the stateless-server decision (§7, §14). If a default is ever wanted, it belongs behind an explicit opt-in flag — out of scope for P1.

---

## File Structure

**API (`apps/api/src/`):**

| Path | Responsibility | Action |
|---|---|---|
| `providers/types.ts` | `Provider`, `ProviderConfig`, `ProviderKind`, `ProviderCapabilities`, `ChatParams`, `TextDelta`, `StructuredParams<T>` | Create |
| `providers/errors.ts` | `ProviderError` + `httpToProviderError` / `networkToProviderError` (normalized, key-safe) | Create |
| `providers/jsonSchema.ts` | `toJsonSchema(zodSchema)` — single wrapper over zod→JSON Schema | Create |
| `providers/capabilities.ts` | `inferCapabilities(config)` — kind + host → capabilities | Create |
| `providers/openai-compat.ts` | `OpenAICompatProvider` — fetch → `/chat/completions` (stream + structured) | Create |
| `providers/anthropic.ts` | `AnthropicProvider` — native SDK (stream + forced tool-use JSON + caching) | Create |
| `providers/registry.ts` | `resolveProvider(config)` → adapter instance | Create |
| `modes/socratic.ts` | `AnalysisSchema`, `Analysis`, `buildAnalyzeParams`, `buildSessionSystem` | Create |
| `prompts.ts` | Japanese socratic prompt strings | Keep (unchanged) |
| `types.ts` | request/response types; re-export `Analysis`; add `provider` to requests | Modify |
| `routes/fetch.ts` | URL→text | Keep (unchanged) |
| `routes/analyze.ts` | `resolveProvider` + `buildAnalyzeParams` + `provider.complete` | Rewrite |
| `routes/chat.ts` | `resolveProvider` + `buildSessionSystem` + `provider.streamChat` (keeps `{delta}`) | Rewrite |
| `routes/provider.ts` | `POST /api/provider/test`, `POST /api/provider/models` | Create |
| `index.ts` | wire `/api/provider` route | Modify |
| `package.json` | add `zod`, add `test` script | Modify |

**Web (`apps/web/src/`):** P1 keeps the current **flat layout** (FSD restructure is P3).

| Path | Responsibility | Action |
|---|---|---|
| `config/presets.ts` | `ProviderConfig`, `Preset`, `PRESETS`, `presetById` | Create |
| `config/store.ts` | localStorage load/save/redact + `providerConfig` signal + `isConfigUsable` | Create |
| `components/SettingsPanel.tsx` | preset picker, fields, fetch-models, test-connection, save | Create |
| `hooks/useSession.ts` | forward `provider`; guard missing config; handle `{error}` SSE | Modify |
| `main.tsx` | settings gate + gear button | Modify |

---

## Task 1: Project setup — add `zod`, test script, branch

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/providers/sanity.test.ts` (temporary)

- [ ] **Step 1: Create the feature branch**

Run:
```bash
cd /home/nixos/wkspace/wisdom-distiller
jj new main -m "feat(provider-seam): start phase 1"
jj bookmark create feat/provider-seam
```
Expected: a new working-copy commit on a fresh bookmark off `main`.

- [ ] **Step 2: Add `zod` and a `test` script to the API package**

Edit `apps/api/package.json` to:
```json
{
  "name": "api",
  "private": true,
  "scripts": {
    "dev": "bun run --hot src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.82.0",
    "hono": "^4.12.10",
    "linkedom": "^0.18.12",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/bun": "^1.2.0",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 3: Install**

Run: `bun install`
Expected: `zod` resolves and `bun.lock` updates.

- [ ] **Step 4: Write a sanity test that proves `bun test` + `zod` work**

Create `apps/api/src/providers/sanity.test.ts`:
```ts
import { test, expect } from "bun:test";
import { z } from "zod";

test("zod parses a known-good object", () => {
  const schema = z.object({ ok: z.boolean() });
  expect(schema.parse({ ok: true })).toEqual({ ok: true });
});
```

- [ ] **Step 5: Run it green**

Run: `bun test apps/api/src/providers/sanity.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 6: Delete the sanity test, commit**

Run:
```bash
rm apps/api/src/providers/sanity.test.ts
jj commit -m ":wrench: chore(api): add zod and bun test script

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Provider types + `ProviderError`

**Files:**
- Create: `apps/api/src/providers/types.ts`
- Create: `apps/api/src/providers/errors.ts`
- Test: `apps/api/src/providers/errors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/providers/errors.test.ts`:
```ts
import { test, expect } from "bun:test";
import { ProviderError, httpToProviderError, networkToProviderError } from "./errors";
import type { ProviderConfig } from "./types";

const cfg: ProviderConfig = {
  kind: "openai-compat",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
  apiKey: "sk-super-secret-value",
};

test("ProviderError carries an HTTP status", () => {
  const e = new ProviderError(429, "slow down");
  expect(e.status).toBe(429);
  expect(e.message).toBe("slow down");
});

test("401 maps to an actionable, key-free message", () => {
  const e = httpToProviderError(401, "Unauthorized", cfg);
  expect(e.status).toBe(401);
  expect(e.message.toLowerCase()).toContain("api key");
  expect(e.message).not.toContain("sk-super-secret-value");
});

test("ECONNREFUSED maps to a 'is your server running' message", () => {
  const e = networkToProviderError({ code: "ECONNREFUSED" }, cfg);
  expect(e.status).toBe(502);
  expect(e.message).toContain("http://localhost:11434/v1");
  expect(e.message).not.toContain("sk-super-secret-value");
});

test("network error reads code from err.cause too", () => {
  const e = networkToProviderError({ cause: { code: "ECONNREFUSED" } }, cfg);
  expect(e.message.toLowerCase()).toContain("running");
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/providers/errors.test.ts`
Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 3: Create the types**

Create `apps/api/src/providers/types.ts`:
```ts
import type { ZodType } from "zod";

export type ProviderKind = "openai-compat" | "anthropic";

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl?: string; // openai-compat (local or cloud); ignored by native anthropic
  model: string;
  apiKey?: string; // optional for local servers
  headers?: Record<string, string>;
}

export interface ProviderCapabilities {
  structuredOutput: "json_schema" | "tool_use" | "json_object" | "prompt_only";
  promptCaching: boolean;
  streaming: boolean;
}

export interface ChatParams {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

export interface TextDelta {
  text: string;
}

export interface StructuredParams<T> {
  system?: string;
  prompt: string;
  schema: ZodType<T>;
  schemaName: string;
  maxTokens?: number;
}

export interface Provider {
  readonly config: ProviderConfig;
  readonly capabilities: ProviderCapabilities;
  streamChat(params: ChatParams, signal?: AbortSignal): AsyncIterable<TextDelta>;
  complete<T>(params: StructuredParams<T>): Promise<T>;
}
```

- [ ] **Step 4: Create the errors module**

Create `apps/api/src/providers/errors.ts`:
```ts
import type { ProviderConfig } from "./types";

export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const where = (config: ProviderConfig) =>
  config.baseUrl ?? (config.kind === "anthropic" ? "the Anthropic API" : "the provider");

export function httpToProviderError(
  status: number,
  bodyText: string,
  config: ProviderConfig,
): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(status, "Authentication failed — check your API key.");
  }
  if (status === 404) {
    return new ProviderError(
      status,
      `Not found — is the model "${config.model}" available at ${where(config)}?`,
    );
  }
  if (status === 429) {
    return new ProviderError(status, "Rate limited — wait a moment and try again.");
  }
  const snippet = bodyText.slice(0, 200).trim();
  return new ProviderError(status, `Provider error (${status})${snippet ? `: ${snippet}` : ""}`);
}

export function networkToProviderError(err: unknown, config: ProviderConfig): ProviderError {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === "ECONNREFUSED" || code === "ConnectionRefused") {
    return new ProviderError(
      502,
      `Could not reach the model server at ${where(config)}. Is it running (Ollama / LM Studio / llama.cpp)?`,
    );
  }
  const msg = (err as Error)?.message ?? "unknown error";
  return new ProviderError(502, `Network error contacting the provider: ${msg}`);
}
```

> Note: `bodyText`/`err.message` could in theory echo a key the *user* pasted into a URL; we only ever pass server-side response bodies and network errors here, never the request headers, so the key is not present. The tests assert the key never leaks.

- [ ] **Step 5: Run it green**

Run: `bun test apps/api/src/providers/errors.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 6: Commit**

Run:
```bash
jj commit -m ":sparkles: feat(api): add provider types and normalized errors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `toJsonSchema` (zod → JSON Schema)

**Files:**
- Create: `apps/api/src/providers/jsonSchema.ts`
- Test: `apps/api/src/providers/jsonSchema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/providers/jsonSchema.test.ts`:
```ts
import { test, expect } from "bun:test";
import { z } from "zod";
import { toJsonSchema } from "./jsonSchema";

test("converts a zod object to a JSON Schema with the right shape", () => {
  const schema = z.object({
    title: z.string(),
    tags: z.array(z.string()),
  });
  const json = toJsonSchema(schema) as {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  expect(json.type).toBe("object");
  expect(Object.keys(json.properties)).toEqual(["title", "tags"]);
  expect((json.properties.tags as { type: string }).type).toBe("array");
  expect(json.required).toContain("title");
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/providers/jsonSchema.test.ts`
Expected: FAIL — `Cannot find module './jsonSchema'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/providers/jsonSchema.ts`:
```ts
import { z, type ZodType } from "zod";

/**
 * Single conversion point from a zod schema to a plain JSON Schema object,
 * used for OpenAI `response_format.json_schema` and Anthropic tool `input_schema`.
 * Isolated here so any zod-version API change is a one-line fix.
 */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}
```

> If `z.toJSONSchema` is unavailable in the installed zod, the test in Step 1 fails loudly; switch this body to a maintained converter (`zod-to-json-schema`) — the rest of the codebase only depends on `toJsonSchema`, so nothing else changes.

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/providers/jsonSchema.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

Run:
```bash
jj commit -m ":sparkles: feat(api): add zod to JSON Schema converter

…+ co-author trailer"
```
(Use the full trailer line shown in Task 1.)

---

## Task 4: `inferCapabilities`

**Files:**
- Create: `apps/api/src/providers/capabilities.ts`
- Test: `apps/api/src/providers/capabilities.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/providers/capabilities.test.ts`:
```ts
import { test, expect } from "bun:test";
import { inferCapabilities } from "./capabilities";

test("anthropic kind → tool_use + caching", () => {
  const c = inferCapabilities({ kind: "anthropic", model: "claude-sonnet-4-20250514" });
  expect(c.structuredOutput).toBe("tool_use");
  expect(c.promptCaching).toBe(true);
  expect(c.streaming).toBe(true);
});

test("openai.com → json_schema", () => {
  const c = inferCapabilities({
    kind: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });
  expect(c.structuredOutput).toBe("json_schema");
});

test("local Ollama → json_object (safe default)", () => {
  const c = inferCapabilities({
    kind: "openai-compat",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
  });
  expect(c.structuredOutput).toBe("json_object");
  expect(c.promptCaching).toBe(false);
});

test("missing/garbage baseUrl → json_object, no throw", () => {
  const c = inferCapabilities({ kind: "openai-compat", model: "x" });
  expect(c.structuredOutput).toBe("json_object");
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/providers/capabilities.test.ts`
Expected: FAIL — `Cannot find module './capabilities'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/providers/capabilities.ts`:
```ts
import type { ProviderCapabilities, ProviderConfig } from "./types";

const JSON_SCHEMA_HOSTS = ["api.openai.com", "openrouter.ai"];

export function inferCapabilities(config: ProviderConfig): ProviderCapabilities {
  if (config.kind === "anthropic") {
    return { structuredOutput: "tool_use", promptCaching: true, streaming: true };
  }
  let host = "";
  try {
    host = new URL(config.baseUrl ?? "").host;
  } catch {
    host = "";
  }
  const supportsJsonSchema = JSON_SCHEMA_HOSTS.some((h) => host.endsWith(h));
  return {
    structuredOutput: supportsJsonSchema ? "json_schema" : "json_object",
    promptCaching: false,
    streaming: true,
  };
}
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/providers/capabilities.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(api): infer provider capabilities from config

…+ co-author trailer"`

---

## Task 5: `OpenAICompatProvider.streamChat`

**Files:**
- Create: `apps/api/src/providers/openai-compat.ts`
- Test: `apps/api/src/providers/openai-compat.stream.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/providers/openai-compat.stream.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/providers/openai-compat.stream.test.ts`
Expected: FAIL — `Cannot find module './openai-compat'`.

- [ ] **Step 3: Implement (streamChat + shared helpers)**

Create `apps/api/src/providers/openai-compat.ts`:
```ts
import type {
  ChatParams,
  Provider,
  ProviderCapabilities,
  ProviderConfig,
  StructuredParams,
  TextDelta,
} from "./types";
import { httpToProviderError, networkToProviderError } from "./errors";

const DEFAULT_CAPS: ProviderCapabilities = {
  structuredOutput: "json_object",
  promptCaching: false,
  streaming: true,
};

export class OpenAICompatProvider implements Provider {
  constructor(
    public readonly config: ProviderConfig,
    public readonly capabilities: ProviderCapabilities = DEFAULT_CAPS,
  ) {}

  #headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...(this.config.headers ?? {}),
    };
  }

  #endpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  async *streamChat(params: ChatParams, signal?: AbortSignal): AsyncIterable<TextDelta> {
    let res: Response;
    try {
      res = await fetch(this.#endpoint(), {
        method: "POST",
        signal,
        headers: this.#headers(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            ...(params.system ? [{ role: "system", content: params.system }] : []),
            ...params.messages,
          ],
          stream: true,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 512,
        }),
      });
    } catch (e) {
      throw networkToProviderError(e, this.config);
    }
    if (!res.ok) {
      throw httpToProviderError(res.status, await res.text().catch(() => ""), this.config);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield { text: delta };
        } catch {
          // skip malformed frame
        }
      }
    }
  }

  // complete<T> implemented in Task 6
  async complete<T>(_params: StructuredParams<T>): Promise<T> {
    throw new Error("not implemented");
  }
}
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/providers/openai-compat.stream.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(api): add openai-compat streaming adapter

…+ co-author trailer"`

---

## Task 6: `OpenAICompatProvider.complete` (structured + repair)

**Files:**
- Modify: `apps/api/src/providers/openai-compat.ts` (replace the stub `complete`)
- Test: `apps/api/src/providers/openai-compat.complete.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/providers/openai-compat.complete.test.ts`:
```ts
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
    chatJson(JSON.stringify({ title: "ok", n: 1 }))) as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  expect(await p.complete(params)).toEqual({ title: "ok", n: 1 });
});

test("complete strips ```json fences and surrounding prose", async () => {
  globalThis.fetch = (async () =>
    chatJson('Sure!\n```json\n{"title":"x","n":2}\n```')) as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  expect(await p.complete(params)).toEqual({ title: "x", n: 2 });
});

test("complete repairs once: bad first response, good retry", async () => {
  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    return call === 1 ? chatJson("not json at all") : chatJson('{"title":"y","n":3}');
  }) as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  expect(await p.complete(params)).toEqual({ title: "y", n: 3 });
  expect(call).toBe(2);
});

test("complete throws a 422 after the repair also fails", async () => {
  globalThis.fetch = (async () => chatJson("never json")) as typeof fetch;
  const p = new OpenAICompatProvider(cfg);
  await expect(p.complete(params)).rejects.toThrow(/valid JSON/i);
});

test("json_schema capability sends response_format.json_schema", async () => {
  let sentBody: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sentBody = JSON.parse(init.body as string);
    return chatJson('{"title":"z","n":4}');
  }) as typeof fetch;
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
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/providers/openai-compat.complete.test.ts`
Expected: FAIL — `complete` throws "not implemented".

- [ ] **Step 3: Implement**

In `apps/api/src/providers/openai-compat.ts`, add the import and a module-level helper, and replace the stub `complete`:

Add to the existing imports at the top:
```ts
import { httpToProviderError, networkToProviderError, ProviderError } from "./errors";
import { toJsonSchema } from "./jsonSchema";
```
(Replace the existing `errors` import line with this one so `ProviderError` is included.)

Add this helper below the imports (module scope):
```ts
type Strategy = ProviderCapabilities["structuredOutput"];

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const slice = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  try {
    return JSON.parse(slice);
  } catch {
    return undefined;
  }
}
```

Replace the stub `complete` method with:
```ts
  async complete<T>(params: StructuredParams<T>): Promise<T> {
    const strategies: Strategy[] = [this.capabilities.structuredOutput];
    if (strategies[0] !== "prompt_only") strategies.push("prompt_only");

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const isLast = i === strategies.length - 1;
      try {
        const raw = await this.#requestJson(params, strategy);
        const parsed = params.schema.safeParse(extractJson(raw));
        if (parsed.success) return parsed.data;
      } catch (e) {
        if (isLast) throw e; // network/HTTP error on the final attempt → surface it
        // otherwise fall through and try the next strategy
      }
    }
    throw new ProviderError(
      422,
      `The model did not return valid JSON for "${params.schemaName}". Try a more capable model.`,
    );
  }

  async #requestJson<T>(params: StructuredParams<T>, strategy: Strategy): Promise<string> {
    const needsInstruction = strategy !== "json_schema";
    const userContent =
      params.prompt +
      (needsInstruction
        ? "\n\nReturn ONLY a single JSON object. No markdown fences, no prose."
        : "");

    const body: Record<string, unknown> = {
      model: this.config.model,
      temperature: 0.4,
      max_tokens: params.maxTokens ?? 1024,
      stream: false,
      messages: [
        ...(params.system ? [{ role: "system", content: params.system }] : []),
        { role: "user", content: userContent },
      ],
    };
    if (strategy === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: params.schemaName, schema: toJsonSchema(params.schema), strict: true },
      };
    } else if (strategy === "json_object") {
      body.response_format = { type: "json_object" };
    }

    let res: Response;
    try {
      res = await fetch(this.#endpoint(), {
        method: "POST",
        headers: this.#headers(),
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw networkToProviderError(e, this.config);
    }
    if (!res.ok) {
      throw httpToProviderError(res.status, await res.text().catch(() => ""), this.config);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  }
```

- [ ] **Step 4: Run both openai-compat test files green**

Run: `bun test apps/api/src/providers/openai-compat.complete.test.ts apps/api/src/providers/openai-compat.stream.test.ts`
Expected: PASS (8 pass total).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(api): add capability-driven structured output with repair

…+ co-author trailer"`

---

## Task 7: `AnthropicProvider` (stream + forced tool-use + caching)

**Files:**
- Create: `apps/api/src/providers/anthropic.ts`
- Test: `apps/api/src/providers/anthropic.test.ts`

- [ ] **Step 1: Write the failing test (inject a fake SDK client)**

Create `apps/api/src/providers/anthropic.test.ts`:
```ts
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
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/providers/anthropic.test.ts`
Expected: FAIL — `Cannot find module './anthropic'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/providers/anthropic.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatParams,
  Provider,
  ProviderCapabilities,
  ProviderConfig,
  StructuredParams,
  TextDelta,
} from "./types";
import { httpToProviderError, ProviderError } from "./errors";
import { toJsonSchema } from "./jsonSchema";

export class AnthropicProvider implements Provider {
  readonly capabilities: ProviderCapabilities = {
    structuredOutput: "tool_use",
    promptCaching: true,
    streaming: true,
  };
  #client: Anthropic;

  constructor(
    public readonly config: ProviderConfig,
    client?: Anthropic,
  ) {
    this.#client = client ?? new Anthropic({ apiKey: config.apiKey });
  }

  async *streamChat(params: ChatParams, signal?: AbortSignal): AsyncIterable<TextDelta> {
    const stream = this.#client.messages.stream({
      model: this.config.model,
      max_tokens: params.maxTokens ?? 512,
      system: params.system,
      messages: params.messages,
    });
    if (signal) signal.addEventListener("abort", () => stream.abort());
    for await (const event of stream as AsyncIterable<any>) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield { text: event.delta.text };
      }
    }
  }

  async complete<T>(params: StructuredParams<T>): Promise<T> {
    let res: any;
    try {
      res = await this.#client.messages.create({
        model: this.config.model,
        max_tokens: params.maxTokens ?? 1024,
        system: params.system
          ? [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }]
          : undefined,
        tools: [
          {
            name: params.schemaName,
            description: `Return the ${params.schemaName} as structured data.`,
            input_schema: toJsonSchema(params.schema) as any,
          },
        ],
        tool_choice: { type: "tool", name: params.schemaName },
        messages: [{ role: "user", content: params.prompt }],
      });
    } catch (e: any) {
      throw httpToProviderError(e?.status ?? 502, e?.message ?? "", this.config);
    }

    const block = (res.content ?? []).find((b: any) => b.type === "tool_use");
    if (!block) {
      throw new ProviderError(422, "The model did not return structured tool output.");
    }
    const parsed = params.schema.safeParse(block.input);
    if (!parsed.success) {
      throw new ProviderError(422, `Structured output failed validation for "${params.schemaName}".`);
    }
    return parsed.data;
  }
}
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/providers/anthropic.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(api): add native anthropic adapter with tool-use json

…+ co-author trailer"`

---

## Task 8: `resolveProvider` registry + adapter contract test

**Files:**
- Create: `apps/api/src/providers/registry.ts`
- Test: `apps/api/src/providers/registry.test.ts`
- Test: `apps/api/src/providers/contract.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/providers/registry.test.ts`:
```ts
import { test, expect } from "bun:test";
import { resolveProvider } from "./registry";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";
import { ProviderError } from "./errors";

test("anthropic kind resolves to AnthropicProvider", () => {
  const p = resolveProvider({ kind: "anthropic", model: "claude-sonnet-4-20250514", apiKey: "k" });
  expect(p).toBeInstanceOf(AnthropicProvider);
  expect(p.capabilities.structuredOutput).toBe("tool_use");
});

test("openai-compat kind resolves with inferred capabilities", () => {
  const p = resolveProvider({
    kind: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });
  expect(p).toBeInstanceOf(OpenAICompatProvider);
  expect(p.capabilities.structuredOutput).toBe("json_schema");
});

test("missing kind throws an actionable 400", () => {
  expect(() => resolveProvider({} as any)).toThrow(ProviderError);
  expect(() => resolveProvider({} as any)).toThrow(/settings/i);
});
```

Create `apps/api/src/providers/contract.test.ts`:
```ts
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
    )) as typeof fetch;
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
```

- [ ] **Step 2: Run them red**

Run: `bun test apps/api/src/providers/registry.test.ts apps/api/src/providers/contract.test.ts`
Expected: FAIL — `Cannot find module './registry'`.

- [ ] **Step 3: Implement the registry**

Create `apps/api/src/providers/registry.ts`:
```ts
import type { Provider, ProviderConfig } from "./types";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";
import { inferCapabilities } from "./capabilities";
import { ProviderError } from "./errors";

export function resolveProvider(config: ProviderConfig): Provider {
  if (!config || !config.kind) {
    throw new ProviderError(400, "No provider configured. Open settings and choose a provider.");
  }
  if (config.kind === "anthropic") {
    return new AnthropicProvider(config);
  }
  return new OpenAICompatProvider(config, inferCapabilities(config));
}
```

- [ ] **Step 4: Run them green**

Run: `bun test apps/api/src/providers/registry.test.ts apps/api/src/providers/contract.test.ts`
Expected: PASS (4 pass total).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(api): add provider registry and adapter contract test

…+ co-author trailer"`

---

## Task 9: `modes/socratic.ts` (schema + prompt builders)

**Files:**
- Create: `apps/api/src/modes/socratic.ts`
- Test: `apps/api/src/modes/socratic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modes/socratic.test.ts`:
```ts
import { test, expect } from "bun:test";
import { AnalysisSchema, buildAnalyzeParams, buildSessionSystem } from "./socratic";

const sample = {
  title: "T",
  pain_points: ["p"],
  cognitive_traps: ["c"],
  turning_point: "t",
  first_question: "q",
};

test("AnalysisSchema accepts the canonical shape", () => {
  expect(AnalysisSchema.parse(sample)).toEqual(sample);
});

test("AnalysisSchema rejects a missing field", () => {
  const { first_question, ...rest } = sample;
  expect(AnalysisSchema.safeParse(rest).success).toBe(false);
});

test("buildAnalyzeParams embeds the article text and names the schema 'analysis'", () => {
  const p = buildAnalyzeParams("ARTICLE BODY");
  expect(p.schemaName).toBe("analysis");
  expect(p.prompt).toContain("ARTICLE BODY");
  expect(p.schema).toBe(AnalysisSchema);
});

test("buildSessionSystem embeds the serialized analysis", () => {
  const sys = buildSessionSystem(sample);
  expect(sys).toContain("ファシリテーター");
  expect(sys).toContain('"title":"T"');
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/modes/socratic.test.ts`
Expected: FAIL — `Cannot find module './socratic'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/modes/socratic.ts`:
```ts
import { z } from "zod";
import { ANALYZE_PROMPT, SESSION_SYSTEM_PROMPT } from "../prompts";
import type { StructuredParams } from "../providers/types";

export const AnalysisSchema = z.object({
  title: z.string(),
  pain_points: z.array(z.string()),
  cognitive_traps: z.array(z.string()),
  turning_point: z.string(),
  first_question: z.string(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const ANALYSIS_SCHEMA_NAME = "analysis";

export function buildAnalyzeParams(articleText: string): StructuredParams<Analysis> {
  return {
    prompt: `${ANALYZE_PROMPT}\n\n---\n\n${articleText}`,
    schema: AnalysisSchema,
    schemaName: ANALYSIS_SCHEMA_NAME,
    maxTokens: 1024,
  };
}

export function buildSessionSystem(analysis: Analysis): string {
  return SESSION_SYSTEM_PROMPT(JSON.stringify(analysis));
}
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/modes/socratic.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(api): extract socratic mode schema and prompt builders

…+ co-author trailer"`

---

## Task 10: Update API request/response types

**Files:**
- Modify: `apps/api/src/types.ts`

- [ ] **Step 1: Rewrite the types file**

Replace the entire contents of `apps/api/src/types.ts` with:
```ts
import type { ProviderConfig } from "./providers/types";

export type { Analysis } from "./modes/socratic";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type FetchRequest = {
  url: string;
};

export type FetchResponse = {
  text: string;
  title: string;
};

export type AnalyzeRequest = {
  text: string;
  provider: ProviderConfig;
};

export type ChatRequest = {
  analysis: import("./modes/socratic").Analysis;
  history: Message[];
  provider: ProviderConfig;
};
```

- [ ] **Step 2: Type-check the API package**

Run: `bunx tsc -p apps/api/tsconfig.json --noEmit`
Expected: **no errors.** The old `routes/analyze.ts` / `routes/chat.ts` still compile against the widened request types (the new required `provider` field is simply ignored by their existing destructures; `Analysis` is still importable from `types.ts` via the re-export). They are rewritten for behavior — not to fix type errors — in Tasks 11–12.

- [ ] **Step 3: Commit**

Run: `jj commit -m ":recycle: refactor(api): thread ProviderConfig through request types

…+ co-author trailer"`

---

## Task 11: Rewrite `routes/analyze.ts`

**Files:**
- Modify (full rewrite): `apps/api/src/routes/analyze.ts`
- Test: `apps/api/src/routes/analyze.test.ts`

- [ ] **Step 1: Write the failing test (drive the Hono app directly)**

Create `apps/api/src/routes/analyze.test.ts`:
```ts
import { test, expect, afterEach } from "bun:test";
import app from "./analyze";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const provider = { kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "m" };

function post(body: unknown) {
  return app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("400 when text is missing", async () => {
  const res = await post({ provider });
  expect(res.status).toBe(400);
});

test("400 when provider is missing", async () => {
  const res = await post({ text: "hello" });
  expect(res.status).toBe(400);
});

test("returns validated analysis JSON on success", async () => {
  const analysis = {
    title: "T",
    pain_points: ["p"],
    cognitive_traps: ["c"],
    turning_point: "t",
    first_question: "q",
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis) } }] }), {
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  const res = await post({ text: "article", provider });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(analysis);
});

test("surfaces a normalized provider error status (401 → 401, no key leak)", async () => {
  globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as typeof fetch;
  const res = await post({ text: "article", provider: { ...provider, apiKey: "sk-leak" } });
  expect(res.status).toBe(401);
  const body = await res.json();
  expect(JSON.stringify(body)).not.toContain("sk-leak");
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/routes/analyze.test.ts`
Expected: FAIL — the old route ignores `provider` and uses Anthropic directly (the success/401 cases fail).

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `apps/api/src/routes/analyze.ts` with:
```ts
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
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/routes/analyze.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":recycle: refactor(api): drive analyze route through the provider seam

…+ co-author trailer"`

---

## Task 12: Rewrite `routes/chat.ts`

**Files:**
- Modify (full rewrite): `apps/api/src/routes/chat.ts`
- Test: `apps/api/src/routes/chat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/chat.test.ts`:
```ts
import { test, expect, afterEach } from "bun:test";
import app from "./chat";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const provider = { kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "m" };
const analysis = {
  title: "T",
  pain_points: ["p"],
  cognitive_traps: ["c"],
  turning_point: "t",
  first_question: "q",
};

function post(body: unknown) {
  return app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("400 when analysis or history missing", async () => {
  const res = await post({ provider });
  expect(res.status).toBe(400);
});

test("streams {delta} frames then [DONE] (P1 wire format unchanged)", async () => {
  globalThis.fetch = (async () =>
    new Response(
      [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n`,
        "data: [DONE]\n\n",
      ].join(""),
      { headers: { "content-type": "text/event-stream" } },
    )) as typeof fetch;

  const res = await post({ analysis, history: [{ role: "user", content: "hi" }], provider });
  const text = await res.text();
  expect(text).toContain('data: {"delta":"Hel"}');
  expect(text).toContain('data: {"delta":"lo"}');
  expect(text).toContain("data: [DONE]");
});

test("emits an {error} frame when the provider fails mid-resolve", async () => {
  const res = await post({
    analysis,
    history: [{ role: "user", content: "hi" }],
    provider: { kind: "openai-compat", model: "m" }, // no baseUrl → fetch throws
  });
  const text = await res.text();
  expect(text).toContain('"error"');
  expect(text).toContain("data: [DONE]");
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/routes/chat.test.ts`
Expected: FAIL — old route ignores `provider` and calls Anthropic.

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `apps/api/src/routes/chat.ts` with:
```ts
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
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/routes/chat.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Full API suite + type-check**

Run: `bun test apps/api && bunx tsc -p apps/api/tsconfig.json --noEmit`
Expected: all API tests PASS; `tsc` reports **no errors**.

- [ ] **Step 6: Commit**

Run: `jj commit -m ":recycle: refactor(api): drive chat route through the provider seam

…+ co-author trailer"`

---

## Task 13: `routes/provider.ts` (test-connection + list-models) + wire it

**Files:**
- Create: `apps/api/src/routes/provider.ts`
- Modify: `apps/api/src/index.ts`
- Test: `apps/api/src/routes/provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/provider.test.ts`:
```ts
import { test, expect, afterEach } from "bun:test";
import app from "./provider";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const provider = { kind: "openai-compat", baseUrl: "http://localhost:11434/v1", model: "m" };

function post(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("/models returns model ids from /v1/models", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: "llama3.1" }, { id: "qwen2.5" }] }), {
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  const res = await post("/models", { provider });
  expect(await res.json()).toEqual({ models: ["llama3.1", "qwen2.5"] });
});

test("/test returns ok:true with models on success", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: [{ id: "llama3.1" }] }), {
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  const res = await post("/test", { provider });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, models: ["llama3.1"] });
});

test("/test returns ok:false with a friendly message on refusal (no key leak)", async () => {
  globalThis.fetch = (async () => {
    throw { code: "ECONNREFUSED" };
  }) as typeof fetch;
  const res = await post("/test", { provider: { ...provider, apiKey: "sk-leak" } });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(false);
  expect(body.error).toMatch(/running/i);
  expect(JSON.stringify(body)).not.toContain("sk-leak");
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/api/src/routes/provider.test.ts`
Expected: FAIL — `Cannot find module './provider'`.

- [ ] **Step 3: Implement the route**

Create `apps/api/src/routes/provider.ts`:
```ts
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
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/api/src/routes/provider.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Wire the route into the app**

In `apps/api/src/index.ts`, add the import after the other route imports:
```ts
import providerRoute from "./routes/provider";
```
and register it alongside the others:
```ts
app.route("/api/provider", providerRoute);
```
The file should now read:
```ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import fetchRoute from "./routes/fetch";
import analyzeRoute from "./routes/analyze";
import chatRoute from "./routes/chat";
import providerRoute from "./routes/provider";

const app = new Hono();

app.use("/*", cors({ origin: "http://localhost:5173" }));

app.route("/api/fetch", fetchRoute);
app.route("/api/analyze", analyzeRoute);
app.route("/api/chat", chatRoute);
app.route("/api/provider", providerRoute);

app.get("/", (c) => c.text("Wisdom Distiller API"));

export default {
  port: 3000,
  fetch: app.fetch,
};
```

- [ ] **Step 6: Full API suite + type-check, commit**

Run: `bun test apps/api && bunx tsc -p apps/api/tsconfig.json --noEmit`
Expected: all PASS, no type errors.

Run: `jj commit -m ":sparkles: feat(api): add provider test-connection and list-models route

…+ co-author trailer"`

---

## Task 14: Web — `config/presets.ts`

**Files:**
- Modify: `apps/web/tsconfig.json`
- Create: `apps/web/src/config/presets.ts`
- Test: `apps/web/src/config/presets.test.ts`

- [ ] **Step 0: Keep `bun:test` files out of the web type-check**

The web package targets the browser (no Bun types), so `tsc` must not try to type-check `*.test.ts` (they import `bun:test`). Edit `apps/web/tsconfig.json` to add an `exclude` (this does not affect Vite, which bundles from the entry, not from `include`):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/config/presets.test.ts`:
```ts
import { test, expect } from "bun:test";
import { PRESETS, presetById } from "./presets";

test("includes the three local presets and native anthropic", () => {
  const ids = PRESETS.map((p) => p.id);
  expect(ids).toEqual(
    expect.arrayContaining(["ollama", "lmstudio", "llamacpp", "openai", "anthropic", "openrouter", "custom"]),
  );
});

test("local presets require no key and ship a localhost baseUrl", () => {
  const ollama = presetById("ollama")!;
  expect(ollama.keyRequired).toBe(false);
  expect(ollama.baseUrl).toContain("localhost");
  expect(ollama.kind).toBe("openai-compat");
});

test("anthropic preset is native kind and key-required", () => {
  const a = presetById("anthropic")!;
  expect(a.kind).toBe("anthropic");
  expect(a.keyRequired).toBe(true);
});

test("presetById returns undefined for unknown id", () => {
  expect(presetById("nope")).toBeUndefined();
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/web/src/config/presets.test.ts`
Expected: FAIL — `Cannot find module './presets'`.

- [ ] **Step 3: Implement**

Create `apps/web/src/config/presets.ts`:
```ts
export type ProviderKind = "openai-compat" | "anthropic";

export type ProviderConfig = {
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
};

export type Preset = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  keyRequired: boolean;
  defaultModel?: string;
};

export const PRESETS: Preset[] = [
  { id: "ollama", label: "Ollama (local)", kind: "openai-compat", baseUrl: "http://localhost:11434/v1", keyRequired: false, defaultModel: "llama3.1" },
  { id: "lmstudio", label: "LM Studio (local)", kind: "openai-compat", baseUrl: "http://localhost:1234/v1", keyRequired: false },
  { id: "llamacpp", label: "llama.cpp (local)", kind: "openai-compat", baseUrl: "http://localhost:8080/v1", keyRequired: false },
  { id: "openai", label: "OpenAI", kind: "openai-compat", baseUrl: "https://api.openai.com/v1", keyRequired: true, defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic (native)", kind: "anthropic", keyRequired: true, defaultModel: "claude-sonnet-4-20250514" },
  { id: "openrouter", label: "OpenRouter", kind: "openai-compat", baseUrl: "https://openrouter.ai/api/v1", keyRequired: true },
  { id: "custom", label: "Custom", kind: "openai-compat", keyRequired: false },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/web/src/config/presets.test.ts`
Expected: PASS (4 pass).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(web): add provider presets table

…+ co-author trailer"`

---

## Task 15: Web — `config/store.ts`

**Files:**
- Create: `apps/web/src/config/store.ts`
- Test: `apps/web/src/config/store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/config/store.test.ts`:
```ts
import { test, expect, beforeEach } from "bun:test";
import { loadProviderConfig, saveProviderConfig, clearProviderConfig, redactConfig, isConfigUsable } from "./store";
import type { ProviderConfig } from "./presets";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

beforeEach(() => {
  (globalThis as any).localStorage = memStorage();
});

const cfg: ProviderConfig = {
  kind: "openai-compat",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
};

test("save then load round-trips", () => {
  saveProviderConfig(cfg);
  expect(loadProviderConfig()).toEqual(cfg);
});

test("load returns null when nothing is stored", () => {
  expect(loadProviderConfig()).toBeNull();
});

test("clear removes the stored config", () => {
  saveProviderConfig(cfg);
  clearProviderConfig();
  expect(loadProviderConfig()).toBeNull();
});

test("redactConfig masks the api key", () => {
  expect(redactConfig({ ...cfg, apiKey: "sk-secret" }).apiKey).toBe("***");
  expect(redactConfig(cfg).apiKey).toBeUndefined();
});

test("isConfigUsable: openai-compat needs model + baseUrl", () => {
  expect(isConfigUsable(cfg)).toBe(true);
  expect(isConfigUsable({ ...cfg, baseUrl: "" })).toBe(false);
  expect(isConfigUsable(null)).toBe(false);
});

test("isConfigUsable: anthropic needs model + apiKey", () => {
  expect(isConfigUsable({ kind: "anthropic", model: "claude-x", apiKey: "k" })).toBe(true);
  expect(isConfigUsable({ kind: "anthropic", model: "claude-x" })).toBe(false);
});
```

- [ ] **Step 2: Run it red**

Run: `bun test apps/web/src/config/store.test.ts`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Implement**

Create `apps/web/src/config/store.ts`:
```ts
import { createSignal } from "solid-js";
import type { ProviderConfig } from "./presets";

const KEY = "wd.provider";

export function loadProviderConfig(): ProviderConfig | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProviderConfig) : null;
  } catch {
    return null;
  }
}

export function saveProviderConfig(config: ProviderConfig): void {
  globalThis.localStorage?.setItem(KEY, JSON.stringify(config));
}

export function clearProviderConfig(): void {
  globalThis.localStorage?.removeItem(KEY);
}

export function redactConfig(config: ProviderConfig): ProviderConfig {
  return { ...config, apiKey: config.apiKey ? "***" : undefined };
}

export function isConfigUsable(config: ProviderConfig | null): config is ProviderConfig {
  if (!config || !config.model) return false;
  return config.kind === "anthropic" ? !!config.apiKey : !!config.baseUrl;
}

const [providerConfig, setProviderConfigSignal] = createSignal<ProviderConfig | null>(
  loadProviderConfig(),
);

export { providerConfig };

export function setProviderConfig(config: ProviderConfig): void {
  saveProviderConfig(config);
  setProviderConfigSignal(config);
}

export function resetProviderConfig(): void {
  clearProviderConfig();
  setProviderConfigSignal(null);
}
```

- [ ] **Step 4: Run it green**

Run: `bun test apps/web/src/config/store.test.ts`
Expected: PASS (6 pass).

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(web): add localStorage provider config store

…+ co-author trailer"`

---

## Task 16: Web — `SettingsPanel.tsx`

> Component rendering is **manually verified** in P1 (Solid component test tooling — vitest + `@solidjs/testing-library` — is deferred to P3 per spec §15). The pure logic it relies on (`presets`, `store`) is already unit-tested in Tasks 14–15.

**Files:**
- Create: `apps/web/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Implement the component**

Create `apps/web/src/components/SettingsPanel.tsx`:
```tsx
import { createSignal, For, Show } from "solid-js";
import { PRESETS, presetById, type ProviderConfig } from "../config/presets";
import { providerConfig, setProviderConfig, isConfigUsable } from "../config/store";

type Props = {
  onClose?: () => void;
};

type TestState = { status: "idle" | "testing" | "ok" | "error"; message?: string };

export function SettingsPanel(props: Props) {
  const existing = providerConfig();
  const [presetId, setPresetId] = createSignal(existing ? "custom" : "ollama");
  const initial = existing ?? presetById("ollama")!;

  const [kind, setKind] = createSignal<ProviderConfig["kind"]>(initial.kind);
  const [baseUrl, setBaseUrl] = createSignal(initial.baseUrl ?? "");
  const [model, setModel] = createSignal(existing?.model ?? presetById("ollama")?.defaultModel ?? "");
  const [apiKey, setApiKey] = createSignal(existing?.apiKey ?? "");
  const [test, setTest] = createSignal<TestState>({ status: "idle" });
  const [models, setModels] = createSignal<string[]>([]);

  function applyPreset(id: string) {
    setPresetId(id);
    const p = presetById(id);
    if (!p) return;
    setKind(p.kind);
    setBaseUrl(p.baseUrl ?? "");
    if (p.defaultModel) setModel(p.defaultModel);
    setTest({ status: "idle" });
    setModels([]);
  }

  function currentConfig(): ProviderConfig {
    return {
      kind: kind(),
      baseUrl: kind() === "anthropic" ? undefined : baseUrl().trim() || undefined,
      model: model().trim(),
      apiKey: apiKey().trim() || undefined,
    };
  }

  async function fetchModels() {
    setTest({ status: "testing" });
    try {
      const res = await fetch("/api/provider/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: currentConfig() }),
      });
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        setTest({ status: "idle" });
      } else {
        setTest({ status: "error", message: data.error ?? "Failed to list models" });
      }
    } catch (e) {
      setTest({ status: "error", message: e instanceof Error ? e.message : "Failed to list models" });
    }
  }

  async function testConnection() {
    setTest({ status: "testing" });
    try {
      const res = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: currentConfig() }),
      });
      const data = await res.json();
      setTest(
        data.ok
          ? { status: "ok", message: "Connected" }
          : { status: "error", message: data.error ?? "Connection failed" },
      );
    } catch (e) {
      setTest({ status: "error", message: e instanceof Error ? e.message : "Connection failed" });
    }
  }

  function save() {
    setProviderConfig(currentConfig());
    props.onClose?.();
  }

  const fieldClass =
    "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500";

  return (
    <div class="mx-auto w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 class="text-xl font-semibold text-zinc-100">プロバイダ設定</h2>
      <p class="mt-1 text-sm text-zinc-400">
        ローカルLLM（Ollama / LM Studio / llama.cpp）またはクラウドのキーを設定します。
      </p>

      <label class="mt-5 block text-sm text-zinc-300">プリセット</label>
      <select class={fieldClass} value={presetId()} onChange={(e) => applyPreset(e.currentTarget.value)}>
        <For each={PRESETS}>{(p) => <option value={p.id}>{p.label}</option>}</For>
      </select>

      <Show when={kind() !== "anthropic"}>
        <label class="mt-4 block text-sm text-zinc-300">Base URL</label>
        <input
          class={fieldClass}
          value={baseUrl()}
          onInput={(e) => setBaseUrl(e.currentTarget.value)}
          placeholder="http://localhost:11434/v1"
        />
      </Show>

      <label class="mt-4 block text-sm text-zinc-300">モデル</label>
      <div class="flex gap-2">
        <input
          class={fieldClass}
          value={model()}
          onInput={(e) => setModel(e.currentTarget.value)}
          placeholder="llama3.1"
          list="wd-models"
        />
        <datalist id="wd-models">
          <For each={models()}>{(m) => <option value={m} />}</For>
        </datalist>
        <button
          type="button"
          onClick={fetchModels}
          class="shrink-0 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          一覧取得
        </button>
      </div>

      <label class="mt-4 block text-sm text-zinc-300">
        APIキー <span class="text-zinc-500">（ローカルは不要）</span>
      </label>
      <input
        class={fieldClass}
        type="password"
        value={apiKey()}
        onInput={(e) => setApiKey(e.currentTarget.value)}
        placeholder="sk-..."
      />

      <div class="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={testConnection}
          class="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          接続テスト
        </button>
        <button
          type="button"
          disabled={!isConfigUsable(currentConfig())}
          onClick={save}
          class="rounded-lg bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-40"
        >
          保存
        </button>
        <Show when={test().status === "testing"}>
          <span class="text-sm text-zinc-400">確認中...</span>
        </Show>
        <Show when={test().status === "ok"}>
          <span class="text-sm text-emerald-400">● {test().message}</span>
        </Show>
        <Show when={test().status === "error"}>
          <span class="text-sm text-red-400">● {test().message}</span>
        </Show>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check the web package**

Run: `bunx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors (the panel only references already-created `presets`/`store` exports).

- [ ] **Step 3: Commit**

Run: `jj commit -m ":sparkles: feat(web): add provider settings panel

…+ co-author trailer"`

---

## Task 17: Web — wire `useSession` to forward `provider`

**Files:**
- Modify: `apps/web/src/hooks/useSession.ts`

- [ ] **Step 1: Add the import**

At the top of `apps/web/src/hooks/useSession.ts`, add:
```ts
import { providerConfig, isConfigUsable } from "../config/store";
```

- [ ] **Step 2: Guard + forward provider in `startSession`**

In `startSession`, immediately after `setError(null);` (before the `try`), add the guard:
```ts
    const provider = providerConfig();
    if (!isConfigUsable(provider)) {
      setError("プロバイダが未設定です。設定からLLMを選んでください。");
      setPhase("error");
      return;
    }
```
Then change the `/api/analyze` body to include the provider:
```ts
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, provider }),
      });
```

- [ ] **Step 3: Forward provider + handle `{error}` frames in `sendMessage`**

In `sendMessage`, after `const newHistory = [...messages(), userMessage];`, add:
```ts
    const provider = providerConfig();
    if (!isConfigUsable(provider)) {
      setError("プロバイダが未設定です。設定からLLMを選んでください。");
      return;
    }
```
Change the `/api/chat` body to:
```ts
        body: JSON.stringify({
          analysis: currentAnalysis,
          history: newHistory,
          provider,
        }),
```
Then, inside the SSE parse loop, replace the existing `try { const { delta } = JSON.parse(data); … }` block with one that also surfaces `{error}` frames:
```ts
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              setError(parsed.error);
              continue;
            }
            assistantContent += parsed.delta;
            setMessages((prev) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = {
                role: "assistant",
                content: assistantContent,
              };
              return msgs;
            });
          } catch {
            // skip malformed SSE lines
          }
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

Run: `jj commit -m ":sparkles: feat(web): forward provider config and surface stream errors

…+ co-author trailer"`

---

## Task 18: Web — settings gate + gear button in `main.tsx`

**Files:**
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: Rewrite `main.tsx`**

Replace the entire contents of `apps/web/src/main.tsx` with:
```tsx
import "./app.css";
import { render } from "solid-js/web";
import { createSignal, Match, Show, Switch } from "solid-js";
import { useSession } from "./hooks/useSession";
import { UrlInput } from "./components/UrlInput";
import { SessionView } from "./components/SessionView";
import { SettingsPanel } from "./components/SettingsPanel";
import { providerConfig, isConfigUsable } from "./config/store";

function App() {
  const { phase, analysis, messages, streaming, error, startSession, sendMessage, reset } =
    useSession();

  // Open settings automatically until a usable config exists; reopenable via the gear.
  const [showSettings, setShowSettings] = createSignal(!isConfigUsable(providerConfig()));

  return (
    <div class="relative flex min-h-screen flex-col bg-zinc-900 text-zinc-100">
      <button
        type="button"
        title="プロバイダ設定"
        onClick={() => setShowSettings(true)}
        class="absolute right-4 top-4 z-10 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
      >
        ⚙ 設定
      </button>

      <Show
        when={!showSettings()}
        fallback={
          <div class="flex flex-1 items-center justify-center px-4 py-12">
            <SettingsPanel onClose={() => setShowSettings(false)} />
          </div>
        }
      >
        <Switch>
          <Match when={phase() === "input"}>
            <div class="flex flex-1 items-center justify-center px-4">
              <UrlInput onSubmit={startSession} />
            </div>
          </Match>

          <Match when={phase() === "fetching" || phase() === "analyzing"}>
            <div class="flex flex-1 items-center justify-center">
              <div class="text-center">
                <div class="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <p class="mt-4 text-sm text-zinc-400">
                  {phase() === "fetching" ? "記事を取得中..." : "著者の思考を解剖中..."}
                </p>
              </div>
            </div>
          </Match>

          <Match when={phase() === "session" && analysis()}>
            <div class="mx-auto flex h-screen w-full max-w-2xl flex-col">
              <SessionView
                analysis={analysis()!}
                messages={messages()}
                streaming={streaming()}
                onSend={sendMessage}
                onReset={reset}
              />
            </div>
          </Match>

          <Match when={phase() === "error"}>
            <div class="flex flex-1 items-center justify-center px-4">
              <div class="text-center">
                <p class="text-red-400">{error()}</p>
                <button
                  onClick={reset}
                  class="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  やり直す
                </button>
              </div>
            </div>
          </Match>
        </Switch>
      </Show>
    </div>
  );
}

render(() => <App />, document.getElementById("root")!);
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc -p apps/web/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

Run: `jj commit -m ":sparkles: feat(web): gate first-run on provider settings with a gear toggle

…+ co-author trailer"`

---

## Task 19: Manual end-to-end smoke + README

**Files:**
- Modify: `README.md` (add a "Providers (bring your own LLM)" section)

- [ ] **Step 1: Add provider docs to the README**

Append this section to `README.md`:
```markdown
## Providers (bring your own LLM)

Wisdom Distiller talks to any OpenAI-compatible server plus native Anthropic. Pick a
provider in the in-app settings panel (gear icon, top-right). Nothing is stored on the
server — your config (and any API key) lives in the browser's `localStorage` and is sent
per request.

| Provider | Base URL | Key |
|---|---|---|
| Ollama (local) | `http://localhost:11434/v1` | none |
| LM Studio (local) | `http://localhost:1234/v1` | none |
| llama.cpp (local) | `http://localhost:8080/v1` | none |
| OpenAI | `https://api.openai.com/v1` | required |
| Anthropic (native) | — | required |
| OpenRouter | `https://openrouter.ai/api/v1` | required |
| Custom | your URL | optional |

Local quick start (Ollama):

\`\`\`bash
ollama serve
ollama pull llama3.1
# then choose "Ollama (local)" in settings → 接続テスト → 保存
\`\`\`

> Security note: forwarding browser-held keys through the local backend is acceptable for
> personal/local use only. See the v2 design spec §14 before any hosted deployment.
```

- [ ] **Step 2: Run the full test suite once more**

Run: `bun test apps/api apps/web`
Expected: all tests PASS (providers, modes, routes, web config).

- [ ] **Step 3: Manual smoke against a real local model**

Prereq: `ollama serve` running with a pulled model (e.g. `ollama pull llama3.1`).

Run (two terminals, both inside `nix develop`):
```bash
bun run dev:api
bun run dev:web
```
Then in the browser at `http://localhost:5173`:
1. Settings panel appears on first load (no saved config). Expected: ✅ panel shown, URL input hidden.
2. Choose "Ollama (local)", click **一覧取得**. Expected: model dropdown populates.
3. Click **接続テスト**. Expected: green "Connected".
4. Click **保存**. Expected: panel closes, URL input appears.
5. Paste a technical-article URL, click **解剖する**. Expected: spinner → session view with a first question (analysis succeeded via `provider.complete`).
6. Type a reply, send. Expected: streamed response token-by-token (via `provider.streamChat`, `{delta}` frames).
7. Stop Ollama, send another reply. Expected: a friendly "Is it running…" error surfaced in the UI (not a raw 500), proving error normalization + `{error}` frame handling.
8. Click the gear, switch to a cloud preset without a key, **接続テスト**. Expected: red "check your API key" (no key value shown anywhere).

Record the result of each step. If any step fails, fix before proceeding.

- [ ] **Step 4: Commit**

Run: `jj commit -m ":memo: docs(readme): document bring-your-own provider setup

…+ co-author trailer"`

---

## Task 20: Push + open PR

**Files:** none (VCS only)

- [ ] **Step 1: Push the bookmark**

Run:
```bash
jj git push --bookmark feat/provider-seam --allow-new
```
Expected: branch pushed to `origin`.

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --base main --head feat/provider-seam \
  --title ":sparkles: feat(api): provider seam + bring-your-own multi-provider config (P1)" \
  --body "$(cat <<'EOF'
Implements Phase 1 of the v2 design spec: a pluggable provider seam (local OpenAI-compatible servers + cloud + native Anthropic) with an in-app settings panel and per-request, server-stateless config.

## What changed
- **API:** `providers/` (types, errors, json-schema, capabilities, openai-compat, anthropic, registry), `modes/socratic.ts`, capability-driven structured output with one repair retry, normalized key-safe errors. `analyze`/`chat` routes now resolve a provider per request; new `/api/provider/{test,models}` route. SSE wire format unchanged (`{delta}`/`[DONE]`, plus an `{error}` frame).
- **Web:** `config/presets.ts` + `config/store.ts` (localStorage), `SettingsPanel.tsx`, first-run settings gate + gear toggle, `useSession` forwards the config and surfaces stream errors.
- **Tests:** `bun test` across adapters, registry, contract, modes, routes, and web config (zero new test deps).
- **Docs:** README "bring your own LLM" section.

## Out of scope (later phases)
- AG-UI event envelope + mode registry (P2)
- FSD restructure + Vite+ `vp` + DESIGN.md reconciliation (P3)

Spec: `docs/superpowers/specs/2026-05-30-wisdom-distiller-v2-design.md` §17 P1.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 3: Report the PR URL to the user.**

---

## Phase 1 Definition of Done

- [ ] `bun test apps/api apps/web` is fully green.
- [ ] `bunx tsc -p apps/api/tsconfig.json --noEmit` and `bunx tsc -p apps/web/tsconfig.json --noEmit` report no errors.
- [ ] No hardcoded model or inline `new Anthropic()` remains in `routes/analyze.ts` or `routes/chat.ts`.
- [ ] A real local-model (Ollama) round-trip works end-to-end (manual smoke steps 1–7).
- [ ] API keys never appear in any error message or response (asserted by tests + manual step 8).
- [ ] PR opened against `main`.

## Notes for Phase 2 (not in scope here)

- Replace the `{delta}`/`[DONE]` wire format with the AG-UI event envelope (`agui/events.ts`, `agui/stream.ts`, `shared/sse/agui.ts`).
- Promote `modes/socratic.ts` into a registry (`modes/types.ts` + `modes/index.ts`); routes resolve `mode` by id (the request types already have a clean place to add `mode`).
- Introduce Vitest via `vp test` for Solid component coverage (SettingsPanel render/interaction).
