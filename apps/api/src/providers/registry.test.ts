import { test, expect } from "bun:test";
import { resolveProvider } from "./registry";
import { OpenAICompatProvider } from "./openai-compat";
import { AnthropicProvider } from "./anthropic";
import { ProviderError } from "./errors";

test("anthropic kind resolves to AnthropicProvider", () => {
  const p = resolveProvider({ kind: "anthropic", model: "claude-sonnet-4-20250514", apiKey: "k" });
  expect(p).toBeInstanceOf(AnthropicProvider);
  expect(p.capabilities.structuredOutput).toBe("tool_use");
});

test("openai-compat kind resolves with inferred capabilities", () => {
  const p = resolveProvider({
    kind: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });
  expect(p).toBeInstanceOf(OpenAICompatProvider);
  expect(p.capabilities.structuredOutput).toBe("json_schema");
});

test("missing kind throws an actionable 400", () => {
  expect(() => resolveProvider({} as any)).toThrow(ProviderError);
  expect(() => resolveProvider({} as any)).toThrow(/settings/i);
});
