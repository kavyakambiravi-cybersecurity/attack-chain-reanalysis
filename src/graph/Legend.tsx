// What the four edge styles mean, in the corner of the graph, so nobody has to
// guess. Constitution V.
const EDGE_STATES = [
  { state: "verified", text: "backed by events that name both assets" },
  { state: "unverified", text: "the events cited do not back this up" },
  { state: "vanished", text: "no longer backed by the remaining events" },
  { state: "appeared", text: "new since your last change" },
] as const;

export default function Legend() {
  return (
    <div className="legend">
      <span className="legend-title">Steps</span>
      <ul>
        {EDGE_STATES.map(({ state, text }) => (
          <li key={state}>
            <svg viewBox="0 0 40 8" className="legend-line" aria-hidden="true">
              <path d="M1 4 H39" className={`chain-edge state-${state}`} />
            </svg>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
