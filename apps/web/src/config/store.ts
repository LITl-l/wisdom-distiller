import { createSignal } from "solid-js";
import type { ProviderConfig } from "./presets";

const KEY = "wd.provider";

export function loadProviderConfig(): ProviderConfig | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProviderConfig) : null;
  } catch {
    return null;
  }
}

export function saveProviderConfig(config: ProviderConfig): void {
  globalThis.localStorage?.setItem(KEY, JSON.stringify(config));
}

export function clearProviderConfig(): void {
  globalThis.localStorage?.removeItem(KEY);
}

export function redactConfig(config: ProviderConfig): ProviderConfig {
  return { ...config, apiKey: config.apiKey ? "***" : undefined };
}

export function isConfigUsable(config: ProviderConfig | null): config is ProviderConfig {
  if (!config || !config.model) return false;
  return config.kind === "anthropic" ? !!config.apiKey : !!config.baseUrl;
}

const [providerConfig, setProviderConfigSignal] = createSignal<ProviderConfig | null>(
  loadProviderConfig(),
);

export { providerConfig };

export function setProviderConfig(config: ProviderConfig): void {
  saveProviderConfig(config);
  setProviderConfigSignal(config);
}

export function resetProviderConfig(): void {
  clearProviderConfig();
  setProviderConfigSignal(null);
}
