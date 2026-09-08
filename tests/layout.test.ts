import { describe, expect, it } from "vitest";
import { layoutChain } from "../src/graph/layout";
import { validateChain } from "../src/lib/validate";
import { goodChain } from "./fixtures/chains";
import { mini } from "./fixtures/mini";

const validated = validateChain(goodChain, mini);

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
});
