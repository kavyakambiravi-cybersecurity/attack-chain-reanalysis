import { describe, expect, it } from "vitest";
import { diffChains } from "../src/lib/diff";
import { validateChain } from "../src/lib/validate";
import type { Chain, ValidatedChain } from "../src/types";
import { goodChain } from "./fixtures/chains";
import { mini } from "./fixtures/mini";

const prev = validateChain(goodChain, mini);

function validated(mutate: (chain: Chain) => Chain): ValidatedChain {
  return validateChain(mutate(JSON.parse(JSON.stringify(goodChain)) as Chain), mini);
}

const key = (edge: { source: string; target: string }) => `${edge.source}->${edge.target}`;
const statusOf = (chain: ReturnType<typeof diffChains>, k: string) =>
  chain.edges.find((edge) => key(edge) === k)?.status;

describe("diffChains", () => {
  it("marks everything survived when nothing changed", () => {
    const diffed = diffChains(prev, prev);
    expect(diffed.edges.every((edge) => edge.status === "survived")).toBe(true);
    expect(diffed.counts).toEqual({ vanished: 0, survived: 5, appeared: 0 });
  });

  it("keeps a removed edge with its previous evidence, marked vanished", () => {
    const next = validated((chain) => ({
      ...chain,
      edges: chain.edges.filter((edge) => key(edge) !== "WKSTN-042->FILESRV-01"),
    }));
    const diffed = diffChains(prev, next);
    const gone = diffed.edges.find((edge) => key(edge) === "WKSTN-042->FILESRV-01");
    expect(gone?.status).toBe("vanished");
    expect(gone?.citations).toEqual(["E-0004"]);
    expect(diffed.counts.vanished).toBe(1);
  });

  it("marks a new edge appeared", () => {
    const next = validated((chain) => ({
      ...chain,
      edges: [
        ...chain.edges,
        {
          source: "apatel",
          target: "WKSTN-017",
          action: "signed in as usual",
          description: "A different person signed in to a different workstation.",
          citations: ["E-0006"],
        },
      ],
    }));
    const diffed = diffChains(prev, next);
    expect(statusOf(diffed, "apatel->WKSTN-017")).toBe("appeared");
    expect(diffed.counts).toEqual({ vanished: 0, survived: 5, appeared: 1 });
  });

  it("treats identity as the endpoints, not the wording", () => {
    const next = validated((chain) => ({
      ...chain,
      edges: chain.edges.map((edge) =>
        key(edge) === "WKSTN-042->FILESRV-01" ? { ...edge, action: "totally different words" } : edge,
      ),
    }));
    const diffed = diffChains(prev, next);
    expect(statusOf(diffed, "WKSTN-042->FILESRV-01")).toBe("survived");
    expect(diffed.counts.survived).toBe(5);
  });

  it("treats a reversed edge as one vanished and one appeared", () => {
    const next = validated((chain) => ({
      ...chain,
      edges: chain.edges.map((edge) =>
        key(edge) === "WKSTN-042->FILESRV-01"
          ? { ...edge, source: "FILESRV-01", target: "WKSTN-042" }
          : edge,
      ),
    }));
    const diffed = diffChains(prev, next);
    expect(statusOf(diffed, "WKSTN-042->FILESRV-01")).toBe("vanished");
    expect(statusOf(diffed, "FILESRV-01->WKSTN-042")).toBe("appeared");
    expect(diffed.counts).toEqual({ vanished: 1, survived: 4, appeared: 1 });
  });

  it("marks everything vanished when the next chain is empty", () => {
    const next = validated((chain) => ({ ...chain, nodes: [], edges: [] }));
    const diffed = diffChains(prev, next);
    expect(diffed.edges).toHaveLength(prev.edges.length);
    expect(diffed.edges.every((edge) => edge.status === "vanished")).toBe(true);
    expect(diffed.counts).toEqual({ vanished: 5, survived: 0, appeared: 0 });
  });

  it("counts edges only", () => {
    const next = validated((chain) => ({ ...chain, nodes: [] }));
    const diffed = diffChains(prev, next);
    const total = diffed.counts.vanished + diffed.counts.survived + diffed.counts.appeared;
    expect(total).toBe(diffed.edges.length);
  });

  it("gives a surviving node the current label", () => {
    const next = validated((chain) => ({
      ...chain,
      nodes: chain.nodes.map((node) =>
        node.id === "WKSTN-042" ? { ...node, label: "a newer description" } : node,
      ),
    }));
    const node = diffChains(prev, next).nodes.find((n) => n.id === "WKSTN-042");
    expect(node).toEqual({ id: "WKSTN-042", label: "a newer description", status: "survived" });
  });

  it("keeps a vanished node with its previous label", () => {
    const next = validated((chain) => ({
      ...chain,
      nodes: chain.nodes.filter((node) => node.id !== "FILESRV-01"),
    }));
    const node = diffChains(prev, next).nodes.find((n) => n.id === "FILESRV-01");
    expect(node).toEqual({ id: "FILESRV-01", label: "finance file server", status: "vanished" });
  });

  it("marks a node that was not there before as appeared", () => {
    const next = validated((chain) => ({
      ...chain,
      nodes: [...chain.nodes, { id: "WKSTN-017", label: "another workstation" }],
    }));
    const node = diffChains(prev, next).nodes.find((n) => n.id === "WKSTN-017");
    expect(node?.status).toBe("appeared");
  });

  it("marks the first render entirely survived", () => {
    const diffed = diffChains(null, prev);
    expect(diffed.nodes.every((node) => node.status === "survived")).toBe(true);
    expect(diffed.edges.every((edge) => edge.status === "survived")).toBe(true);
    expect(diffed.counts).toEqual({ vanished: 0, survived: prev.edges.length, appeared: 0 });
    expect(diffed.summary).toBe(prev.summary);
  });

  it("keeps an isolated asset and its steps on screen, faded", () => {
    const next = validated((chain) => ({
      ...chain,
      nodes: chain.nodes.filter((node) => node.id !== "FILESRV-01"),
      edges: chain.edges.filter(
        (edge) => edge.source !== "FILESRV-01" && edge.target !== "FILESRV-01",
      ),
    }));
    const diffed = diffChains(prev, next);
    expect(diffed.nodes.find((n) => n.id === "FILESRV-01")?.status).toBe("vanished");
    expect(statusOf(diffed, "WKSTN-042->FILESRV-01")).toBe("vanished");
    expect(statusOf(diffed, "FILESRV-01->198.51.100.22")).toBe("vanished");
    expect(statusOf(diffed, "203.0.113.47->WKSTN-042")).toBe("survived");
    expect(diffed.counts).toEqual({ vanished: 2, survived: 3, appeared: 0 });
  });

  it("does not mutate either chain", () => {
    const before = JSON.parse(JSON.stringify(prev));
    diffChains(prev, prev);
    expect(prev).toEqual(before);
  });
});
