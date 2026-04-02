import { createSignal } from "solid-js";

type Props = {
  onSend: (content: string) => void;
  disabled: boolean;
};

export function ReplyInput(props: Props) {
  const [text, setText] = createSignal("");

  const handleSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    if (text().trim() && !props.disabled) {
      props.onSend(text().trim());
      setText("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text().trim() && !props.disabled) {
        props.onSend(text().trim());
        setText("");
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} class="flex gap-2">
      <textarea
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="考えを書いてみてください..."
        disabled={props.disabled}
        rows={2}
        class="flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={props.disabled || !text().trim()}
        class="self-end rounded-lg bg-amber-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-40"
      >
        送信
      </button>
    </form>
  );
}
