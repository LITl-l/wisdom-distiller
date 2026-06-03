import Anthropic from "@anthropic-ai/sdk";
import type {
  ChatParams,
  Provider,
  ProviderCapabilities,
  ProviderConfig,
  StructuredParams,
  TextDelta,
} from "./types";
import { httpToProviderError, ProviderError } from "./errors";
import { toJsonSchema } from "./jsonSchema";

export class AnthropicProvider implements Provider {
  readonly capabilities: ProviderCapabilities = {
    structuredOutput: "tool_use",
    promptCaching: true,
    streaming: true,
  };
  #client: Anthropic;

  constructor(
    public readonly config: ProviderConfig,
    client?: Anthropic,
  ) {
    this.#client = client ?? new Anthropic({ apiKey: config.apiKey });
  }

  async *streamChat(params: ChatParams, signal?: AbortSignal): AsyncIterable<TextDelta> {
    const stream = this.#client.messages.stream(
      {
        model: this.config.model,
        max_tokens: params.maxTokens ?? 512,
        system: params.system,
        messages: params.messages,
      },
      { signal },
    );
    for await (const event of stream as AsyncIterable<any>) {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield { text: event.delta.text };
      }
    }
  }

  async complete<T>(params: StructuredParams<T>): Promise<T> {
    let res: any;
    try {
      res = await this.#client.messages.create({
        model: this.config.model,
        max_tokens: params.maxTokens ?? 1024,
        system: params.system
          ? [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }]
          : undefined,
        tools: [
          {
            name: params.schemaName,
            description: `Return the ${params.schemaName} as structured data.`,
            input_schema: toJsonSchema(params.schema) as any,
          },
        ],
        tool_choice: { type: "tool", name: params.schemaName },
        messages: [{ role: "user", content: params.prompt }],
      });
    } catch (e: any) {
      throw httpToProviderError(e?.status ?? 502, e?.message ?? "", this.config);
    }

    const block = (res.content ?? []).find((b: any) => b.type === "tool_use");
    if (!block) {
      throw new ProviderError(422, "The model did not return structured tool output.");
    }
    const parsed = params.schema.safeParse(block.input);
    if (!parsed.success) {
      throw new ProviderError(422, `Structured output failed validation for "${params.schemaName}".`);
    }
    return parsed.data;
  }
}
