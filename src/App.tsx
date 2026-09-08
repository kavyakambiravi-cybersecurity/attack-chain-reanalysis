import { useCallback, useEffect, useMemo, useState } from "react";
import Toolbar from "./components/Toolbar";
import AnswerKeyPanel from "./components/AnswerKey";
import ChainGraph from "./graph/ChainGraph";
import EvidencePanel from "./graph/EvidencePanel";
import { health, loadScenario } from "./lib/api";
import { edgeKey, validateChain } from "./lib/validate";
import type { AnswerKey, Chain, Event, ValidatedChain } from "./types";

const SCENARIO_ID = "attack-chain-01";

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
            error instanceof Error
              ? `This scenario could not be loaded: ${error.message}`
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

  const selectedEdge = useMemo(
    () => chain?.edges.find((edge) => edgeKey(edge) === selectedEdgeKey) ?? null,
    [chain, selectedEdgeKey],
  );

  const citedIds = useMemo(
    () => new Set((chain?.edges ?? []).flatMap((edge) => edge.citations)),
    [chain],
  );

  const notYet = useCallback(() => undefined, []);

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
        removedCount={chain?.removed_event_ids.length ?? 0}
        busy={false}
        canReset={false}
        onReset={notYet}
        onToggleAnswerKey={() => setAnswerKeyOpen((open) => !open)}
        onAnalyse={null}
      />

      <main className="workspace">
        <section className="graph-pane">
          {chain ? (
            <ChainGraph
              chain={chain}
              events={events}
              onIsolate={notYet}
              onBlock={notYet}
              onSelectEdge={setSelectedEdgeKey}
              selectedEdgeKey={selectedEdgeKey}
              canIntervene={false}
              busyKey={null}
              disabledReason="Not wired up yet."
            />
          ) : (
            <div className="graph-placeholder">
              {cached === null && events.length > 0
                ? "No analysis has been generated for this scenario yet."
                : "Loading the chain…"}
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
