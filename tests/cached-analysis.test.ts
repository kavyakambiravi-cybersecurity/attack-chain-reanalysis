// The committed first analysis is the only chain a reviewer sees before they
// touch anything, so it has to be trustworthy. Backend task T012 generates it;
// until then this file skips with a visible message rather than passing.
import { describe, expect, it } from "vitest";
import { BANNED_WORDS, validateChain } from "../src/lib/validate";
import { ChainSchema } from "../src/lib/schema";
import type { AnswerKey, Chain, Event } from "../src/types";
import { readJson, repoFileExists } from "./contract";

const ATTACK = "data/scenarios/attack-chain-01/analysis.json";
const BENIGN = "data/scenarios/benign-lookalike-02/analysis.json";

const bannedIn = (text: string) =>
  BANNED_WORDS.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(text));

const SKIP_MESSAGE = "analysis.json not generated yet (backend task T012)";

if (!repoFileExists(ATTACK)) {
  console.warn(`[cached-analysis] skipped: ${SKIP_MESSAGE}`);
  describe("cached analysis for attack-chain-01", () => {
    it.skip(SKIP_MESSAGE, () => undefined);
  });
} else {
  describe("cached analysis for attack-chain-01", () => {
    const raw = readJson(ATTACK);
    const events = readJson<Event[]>("data/scenarios/attack-chain-01/events.json");
    const key = readJson<AnswerKey>("data/scenarios/attack-chain-01/answer_key.json");
    const chain: Chain = ChainSchema.parse(raw);
    const validated = validateChain(chain, events);
    const cited = new Set(chain.edges.flatMap((edge) => edge.citations));
    const attackIds = new Set(key.attack_event_ids);

    it("is an AnalyzeResponse for the full scenario", () => {
      expect(chain.scenario_id).toBe("attack-chain-01");
      expect(chain.removed_event_ids).toEqual([]);
      expect(chain.prompt_version.length).toBeGreaterThan(0);
    });

    it("validates with no unverified edges and no warnings", () => {
      expect(validated.warnings).toEqual([]);
      expect(
        validated.edges.filter((edge) => !edge.verified).map((edge) => `${edge.source}->${edge.target}`),
      ).toEqual([]);
    });

    it("cites at least 10 of the 16 attack events", () => {
      const hits = key.attack_event_ids.filter((id) => cited.has(id));
      expect(hits.length).toBeGreaterThanOrEqual(10);
    });

    it("reaches the domain controller", () => {
      expect(chain.edges.some((e) => e.source === "DC-01" || e.target === "DC-01")).toBe(true);
    });

    it("reaches the exfiltration destination", () => {
      const ip = "198.51.100.22";
      expect(chain.edges.some((e) => e.source === ip || e.target === ip)).toBe(true);
    });

    it("draws no edge built only from ordinary activity", () => {
      for (const edge of chain.edges) {
        expect(edge.citations.some((id) => attackIds.has(id))).toBe(true);
      }
    });

    it("never says secure, safe, or contained", () => {
      for (const edge of chain.edges) {
        expect(bannedIn(`${edge.action} ${edge.description}`)).toEqual([]);
      }
      expect(bannedIn(chain.summary)).toEqual([]);
    });
  });
}

if (!repoFileExists(BENIGN)) {
  describe("cached analysis for benign-lookalike-02", () => {
    it.skip("analysis.json not generated yet (optional backend task T028)", () => undefined);
  });
} else {
  describe("cached analysis for benign-lookalike-02", () => {
    const chain: Chain = ChainSchema.parse(readJson(BENIGN));
    const events = readJson<Event[]>("data/scenarios/benign-lookalike-02/events.json");
    const validated = validateChain(chain, events);

    it("draws at most one verified edge", () => {
      expect(validated.edges.filter((edge) => edge.verified).length).toBeLessThanOrEqual(1);
    });

    it("never says secure, safe, or contained", () => {
      for (const edge of chain.edges) {
        expect(bannedIn(`${edge.action} ${edge.description}`)).toEqual([]);
      }
      expect(bannedIn(chain.summary)).toEqual([]);
    });
  });
}
