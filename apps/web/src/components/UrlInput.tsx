import { createSignal } from "solid-js";

type Props = {
  onSubmit: (url: string) => void;
};

export function UrlInput(props: Props) {
  const [url, setUrl] = createSignal("");

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (url().trim()) props.onSubmit(url().trim());
  };

  return (
    <form onSubmit={handleSubmit} class="flex flex-col items-center gap-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold tracking-tight text-zinc-100">
          Wisdom Distiller
        </h1>
        <p class="mt-2 text-zinc-400">
          技術記事のURLを入れると、著者の思考の迷路を追体験できます
        </p>
      </div>
      <div class="flex w-full max-w-xl gap-2">
        <input
          type="url"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          placeholder="https://zenn.dev/..."
          class="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
        <button
          type="submit"
          disabled={!url().trim()}
          class="rounded-lg bg-amber-600 px-6 py-3 font-medium text-white transition hover:bg-amber-500 disabled:opacity-40 disabled:hover:bg-amber-600"
        >
          解剖する
        </button>
      </div>
    </form>
  );
}
