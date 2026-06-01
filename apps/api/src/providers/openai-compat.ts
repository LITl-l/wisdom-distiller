import type {
  ChatParams,
  Provider,
  ProviderCapabilities,
  ProviderConfig,
  StructuredParams,
  TextDelta,
} from "./types";
import { httpToProviderError, networkToProviderError } from "./errors";

const DEFAULT_CAPS: ProviderCapabilities = {
  structuredOutput: "json_object",
  promptCaching: false,
  streaming: true,
};

export class OpenAICompatProvider implements Provider {
  constructor(
    public readonly config: ProviderConfig,
    public readonly capabilities: ProviderCapabilities = DEFAULT_CAPS,
  ) {}

  #headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      ...(this.config.headers ?? {}),
    };
  }

  #endpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  async *streamChat(params: ChatParams, signal?: AbortSignal): AsyncIterable<TextDelta> {
    let res: Response;
    try {
      res = await fetch(this.#endpoint(), {
        method: "POST",
        signal,
        headers: this.#headers(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            ...(params.system ? [{ role: "system", content: params.system }] : []),
            ...params.messages,
          ],
          stream: true,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 512,
        }),
      });
    } catch (e) {
      throw networkToProviderError(e, this.config);
    }
    if (!res.ok) {
      throw httpToProviderError(res.status, await res.text().catch(() => ""), this.config);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield { text: delta };
        } catch {
          // skip malformed frame
        }
      }
    }
  }

  // complete<T> implemented in Task 6
  async complete<T>(_params: StructuredParams<T>): Promise<T> {
    throw new Error("not implemented");
  }
}
