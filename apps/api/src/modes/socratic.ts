import { z } from "zod";
import { ANALYZE_PROMPT, SESSION_SYSTEM_PROMPT } from "../prompts";
import type { StructuredParams } from "../providers/types";

export const AnalysisSchema = z.object({
  title: z.string(),
  pain_points: z.array(z.string()),
  cognitive_traps: z.array(z.string()),
  turning_point: z.string(),
  first_question: z.string(),
});

export type Analysis = z.infer<typeof AnalysisSchema>;

export const ANALYSIS_SCHEMA_NAME = "analysis";

export function buildAnalyzeParams(articleText: string): StructuredParams<Analysis> {
  return {
    prompt: `${ANALYZE_PROMPT}\n\n---\n\n${articleText}`,
    schema: AnalysisSchema,
    schemaName: ANALYSIS_SCHEMA_NAME,
    maxTokens: 1024,
  };
}

export function buildSessionSystem(analysis: Analysis): string {
  return SESSION_SYSTEM_PROMPT(JSON.stringify(analysis));
}
