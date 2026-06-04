import type { Provider, ProviderConfig } from "./types";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";
import { inferCapabilities } from "./capabilities";
import { ProviderError } from "./errors";

export function resolveProvider(config: ProviderConfig): Provider {
  if (!config || !config.kind) {
    throw new ProviderError(400, "No provider configured. Open settings and choose a provider.");
  }
  if (config.kind === "anthropic") {
    return new AnthropicProvider(config);
  }
  return new OpenAICompatProvider(config, inferCapabilities(config));
}
