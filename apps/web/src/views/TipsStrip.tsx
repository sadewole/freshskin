import { Lightbulb } from 'lucide-react';
import type { RoutineResponse } from '../api/types';

/**
 * Home tips strip (PRD S7, FR-15): three curated tips, each with body + why + inputs.
 * Articles, never a carousel — one tap to expand the reason, no auto-play.
 */
export function TipsStrip({ tips }: { readonly tips: RoutineResponse['data']['tips'] }) {
  if (tips.length === 0) return null;
  return (
    <section className="home-section" aria-labelledby="tips-title">
      <div className="section-head">
        <div>
          <p className="kicker">Good to know</p>
          <h2 id="tips-title">Tips that suit body skin</h2>
        </div>
      </div>
      <div className="tips-strip">
        {tips.map((tip) => (
          <article key={tip.id} className="card tip">
            <p className="tip-mark" aria-hidden="true">
              <Lightbulb size={18} aria-hidden="true" />
            </p>
            <p>{tip.body}</p>
            <details>
              <summary className="muted small">Why this helps</summary>
              <p className="muted small">
                {tip.why} ({tip.inputs.join(', ')})
              </p>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
