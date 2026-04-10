import type {
  CompleteParams,
  LLMClient,
  LLMMessage,
  StreamParams,
} from "./types";

type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function toOpenAIMessages(
  messages: LLMMessage[],
  system: string | undefined,
): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) out.push({ role: m.role, content: m.content });
  return out;
}

export function createOpenAICompatibleClient(opts: {
  baseURL: string;
  apiKey: string;
  model: string;
}): LLMClient {
  const base = opts.baseURL.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;

  const headers = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.apiKey) h.Authorization = `Bearer ${opts.apiKey}`;
    return h;
  };

  return {
    async complete({ system, messages, maxTokens }: CompleteParams) {
      const res = await fetch(url, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          model: opts.model,
          max_tokens: maxTokens,
          messages: toOpenAIMessages(messages, system),
          stream: false,
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenAI-compatible request failed: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw new Error("OpenAI-compatible response missing message content");
      }
      return content;
    },

    async *stream({ system, messages, maxTokens }: StreamParams) {
      const res = await fetch(url, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          model: opts.model,
          max_tokens: maxTokens,
          messages: toOpenAIMessages(messages, system),
          stream: true,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`OpenAI-compatible stream failed: ${res.status} ${await res.text().catch(() => "")}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta: string | undefined = json?.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // skip malformed chunks
          }
        }
      }
    },
  };
}
