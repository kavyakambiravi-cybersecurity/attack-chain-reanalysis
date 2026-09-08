import { describe, expect, it } from "vitest";
import {
  eventsForEdge,
  eventsForNode,
  interventionForEdge,
  interventionForNode,
  unionRemoved,
} from "../src/lib/intervene";
import { badCitationChain, goodChain } from "./fixtures/chains";
import { mini } from "./fixtures/mini";

describe("eventsForNode", () => {
  it("removes every event that touches an isolated host", () => {
    expect(eventsForNode("WKSTN-042", mini)).toEqual(["E-0001", "E-0002", "E-0003", "E-0004"]);
  });

  it("removes only the events a user account took part in", () => {
    expect(eventsForNode("jsmith", mini)).toEqual(["E-0002"]);
  });

  it("removes nothing for an asset that is in no event", () => {
    expect(eventsForNode("zz", mini)).toEqual([]);
  });

  it("does not mutate the events it was given", () => {
    const before = JSON.parse(JSON.stringify(mini));
    eventsForNode("WKSTN-042", mini);
    expect(mini).toEqual(before);
  });
});

describe("eventsForEdge", () => {
  it("removes exactly the events the step cites", () => {
    expect(eventsForEdge(goodChain.edges[3])).toEqual(["E-0004"]);
  });

  it("returns an invalid citation too, so the server can say it is unknown", () => {
    expect(eventsForEdge(badCitationChain.edges[3])).toEqual(["E-9999"]);
  });
});

describe("unionRemoved", () => {
  it("has set semantics in stable order", () => {
    expect(unionRemoved(["E-0001", "E-0002"], ["E-0002", "E-0003"])).toEqual([
      "E-0001",
      "E-0002",
      "E-0003",
    ]);
  });

  it("does not mutate either input", () => {
    const a = ["E-0001", "E-0002"];
    const b = ["E-0002", "E-0003"];
    unionRemoved(a, b);
    expect(a).toEqual(["E-0001", "E-0002"]);
    expect(b).toEqual(["E-0002", "E-0003"]);
  });
});

describe("interventions are one mechanism", () => {
  it("describes isolating an asset as a set of removed event ids", () => {
    expect(interventionForNode("jsmith", mini)).toEqual({
      kind: "isolate",
      subject: "jsmith",
      removed_event_ids: ["E-0002"],
    });
  });

  it("describes blocking a step as a set of removed event ids", () => {
    expect(interventionForEdge(goodChain.edges[3])).toEqual({
      kind: "block",
      subject: "WKSTN-042->FILESRV-01",
      removed_event_ids: ["E-0004"],
    });
  });
});
