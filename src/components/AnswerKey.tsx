// The bundled scenario's answer key, so a reviewer with no security background
// can check the model rather than trust it.
import type { AnswerKey as AnswerKeyShape } from "../types";

export default function AnswerKey({
  answerKey,
  citedIds,
  notedIds,
  open,
  onClose,
}: {
  answerKey: AnswerKeyShape | null;
  /** Event ids cited by the attack chain on screen. */
  citedIds: Set<string>;
  /** Event ids cited by the steps the model looked at and set aside. */
  notedIds: Set<string>;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !answerKey) return null;

  const cited = answerKey.attack_event_ids.filter((id) => citedIds.has(id)).length;

  return (
    <div className="slideover-backdrop" onClick={onClose}>
      <section className="slideover" onClick={(event) => event.stopPropagation()}>
        <div className="slideover-head">
          <h2>Answer key</h2>
          <button type="button" className="link" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="answer-name">{answerKey.scenario_name}</p>
        <p className="answer-verdict">
          What actually happened: <strong>{answerKey.correct_answer}</strong>
        </p>

        {answerKey.chain_summary ? (
          <>
            <h3>The story, step by step</h3>
            <ol className="answer-steps">
              {answerKey.chain_summary.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </>
        ) : null}

        {answerKey.attack_event_ids.length > 0 ? (
          <>
            <h3>
              Planted events <span className="muted">({cited} of {answerKey.attack_event_ids.length} cited by the chain on screen)</span>
            </h3>
            <ul className="answer-ids">
              {answerKey.attack_event_ids.map((id) => (
                <li key={id} className={citedIds.has(id) ? "cited" : ""}>
                  <span className="event-id">{id}</span>
                  <span className="mark-word">{citedIds.has(id) ? "cited" : "not cited"}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {answerKey.lookalikes ? (
          <>
            <h3>Events that look like an attack but are not</h3>
            <ul className="answer-lookalikes">
              {answerKey.lookalikes.map((lookalike) => {
                const drawn = citedIds.has(lookalike.id);
                const noted = notedIds.has(lookalike.id);
                return (
                  <li key={lookalike.id} className={drawn ? "drawn" : noted ? "noted" : ""}>
                    <span className="event-id">{lookalike.id}</span>
                    <span>
                      {lookalike.why_benign}
                      {drawn ? (
                        <span className="mark-word"> Drawn into the chain on screen.</span>
                      ) : noted ? (
                        <span className="mark-word"> Noted and set aside by the model.</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        <p className="answer-note">{answerKey.note}</p>
      </section>
    </div>
  );
}
