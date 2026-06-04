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
