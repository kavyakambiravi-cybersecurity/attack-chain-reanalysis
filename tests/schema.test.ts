import { describe, expect, it } from "vitest";
import {
  AnalyzeRequestSchema,
  AnswerKeySchema,
  ChainSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
} from "../src/lib/schema";
import { contract, readJson } from "./contract";

describe("wire contract on the client", () => {
  it("parses the analyze_request example", () => {
    const parsed = AnalyzeRequestSchema.parse(contract("analyze_request.json"));
    expect(parsed.scenario_id).toBe("attack-chain-01");
    expect(parsed.removed_event_ids).toEqual(["E-0115", "E-0117", "E-0115"]);
  });

  it("parses the analyze_response example and every field survives the round trip", () => {
    const raw = contract<Record<string, unknown>>("analyze_response.json");
    const parsed = ChainSchema.parse(raw);
    expect(parsed).toEqual(raw);
    expect(parsed.prompt_version).toBe("2026-09-07.1");
    expect(parsed.edges).toHaveLength(3);
    expect(parsed.nodes.map((n) => n.id)).toEqual([
      "203.0.113.47",
      "WKSTN-042",
      "DC-01",
    ]);
  });

  it("rejects a response with no prompt_version", () => {
    const raw = contract<Record<string, unknown>>("analyze_response.json");
    delete raw.prompt_version;
    expect(ChainSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects an edge with no citations field", () => {
    const raw = contract<any>("analyze_response.json");
    delete raw.edges[0].citations;
    expect(ChainSchema.safeParse(raw).success).toBe(false);
  });

  it("strips extra fields so no score can leak in through the schema", () => {
    const raw = contract<any>("analyze_response.json");
    raw.edges[0].confidence = 0.9;
    raw.severity = "high";
    const parsed = ChainSchema.parse(raw);
    expect(parsed.edges[0]).not.toHaveProperty("confidence");
    expect(parsed).not.toHaveProperty("severity");
  });

  it("parses an error body carrying ids", () => {
    const parsed = ErrorResponseSchema.parse(contract("error_unknown_event_ids.json"));
    expect(parsed.error).toBe("unknown_event_ids");
    expect(parsed.ids).toEqual(["E-9999", "E-0000"]);
  });

  it("parses an error body without ids", () => {
    const parsed = ErrorResponseSchema.parse(contract("error_not_configured.json"));
    expect(parsed.error).toBe("not_configured");
    expect(parsed.ids).toBeUndefined();
    expect(parsed.detail).toBe("Live re-analysis is off: the server has no model key.");
  });

  it("rejects an unknown error code", () => {
    expect(ErrorResponseSchema.safeParse({ error: "teapot", detail: "x" }).success).toBe(false);
  });

  it("parses both health shapes and requires ok to be literally true", () => {
    expect(HealthResponseSchema.parse(contract("health_live.json"))).toEqual({
      ok: true,
      live: true,
      model: "claude-sonnet-5",
    });
    expect(HealthResponseSchema.parse(contract("health_offline.json")).live).toBe(false);
    expect(
      HealthResponseSchema.safeParse({ ok: false, live: true, model: "claude-sonnet-5" }).success,
    ).toBe(false);
  });

  it("parses both answer keys and strips the generator bookkeeping fields", () => {
    const attack = AnswerKeySchema.parse(
      readJson("data/scenarios/attack-chain-01/answer_key.json"),
    );
    expect(attack.scenario_type).toBe("attack");
    expect(attack.attack_event_ids).toHaveLength(16);
    expect(attack.chain_summary?.length).toBeGreaterThan(0);
    for (const stripped of ["seed", "generated_by", "attack_event_count"]) {
      expect(attack).not.toHaveProperty(stripped);
    }

    const benign = AnswerKeySchema.parse(
      readJson("data/scenarios/benign-lookalike-02/answer_key.json"),
    );
    expect(benign.scenario_type).toBe("benign");
    expect(benign.attack_event_ids).toEqual([]);
    expect(benign.lookalikes?.[0].why_benign.length).toBeGreaterThan(0);
    for (const stripped of ["seed", "generated_by", "lookalike_event_count"]) {
      expect(benign).not.toHaveProperty(stripped);
    }
  });
});
