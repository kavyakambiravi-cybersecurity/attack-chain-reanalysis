import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, analyze, health, loadScenario } from "../src/lib/api";
import { contract, readJson } from "./contract";

type Route = { status: number; body: unknown; text?: string };

function stubRoutes(routes: Record<string, Route>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`no stub for ${url}`);
    const text = route.text ?? JSON.stringify(route.body);
    return {
      ok: route.status >= 200 && route.status < 300,
      status: route.status,
      async json() {
        return JSON.parse(text);
      },
      async text() {
        return text;
      },
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchStub);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("analyze", () => {
  it("resolves to the parsed chain on 200", async () => {
    stubRoutes({ "/api/analyze": { status: 200, body: contract("analyze_response.json") } });
    const chain = await analyze("attack-chain-01", ["E-0115", "E-0117"]);
    expect(chain.scenario_id).toBe("attack-chain-01");
    expect(chain.edges).toHaveLength(3);
    expect(chain.prompt_version).toBe("2026-09-07.1");
  });

  it("sends exactly the two request fields", async () => {
    const calls = stubRoutes({
      "/api/analyze": { status: 200, body: contract("analyze_response.json") },
    });
    await analyze("attack-chain-01", ["E-0115"]);
    expect(calls[0].url).toBe("/api/analyze");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      scenario_id: "attack-chain-01",
      removed_event_ids: ["E-0115"],
    });
  });

  it("rejects with the contract error body on a non-2xx", async () => {
    stubRoutes({
      "/api/analyze": { status: 503, body: contract("error_not_configured.json") },
    });
    const error = await analyze("attack-chain-01", []).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("not_configured");
    expect(error.detail).toBe("Live re-analysis is off: the server has no model key.");
    expect(error.status).toBe(503);
  });

  it("carries the ids of an unknown_event_ids error", async () => {
    stubRoutes({
      "/api/analyze": { status: 400, body: contract("error_unknown_event_ids.json") },
    });
    const error = await analyze("attack-chain-01", ["E-9999"]).catch((e) => e);
    expect(error.code).toBe("unknown_event_ids");
    expect(error.ids).toEqual(["E-9999", "E-0000"]);
  });

  it("synthesises an internal error when the body is not the contract shape", async () => {
    stubRoutes({
      "/api/analyze": { status: 500, body: null, text: "<html>oops</html>" },
    });
    const error = await analyze("attack-chain-01", []).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("internal");
    expect(error.detail).toBe("Unexpected response from the server.");
  });
});

describe("health", () => {
  it("parses a live health response", async () => {
    stubRoutes({ "/api/health": { status: 200, body: contract("health_live.json") } });
    expect(await health()).toEqual({ ok: true, live: true, model: "claude-sonnet-5" });
  });
});

describe("loadScenario", () => {
  const events = readJson("data/scenarios/attack-chain-01/events.json");
  const key = readJson("data/scenarios/attack-chain-01/answer_key.json");
  const cached = contract("analyze_response.json");

  it("loads events, answer key, and the cached analysis", async () => {
    stubRoutes({
      "/scenarios/attack-chain-01/events.json": { status: 200, body: events },
      "/scenarios/attack-chain-01/answer_key.json": { status: 200, body: key },
      "/scenarios/attack-chain-01/analysis.json": { status: 200, body: cached },
    });
    const loaded = await loadScenario("attack-chain-01");
    expect(loaded.events).toHaveLength(500);
    expect(loaded.answer_key.scenario_id).toBe("attack-chain-01");
    expect(loaded.cached?.edges).toHaveLength(3);
  });

  it("treats a missing analysis.json as not fatal", async () => {
    stubRoutes({
      "/scenarios/attack-chain-01/events.json": { status: 200, body: events },
      "/scenarios/attack-chain-01/answer_key.json": { status: 200, body: key },
      "/scenarios/attack-chain-01/analysis.json": { status: 404, body: null, text: "not found" },
    });
    const loaded = await loadScenario("attack-chain-01");
    expect(loaded.cached).toBeNull();
    expect(loaded.events).toHaveLength(500);
  });

  it("treats a missing events.json as fatal", async () => {
    stubRoutes({
      "/scenarios/attack-chain-01/events.json": { status: 404, body: null, text: "not found" },
      "/scenarios/attack-chain-01/answer_key.json": { status: 200, body: key },
      "/scenarios/attack-chain-01/analysis.json": { status: 200, body: cached },
    });
    await expect(loadScenario("attack-chain-01")).rejects.toBeInstanceOf(ApiError);
  });
});
