// A crash in a panel is the one failure the logic tests cannot see, so render
// each of them once against the real scenario and the mock chain.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AnswerKeyPanel from "../src/components/AnswerKey";
import Toolbar from "../src/components/Toolbar";
import EvidencePanel from "../src/graph/EvidencePanel";
import Legend from "../src/graph/Legend";
import { diffChains } from "../src/lib/diff";
import { SCENARIOS } from "../src/lib/scenarios";
import { AnswerKeySchema, ChainSchema, EventsSchema } from "../src/lib/schema";
import { validateChain } from "../src/lib/validate";
import { readJson } from "./contract";
import { notableChain } from "./fixtures/chains";
import { mini } from "./fixtures/mini";

const events = EventsSchema.parse(readJson("data/scenarios/attack-chain-01/events.json"));
const answerKey = AnswerKeySchema.parse(readJson("data/scenarios/attack-chain-01/answer_key.json"));
const chain = validateChain(
  ChainSchema.parse(readJson("src/mock/analysis.attack-chain-01.json")),
  events,
);
const view = diffChains(null, chain);
const citedIds = new Set(chain.edges.flatMap((edge) => edge.citations));
const nothing = () => undefined;

describe("panels render", () => {
  it("shows the events behind the step that was clicked", () => {
    const html = renderToStaticMarkup(
      <EvidencePanel
        edge={view.edges.find((edge) => edge.source === "administrator")!}
        events={events}
        onClose={nothing}
      />,
    );
    expect(html).toContain("E-0119");
    expect(html).toContain("Read \\\\FILESRV-01\\Finance\\Q3_forecast.xlsx");
    expect(html).not.toContain("mark no");
  });

  it("asks for a step when none is selected", () => {
    const html = renderToStaticMarkup(
      <EvidencePanel edge={null} events={events} onClose={nothing} />,
    );
    expect(html).toContain("Click a step in the chain");
  });

  it("marks which planted events the chain on screen cites", () => {
    const html = renderToStaticMarkup(
      <AnswerKeyPanel
        answerKey={answerKey}
        citedIds={citedIds}
        notedIds={new Set()}
        open
        onClose={nothing}
      />,
    );
    expect(html).toContain("Finance file-server exfiltration");
    expect(html).toContain("15 of 16 cited by the chain on screen");
    expect(html).toContain("not cited");
  });

  it("says when live re-analysis is off, without saying anything else", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        scenarios={SCENARIOS}
        scenarioId="attack-chain-01"
        onSelectScenario={nothing}
        live={false}
        model="claude-sonnet-5"
        removedCount={3}
        stagedCount={0}
        stagedEvents={0}
        onRun={null}
        busy={false}
        canReset
        onReset={nothing}
        onToggleAnswerKey={nothing}
        onAnalyse={null}
      />,
    );
    expect(html).toContain("live re-analysis off");
    expect(html).toContain("3 events removed");
  });

  it("offers every bundled scenario by name and marks the open one", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        scenarios={SCENARIOS}
        scenarioId="benign-lookalike-02"
        onSelectScenario={nothing}
        live
        model="claude-sonnet-5"
        removedCount={0}
        stagedCount={0}
        stagedEvents={0}
        onRun={null}
        busy={false}
        canReset={false}
        onReset={nothing}
        onToggleAnswerKey={nothing}
        onAnalyse={null}
      />,
    );
    for (const scenario of SCENARIOS) expect(html).toContain(scenario.name);
    expect(html).toMatch(/<option value="benign-lookalike-02" selected=""/);
  });

  it("offers one Re-analyse button for everything staged, and none when nothing is", () => {
    const props = {
      scenarios: SCENARIOS,
      scenarioId: "attack-chain-01",
      onSelectScenario: nothing,
      live: true,
      model: "claude-sonnet-5",
      removedCount: 0,
      busy: false,
      canReset: true,
      onReset: nothing,
      onToggleAnswerKey: nothing,
      onAnalyse: null,
    };
    const idle = renderToStaticMarkup(
      <Toolbar {...props} stagedCount={0} stagedEvents={0} onRun={null} />,
    );
    expect(idle).not.toContain("Re-analyse");
    const two = renderToStaticMarkup(
      <Toolbar {...props} stagedCount={2} stagedEvents={41} onRun={nothing} />,
    );
    expect(two).toContain("Re-analyse (2 changes, 41 events)");
    expect(two).not.toContain("disabled");
    const offline = renderToStaticMarkup(
      <Toolbar {...props} live={false} stagedCount={1} stagedEvents={5} onRun={null} />,
    );
    expect(offline).toContain("Re-analyse (1 change, 5 events)");
    expect(offline).toContain("disabled");
  });

  it("explains every step style", () => {
    const html = renderToStaticMarkup(<Legend />);
    expect(html).toContain("no longer backed by the remaining events");
    expect(html).toContain("data left the network");
    expect(html).toContain("joins no chain");
  });

  it("says when a step was noted and set aside, and when data left the network", () => {
    const noted = validateChain(notableChain, mini);
    const view = diffChains(null, noted);
    const aside = renderToStaticMarkup(
      <EvidencePanel
        edge={view.edges.find((edge) => edge.role === "notable")!}
        events={mini}
        onClose={nothing}
      />,
    );
    expect(aside).toContain("noted");
    expect(aside).toContain("set it aside");
    expect(aside).not.toContain("Data left the network");
    const exfil = renderToStaticMarkup(
      <EvidencePanel
        edge={view.edges.find((edge) => edge.target === "198.51.100.22")!}
        events={mini}
        onClose={nothing}
      />,
    );
    expect(exfil).toContain("Data left the network. Event E-0005 records 480MB");
  });

  it("marks lookalikes the model noted, apart from ones it drew into a chain", () => {
    const benignKey = AnswerKeySchema.parse(
      readJson("data/scenarios/benign-lookalike-02/answer_key.json"),
    );
    const html = renderToStaticMarkup(
      <AnswerKeyPanel
        answerKey={benignKey}
        citedIds={new Set(["E-0046"])}
        notedIds={new Set(["E-0192"])}
        open
        onClose={nothing}
      />,
    );
    expect(html).toContain("Noted and set aside by the model.");
    expect(html).toContain("Drawn into the chain on screen.");
    expect(html.match(/mark-word/g)).toHaveLength(2);
  });
});
