import { describe, expect, it } from "vitest";
import { NODE_HEIGHT, NODE_WIDTH, layoutChain, smoothPath } from "../src/graph/layout";
import { ChainSchema } from "../src/lib/schema";
import { uniqueEdgeIds, validateChain } from "../src/lib/validate";
import type { Chain, Event } from "../src/types";
import { readJson } from "./contract";
import { goodChain } from "./fixtures/chains";
import { mini } from "./fixtures/mini";

const validated = validateChain(goodChain, mini);

type Box = { x: number; y: number; width: number; height: number };

/** Axis-aligned overlap test on centre-based boxes. */
function overlaps(a: Box, b: Box): boolean {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2
  );
}

describe("layoutChain", () => {
  it("places every node and edge exactly once", () => {
    const { nodes, edges } = layoutChain(validated, mini);
    expect(nodes.map((n) => n.id).sort()).toEqual(
      goodChain.nodes.map((n) => n.id).sort(),
    );
    expect(edges.map((e) => e.id)).toEqual([
      "203.0.113.47->WKSTN-042",
      "jsmith->WKSTN-042",
      "WKSTN-042->203.0.113.47",
      "WKSTN-042->FILESRV-01",
      "FILESRV-01->198.51.100.22",
    ]);
  });

  it("reads left to right in time order", () => {
    const { nodes } = layoutChain(validated, mini);
    const x = (id: string) => nodes.find((n) => n.id === id)!.position.x;
    expect(x("203.0.113.47")).toBeLessThan(x("WKSTN-042"));
    expect(x("WKSTN-042")).toBeLessThan(x("FILESRV-01"));
    expect(x("FILESRV-01")).toBeLessThan(x("198.51.100.22"));
  });

  it("is deterministic", () => {
    expect(layoutChain(validated, mini)).toEqual(layoutChain(validated, mini));
  });

  it("carries the asset kind onto every node", () => {
    const { nodes } = layoutChain(validated, mini);
    const kind = (id: string) => nodes.find((n) => n.id === id)!.data.kind;
    expect(kind("203.0.113.47")).toBe("external");
    expect(kind("WKSTN-042")).toBe("host");
    expect(kind("jsmith")).toBe("user");
  });

  it("routes every edge from its source's border to its target's", () => {
    const { nodes, edges } = layoutChain(validated, mini);
    const box = (id: string): Box => {
      const node = nodes.find((n) => n.id === id)!;
      return {
        x: node.position.x + NODE_WIDTH / 2,
        y: node.position.y + NODE_HEIGHT / 2,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      };
    };
    const onBorder = (point: { x: number; y: number }, b: Box) =>
      (Math.abs(Math.abs(point.x - b.x) - b.width / 2) < 0.5 && Math.abs(point.y - b.y) <= b.height / 2 + 0.5) ||
      (Math.abs(Math.abs(point.y - b.y) - b.height / 2) < 0.5 && Math.abs(point.x - b.x) <= b.width / 2 + 0.5);
    for (const edge of edges) {
      const { points } = edge.data!;
      expect(points.length).toBeGreaterThanOrEqual(3);
      expect(onBorder(points[0], box(edge.source))).toBe(true);
      expect(onBorder(points[points.length - 1], box(edge.target))).toBe(true);
    }
  });

  it("puts a forward edge's label between its two nodes, with room on both sides", () => {
    const { nodes, edges } = layoutChain(validated, mini);
    const centreX = (id: string) => nodes.find((n) => n.id === id)!.position.x + NODE_WIDTH / 2;
    for (const edge of edges) {
      const { label } = edge.data!;
      const left = Math.min(centreX(edge.source), centreX(edge.target));
      const right = Math.max(centreX(edge.source), centreX(edge.target));
      expect(label.x - label.width / 2).toBeGreaterThan(left + NODE_WIDTH / 2);
      expect(label.x + label.width / 2).toBeLessThan(right - NODE_WIDTH / 2);
    }
  });
});

describe("the committed attack chain, laid out", () => {
  const events = readJson<Event[]>("data/scenarios/attack-chain-01/events.json");
  const chain: Chain = ChainSchema.parse(readJson("data/scenarios/attack-chain-01/analysis.json"));
  const { nodes, edges } = layoutChain(validateChain(chain, events), events);

  it("draws both steps between the same two assets, each with its own id", () => {
    const ids = edges.map((edge) => edge.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("jsmith->WKSTN-042");
    expect(ids).toContain("jsmith->WKSTN-042#2");
    expect(ids).toContain("administrator->FILESRV-01#2");
  });

  it("gives two steps between the same assets different label positions", () => {
    const first = edges.find((edge) => edge.id === "jsmith->WKSTN-042")!.data!.label;
    const second = edges.find((edge) => edge.id === "jsmith->WKSTN-042#2")!.data!.label;
    expect(Math.abs(first.y - second.y)).toBeGreaterThanOrEqual((first.height + second.height) / 2);
  });

  it("never puts a label over a node or over another label", () => {
    const nodeBoxes: Box[] = nodes.map((node) => ({
      x: node.position.x + NODE_WIDTH / 2,
      y: node.position.y + NODE_HEIGHT / 2,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }));
    const labels = edges.map((edge) => ({ id: edge.id, box: edge.data!.label }));
    for (const { id, box } of labels) {
      for (const node of nodeBoxes) {
        expect(overlaps(box, node), `${id} overlaps a node`).toBe(false);
      }
      for (const other of labels) {
        if (other.id === id) continue;
        expect(overlaps(box, other.box), `${id} overlaps ${other.id}`).toBe(false);
      }
    }
  });
});

describe("uniqueEdgeIds", () => {
  it("keeps the edgeKey when it is unique", () => {
    expect(uniqueEdgeIds(goodChain.edges)).toEqual(goodChain.edges.map((e) => `${e.source}->${e.target}`));
  });

  it("numbers a repeated pair from the second occurrence", () => {
    const pair = { source: "a", target: "b" };
    expect(uniqueEdgeIds([pair, { source: "b", target: "a" }, pair, pair])).toEqual([
      "a->b",
      "b->a",
      "a->b#2",
      "a->b#3",
    ]);
  });
});

describe("smoothPath", () => {
  it("is empty for no points and a line for two", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M0,0 L10,5");
  });

  it("passes through every point in order", () => {
    const points = [{ x: 0, y: 0 }, { x: 50, y: 20 }, { x: 100, y: 0 }];
    const d = smoothPath(points);
    expect(d.startsWith("M0,0")).toBe(true);
    expect(d).toContain(" 50,20");
    expect(d.endsWith(" 100,0")).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
  });

  it("keeps a straight route straight", () => {
    const d = smoothPath([{ x: 0, y: 10 }, { x: 50, y: 10 }, { x: 100, y: 10 }]);
    for (const y of d.match(/,(-?[\d.]+)/g)!) expect(y).toBe(",10");
  });
});
