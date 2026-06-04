import type { ProviderCapabilities, ProviderConfig } from "./types";

const JSON_SCHEMA_HOSTS = ["api.openai.com", "openrouter.ai"];

export function inferCapabilities(config: ProviderConfig): ProviderCapabilities {
  if (config.kind === "anthropic") {
    return { structuredOutput: "tool_use", promptCaching: true, streaming: true };
  }
  let host = "";
  try {
    host = new URL(config.baseUrl ?? "").host;
  } catch {
    host = "";
  }
  const supportsJsonSchema = JSON_SCHEMA_HOSTS.some((h) => host.endsWith(h));
  return {
    structuredOutput: supportsJsonSchema ? "json_schema" : "json_object",
    promptCaching: false,
    streaming: true,
  };
}
