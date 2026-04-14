# Wisdom Distiller — システム設計ドキュメント

## コンセプト

技術記事のURLを投げると、著者が経験した「苦痛の思考過程」をAIが抽出し、
読者が著者と同じ認知の罠に自然にはまることで、知識ではなく知恵を得る体験を提供する。

---

## スタック

| レイヤー | 技術 | 理由 |
|---|---|---|
| フロントエンド | Vite + React + TypeScript | 標準的、Cloudflare Pages対応 |
| バックエンド | Hono + TypeScript | Cloudflare Workers対応、ローカルもBunで動く |
| スタイル | Tailwind CSS v4 | ユーティリティファースト |
| ランタイム | Bun（ローカル） | 速い、TypeScriptネイティブ |
| AI | Anthropic Claude API | claude-sonnet-4系 |

---

## ディレクトリ構成

```
wisdom-distiller/
├── apps/
│   ├── web/                  # Vite + React フロントエンド
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── UrlInput.tsx
│   │   │   │   ├── SessionView.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   └── ReplyInput.tsx
│   │   │   ├── hooks/
│   │   │   │   └── useSession.ts
│   │   │   ├── types.ts
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── vite.config.ts
│   └── api/                  # Hono バックエンド
│       ├── src/
│       │   ├── index.ts      # エントリーポイント
│       │   ├── routes/
│       │   │   ├── fetch.ts  # URL fetch & HTML→text変換
│       │   │   ├── analyze.ts # フェーズ1: 記事解剖
│       │   │   └── chat.ts   # フェーズ2: 追体験セッション
│       │   ├── prompts.ts    # プロンプト定義
│       │   └── types.ts
│       └── wrangler.toml     # Cloudflare Workers設定（後で使う）
├── package.json              # ワークスペースルート
└── .env                      # ANTHROPIC_API_KEY
```

---

## APIエンドポイント設計

### POST `/api/fetch`
記事URLのテキストを取得して返す。

**Request**
```json
{ "url": "https://zenn.dev/..." }
```

**Response**
```json
{
  "text": "記事本文テキスト（最大8000字）",
  "title": "推定タイトル"
}
```

---

### POST `/api/analyze`
記事テキストを解剖してフェーズ1の分析結果を返す。

**Request**
```json
{ "text": "記事本文テキスト" }
```

**Response**
```json
{
  "title": "記事タイトル",
  "pain_points": ["詰まったポイント1", "..."],
  "cognitive_traps": ["著者が陥った認知の罠1", "..."],
  "turning_point": "著者が気づいた瞬間の描写",
  "first_question": "読者を同じ出発点に立たせる最初の問い"
}
```

---

### POST `/api/chat` (SSE ストリーミング)
追体験セッションの対話を進める。レスポンスはServer-Sent Eventsでストリーミング。

**Request**
```json
{
  "analysis": { /* /api/analyze のレスポンス */ },
  "history": [
    { "role": "assistant", "content": "最初の問い" },
    { "role": "user", "content": "読者の回答" }
  ]
}
```

**Response** (SSE)
```
data: {"delta": "テキストの"}
data: {"delta": "断片が"}
data: {"delta": "流れる"}
data: [DONE]
```

---

## AI プロンプト設計

### フェーズ1: 記事解剖プロンプト

```
あなたは技術記事を解剖する専門家です。

以下の記事を読み、著者の思考過程を復元してください。

特に重要なのは：
- 著者がなぜその方向を「疑わなかったか」（認知の罠）
- 気づく直前に著者が持っていた誤った前提
- 著者が「わかった」瞬間に何が変わったか

JSONのみを返してください：
{
  "title": "...",
  "pain_points": [...],
  "cognitive_traps": [...],
  "turning_point": "...",
  "first_question": "読者を著者と同じ認知の出発点に立たせる問い（答えを匂わせない）"
}
```

### フェーズ2: 追体験セッションシステムプロンプト

```
あなたは読者を技術記事の著者と同じ思考の迷路で歩かせるファシリテーターです。

記事の解剖結果: {analysis}

行動原則：
- 読者が「わかった」と言っても、著者が実際に詰まったポイントで同じように詰まらせる
- 答えは直接言わない。著者が気づいたプロセスと同じ道を歩ませる
- 強度: 中程度（少し悔しい思いをする程度）
- 著者と同じツボにはまった瞬間を感じさせたら、静かに次のステップへ
- 1回の返答は150字以内。簡潔に核心を突く
- 日本語で返答する

読者の回答パターン別の対応：

[A] 著者と同じ罠にはまった的外れな自信
  → 否定せず、その答えが正しいと仮定したらどうなるか問い返す
  → 著者が実際に同じ思い込みをしていた事実は、気づいた後に初めて開示する

[B] 表面的な正解（深く考えていない）
  → 「なぜそうなるか、もう一段掘り下げてみてください」と返す
  → 著者が詰まった具体的なポイントに誘導する

[C] 明示的な「わからない」または長い沈黙後の降参
  → 段階的ヒントを出す（一度に全部渡さない）
  → ヒントLv1: 問いの角度を変える
  → ヒントLv2: 著者が最初に試みた方向を示す
  → ヒントLv3: 著者が気づいた瞬間の直前の状態を描写する
  → 各ヒント後、必ず読者に考える機会を返してから次のヒントを出す
```

---

## フェーズ2 対話フロー（Scaffolding設計）

Vygotsky的なScaffoldingを**逆向きに**適用する設計。
読者はすでに記事を読み終えて「わかった気」にいる——AIはその偽の理解を崩し、
本物のZPDを再出現させてから段階的に支援する。

```
著者と同じ問いに立つ（first_question）
         ↓
    AI が問いを投げる
         ↓
  【沈黙】読者が自分で考える   ← ZPDの核心。ここをスキップさせない
         ↓
    読者が何らかの回答をする
         ↓
    ┌────────────────────────────────────┐
    │ AIが回答パターンを判定              │
    │                                    │
    │ [A] 的外れな自信                   │
    │   → 仮定で問い返す                 │
    │   → 著者も同じ罠にいたと後で開示   │
    │                                    │
    │ [B] 表面的な正解                   │
    │   → 「なぜ？」でもう一段掘る       │
    │                                    │
    │ [C] 「わからない」/ 降参           │
    │   → 段階的ヒント（Lv1→2→3）      │
    │   → 各ヒント後に読者へ返す         │
    └────────────────────────────────────┘
         ↓
  著者と同じツボにはまったと判定
         ↓
  「気づき」の瞬間を静かに肯定
         ↓
  次のpain_pointへ、または終了

```

### Scaffolding Fading の原則

AIが支援を縮小するタイミングを意識的に設計する：

- 読者が自力で正しい方向に進んでいるとき → AIは問いを短くする、または黙って次へ
- 読者が連続して正確な答えを出したとき → ヒントなしで次のポイントへ進む
- セッション後半ほど → AIの発言量を減らし、読者の思考時間を増やす

支援を出しすぎると「AIに誘導されてわかった」になり、Generation Effectが失われる。

---

## フロントエンド状態設計

```typescript
type Phase = 'input' | 'fetching' | 'analyzing' | 'session' | 'error'

type Analysis = {
  title: string
  pain_points: string[]
  cognitive_traps: string[]
  turning_point: string
  first_question: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type AppState = {
  phase: Phase
  url: string
  analysis: Analysis | null
  messages: Message[]
  error: string | null
}
```

---

## URL fetch の実装方針

バックエンドで `fetch(url)` → HTMLをテキストに変換。

変換ステップ：
1. `fetch(url)` でHTMLを取得
2. `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>` を除去
3. HTML→プレーンテキスト変換（`linkedom` または正規表現）
4. 連続空白・改行を圧縮
5. 8000字でトリミング（Claudeのコンテキスト節約）

対応できないケース（初期スコープ外）：
- JSレンダリング必須のSPA（一部のQiita等）
- ログイン必須記事
- PDFリンク

---

## ローカル開発の起動手順（予定）

```bash
# セットアップ
bun install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 起動（フロント + API同時）
bun run dev
# → フロント: http://localhost:5173
# → API:    http://localhost:3000
```

---

## Cloudflare移行時の変更点（メモ）

- `wrangler.toml` にAPIキーをシークレットとして設定
- `fetch` APIはWorkers標準なのでそのまま動く
- `linkedom` → Workers非対応の可能性あり → 独自のHTML→text変換に切り替え
- SSEは `TransformStream` で実装（Hono対応済み）

---

## 今後の拡張候補（スコープ外）

- セッション履歴の保存（KV or D1）
- 記事解剖結果の可視化（認知の罠マップ）
- 複数URLの比較追体験
- ユーザー認証 + 独自APIキー入力
- 著者自身が思考ログを補足入力できるモード
