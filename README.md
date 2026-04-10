# Wisdom Distiller

技術記事のURLを投げると、著者が経験した「苦痛の思考過程」をAIが抽出し、
読者が著者と同じ認知の罠に自然にはまることで、知識ではなく知恵を得る体験を提供する。

## Architecture

**Static site, BYOK (Bring Your Own Key)** — バックエンドなし。すべてブラウザで動く。

- **Frontend**: Vite + SolidJS + TypeScript + Tailwind CSS v4
- **LLM**: 設定画面からプロバイダを選択
  - **Anthropic** (Claude 公式 SDK)
  - **OpenAI 互換** — OpenAI / Ollama / llama.cpp / LM Studio / vLLM / OpenRouter / Groq / Together など、`/chat/completions` 形式を話す全ランタイム
- **Article fetch**: [Jina Reader](https://jina.ai/reader/) (`r.jina.ai`) — CORS 対応の無料 URL → Markdown 抽出サービス

API キーはブラウザの localStorage にのみ保存され、サーバーには一切送られない。

## Setup

```bash
nix develop  # provides bun + node
bun install
```

## Development

```bash
bun run dev
# http://localhost:5173
```

初回起動時に設定画面が開く。Anthropic の場合は API キーとモデル名、OpenAI 互換の場合は base URL / API キー / モデル名を入力。ローカル LLM (Ollama 等) の場合は API キーは空欄で OK。

## Build

```bash
bun run build
# apps/web/dist/ に静的ファイルが出力される
```

この `dist/` はそのまま Cloudflare Pages / Vercel / GitHub Pages 等に配備できる。

## How it works

1. **URL入力** — 記事URLを貼る
2. **記事取得** — Jina Reader 経由でブラウザから直接 Markdown 抽出
3. **記事解剖** — 設定されたLLMが著者の思考過程・認知の罠・転換点を抽出
4. **追体験セッション** — AIファシリテーターが読者を著者と同じ迷路に導く
