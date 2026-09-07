// A six-event scenario in the generator's schema, plus E-0007 for the
// dropped-label test. Small enough to reason about by hand.
import type { Event } from "../../src/types";

export const mini: Event[] = [
  {
    id: "E-0001",
    timestamp: "2026-09-05T09:14:00Z",
    source: "203.0.113.47",
    target: "WKSTN-042",
    type: "authentication",
    detail: "External RDP logon for jsmith",
  },
  {
    id: "E-0002",
    timestamp: "2026-09-05T09:16:00Z",
    source: "jsmith",
    target: "WKSTN-042",
    type: "process_start",
    detail: "powershell.exe -enc spawned by OUTLOOK.EXE",
  },
  {
    id: "E-0003",
    timestamp: "2026-09-05T09:18:00Z",
    source: "WKSTN-042",
    target: "203.0.113.47",
    type: "network_connection",
    detail: "Outbound HTTPS beacon",
  },
  {
    id: "E-0004",
    timestamp: "2026-09-05T09:31:00Z",
    source: "WKSTN-042",
    target: "FILESRV-01",
    type: "authentication",
    detail: "Network logon as administrator",
  },
  {
    id: "E-0005",
    timestamp: "2026-09-05T09:44:00Z",
    source: "FILESRV-01",
    target: "198.51.100.22",
    type: "network_connection",
    detail: "Outbound TLS, 480MB",
  },
  {
    id: "E-0006",
    timestamp: "2026-09-05T09:45:00Z",
    source: "apatel",
    target: "WKSTN-017",
    type: "authentication",
    detail: "Interactive logon succeeded",
  },
  {
    id: "E-0007",
    timestamp: "2026-09-05T09:46:00Z",
    source: "WKSTN-017",
    target: "151.101.1.140 (fastly-cdn)",
    type: "network_connection",
    detail: "TLS session established to 151.101.1.140 (fastly-cdn)",
  },
];
