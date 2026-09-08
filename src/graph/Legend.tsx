// What the edge styles mean, in the corner of the graph, so nobody has to
// guess. Constitution V.
const EDGE_STATES = [
  { key: "verified", className: "", text: "backed by events that name both assets" },
  { key: "unverified", className: "unverified", text: "the events cited do not back this up" },
  {
    key: "notable",
    className: "role-notable",
    text: "noted: looks like an attacker action on its own, but joins no chain",
  },
  { key: "data_out", className: "kind-data_out", text: "data left the network" },
  {
    key: "vanished",
    className: "status-vanished",
    text: "no longer backed by the remaining events",
  },
  { key: "appeared", className: "status-appeared", text: "new since your last change" },
] as const;

export default function Legend() {
  return (
    <div className="legend">
      <span className="legend-title">Steps</span>
      <ul>
        {EDGE_STATES.map(({ key, className, text }) => (
          <li key={key}>
            <svg viewBox="0 0 40 8" className="legend-line" aria-hidden="true">
              <path d="M1 4 H39" className={`chain-edge ${className}`} />
            </svg>
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
