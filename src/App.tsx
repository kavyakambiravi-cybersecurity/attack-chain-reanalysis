import { useCallback, useEffect, useMemo, useState } from "react";
import Toolbar from "./components/Toolbar";
import AnswerKeyPanel from "./components/AnswerKey";
import ChainGraph from "./graph/ChainGraph";
import EvidencePanel from "./graph/EvidencePanel";
import Legend from "./graph/Legend";
import { ApiError, analyze, health, loadScenario } from "./lib/api";
import { describeChange, diffChains } from "./lib/diff";
import { interventionForEdge, interventionForNode, unionRemoved } from "./lib/intervene";
import { DEFAULT_SCENARIO_ID, SCENARIOS } from "./lib/scenarios";
import { uniqueEdgeIds, validateChain } from "./lib/validate";
import type {
  AnswerKey,
  Chain,
  DiffedChain,
  Event,
  Intervention,
  ValidatedChain,
} from "./types";

const OFFLINE_REASON = "Live re-analysis is off: the server has no model key.";
const BUSY_REASON = "One re-analysis is already running.";

export default function App() {
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO_ID);
  const [events, setEvents] = useState<Event[]>([]);
  const [answerKey, setAnswerKey] = useState<AnswerKey | null>(null);
  const [cached, setCached] = useState<Chain | null>(null);
  const [chain, setChain] = useState<ValidatedChain | null>(null);
  const [view, setView] = useState<DiffedChain | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [running, setRunning] = useState<Intervention | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [resultBanner, setResultBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadScenario(scenarioId);
        if (cancelled) return;
        setEvents(loaded.events);
        setAnswerKey(loaded.answer_key);
        setCached(loaded.cached);
        const validated = loaded.cached ? validateChain(loaded.cached, loaded.events) : null;
        setChain(validated);
        setView(validated ? diffChains(null, validated) : null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError
              ? `This scenario could not be loaded. ${error.detail}`
              : "This scenario could not be loaded.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

  useEffect(() => {
    let cancelled = false;
    void health()
      .then((status) => {
        if (cancelled) return;
        setLive(status.live);
        setModel(status.model);
      })
      .catch(() => {
        if (!cancelled) setLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    for (const warning of chain?.warnings ?? []) console.warn(`[validate] ${warning}`);
  }, [chain]);

  const busy = running !== null;
  const canIntervene = live === true && !busy;

  /**
   * The one code path for every intervention. The previous chain stays on
   * screen until a new one arrives, and a failure leaves it there with a
   * banner saying what the server said.
   */
  const runAnalysis = useCallback(
    async (intervention: Intervention, removed: string[]) => {
      setRunning(intervention);
      setErrorBanner(null);
      setResultBanner(null);
      try {
        const response = await analyze(scenarioId, removed);
        const next = validateChain(response, events);
        const diffed = diffChains(chain, next);
        setRemovedIds(response.removed_event_ids);
        setChain(next);
        setView(diffed);
        setResultBanner(describeChange(response.removed_event_ids.length, diffed));
        setSelectedEdgeId(null);
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorBanner(error.detail);
          if (error.code === "not_configured") setLive(false);
        } else {
          setErrorBanner("The re-analysis could not be started.");
        }
      } finally {
        setRunning(null);
      }
    },
    [chain, events, scenarioId],
  );

  const intervene = useCallback(
    (intervention: Intervention) => {
      if (busy) return;
      void runAnalysis(intervention, unionRemoved(removedIds, intervention.removed_event_ids));
    },
    [busy, removedIds, runAnalysis],
  );

  const onIsolate = useCallback(
    (asset: string) => intervene(interventionForNode(asset, events)),
    [events, intervene],
  );

  /** The drawn edges, with the id each one is selected and blocked by. */
  const drawnEdges = useMemo(() => {
    const edges = view?.edges ?? [];
    const ids = uniqueEdgeIds(edges);
    return edges.map((edge, index) => ({ id: ids[index], edge }));
  }, [view]);

  const onBlock = useCallback(
    (id: string) => {
      const drawn = drawnEdges.find((candidate) => candidate.id === id);
      if (drawn) intervene(interventionForEdge(drawn.edge));
    },
    [drawnEdges, intervene],
  );

  /** Offered only when no analysis has been generated for this scenario yet. */
  const onAnalyse = useCallback(() => {
    if (busy) return;
    void runAnalysis({ kind: "isolate", subject: "", removed_event_ids: [] }, removedIds);
  }, [busy, removedIds, runAnalysis]);

  const onReset = useCallback(() => {
    if (busy) return;
    setRemovedIds([]);
    setErrorBanner(null);
    setResultBanner(null);
    setSelectedEdgeId(null);
    const validated = cached ? validateChain(cached, events) : null;
    setChain(validated);
    setView(validated ? diffChains(null, validated) : null);
  }, [busy, cached, events]);

  /**
   * Switching scenario starts over: nothing removed, nothing selected, no
   * banners, and no graph on screen until the new scenario's files arrive.
   */
  const onSelectScenario = useCallback(
    (id: string) => {
      if (busy || id === scenarioId) return;
      setRemovedIds([]);
      setErrorBanner(null);
      setResultBanner(null);
      setSelectedEdgeId(null);
      setAnswerKeyOpen(false);
      setLoadError(null);
      setEvents([]);
      setAnswerKey(null);
      setCached(null);
      setChain(null);
      setView(null);
      setScenarioId(id);
    },
    [busy, scenarioId],
  );

  const selectedEdge = useMemo(
    () => drawnEdges.find((drawn) => drawn.id === selectedEdgeId)?.edge ?? null,
    [drawnEdges, selectedEdgeId],
  );

  const citedIds = useMemo(
    () => new Set((chain?.edges ?? []).flatMap((edge) => edge.citations)),
    [chain],
  );

  const noChain = view !== null && view.nodes.length === 0 && view.edges.length === 0;

  if (loadError) {
    return (
      <div className="app">
        <div className="fatal">{loadError}</div>
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar
        scenarios={SCENARIOS}
        scenarioId={scenarioId}
        onSelectScenario={onSelectScenario}
        live={live}
        model={model}
        removedCount={removedIds.length}
        busy={busy}
        canReset={removedIds.length > 0 || errorBanner !== null}
        onReset={onReset}
        onToggleAnswerKey={() => setAnswerKeyOpen((open) => !open)}
        onAnalyse={events.length > 0 && cached === null && chain === null ? onAnalyse : null}
      />

      {resultBanner && !errorBanner ? (
        <div className="banner result" role="status">
          {resultBanner}
          <button type="button" className="link" onClick={() => setResultBanner(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {errorBanner ? (
        <div className="banner error" role="alert">
          {errorBanner}
          <button type="button" className="link" onClick={() => setErrorBanner(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {busy ? (
        <div className="banner working" role="status">
          <span className="spinner" /> Re-analysing the remaining events. The chain on screen is
          the one from before your change.
        </div>
      ) : null}

      <main className="workspace">
        <section className="graph-pane">
          {view && !noChain ? (
            <div className="graph-canvas">
              <ChainGraph
                chain={view}
                events={events}
                onIsolate={onIsolate}
                onBlock={onBlock}
                onSelectEdge={setSelectedEdgeId}
                selectedEdgeId={selectedEdgeId}
                canIntervene={canIntervene}
                busyKey={running?.subject ?? null}
                disabledReason={live === true ? BUSY_REASON : OFFLINE_REASON}
              />
              <Legend />
            </div>
          ) : noChain ? (
            <div className="graph-placeholder no-chain" role="status">
              <p className="no-chain-title">No attack chain was drawn.</p>
              <p>
                The model read the {events.length - removedIds.length} events
                {removedIds.length > 0 ? " that remain" : " in this scenario"} and did not link any
                of them into a connected sequence of attacker actions, so there is nothing to draw.
              </p>
              <p className="muted">
                Open the answer key to see which events were planted to look like an attack, and
                why each one is ordinary on its own.
              </p>
            </div>
          ) : (
            <div className="graph-placeholder">
              {events.length === 0
                ? "Loading the events…"
                : "No analysis has been generated for this scenario yet. Use Analyse to run one."}
            </div>
          )}
          {chain?.summary ? <p className="chain-summary">{chain.summary}</p> : null}
        </section>

        <EvidencePanel
          edge={selectedEdge}
          events={events}
          onClose={() => setSelectedEdgeId(null)}
        />
      </main>

      <AnswerKeyPanel
        answerKey={answerKey}
        citedIds={citedIds}
        open={answerKeyOpen}
        onClose={() => setAnswerKeyOpen(false)}
      />
    </div>
  );
}
