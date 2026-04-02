import { For } from "solid-js";
import type { Message } from "../types";

type Props = {
  messages: Message[];
};

export function MessageList(props: Props) {
  return (
    <div class="flex flex-col gap-4">
      <For each={props.messages}>
        {(msg) => (
          <div
            class={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              class={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-amber-600 text-white"
                  : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {msg.content || (
                <span class="inline-block animate-pulse text-zinc-500">
                  ...
                </span>
              )}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
