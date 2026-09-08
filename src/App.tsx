import { useCallback, useEffect, useMemo, useState } from "react";
import Toolbar from "./components/Toolbar";
import AnswerKeyPanel from "./components/AnswerKey";
import ChainGraph from "./graph/ChainGraph";
import EvidencePanel from "./graph/EvidencePanel";
import Legend from "./graph/Legend";
import { ApiError, analyze, health, loadScenario } from "./lib/api";
import { describeChange, diffChains } from "./lib/diff";
import {
  describeStaged,
  interventionForEdge,
  interventionForNode,
  stagedRemoved,
  toggleStaged,
} from "./lib/intervene";
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
const BUSY_REASON = "Wait for the running re-analysis to finish.";

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
  /** Changes the user has marked but not yet sent. One analysis takes them all. */
  const [staged, setStaged] = useState<Intervention[]>([]);
  const [running, setRunning] = useState(false);
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

  const busy = running;
  const canIntervene = live === true && !busy;

  /**
   * The one code path for every analysis. Everything staged goes in one
   * request. The previous chain stays on screen until a new one arrives; a
   * failure leaves it there with a banner saying what the server said, and
   * keeps the staged changes so they can be sent again.
   */
  const runAnalysis = useCallback(
    async (removed: string[]) => {
      setRunning(true);
      setErrorBanner(null);
      setResultBanner(null);
      try {
        const response = await analyze(scenarioId, removed);
        const next = validateChain(response, events);
        const diffed = diffChains(chain, next);
        setRemovedIds(response.removed_event_ids);
        setStaged([]);
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
        setRunning(false);
      }
    },
    [chain, events, scenarioId],
  );

  /** Mark a change, or unmark it if it was already marked. Nothing runs yet. */
  const stage = useCallback(
    (intervention: Intervention) => {
      if (busy) return;
      setErrorBanner(null);
      setStaged((current) => toggleStaged(current, intervention));
    },
    [busy],
  );

  const onIsolate = useCallback(
    (asset: string) => stage(interventionForNode(asset, events)),
    [events, stage],
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
      if (drawn) stage(interventionForEdge(drawn.edge));
    },
    [drawnEdges, stage],
  );

  /** The one array that goes to the server: earlier removals plus every staged change. */
  const nextRemoved = useMemo(() => stagedRemoved(removedIds, staged), [removedIds, staged]);
  const stagedKeys = useMemo(
    () => new Set(staged.map((intervention) => intervention.subject)),
    [staged],
  );

  /** Send everything staged as one analysis. */
  const onRun = useCallback(() => {
    if (busy || staged.length === 0) return;
    void runAnalysis(nextRemoved);
  }, [busy, staged.length, nextRemoved, runAnalysis]);

  const onClearStaged = useCallback(() => {
    if (!busy) setStaged([]);
  }, [busy]);

  /** Offered only when no analysis has been generated for this scenario yet. */
  const onAnalyse = useCallback(() => {
    if (busy) return;
    void runAnalysis(removedIds);
  }, [busy, removedIds, runAnalysis]);

  const onReset = useCallback(() => {
    if (busy) return;
    setRemovedIds([]);
    setStaged([]);
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
      setStaged([]);
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
    () =>
      new Set(
        (chain?.edges ?? [])
          .filter((edge) => edge.role === "chain")
          .flatMap((edge) => edge.citations),
      ),
    [chain],
  );
  const notedIds = useMemo(
    () =>
      new Set(
        (chain?.edges ?? [])
          .filter((edge) => edge.role === "notable")
          .flatMap((edge) => edge.citations),
      ),
    [chain],
  );

  /** The model drew no attack chain. It may still have noted steps to show. */
  const noChain = chain !== null && !chain.edges.some((edge) => edge.role === "chain");
  /** Nothing at all to draw, not even a noted step. */
  const nothingDrawn = view !== null && view.nodes.length === 0 && view.edges.length === 0;
  const remaining = events.length - removedIds.length;
  const noChainText = `The model read the ${remaining} events${
    removedIds.length > 0 ? " that remain" : " in this scenario"
  } and did not link any of them into a connected sequence of attacker actions.`;

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
        stagedCount={staged.length}
        stagedEvents={nextRemoved.length - removedIds.length}
        onRun={live === true && staged.length > 0 ? onRun : null}
        busy={busy}
        canReset={removedIds.length > 0 || staged.length > 0 || errorBanner !== null}
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

      {staged.length > 0 && !busy ? (
        <div className="banner staged" role="status">
          <span>
            {staged.length === 1 ? "1 change" : `${staged.length} changes`} staged, not yet
            analysed: <span className="staged-list">{describeStaged(staged)}</span>. Re-analyse
            sends one request with {nextRemoved.length - removedIds.length} more events removed.
          </span>
          <button type="button" className="link" onClick={onClearStaged}>
            Clear
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
          {view && !nothingDrawn && noChain ? (
            <div className="banner no-chain-banner" role="status">
              <span className="no-chain-title">No attack chain was drawn.</span>{" "}
              {noChainText} The steps drawn below are the ones it looked at and set aside: each
              resembles an attacker action on its own, and its label says why it stays on its own.
            </div>
          ) : null}
          {view && !nothingDrawn ? (
            <div className="graph-canvas">
              <ChainGraph
                chain={view}
                events={events}
                onIsolate={onIsolate}
                onBlock={onBlock}
                onSelectEdge={setSelectedEdgeId}
                selectedEdgeId={selectedEdgeId}
                canIntervene={canIntervene}
                stagedKeys={stagedKeys}
                disabledReason={live === true ? BUSY_REASON : OFFLINE_REASON}
              />
            </div>
          ) : nothingDrawn ? (
            <div className="graph-placeholder no-chain" role="status">
              <p className="no-chain-title">No attack chain was drawn.</p>
              <p>{noChainText} It set aside no steps either, so there is nothing to draw.</p>
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
          {view && !nothingDrawn ? <Legend /> : null}
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
        notedIds={notedIds}
        open={answerKeyOpen}
        onClose={() => setAnswerKeyOpen(false)}
      />
    </div>
  );
}
