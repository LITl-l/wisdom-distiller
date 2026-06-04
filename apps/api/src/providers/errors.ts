import type { ProviderConfig } from "./types";

export class ProviderError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const where = (config: ProviderConfig) =>
  config.baseUrl ?? (config.kind === "anthropic" ? "the Anthropic API" : "the provider");

export function httpToProviderError(
  status: number,
  bodyText: string,
  config: ProviderConfig,
): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(status, "Authentication failed — check your API key.");
  }
  if (status === 404) {
    return new ProviderError(
      status,
      `Not found — is the model "${config.model}" available at ${where(config)}?`,
    );
  }
  if (status === 429) {
    return new ProviderError(status, "Rate limited — wait a moment and try again.");
  }
  const snippet = bodyText.slice(0, 200).trim();
  return new ProviderError(status, `Provider error (${status})${snippet ? `: ${snippet}` : ""}`);
}

export function networkToProviderError(err: unknown, config: ProviderConfig): ProviderError {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (code === "ECONNREFUSED" || code === "ConnectionRefused") {
    return new ProviderError(
      502,
      `Could not reach the model server at ${where(config)}. Is it running (Ollama / LM Studio / llama.cpp)?`,
    );
  }
  const msg = (err as Error)?.message ?? "unknown error";
  return new ProviderError(502, `Network error contacting the provider: ${msg}`);
}
