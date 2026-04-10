import { createAnthropicClient } from "./anthropic";
import { createOpenAICompatibleClient } from "./openai";
import type { LLMClient, ProviderConfig } from "./types";

export function createLLMClient(config: ProviderConfig): LLMClient {
  if (config.kind === "anthropic") {
    return createAnthropicClient({
      apiKey: config.apiKey,
      model: config.model,
    });
  }
  return createOpenAICompatibleClient({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
  });
}

export type { LLMClient, ProviderConfig, ProviderKind, LLMMessage } from "./types";
