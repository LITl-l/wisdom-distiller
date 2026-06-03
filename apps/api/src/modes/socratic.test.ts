import { test, expect } from "bun:test";
import { AnalysisSchema, buildAnalyzeParams, buildSessionSystem } from "./socratic";

const sample = {
  title: "T",
  pain_points: ["p"],
  cognitive_traps: ["c"],
  turning_point: "t",
  first_question: "q",
};

test("AnalysisSchema accepts the canonical shape", () => {
  expect(AnalysisSchema.parse(sample)).toEqual(sample);
});

test("AnalysisSchema rejects a missing field", () => {
  const { first_question, ...rest } = sample;
  expect(AnalysisSchema.safeParse(rest).success).toBe(false);
});

test("buildAnalyzeParams embeds the article text and names the schema 'analysis'", () => {
  const p = buildAnalyzeParams("ARTICLE BODY");
  expect(p.schemaName).toBe("analysis");
  expect(p.prompt).toContain("ARTICLE BODY");
  expect(p.schema).toBe(AnalysisSchema);
});

test("buildSessionSystem embeds the serialized analysis", () => {
  const sys = buildSessionSystem(sample);
  expect(sys).toContain("ファシリテーター");
  expect(sys).toContain('"title":"T"');
});
