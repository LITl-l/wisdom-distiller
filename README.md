# Wisdom Distiller

技術記事のURLを投げると、著者が経験した「苦痛の思考過程」をAIが抽出し、
読者が著者と同じ認知の罠に自然にはまることで、知識ではなく知恵を得る体験を提供する。

## Stack

- **Frontend**: Vite + Solid.js + TypeScript + Tailwind CSS v4
- **Backend**: Hono + TypeScript on Bun
- **AI**: bring-your-own — any OpenAI-compatible server (Ollama / LM Studio / llama.cpp /
  OpenAI / OpenRouter) plus native Anthropic, chosen in-app

## Setup

```bash
nix develop  # provides bun + node
bun install
```

No API-key file is required: the provider (and any cloud key) is configured in the in-app
settings panel and stored only in your browser. See
[Providers](#providers-bring-your-own-llm) below.

## Development

```bash
bun run dev
# Frontend: http://localhost:5173
# API:      http://localhost:3000
```

## How it works

1. **URL入力** — 記事URLを貼る
2. **記事解剖** — AIが著者の思考過程・認知の罠・転換点を抽出
3. **追体験セッション** — AIファシリテーターが読者を著者と同じ迷路に導く

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

```bash
ollama serve
ollama pull llama3.1
# then choose "Ollama (local)" in settings → 接続テスト → 保存
```

> Security note: forwarding browser-held keys through the local backend is acceptable for
> personal/local use only. See the v2 design spec §14 before any hosted deployment.
