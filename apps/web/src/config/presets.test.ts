import { test, expect } from "bun:test";
import { PRESETS, presetById } from "./presets";

test("includes the three local presets and native anthropic", () => {
  const ids = PRESETS.map((p) => p.id);
  expect(ids).toEqual(
    expect.arrayContaining(["ollama", "lmstudio", "llamacpp", "openai", "anthropic", "openrouter", "custom"]),
  );
});

test("local presets require no key and ship a localhost baseUrl", () => {
  const ollama = presetById("ollama")!;
  expect(ollama.keyRequired).toBe(false);
  expect(ollama.baseUrl).toContain("localhost");
  expect(ollama.kind).toBe("openai-compat");
});

test("anthropic preset is native kind and key-required", () => {
  const a = presetById("anthropic")!;
  expect(a.kind).toBe("anthropic");
  expect(a.keyRequired).toBe(true);
});

test("presetById returns undefined for unknown id", () => {
  expect(presetById("nope")).toBeUndefined();
});
