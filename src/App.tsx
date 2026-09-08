import { useCallback, useEffect, useMemo, useState } from "react";
import Toolbar from "./components/Toolbar";
import AnswerKeyPanel from "./components/AnswerKey";
import ChainGraph from "./graph/ChainGraph";
import EvidencePanel from "./graph/EvidencePanel";
import { ApiError, analyze, health, loadScenario } from "./lib/api";
import { interventionForEdge, interventionForNode, unionRemoved } from "./lib/intervene";
import { edgeKey, validateChain } from "./lib/validate";
import type { AnswerKey, Chain, Event, Intervention, ValidatedChain } from "./types";

const SCENARIO_ID = "attack-chain-01";

const OFFLINE_REASON = "Live re-analysis is off: the server has no model key.";
const BUSY_REASON = "One re-analysis is already running.";

export default function App() {
  const [events, setEvents] = useState<Event[]>([]);
  const [answerKey, setAnswerKey] = useState<AnswerKey | null>(null);
  const [cached, setCached] = useState<Chain | null>(null);
  const [chain, setChain] = useState<ValidatedChain | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [answerKeyOpen, setAnswerKeyOpen] = useState(false);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [running, setRunning] = useState<Intervention | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const loaded = await loadScenario(SCENARIO_ID);
        if (cancelled) return;
        setEvents(loaded.events);
        setAnswerKey(loaded.answer_key);
        setCached(loaded.cached);
        setChain(loaded.cached ? validateChain(loaded.cached, loaded.events) : null);
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
  }, []);

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
      try {
        const next = await analyze(SCENARIO_ID, removed);
        setRemovedIds(next.removed_event_ids);
        setChain(validateChain(next, events));
        setSelectedEdgeKey(null);
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
    [events],
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

  const onBlock = useCallback(
    (key: string) => {
      const edge = chain?.edges.find((candidate) => edgeKey(candidate) === key);
      if (edge) intervene(interventionForEdge(edge));
    },
    [chain, intervene],
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
    setSelectedEdgeKey(null);
    setChain(cached ? validateChain(cached, events) : null);
  }, [busy, cached, events]);

  const selectedEdge = useMemo(
    () => chain?.edges.find((edge) => edgeKey(edge) === selectedEdgeKey) ?? null,
    [chain, selectedEdgeKey],
  );

  const citedIds = useMemo(
    () => new Set((chain?.edges ?? []).flatMap((edge) => edge.citations)),
    [chain],
  );

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
        scenarioName={answerKey?.scenario_name ?? "loading…"}
        live={live}
        model={model}
        removedCount={removedIds.length}
        busy={busy}
        canReset={removedIds.length > 0 || errorBanner !== null}
        onReset={onReset}
        onToggleAnswerKey={() => setAnswerKeyOpen((open) => !open)}
        onAnalyse={cached === null && chain === null ? onAnalyse : null}
      />

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
          {chain ? (
            <ChainGraph
              chain={chain}
              events={events}
              onIsolate={onIsolate}
              onBlock={onBlock}
              onSelectEdge={setSelectedEdgeKey}
              selectedEdgeKey={selectedEdgeKey}
              canIntervene={canIntervene}
              busyKey={running?.subject ?? null}
              disabledReason={live === true ? BUSY_REASON : OFFLINE_REASON}
            />
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
          onClose={() => setSelectedEdgeKey(null)}
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
