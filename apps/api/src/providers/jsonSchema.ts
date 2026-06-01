import { z, type ZodType } from "zod";

/**
 * Single conversion point from a zod schema to a plain JSON Schema object,
 * used for OpenAI `response_format.json_schema` and Anthropic tool `input_schema`.
 * Isolated here so any zod-version API change is a one-line fix.
 */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}
