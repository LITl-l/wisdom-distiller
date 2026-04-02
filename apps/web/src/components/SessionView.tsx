import { onMount, onCleanup, createEffect } from "solid-js";
import type { Analysis, Message } from "../types";
import { MessageList } from "./MessageList";
import { ReplyInput } from "./ReplyInput";

type Props = {
  analysis: Analysis;
  messages: Message[];
  streaming: boolean;
  onSend: (content: string) => void;
  onReset: () => void;
};

export function SessionView(props: Props) {
  let bottomRef!: HTMLDivElement;

  createEffect(() => {
    // Track messages length to trigger scroll
    props.messages.length;
    bottomRef?.scrollIntoView({ behavior: "smooth" });
  });

  return (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <h2 class="text-sm font-medium text-zinc-300 truncate max-w-[80%]">
          {props.analysis.title}
        </h2>
        <button
          onClick={props.onReset}
          class="text-xs text-zinc-500 hover:text-zinc-300 transition"
        >
          最初から
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <MessageList messages={props.messages} />
        <div ref={bottomRef} />
      </div>

      <div class="border-t border-zinc-800 p-4">
        <ReplyInput onSend={props.onSend} disabled={props.streaming} />
      </div>
    </div>
  );
}
