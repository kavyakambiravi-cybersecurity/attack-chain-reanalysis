import { describe, expect, it } from "vitest";
import { AnswerKeySchema, EventsSchema } from "../src/lib/schema";
import type { AnswerKey, Event } from "../src/types";
import { readJson } from "./contract";

const ATTACKER_IPS = ["203.0.113.47", "198.51.100.22"];
const SCENARIOS = ["attack-chain-01", "benign-lookalike-02"] as const;

function load(id: string): { events: Event[]; key: AnswerKey } {
  return {
    events: EventsSchema.parse(readJson(`data/scenarios/${id}/events.json`)),
    key: AnswerKeySchema.parse(readJson(`data/scenarios/${id}/answer_key.json`)),
  };
}

function minutesBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 60000;
}

describe.each(SCENARIOS)("scenario %s", (id) => {
  const { events, key } = load(id);

  it("has exactly the event count the answer key claims", () => {
    expect(events).toHaveLength(key.total_events);
    expect(events.length).toBeGreaterThanOrEqual(450);
    expect(events.length).toBeLessThanOrEqual(550);
  });

  it("has unique sequential ids with no gaps", () => {
    const ids = events.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((eventId, index) => {
      expect(eventId).toMatch(/^E-\d{4}$/);
      expect(eventId).toBe(`E-${String(index + 1).padStart(4, "0")}`);
    });
  });

  it("is sorted by timestamp", () => {
    for (let i = 1; i < events.length; i += 1) {
      expect(Date.parse(events[i].timestamp)).toBeGreaterThanOrEqual(
        Date.parse(events[i - 1].timestamp),
      );
    }
  });

  it("has exactly the six event fields, all non-empty", () => {
    const fields = ["id", "timestamp", "source", "target", "type", "detail"];
    const raw = readJson<Record<string, unknown>[]>(`data/scenarios/${id}/events.json`);
    for (const event of raw) {
      expect(Object.keys(event).sort()).toEqual([...fields].sort());
      for (const field of fields) {
        expect(String(event[field]).length).toBeGreaterThan(0);
      }
    }
  });

  it("has no self-loops", () => {
    for (const event of events) expect(event.source).not.toBe(event.target);
  });

  it("only names event ids that exist", () => {
    const ids = new Set(events.map((e) => e.id));
    for (const seeded of [...key.attack_event_ids, ...(key.lookalike_event_ids ?? [])]) {
      expect(ids.has(seeded)).toBe(true);
    }
  });

  it("has seeded events that span two distinct assets", () => {
    const seeded = new Set([...key.attack_event_ids, ...(key.lookalike_event_ids ?? [])]);
    for (const event of events.filter((e) => seeded.has(e.id))) {
      expect(event.source).not.toBe(event.target);
    }
  });
});

describe("scenario attack-chain-01 only", () => {
  const { events, key } = load("attack-chain-01");
  const attackIds = new Set(key.attack_event_ids);
  const attackEvents = events.filter((e) => attackIds.has(e.id));

  it("plants between 2 and 6 percent of events", () => {
    const ratio = key.attack_event_ids.length / events.length;
    expect(ratio).toBeGreaterThanOrEqual(0.02);
    expect(ratio).toBeLessThanOrEqual(0.06);
  });

  it("spans at least 20 minutes", () => {
    const first = attackEvents[0].timestamp;
    const last = attackEvents[attackEvents.length - 1].timestamp;
    expect(minutesBetween(first, last)).toBeGreaterThanOrEqual(20);
  });

  it("keeps the attacker IPs out of every non-attack event", () => {
    for (const event of events.filter((e) => !attackIds.has(e.id))) {
      for (const ip of ATTACKER_IPS) {
        expect(event.source).not.toContain(ip);
        expect(event.target).not.toContain(ip);
      }
    }
  });

  it("contains the lateral path to the domain controller and the file server", () => {
    expect(attackEvents.some((e) => e.target === "DC-01")).toBe(true);
    expect(attackEvents.some((e) => e.target === "FILESRV-01")).toBe(true);
  });

  it("tells the story in 4 to 8 steps", () => {
    const steps = key.chain_summary ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.length).toBeLessThanOrEqual(8);
    for (const step of steps) expect(step.trim().length).toBeGreaterThan(0);
  });
});

describe("scenario benign-lookalike-02 only", () => {
  const { events, key } = load("benign-lookalike-02");

  it("claims no attack", () => {
    expect(key.attack_event_ids).toEqual([]);
    expect(key.scenario_type).toBe("benign");
  });

  it("never uses an attacker IP", () => {
    for (const event of events) {
      for (const ip of ATTACKER_IPS) {
        expect(event.source).not.toContain(ip);
        expect(event.target).not.toContain(ip);
      }
    }
  });

  it("explains every lookalike", () => {
    const lookalikeIds = new Set(key.lookalike_event_ids ?? []);
    expect(key.lookalikes?.length).toBeGreaterThan(0);
    for (const lookalike of key.lookalikes ?? []) {
      expect(lookalike.why_benign.trim().length).toBeGreaterThan(0);
      expect(lookalikeIds.has(lookalike.id)).toBe(true);
    }
  });
});
