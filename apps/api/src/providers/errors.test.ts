import { test, expect } from "bun:test";
import { ProviderError, httpToProviderError, networkToProviderError } from "./errors";
import type { ProviderConfig } from "./types";

const cfg: ProviderConfig = {
  kind: "openai-compat",
  baseUrl: "http://localhost:11434/v1",
  model: "llama3.1",
  apiKey: "sk-super-secret-value",
};

test("ProviderError carries an HTTP status", () => {
  const e = new ProviderError(429, "slow down");
  expect(e.status).toBe(429);
  expect(e.message).toBe("slow down");
});

test("401 maps to an actionable, key-free message", () => {
  const e = httpToProviderError(401, "Unauthorized", cfg);
  expect(e.status).toBe(401);
  expect(e.message.toLowerCase()).toContain("api key");
  expect(e.message).not.toContain("sk-super-secret-value");
});

test("ECONNREFUSED maps to a 'is your server running' message", () => {
  const e = networkToProviderError({ code: "ECONNREFUSED" }, cfg);
  expect(e.status).toBe(502);
  expect(e.message).toContain("http://localhost:11434/v1");
  expect(e.message).not.toContain("sk-super-secret-value");
});

test("network error reads code from err.cause too", () => {
  const e = networkToProviderError({ cause: { code: "ECONNREFUSED" } }, cfg);
  expect(e.message.toLowerCase()).toContain("running");
});
