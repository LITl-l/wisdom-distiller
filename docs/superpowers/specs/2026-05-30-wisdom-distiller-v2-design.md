# Wisdom Distiller v2 — Design Spec

- **Date:** 2026-05-30
- **Status:** Draft (awaiting user review)
- **Supersedes:** parts of `DESIGN.md` (stack, provider layer, transport). `DESIGN.md` still describes the original concept and the Phase-1/Phase-2 pedagogy, which remain valid.
- **Approach chosen:** **B — Balanced + Extensible** (see "Approach selection").

---

## 1. Concept (unchanged)

技術記事のURLを投げると、著者が経験した「苦痛の思考過程」をAIが抽出し、読者が著者と同じ認知の罠に自然にはまることで、知識ではなく知恵を得る体験を提供する。

Paste a technical-article URL → an LLM extracts the author's *painful thought process* and cognitive traps → a Socratic facilitator walks the reader back through the same cognitive maze (reverse-scaffolding / Vygotsky ZPD / generation effect). This pedagogy is preserved verbatim; v2 is about the **platform underneath it**.

## 2. Goal & priorities

**North star (user-stated): "for users, then for devs."**

1. **Users first** — local + multi-provider LLM ("bring your own": local server *or* cloud key), reliable analysis, fast Solid UI, minimal dependencies, high UX.
2. **Devs second** — one clean **seam per axis of change** so the next provider, the next agent-mode, and richer UI are cheap to add. Not architecture-for-its-own-sake.

**YAGNI posture:** pragmatic. Add structure only where it removes future friction for users or extension.

### Decisions locked during brainstorming

| Decision | Choice | Rationale |
|---|---|---|
| Overall approach | **B — Balanced + Extensible** | Truest read of users→devs + less-deps |
| Native-Anthropic adapter | **Include** (behind the provider seam) | Claude's caching + reliable structured JSON for `analyze` |
| AG-UI | **Adopt the event schema, not CopilotKit** | `@ag-ui/core` is zod-only, React-free; CopilotKit forces React/heavy UI and has no Solid binding |
| FSD | **Minimal layers** (`app`/`shared`/`entities`/`features`) | Full FSD is over-engineering for a 2-screen app |
| Tooling | **Adopt Vite+ `vp` now** | User wants it; viable (Bun-as-PM supported via PR #1005); keep Bun as API runtime |
| Deploy target | **Local/personal only** | Keep `linkedom`, skip Workers streaming-header/wrangler concessions (keep the `htmlToText` seam for free) |
| Provider-config UX | **In-app settings panel** | "bring your own provider" made tangible; high UX |

## 3. Current state (baseline)

Monorepo (Bun workspaces) with two apps:

- **`apps/web`** — **Solid.js** (not React, despite `DESIGN.md`) + Vite 8 + Tailwind v4 + TS 6. Flat layout: `components/{UrlInput,SessionView,MessageList,ReplyInput}.tsx`, `hooks/useSession.ts`, `types.ts`, `main.tsx`. 3-phase flow (`input → fetching/analyzing → session`). Talks to `/api/*` via Vite proxy; hand-parses `data:{delta}` / `data:[DONE]` SSE.
- **`apps/api`** — **Hono** + `@anthropic-ai/sdk` + `linkedom`. Routes: `/api/fetch` (URL→text), `/api/analyze` (Claude→JSON), `/api/chat` (Claude streaming SSE). **Provider + model are hardcoded inline** (`new Anthropic()`, `claude-sonnet-4-20250514`). `analyze` does a fragile `JSON.parse(content.text)`.

**Known debt addressed by v2:** (a) `DESIGN.md` says React → reconcile to Solid; (b) provider/model hardcoded → provider abstraction; (c) fragile JSON parse → capability-driven structured output; (d) ad-hoc SSE → AG-UI-compatible envelope.

## 4. Approach selection (why B)

Three approaches were weighed (Lean / Balanced / Craft). **B** adopts the *good* parts of every tool the user named while sidestepping their costs:
- AG-UI's **protocol** without CopilotKit's React weight (no Solid binding exists anyway).
- Vite+'s **stable components** + the `vp` convenience layer (user opted in), without betting the build on alpha as the *only* path.
- FSD's **minimal layering**, not the full 6–7 layer cake.

## 5. Research grounding (mid-2026, adversarially verified)

Load-bearing facts behind the design (sources verified 2026-05-30):

- **OpenAI-compat is universal locally + in cloud.** Ollama, LM Studio, llama.cpp `llama-server`, vLLM, and gateways (LiteLLM, OpenRouter) all expose `POST /v1/chat/completions` with SSE streaming. Claude is reachable via an OpenAI-compatible surface too. → one `fetch`-based path covers local + nearly every cloud.
- **But Claude's OpenAI-compat layer drops** prompt caching, extended thinking, and `response_format`/structured output (Anthropic's own docs call it "not production-ready for most use cases"). → keep a **native-Anthropic adapter** behind the seam for the `analyze` step, which depends on reliable JSON.
- **`@ai-sdk/solid` is deprecated** and Solid was dropped from Vercel AI SDK's supported frameworks. → frontend keeps **hand-parsing SSE** (it already does); do **not** add `@ai-sdk/solid`.
- **`@ag-ui/core` depends only on `zod`, no React/rxjs**; `@ag-ui/client` adds rxjs + protobuf. → use the **core event schema** server-side; mirror a tiny subset client-side (keep the web hot-path dep-free).
- **CopilotKit** `react-core` hard-requires React + a ~5.67 MB UI tree; it now has Vue/Angular bindings but **no Solid**. → skip it.
- **Vite+** is alpha (`v0.1.23`, 2026-05-29), MIT/free; **Bun is a first-class package manager** (PR #1005, merged 2026-03-27), but **Bun-as-runtime is not planned**. → use `vp` for tasks/test/lint/fmt/build with Bun as PM; keep `bun` as the API runtime.
- **FSD** v2.1 is framework-agnostic (works with Solid) but **over-engineering for 2 screens**; the legitimate move is *fewer layers*, not "feature folders without layers."

## 6. Architecture overview

Three seams, one per axis of change:

```
Provider  (local + multi-cloud)   →  apps/api/src/providers/
Agent-mode (Socratic = mode #1)   →  apps/api/src/modes/
Transport  (AG-UI events)         →  apps/api/src/agui/  +  apps/web/src/shared/sse/
```

### 6.1 API layout

```
apps/api/src/
  index.ts                 # Hono app wiring (unchanged shape)
  providers/
    types.ts               # Provider, ProviderConfig, ProviderCapabilities, ChatParams, TextDelta, StructuredParams
    registry.ts            # resolveProvider(reqProvider, env) + preset capability table
    openai-compat.ts       # plain fetch → /v1/chat/completions (local + most cloud)
    anthropic.ts           # native @anthropic-ai/sdk adapter (caching, tool-use JSON)
  modes/
    types.ts               # AgentMode<A>
    socratic.ts            # mode #1 (current prompts + Analysis schema)
    index.ts               # registry: id → AgentMode
  agui/
    events.ts              # AG-UI event types (mirror @ag-ui/core names) + encoder helpers
    stream.ts              # emitRun(honoStream, asyncGen) → writes RUN_STARTED…TEXT_MESSAGE_*…RUN_FINISHED
  routes/
    fetch.ts               # URL → text (htmlToText seam kept; linkedom stays for local)
    analyze.ts             # provider.complete(mode.analysisSchema)
    chat.ts                # provider.streamChat → agui/stream
```

### 6.2 Web layout (minimal FSD)

```
apps/web/src/
  app/
    main.tsx               # render shell, mounts AppShell
    AppShell.tsx           # phase switch + settings gate + gear button
  shared/
    ui/                    # Spinner, Button, Field primitives
    api/client.ts          # typed fetch wrappers for /api/*
    sse/agui.ts            # hand-parser: ReadableStream → typed AG-UI events → callbacks
    config/store.ts        # provider config localStorage signal store
    types.ts               # shared types
  entities/
    analysis/              # Analysis model (+ small display bits)
    message/               # Message model + bubble
    provider-config/       # ProviderConfig model, PRESETS table, load/save
  features/
    url-intake/            # UrlInput (was components/UrlInput)
    session/               # SessionView + MessageList + ReplyInput + useSession model
    provider-settings/     # settings panel (preset picker, fields, test connection)
```

File migration map: `UrlInput`→`features/url-intake`; `SessionView`/`MessageList`/`ReplyInput`→`features/session`; `useSession`→ split into `features/session` model + `shared/api` + `shared/sse`.

## 7. Provider abstraction (detail)

```ts
// providers/types.ts
export type ProviderKind = "openai-compat" | "anthropic";

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl?: string;            // openai-compat (local or cloud); ignored by native anthropic
  model: string;
  apiKey?: string;             // optional for local servers
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

export interface TextDelta { text: string }

export interface StructuredParams<T> {
  system?: string;
  prompt: string;
  schema: import("zod").ZodType<T>;
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

- **`openai-compat.ts`** — `POST ${baseUrl}/chat/completions` with `stream:true`; yields `choices[0].delta.content`. `complete()` uses `response_format:{type:"json_schema",…}` when capability allows (OpenAI, many gateways), `{type:"json_object"}` or `prompt_only` otherwise (Ollama `format`, llama.cpp grammar), then **zod-validates with one repair retry**.
- **`anthropic.ts`** — `client.messages.stream` for `streamChat`; `complete()` uses **forced tool-use** with the zod schema → reliable JSON, and enables **prompt caching** on the system/analyze prompt.
- **`registry.ts`** — `resolveProvider(reqProvider, env)`: precedence = per-request `provider` override (from settings panel) → env default. A preset→capabilities table seeds `ProviderCapabilities`.

**Selection from the client:** every `/api/{analyze,chat}` request carries `{ provider: ProviderConfig }`. For local servers `apiKey` is omitted; for cloud the user-pasted key is forwarded. Server is **stateless** — no key persisted server-side.

## 8. Agent-mode registry (detail)

```ts
// modes/types.ts
export interface AgentMode<A> {
  id: string;
  label: string;
  analysisSchema: import("zod").ZodType<A>;
  analysisSchemaName: string;
  buildAnalyzePrompt(articleText: string): { system?: string; prompt: string };
  buildSessionSystem(analysis: A): string;
  firstMessage(analysis: A): string;     // e.g. analysis.first_question
  maxReplyTokens?: number;
}
```

`socratic.ts` ports the existing `ANALYZE_PROMPT` + `SESSION_SYSTEM_PROMPT` and the `{title,pain_points,cognitive_traps,turning_point,first_question}` schema. Routes resolve `mode` by id; **adding a mode = adding a file**, no route edits. The global `Analysis` type becomes the Socratic mode's schema.

## 9. AG-UI-compatible transport (detail)

Event subset (names mirror `@ag-ui/core`): `RUN_STARTED`, `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT` (delta), `TEXT_MESSAGE_END`, `RUN_FINISHED`, `RUN_ERROR`. Reserved for later generative UI: `TOOL_CALL_*`, `STATE_DELTA`.

- **Server** (`agui/stream.ts`): wraps `provider.streamChat` and writes Hono `streamSSE` frames as `data: {"type":"TEXT_MESSAGE_CONTENT","delta":"…"}` (JSON, matching `@ag-ui/core` EventEncoder). `@ag-ui/core` used server-side for canonical types.
- **Client** (`shared/sse/agui.ts`): reads `ReadableStream`, buffers, splits on `\n`, `JSON.parse` each `data:` line, switches on `.type`, invokes callbacks that drive Solid signals. **No `@ag-ui/client`/rxjs; no new dep on the web hot path** (a ~30-line typed mirror).

Evolution, not rewrite: `useSession.ts` already hand-parses SSE; this swaps the line-handler body.

> Note (future, out of scope now): deploying to Cloudflare Workers later requires the `Content-Encoding: Identity` header on the SSE response (Hono buffers otherwise). Recorded here so the seam is known; **not built** under the local-only decision.

## 10. Provider-config UX (detail)

`features/provider-settings` + `entities/provider-config`:

- **Gate:** on first load, if no saved config → setup prompt before URL intake. Gear button reopens.
- **Presets** (`PRESETS` table):
  | Preset | kind | baseUrl | key |
  |---|---|---|---|
  | Ollama (local) | openai-compat | `http://localhost:11434/v1` | none |
  | LM Studio (local) | openai-compat | `http://localhost:1234/v1` | none |
  | llama.cpp (local) | openai-compat | `http://localhost:8080/v1` | none |
  | OpenAI | openai-compat | `https://api.openai.com/v1` | required |
  | Anthropic (native) | anthropic | — | required |
  | OpenRouter | openai-compat | `https://openrouter.ai/api/v1` | required |
  | Custom | openai-compat | user-entered | optional |
- **Fields:** baseUrl (prefilled per preset), model (free text + **"fetch models"** via `GET ${baseUrl}/models` for local), API key (if cloud).
- **Test connection:** ping `/v1/models` (or a 1-token chat) → green/red with the normalized error message.
- **Persistence:** `localStorage` via a Solid signal store; sent per-request.

## 11. Tooling (Vite+ `vp`)

- **Install:** `vp` is a standalone binary (`curl -fsSL https://vite.plus | bash`). It is **alpha** and **not in nixpkgs**; document the install in the README and (optionally) a `flake.nix` `shellHook`. Reproducibility caveat noted in Risks.
- **Usage:** `vp dev`/`vp build` (web, Vite-superset, `vite-plugin-solid` unchanged), `vp test` (Vitest), `vp lint` (oxlint), `vp fmt` (oxfmt), `vp run <task>` (monorepo orchestration replacing root `bun run --filter`).
- **Package manager:** keep **Bun** (`bun.lock`); `vp` detects it.
- **API runtime:** keep `bun run --hot src/index.ts` (Bun-as-runtime; `vp` orchestrates it as a task, does not replace it).

## 12. Data flow

1. First load → no config → **provider-settings** (test connection) → save.
2. **URL intake** → `POST /api/fetch {url}` → `htmlToText` (linkedom, local) → `{text,title}`.
3. **Analyze** → `POST /api/analyze {text, mode, provider}` → `resolveProvider` + `mode.analysisSchema` → `provider.complete()` → validated `Analysis`.
4. **Session** → `POST /api/chat {analysis, history, mode, provider}` → `provider.streamChat` → `agui/stream` → typed AG-UI SSE → Solid signals render streaming reply.
5. Provider/key from client per request; **no server-side persistence** (stateless).

## 13. Error handling

- **Normalized provider errors with actionable messages:** `ECONNREFUSED` → "Is your local model server (Ollama/LM Studio) running at `<baseUrl>`?"; `401` → "Check your API key"; `429` → backoff hint; non-OpenAI-shaped response → schema/validation error surfaced (not a raw 500).
- **Structured-output failure:** zod-validate; on parse failure, **one** "return only JSON" repair retry, then a clean typed error.
- **Keys:** never logged or echoed; redacted in error payloads.
- **SSE:** abort on reset/unmount (`AbortSignal`); handle mid-stream disconnect; `RUN_FINISHED`/`RUN_ERROR` terminal semantics.

## 14. Security

- BYO keys live in `localStorage` and are forwarded through our backend to the provider per request. **Acceptable under the local/personal decision**; documented as a known tradeoff. If this ever goes multi-user/hosted, revisit (direct-to-provider calls or encrypted secrets) — out of scope now.

## 15. Testing (Vitest via `vp test`)

- **Unit:** `openai-compat` adapter (mock `fetch` SSE), `anthropic` adapter (mock SDK), AG-UI parser (`shared/sse/agui`), mode registry, `htmlToText`, provider-config store.
- **Contract:** both adapters satisfy the `Provider` interface against a recorded fixture stream (same normalized deltas).
- **Smoke (manual/skipped in CI):** real Ollama round-trip.
- Requires `nix develop` for `bun`/`node`/`vitest`.

## 16. Out of scope (YAGNI)

Server-side persistence/auth, session history (KV/D1), multi-URL compare, author-supplied thought logs, generative-UI components (cognitive-trap map / interrupts — the AG-UI envelope *enables* them later but they are **not built**), and Cloudflare Workers deploy (local-only for now).

## 17. Phasing (users-first order)

- **P1 — Provider seam + BYO config (ships the headline).** `providers/*`, capability-driven `analyze`, settings panel, wire `analyze`/`chat` to `provider` (mode may be implicit-single here). Remove hardcoded model/inline SDK from routes.
- **P2 — AG-UI events + mode registry (dev seams).** `agui/*` envelope replacing `{delta}`; formalize `modes/*`; tests.
- **P3 — FSD restructure + Vite+ tooling + doc reconciliation.** Move web files into layers; adopt `vp` test/lint/fmt; fix `DESIGN.md` (React→Solid) and link this spec.

Phases are independently shippable; order is reorderable (e.g., `vp` could come earlier since the user wants it).

## 18. Risks & mitigations

- **Vite+ alpha (v0.1.x):** breaking changes likely. *Mitigation:* the underlying pieces (Vite 8, Vitest, oxlint) work standalone; if `vp` regresses, fall back to direct tools. Pin the `vp` version.
- **Vite+ ∉ nixpkgs:** hurts Nix reproducibility. *Mitigation:* document curl install / shellHook; treat `vp` as a dev convenience, not a build-correctness dependency.
- **OpenAI-compat lowest-common-denominator:** local backends differ (Ollama drops `tool_choice`/`logprobs`; image URLs base64-only). *Mitigation:* capability flags per preset; `analyze` falls back to prompt+repair when `json_schema` unsupported.
- **Forwarding BYO keys through backend:** acceptable locally; flagged for any future hosted mode.
- **`DESIGN.md` drift:** reconciled in P3.

## 19. Doc reconciliation

`DESIGN.md` updated in P3: stack table React→Solid, note the provider/transport sections are superseded by this spec, keep the pedagogy (Phase-1/Phase-2 scaffolding) as the canonical concept reference.
