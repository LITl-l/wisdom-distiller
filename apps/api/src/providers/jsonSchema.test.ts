import { test, expect } from "bun:test";
import { z } from "zod";
import { toJsonSchema } from "./jsonSchema";

test("converts a zod object to a JSON Schema with the right shape", () => {
  const schema = z.object({
    title: z.string(),
    tags: z.array(z.string()),
  });
  const json = toJsonSchema(schema) as {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  expect(json.type).toBe("object");
  expect(Object.keys(json.properties)).toEqual(["title", "tags"]);
  expect((json.properties.tags as { type: string }).type).toBe("array");
  expect(json.required).toContain("title");
});
