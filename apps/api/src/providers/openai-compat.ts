import type {
  ChatParams,
  Provider,
  ProviderCapabilities,
  ProviderConfig,
  StructuredParams,
  TextDelta,
} from "./types";
import { httpToProviderError, networkToProviderError, ProviderError } from "./errors";
import { toJsonSchema } from "./jsonSchema";

type Strategy = ProviderCapabilities["structuredOutput"];

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const slice = start >= 0 && end > start ? body.slice(start, end + 1) : body;
  try {
    return JSON.parse(slice);
  } catch {
    return undefined;
  }
}

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
    try {
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
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // reader may already be released/errored; ignore
      }
    }
  }

  async complete<T>(params: StructuredParams<T>): Promise<T> {
    const strategies: Strategy[] = [this.capabilities.structuredOutput];
    if (strategies[0] !== "prompt_only") strategies.push("prompt_only");

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      const isLast = i === strategies.length - 1;
      try {
        const raw = await this.#requestJson(params, strategy);
        const parsed = params.schema.safeParse(extractJson(raw));
        if (parsed.success) return parsed.data;
      } catch (e) {
        // Auth / not-found errors won't be fixed by a different output strategy.
        if (e instanceof ProviderError && (e.status === 401 || e.status === 403 || e.status === 404)) {
          throw e;
        }
        if (isLast) throw e; // network/HTTP error on the final attempt → surface it
        // otherwise fall through and try the next strategy
      }
    }
    throw new ProviderError(
      422,
      `The model did not return valid JSON for "${params.schemaName}". Try a more capable model.`,
    );
  }

  async #requestJson<T>(params: StructuredParams<T>, strategy: Strategy): Promise<string> {
    const needsInstruction = strategy !== "json_schema";
    const userContent =
      params.prompt +
      (needsInstruction
        ? "\n\nReturn ONLY a single JSON object. No markdown fences, no prose."
        : "");

    const body: Record<string, unknown> = {
      model: this.config.model,
      temperature: 0.4,
      max_tokens: params.maxTokens ?? 1024,
      stream: false,
      messages: [
        ...(params.system ? [{ role: "system", content: params.system }] : []),
        { role: "user", content: userContent },
      ],
    };
    if (strategy === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: params.schemaName, schema: toJsonSchema(params.schema), strict: true },
      };
    } else if (strategy === "json_object") {
      body.response_format = { type: "json_object" };
    }

    let res: Response;
    try {
      res = await fetch(this.#endpoint(), {
        method: "POST",
        headers: this.#headers(),
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw networkToProviderError(e, this.config);
    }
    if (!res.ok) {
      throw httpToProviderError(res.status, await res.text().catch(() => ""), this.config);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  }
}
