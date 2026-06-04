export type ProviderKind = "openai-compat" | "anthropic";

export type ProviderConfig = {
  kind: ProviderKind;
  baseUrl?: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
};

export type Preset = {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl?: string;
  keyRequired: boolean;
  defaultModel?: string;
};

export const PRESETS: Preset[] = [
  { id: "ollama", label: "Ollama (local)", kind: "openai-compat", baseUrl: "http://localhost:11434/v1", keyRequired: false, defaultModel: "llama3.1" },
  { id: "lmstudio", label: "LM Studio (local)", kind: "openai-compat", baseUrl: "http://localhost:1234/v1", keyRequired: false },
  { id: "llamacpp", label: "llama.cpp (local)", kind: "openai-compat", baseUrl: "http://localhost:8080/v1", keyRequired: false },
  { id: "openai", label: "OpenAI", kind: "openai-compat", baseUrl: "https://api.openai.com/v1", keyRequired: true, defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic (native)", kind: "anthropic", keyRequired: true, defaultModel: "claude-sonnet-4-20250514" },
  { id: "openrouter", label: "OpenRouter", kind: "openai-compat", baseUrl: "https://openrouter.ai/api/v1", keyRequired: true },
  { id: "custom", label: "Custom", kind: "openai-compat", keyRequired: false },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
