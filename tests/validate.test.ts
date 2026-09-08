import { describe, expect, it } from "vitest";
import { describeDataOut, validateChain } from "../src/lib/validate";
import type { Chain } from "../src/types";
import {
  badCitationChain,
  emptyCitationChain,
  goodChain,
  labelDroppedChain,
  notableChain,
  userCollapsedChain,
  wrongEndpointChain,
} from "./fixtures/chains";
import { mini } from "./fixtures/mini";

const LATERAL = "WKSTN-042->FILESRV-01";

function edgeByKey(chain: ReturnType<typeof validateChain>, key: string) {
  const found = chain.edges.find((e) => `${e.source}->${e.target}` === key);
  if (!found) throw new Error(`no edge ${key} in the validated chain`);
  return found;
}

describe("validateChain", () => {
  it("verifies every edge when all citations are valid", () => {
    const validated = validateChain(goodChain, mini);
    expect(validated.edges).toHaveLength(5);
    for (const edge of validated.edges) {
      expect(edge.verified).toBe(true);
      expect(edge.checks.length).toBeGreaterThan(0);
      for (const check of edge.checks) {
        expect(check.exists).toBe(true);
        expect(check.involvesBothEndpoints).toBe(true);
      }
    }
    expect(validated.warnings).toEqual([]);
  });

  it("fails an edge that cites an event id which does not exist", () => {
    const edge = edgeByKey(validateChain(badCitationChain, mini), LATERAL);
    expect(edge.verified).toBe(false);
    const check = edge.checks.find((c) => c.id === "E-9999");
    expect(check).toEqual({ id: "E-9999", exists: false, involvesBothEndpoints: false });
  });

  it("fails an edge whose cited event exists but names other assets", () => {
    const edge = edgeByKey(validateChain(wrongEndpointChain, mini), LATERAL);
    expect(edge.verified).toBe(false);
    expect(edge.checks.find((c) => c.id === "E-0006")).toEqual({
      id: "E-0006",
      exists: true,
      involvesBothEndpoints: false,
    });
  });

  it("fails an edge that collapses a user into the host they used", () => {
    const edge = edgeByKey(validateChain(userCollapsedChain, mini), LATERAL);
    expect(edge.verified).toBe(false);
    expect(edge.checks[0]).toEqual({
      id: "E-0002",
      exists: true,
      involvesBothEndpoints: false,
    });
  });

  it("fails an edge with no citations at all", () => {
    const edge = edgeByKey(validateChain(emptyCitationChain, mini), LATERAL);
    expect(edge.verified).toBe(false);
    expect(edge.checks).toEqual([]);
  });

  it("matches asset names exactly, with no normalisation of dropped labels", () => {
    const validated = validateChain(labelDroppedChain, mini);
    const edge = edgeByKey(validated, "WKSTN-017->151.101.1.140");
    expect(edge.verified).toBe(false);
    expect(edge.checks[0]).toEqual({
      id: "E-0007",
      exists: true,
      involvesBothEndpoints: false,
    });
  });

  it("does not care about endpoint order: involvement is what is checked", () => {
    const reversed: Chain = {
      ...goodChain,
      edges: [{ ...goodChain.edges[0], source: "WKSTN-042", target: "203.0.113.47" }],
    };
    const edge = validateChain(reversed, mini).edges[0];
    expect(edge.verified).toBe(true);
    expect(edge.checks[0].involvesBothEndpoints).toBe(true);
  });

  it("drops an edge whose endpoint appears in no event, with a warning", () => {
    const chain: Chain = {
      ...goodChain,
      edges: [
        ...goodChain.edges,
        {
          source: "GHOST-99",
          target: "WKSTN-042",
          action: "appeared from nowhere",
          description: "An asset that is in no event.",
          citations: ["E-0001"],
        },
      ],
    };
    const validated = validateChain(chain, mini);
    expect(validated.edges).toHaveLength(5);
    expect(validated.warnings).toHaveLength(1);
    expect(validated.warnings[0]).toContain("GHOST-99");
  });

  it("drops a node whose id appears in no event, with a warning", () => {
    const chain: Chain = {
      ...goodChain,
      nodes: [...goodChain.nodes, { id: "GHOST-99", label: "not in any event" }],
    };
    const validated = validateChain(chain, mini);
    expect(validated.nodes.map((n) => n.id)).toEqual(goodChain.nodes.map((n) => n.id));
    expect(validated.warnings).toHaveLength(1);
    expect(validated.warnings[0]).toContain("GHOST-99");
  });

  it("flags the banned words wherever they appear in an edge", () => {
    const chain: Chain = {
      ...goodChain,
      edges: [
        { ...goodChain.edges[0], description: "Contained the threat at the workstation." },
        goodChain.edges[1],
      ],
    };
    const validated = validateChain(chain, mini);
    expect(validated.edges[0].bannedWords).toEqual(["contained"]);
    expect(validated.edges[1].bannedWords).toEqual([]);
  });

  it("carries the wire fields and the summary through unchanged", () => {
    const validated = validateChain(goodChain, mini);
    expect(validated.scenario_id).toBe(goodChain.scenario_id);
    expect(validated.removed_event_ids).toEqual(goodChain.removed_event_ids);
    expect(validated.prompt_version).toBe(goodChain.prompt_version);
    expect(validated.summary).toBe(goodChain.summary);
  });

  it("is pure: same output twice, and the input is untouched", () => {
    const before = JSON.parse(JSON.stringify(goodChain));
    const first = validateChain(goodChain, mini);
    const second = validateChain(goodChain, mini);
    expect(first).toEqual(second);
    expect(goodChain).toEqual(before);
  });
});

describe("explainCheck", () => {
  it("names the event and the endpoint it does not match", async () => {
    const { explainCheck } = await import("../src/lib/validate");
    const validated = validateChain(wrongEndpointChain, mini);
    const edge = edgeByKey(validated, LATERAL);
    const reason = explainCheck(edge, edge.checks[0], mini);
    expect(reason).toContain("E-0006");
    expect(reason).toContain("apatel");
    expect(reason).toContain("WKSTN-042");
  });

  it("says so when the event does not exist", async () => {
    const { explainCheck } = await import("../src/lib/validate");
    const validated = validateChain(badCitationChain, mini);
    const edge = edgeByKey(validated, LATERAL);
    expect(explainCheck(edge, edge.checks[0], mini)).toContain("is not in this scenario");
  });

  it("returns null for a passing check", async () => {
    const { explainCheck } = await import("../src/lib/validate");
    const validated = validateChain(goodChain, mini);
    const edge = validated.edges[0];
    expect(explainCheck(edge, edge.checks[0], mini)).toBeNull();
  });
});

describe("roles and kinds", () => {
  it("marks a large transfer to an outside address as data out", () => {
    const edges = validateChain(goodChain, mini).edges;
    const kind = (source: string, target: string) =>
      edges.find((e) => e.source === source && e.target === target)!.kind;
    expect(kind("FILESRV-01", "198.51.100.22")).toBe("data_out");
    expect(kind("WKSTN-042", "203.0.113.47")).toBe("action");
    expect(kind("WKSTN-042", "FILESRV-01")).toBe("action");
  });

  it("describes the data movement from the cited event", () => {
    const edge = goodChain.edges[4];
    expect(describeDataOut(edge, mini)).toBe("Event E-0005 records 480MB sent to 198.51.100.22.");
    expect(describeDataOut(goodChain.edges[2], mini)).toBeNull();
  });

  it("keeps chain steps and noted steps apart, checked the same way", () => {
    const validated = validateChain(notableChain, mini);
    expect(validated.warnings).toEqual([]);
    const noted = validated.edges.filter((e) => e.role === "notable");
    expect(noted).toHaveLength(1);
    expect(noted[0].source).toBe("apatel");
    expect(noted[0].verified).toBe(true);
    expect(validated.edges.filter((e) => e.role === "chain")).toHaveLength(5);
  });

  it("flags a noted step with a bad citation as unverified, like any edge", () => {
    const chain = {
      ...notableChain,
      notable: [{ ...notableChain.notable[0], citations: ["E-9999"] }],
    };
    const noted = validateChain(chain, mini).edges.find((e) => e.role === "notable")!;
    expect(noted.verified).toBe(false);
    expect(noted.checks[0].exists).toBe(false);
  });

  it("tolerates an old chain with no notable list", () => {
    const { notable: _dropped, ...legacy } = goodChain;
    const validated = validateChain(legacy as typeof goodChain, mini);
    expect(validated.edges).toHaveLength(5);
  });
});
