// The toolbar's scenario list is typed by hand so it can render before any
// file loads. This keeps it honest against what is actually bundled.
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SCENARIO_ID, SCENARIOS } from "../src/lib/scenarios";
import { AnswerKeySchema } from "../src/lib/schema";
import { readJson, repoFileExists, repoPath } from "./contract";

describe("the bundled scenario list", () => {
  it("names every directory under data/scenarios, and nothing else", () => {
    const bundled = readdirSync(repoPath("data/scenarios")).sort();
    expect(SCENARIOS.map((scenario) => scenario.id).sort()).toEqual(bundled);
  });

  it("uses each answer key's own scenario name", () => {
    for (const scenario of SCENARIOS) {
      const key = AnswerKeySchema.parse(readJson(`data/scenarios/${scenario.id}/answer_key.json`));
      expect(scenario.name).toBe(key.scenario_name);
    }
  });

  it("has a cached first analysis for every scenario it offers", () => {
    for (const scenario of SCENARIOS) {
      expect(repoFileExists(`data/scenarios/${scenario.id}/analysis.json`)).toBe(true);
    }
  });

  it("opens on the attack scenario", () => {
    expect(DEFAULT_SCENARIO_ID).toBe("attack-chain-01");
  });
});
