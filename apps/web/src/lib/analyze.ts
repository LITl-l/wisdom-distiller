import type { Analysis } from "../types";
import type { LLMClient } from "./llm";
import { ANALYZE_PROMPT } from "./prompts";

function extractJSON(raw: string): string {
  // Some models wrap JSON in ```json fences; strip if present.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  return raw.trim();
}

export async function analyzeArticle(
  llm: LLMClient,
  text: string,
): Promise<Analysis> {
  const raw = await llm.complete({
    maxTokens: 1024,
    messages: [
      {
        role: "user",
        content: `${ANALYZE_PROMPT}\n\n---\n\n${text}`,
      },
    ],
  });

  try {
    return JSON.parse(extractJSON(raw)) as Analysis;
  } catch {
    throw new Error(`Failed to parse analysis JSON:\n${raw}`);
  }
}
