import type { ScenarioOption } from "../lib/scenarios";

export interface ToolbarProps {
  scenarios: readonly ScenarioOption[];
  scenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  /** Null until the health check answers. */
  live: boolean | null;
  model: string | null;
  removedCount: number;
  busy: boolean;
  canReset: boolean;
  onReset: () => void;
  onToggleAnswerKey: () => void;
  /** Offered only when there is no cached analysis to start from. */
  onAnalyse: (() => void) | null;
}

function LivePill({ live, model }: { live: boolean | null; model: string | null }) {
  if (live === null) return <span className="pill checking">checking the server</span>;
  if (live) {
    return (
      <span className="pill live" title={model ? `Re-analysis runs on ${model}` : undefined}>
        live re-analysis on
      </span>
    );
  }
  return (
    <span className="pill offline" title="The server has no model key, so it cannot re-analyse.">
      live re-analysis off
    </span>
  );
}

export default function Toolbar({
  scenarios,
  scenarioId,
  onSelectScenario,
  live,
  model,
  removedCount,
  busy,
  canReset,
  onReset,
  onToggleAnswerKey,
  onAnalyse,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="brand">Sever</span>
        <label className="scenario-picker">
          <span className="scenario-picker-label">Scenario</span>
          <select
            value={scenarioId}
            disabled={busy}
            title={busy ? "Wait for the running re-analysis to finish." : "Switch to another bundled scenario"}
            onChange={(event) => onSelectScenario(event.target.value)}
          >
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar-right">
        {removedCount > 0 ? (
          <span className="removed-count">{removedCount} events removed</span>
        ) : null}
        {onAnalyse ? (
          <button type="button" onClick={onAnalyse} disabled={busy}>
            {busy ? "Analysing…" : "Analyse"}
          </button>
        ) : null}
        <button type="button" onClick={onReset} disabled={!canReset || busy}>
          Reset
        </button>
        <button type="button" onClick={onToggleAnswerKey}>
          Answer key
        </button>
        <LivePill live={live} model={model} />
      </div>
    </header>
  );
}
