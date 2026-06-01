import type { ZodType } from "zod";

export type ProviderKind = "openai-compat" | "anthropic";

export interface ProviderConfig {
  kind: ProviderKind;
  baseUrl?: string; // openai-compat (local or cloud); ignored by native anthropic
  model: string;
  apiKey?: string; // optional for local servers
  headers?: Record<string, string>;
}

export interface ProviderCapabilities {
  structuredOutput: "json_schema" | "tool_use" | "json_object" | "prompt_only";
  promptCaching: boolean;
  streaming: boolean;
}

export interface ChatParams {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

export interface TextDelta {
  text: string;
}

export interface StructuredParams<T> {
  system?: string;
  prompt: string;
  schema: ZodType<T>;
  schemaName: string;
  maxTokens?: number;
}

export interface Provider {
  readonly config: ProviderConfig;
  readonly capabilities: ProviderCapabilities;
  streamChat(params: ChatParams, signal?: AbortSignal): AsyncIterable<TextDelta>;
  complete<T>(params: StructuredParams<T>): Promise<T>;
}
