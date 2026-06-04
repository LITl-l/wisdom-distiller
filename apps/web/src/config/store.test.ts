import { test, expect, beforeEach } from "bun:test";
import { loadProviderConfig, saveProviderConfig, clearProviderConfig, redactConfig, isConfigUsable } from "./store";
import type { ProviderConfig } from "./presets";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

beforeEach(() => {
  (globalThis as any).localStorage = memStorage();
});

const cfg: ProviderConfig = {
  kind: "openai-compat",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
};

test("save then load round-trips", () => {
  saveProviderConfig(cfg);
  expect(loadProviderConfig()).toEqual(cfg);
});

test("load returns null when nothing is stored", () => {
  expect(loadProviderConfig()).toBeNull();
});

test("clear removes the stored config", () => {
  saveProviderConfig(cfg);
  clearProviderConfig();
  expect(loadProviderConfig()).toBeNull();
});

test("redactConfig masks the api key", () => {
  expect(redactConfig({ ...cfg, apiKey: "sk-secret" }).apiKey).toBe("***");
  expect(redactConfig(cfg).apiKey).toBeUndefined();
});

test("isConfigUsable: openai-compat needs model + baseUrl", () => {
  expect(isConfigUsable(cfg)).toBe(true);
  expect(isConfigUsable({ ...cfg, baseUrl: "" })).toBe(false);
  expect(isConfigUsable(null)).toBe(false);
});

test("isConfigUsable: anthropic needs model + apiKey", () => {
  expect(isConfigUsable({ kind: "anthropic", model: "claude-x", apiKey: "k" })).toBe(true);
  expect(isConfigUsable({ kind: "anthropic", model: "claude-x" })).toBe(false);
});
