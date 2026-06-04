import type { ProviderConfig } from "./providers/types";

export type { Analysis } from "./modes/socratic";

export type Message = {
  role: "user" | "assistant";
  content: string;
};

export type FetchRequest = {
  url: string;
};

export type FetchResponse = {
  text: string;
  title: string;
};

export type AnalyzeRequest = {
  text: string;
  provider: ProviderConfig;
};

export type ChatRequest = {
  analysis: import("./modes/socratic").Analysis;
  history: Message[];
  provider: ProviderConfig;
};
