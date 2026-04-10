export type LLMMessage = {
  role: "user" | "assistant";
  content: string;
};

export type CompleteParams = {
  system?: string;
  messages: LLMMessage[];
  maxTokens: number;
};

export type StreamParams = CompleteParams;

export interface LLMClient {
  complete(params: CompleteParams): Promise<string>;
  stream(params: StreamParams): AsyncIterable<string>;
}

export type ProviderKind = "anthropic" | "openai-compatible";

export type ProviderConfig =
  | {
      kind: "anthropic";
      apiKey: string;
      model: string;
    }
  | {
      kind: "openai-compatible";
      baseURL: string;
      apiKey: string;
      model: string;
    };
