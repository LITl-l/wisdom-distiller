import type { Analysis, Message } from "../types";
import type { LLMClient } from "./llm";
import { SESSION_SYSTEM_PROMPT } from "./prompts";

export function streamChatReply(
  llm: LLMClient,
  analysis: Analysis,
  history: Message[],
): AsyncIterable<string> {
  return llm.stream({
    maxTokens: 512,
    system: SESSION_SYSTEM_PROMPT(JSON.stringify(analysis)),
    messages: history,
  });
}
