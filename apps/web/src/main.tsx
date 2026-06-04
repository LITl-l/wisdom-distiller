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
