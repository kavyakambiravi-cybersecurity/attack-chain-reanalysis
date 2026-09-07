// Hand-written chains over the mini fixture. Each is an AnalyzeResponse.
import type { Chain, ChainEdge } from "../../src/types";

const base = {
  scenario_id: "mini",
  removed_event_ids: [] as string[],
  prompt_version: "test-1",
  summary: "An outside computer took over a workstation and files left the file server.",
};

const nodes = [
  { id: "203.0.113.47", label: "outside computer" },
  { id: "jsmith", label: "finance user" },
  { id: "WKSTN-042", label: "finance workstation" },
  { id: "FILESRV-01", label: "finance file server" },
  { id: "198.51.100.22", label: "outside storage" },
];

const edges: ChainEdge[] = [
  {
    source: "203.0.113.47",
    target: "WKSTN-042",
    action: "logged in from outside",
    description: "Someone outside the company logged in to the workstation as jsmith.",
    citations: ["E-0001"],
  },
  {
    source: "jsmith",
    target: "WKSTN-042",
    action: "ran a hidden command",
    description: "The user's mail program started a hidden command on the workstation.",
    citations: ["E-0002"],
  },
  {
    source: "WKSTN-042",
    target: "203.0.113.47",
    action: "kept calling home",
    description: "The workstation sent small regular messages to the outside computer.",
    citations: ["E-0003"],
  },
  {
    source: "WKSTN-042",
    target: "FILESRV-01",
    action: "signed in as an administrator",
    description: "The workstation signed in to the file server using an administrator account.",
    citations: ["E-0004"],
  },
  {
    source: "FILESRV-01",
    target: "198.51.100.22",
    action: "sent files outside",
    description: "The file server sent 480MB of data to an outside address.",
    citations: ["E-0005"],
  },
];

function chainWith(replacement: Partial<ChainEdge>): Chain {
  const next = edges.map((edge, index) => (index === 3 ? { ...edge, ...replacement } : { ...edge }));
  return { ...base, nodes: nodes.map((n) => ({ ...n })), edges: next };
}

/** Every citation exists and names both of its edge's endpoints. */
export const goodChain: Chain = chainWith({});

/** The WKSTN-042 -> FILESRV-01 edge cites an id that is not in the events. */
export const badCitationChain: Chain = chainWith({ citations: ["E-9999"] });

/** It cites an event that exists but names neither endpoint. */
export const wrongEndpointChain: Chain = chainWith({ citations: ["E-0006"] });

/** It cites a user-sourced event that involves only one of the two endpoints. */
export const userCollapsedChain: Chain = chainWith({ citations: ["E-0002"] });

/** It cites nothing at all. */
export const emptyCitationChain: Chain = chainWith({ citations: [] });

/** An edge that drops the parenthesised label from an external asset name. */
export const labelDroppedChain: Chain = {
  ...base,
  nodes: [
    { id: "WKSTN-017", label: "workstation" },
    { id: "151.101.1.140", label: "content network" },
  ],
  edges: [
    {
      source: "WKSTN-017",
      target: "151.101.1.140",
      action: "connected to a content network",
      description: "The workstation opened a connection to a content delivery network.",
      citations: ["E-0007"],
    },
  ],
};
