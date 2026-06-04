import { test, expect } from "bun:test";
import { inferCapabilities } from "./capabilities";

test("anthropic kind → tool_use + caching", () => {
  const c = inferCapabilities({ kind: "anthropic", model: "claude-sonnet-4-20250514" });
  expect(c.structuredOutput).toBe("tool_use");
  expect(c.promptCaching).toBe(true);
  expect(c.streaming).toBe(true);
});

test("openai.com → json_schema", () => {
  const c = inferCapabilities({
    kind: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });
  expect(c.structuredOutput).toBe("json_schema");
});

test("local Ollama → json_object (safe default)", () => {
  const c = inferCapabilities({
    kind: "openai-compat",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
  });
  expect(c.structuredOutput).toBe("json_object");
  expect(c.promptCaching).toBe(false);
});

test("missing/garbage baseUrl → json_object, no throw", () => {
  const c = inferCapabilities({ kind: "openai-compat", model: "x" });
  expect(c.structuredOutput).toBe("json_object");
});
