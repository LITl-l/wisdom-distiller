# Wisdom Distiller

技術記事のURLを投げると、著者が経験した「苦痛の思考過程」をAIが抽出し、
読者が著者と同じ認知の罠に自然にはまることで、知識ではなく知恵を得る体験を提供する。

## Stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS v4
- **Backend**: Hono + TypeScript (Bun / Cloudflare Workers)
- **AI**: Anthropic Claude API (claude-sonnet-4)

## Setup

```bash
nix develop  # provides bun + node
bun install
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
```

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
