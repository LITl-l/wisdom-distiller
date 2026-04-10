import type { ProviderConfig, ProviderKind } from "./llm";

const STORAGE_KEY = "wisdom-distiller:provider-config";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export function loadConfig(): ProviderConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidConfig(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfig(config: ProviderConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isValidConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "anthropic") {
    return typeof v.apiKey === "string" && typeof v.model === "string" && v.apiKey.length > 0;
  }
  if (v.kind === "openai-compatible") {
    return (
      typeof v.baseURL === "string" &&
      v.baseURL.length > 0 &&
      typeof v.apiKey === "string" &&
      typeof v.model === "string" &&
      v.model.length > 0
    );
  }
  return false;
}

export function defaultConfigFor(kind: ProviderKind): ProviderConfig {
  if (kind === "anthropic") {
    return { kind: "anthropic", apiKey: "", model: DEFAULT_ANTHROPIC_MODEL };
  }
  return {
    kind: "openai-compatible",
    baseURL: DEFAULT_OPENAI_BASE_URL,
    apiKey: "",
    model: DEFAULT_OPENAI_MODEL,
  };
}
