import type {
  CompleteParams,
  LLMClient,
  StreamParams,
} from "./types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicContentBlock = { type: string; text?: string };
type AnthropicResponse = { content: AnthropicContentBlock[] };

export function createAnthropicClient(opts: {
  apiKey: string;
  model: string;
}): LLMClient {
  const headers = (): Record<string, string> => ({
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    // Required to call Anthropic directly from the browser (BYOK / static site).
    "anthropic-dangerous-direct-browser-access": "true",
  });

  const buildBody = (
    { system, messages, maxTokens }: CompleteParams,
    stream: boolean,
  ) => {
    const body: Record<string, unknown> = {
      model: opts.model,
      max_tokens: maxTokens,
      messages,
      stream,
    };
    if (system) body.system = system;
    return JSON.stringify(body);
  };

  return {
    async complete(params: CompleteParams) {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: headers(),
        body: buildBody(params, false),
      });
      if (!res.ok) {
        throw new Error(`Anthropic request failed: ${res.status} ${await res.text()}`);
      }
      const data = (await res.json()) as AnthropicResponse;
      const block = data.content?.[0];
      if (!block || block.type !== "text" || typeof block.text !== "string") {
        throw new Error("Anthropic returned non-text content");
      }
      return block.text;
    },

    async *stream(params: StreamParams) {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: headers(),
        body: buildBody(params, true),
      });
      if (!res.ok || !res.body) {
        throw new Error(
          `Anthropic stream failed: ${res.status} ${await res.text().catch(() => "")}`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by blank lines. Parse the data: line within each.
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          for (const rawLine of rawEvent.split("\n")) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              const json = JSON.parse(payload);
              if (
                json?.type === "content_block_delta" &&
                json?.delta?.type === "text_delta" &&
                typeof json.delta.text === "string"
              ) {
                yield json.delta.text as string;
              }
            } catch {
              // skip malformed SSE payloads
            }
          }
        }
      }
    },
  };
}
