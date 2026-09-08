import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ChainSchema } from "../src/lib/schema";
import { validateChain } from "../src/lib/validate";
import { MOCK_MARKER, mockAnalyze, mockCachedChain, mockHealth, setMockError } from "../src/lib/mock";
import type { AnswerKey, Event } from "../src/types";
import { readJson, repoPath } from "./contract";

const events = readJson<Event[]>("data/scenarios/attack-chain-01/events.json");
const key = readJson<AnswerKey>("data/scenarios/attack-chain-01/answer_key.json");
const NO_DELAY = { delayMs: 0 };

describe("the dev mock's cached chain", () => {
  const cached = mockCachedChain("attack-chain-01");

  it("parses as a Chain and validates with zero unverified edges", () => {
    expect(ChainSchema.safeParse(cached).success).toBe(true);
    const validated = validateChain(ChainSchema.parse(cached), events);
    expect(validated.warnings).toEqual([]);
    expect(validated.edges.filter((e) => !e.verified)).toEqual([]);
    expect(validated.edges.every((e) => e.bannedWords.length === 0)).toBe(true);
  });

  it("cites the answer key and names all seven assets", () => {
    const attackIds = new Set(key.attack_event_ids);
    for (const edge of cached.edges) {
      expect(edge.citations.some((id) => attackIds.has(id))).toBe(true);
    }
    const nodeIds = new Set(cached.nodes.map((n) => n.id));
    for (const asset of key.assets_involved ?? []) expect(nodeIds.has(asset)).toBe(true);
    expect(cached.nodes).toHaveLength(7);
    expect(cached.edges).toHaveLength(7);
  });
});

describe("the dev mock's analyze", () => {
  it("returns the cached chain unchanged when nothing is removed", async () => {
    const chain = await mockAnalyze("attack-chain-01", [], NO_DELAY);
    expect(chain.edges).toEqual(mockCachedChain("attack-chain-01").edges);
    expect(chain.removed_event_ids).toEqual([]);
  });

  it("drops the file server and everything hanging off it when it is isolated", async () => {
    const removed = events
      .filter((e) => e.source === "FILESRV-01" || e.target === "FILESRV-01")
      .map((e) => e.id);
    const chain = await mockAnalyze("attack-chain-01", removed, NO_DELAY);
    expect(chain.nodes.map((n) => n.id)).not.toContain("FILESRV-01");
    for (const edge of chain.edges) {
      expect(edge.source).not.toBe("FILESRV-01");
      expect(edge.target).not.toBe("FILESRV-01");
    }
    expect(chain.edges.length).toBeGreaterThan(0);
    expect(chain.removed_event_ids).toEqual(removed);
  });

  it("fails once when an error is armed, then succeeds", async () => {
    setMockError("model_error");
    const error = await mockAnalyze("attack-chain-01", [], NO_DELAY).catch((e) => e);
    expect(error.code).toBe("model_error");
    expect(error.detail.length).toBeGreaterThan(0);
    const chain = await mockAnalyze("attack-chain-01", [], NO_DELAY);
    expect(chain.edges).toHaveLength(7);
  });

  it("reports live so the intervention buttons stay enabled in dev", async () => {
    expect(await mockHealth()).toEqual({ ok: true, live: true, model: "claude-sonnet-5" });
  });
});

describe("the dev mock never ships", () => {
  const dist = repoPath("dist");

  function filesUnder(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? filesUnder(full) : [full];
    });
  }

  it.skipIf(!existsSync(dist))("leaves no trace of the mock in dist/", () => {
    const offenders = filesUnder(dist).filter((file) => {
      const text = readFileSync(file, "utf8");
      return text.includes("mock/analysis") || text.includes(MOCK_MARKER);
    });
    expect(offenders).toEqual([]);
  });
});
