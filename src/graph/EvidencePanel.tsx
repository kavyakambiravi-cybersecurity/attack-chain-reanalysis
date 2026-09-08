// Constitution I, made visible: for the step you clicked, here are the raw
// events behind it and whether each one actually supports it.
import { describeDataOut, explainCheck } from "../lib/validate";
import type { Event } from "../types";
import type { LaidOutEdge } from "./layout";

function Mark({ ok }: { ok: boolean }) {
  return (
    <span className={ok ? "mark yes" : "mark no"} aria-label={ok ? "yes" : "no"}>
      {ok ? "✓" : "✗"}
    </span>
  );
}

function time(timestamp: string): string {
  return timestamp.replace("T", " ").replace("Z", " UTC");
}

export default function EvidencePanel({
  edge,
  events,
  onClose,
}: {
  edge: LaidOutEdge | null;
  events: Event[];
  onClose: () => void;
}) {
  if (!edge) {
    return (
      <aside className="evidence empty">
        <h2>Evidence</h2>
        <p>Click a step in the chain to see the events it is built on.</p>
      </aside>
    );
  }

  const byId = new Map(events.map((event) => [event.id, event]));
  const dataOut = describeDataOut(edge, events);

  return (
    <aside className="evidence">
      <div className="evidence-head">
        <h2>Evidence</h2>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </div>

      <p className="evidence-endpoints">
        <span className="asset-name">{edge.source}</span>
        <span className="arrow">{"→"}</span>
        <span className="asset-name">{edge.target}</span>
      </p>
      <p className="evidence-action">
        {edge.action}
        {edge.kind === "data_out" ? <span className="tag data-out">data out</span> : null}
        {edge.role === "notable" ? <span className="tag noted">noted</span> : null}
        {edge.verified ? null : <span className="tag">unverified</span>}
      </p>
      <p className="evidence-description">{edge.description}</p>

      {edge.role === "notable" ? (
        <p className="evidence-note muted">
          Noted, not part of an attack chain: the model looked at this step and set it aside.
          The sentence above is its reason.
        </p>
      ) : null}

      {dataOut ? <p className="evidence-note data-out">Data left the network. {dataOut}</p> : null}

      {edge.status === "vanished" ? (
        <p className="evidence-note">
          This step is no longer supported by the remaining events. It is shown as it was before
          your change.
        </p>
      ) : null}

      {edge.bannedWords.length > 0 ? (
        <p className="evidence-note">
          The wording of this step used {edge.bannedWords.length === 1 ? "a word" : "words"} this
          tool does not stand behind: {edge.bannedWords.join(", ")}.
        </p>
      ) : null}

      {edge.checks.length === 0 ? (
        <p className="evidence-note">
          This step cites no events at all, so nothing supports it.
        </p>
      ) : null}

      <ol className="citations">
        {edge.checks.map((check) => {
          const event = byId.get(check.id);
          const reason = explainCheck(edge, check, events);
          return (
            <li key={check.id} className={check.exists && check.involvesBothEndpoints ? "ok" : "bad"}>
              <div className="citation-head">
                <span className="event-id">{check.id}</span>
                <span className="event-time">{event ? time(event.timestamp) : "not in this scenario"}</span>
              </div>
              {event ? (
                <>
                  <div className="citation-assets">
                    <span className="asset-name">{event.source}</span>
                    <span className="arrow">{"→"}</span>
                    <span className="asset-name">{event.target}</span>
                    <span className="event-type">{event.type.replace("_", " ")}</span>
                  </div>
                  <div className="citation-detail">{event.detail}</div>
                </>
              ) : null}
              <div className="citation-checks">
                <span>
                  <Mark ok={check.exists} /> the event is in this scenario
                </span>
                <span>
                  <Mark ok={check.involvesBothEndpoints} /> it names both assets in this step
                </span>
              </div>
              {reason ? <div className="citation-reason">{reason}</div> : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
