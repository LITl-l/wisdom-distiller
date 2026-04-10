import { createSignal, Show } from "solid-js";
import type { ProviderConfig, ProviderKind } from "../lib/llm";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  DEFAULT_OPENAI_MODEL,
  defaultConfigFor,
} from "../lib/settings";

const INPUT_CLASS =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500";

type Props = {
  initial: ProviderConfig | null;
  onSave: (config: ProviderConfig) => void;
  onCancel: () => void;
};

export function Settings(props: Props) {
  const initial = props.initial ?? defaultConfigFor("anthropic");

  const [kind, setKind] = createSignal<ProviderKind>(initial.kind);
  const [anthropicKey, setAnthropicKey] = createSignal(
    initial.kind === "anthropic" ? initial.apiKey : "",
  );
  const [anthropicModel, setAnthropicModel] = createSignal(
    initial.kind === "anthropic" ? initial.model : DEFAULT_ANTHROPIC_MODEL,
  );
  const [baseURL, setBaseURL] = createSignal(
    initial.kind === "openai-compatible" ? initial.baseURL : DEFAULT_OPENAI_BASE_URL,
  );
  const [openaiKey, setOpenaiKey] = createSignal(
    initial.kind === "openai-compatible" ? initial.apiKey : "",
  );
  const [openaiModel, setOpenaiModel] = createSignal(
    initial.kind === "openai-compatible" ? initial.model : DEFAULT_OPENAI_MODEL,
  );

  const canSave = () => {
    if (kind() === "anthropic") {
      return anthropicKey().trim().length > 0 && anthropicModel().trim().length > 0;
    }
    return baseURL().trim().length > 0 && openaiModel().trim().length > 0;
  };

  const handleSave = (e: SubmitEvent) => {
    e.preventDefault();
    if (!canSave()) return;
    if (kind() === "anthropic") {
      props.onSave({
        kind: "anthropic",
        apiKey: anthropicKey().trim(),
        model: anthropicModel().trim(),
      });
    } else {
      props.onSave({
        kind: "openai-compatible",
        baseURL: baseURL().trim().replace(/\/+$/, ""),
        apiKey: openaiKey().trim(),
        model: openaiModel().trim(),
      });
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <form
        onSubmit={handleSave}
        class="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
      >
        <h2 class="text-lg font-semibold text-zinc-100">LLM Provider 設定</h2>
        <p class="mt-1 text-xs text-zinc-500">
          API キーはこのブラウザの localStorage にのみ保存されます。
        </p>

        <div class="mt-5">
          <label class="text-xs text-zinc-400">プロバイダ</label>
          <div class="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setKind("anthropic")}
              class={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                kind() === "anthropic"
                  ? "border-amber-500 bg-amber-500/10 text-amber-200"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Anthropic
            </button>
            <button
              type="button"
              onClick={() => setKind("openai-compatible")}
              class={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                kind() === "openai-compatible"
                  ? "border-amber-500 bg-amber-500/10 text-amber-200"
                  : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              OpenAI 互換
            </button>
          </div>
          <p class="mt-2 text-[11px] leading-relaxed text-zinc-500">
            OpenAI 互換は OpenAI / Ollama / llama.cpp / LM Studio / vLLM / OpenRouter / Groq
            など、<code>/chat/completions</code> 形式を話す全ランタイムで動きます。
          </p>
        </div>

        <Show when={kind() === "anthropic"}>
          <div class="mt-5 space-y-3">
            <Field label="API Key">
              <input
                type="password"
                value={anthropicKey()}
                onInput={(e) => setAnthropicKey(e.currentTarget.value)}
                placeholder="sk-ant-..."
                class={INPUT_CLASS}
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                value={anthropicModel()}
                onInput={(e) => setAnthropicModel(e.currentTarget.value)}
                class={INPUT_CLASS}
              />
            </Field>
          </div>
        </Show>

        <Show when={kind() === "openai-compatible"}>
          <div class="mt-5 space-y-3">
            <Field label="Base URL">
              <input
                type="text"
                value={baseURL()}
                onInput={(e) => setBaseURL(e.currentTarget.value)}
                placeholder="https://api.openai.com/v1"
                class={INPUT_CLASS}
              />
            </Field>
            <Field label="API Key (ローカルの場合は空欄でOK)">
              <input
                type="password"
                value={openaiKey()}
                onInput={(e) => setOpenaiKey(e.currentTarget.value)}
                placeholder="sk-... / ollama / 任意"
                class={INPUT_CLASS}
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                value={openaiModel()}
                onInput={(e) => setOpenaiModel(e.currentTarget.value)}
                placeholder="gpt-4o-mini / llama3.1:8b / ..."
                class={INPUT_CLASS}
              />
            </Field>
          </div>
        </Show>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            class="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
          >
            キャンセル
          </button>
          <button
            type="submit"
            disabled={!canSave()}
            class="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-40"
          >
            保存
          </button>
        </div>
      </form>
    </div>
  );
}

function Field(props: { label: string; children: any }) {
  return (
    <label class="block">
      <span class="text-xs text-zinc-400">{props.label}</span>
      <div class="mt-1">{props.children}</div>
    </label>
  );
}
