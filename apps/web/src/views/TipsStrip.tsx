import { useMemo, useState } from 'react';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { RoutineResponse } from '../api/types';
import { stepTransition, stepVariants } from '../ui/motion';

type Daypart = 'morning' | 'afternoon' | 'evening';

function daypartOf(date: Date): { readonly part: Daypart; readonly label: string; readonly offset: number } {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return { part: 'morning', label: 'Morning tip', offset: 0 };
  if (hour >= 12 && hour < 17) return { part: 'afternoon', label: 'Afternoon tip', offset: 1 };
  return { part: 'evening', label: 'Evening tip', offset: 2 };
}

function dayOfYear(date: Date): number {
  return Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000,
  );
}

/**
 * Home tip ribbon (PRD S7, FR-15): a single rotating tip, never a list or a carousel. The
 * pick is deterministic — local day-of-year plus a daypart offset (morning 5–12, afternoon
 * 12–17, evening otherwise) — so it reads as "today's tip" and changes across the day
 * without autoplay or user tracking. The refresh button cycles within the session; "Why
 * this helps" stays one tap away.
 */
export function TipsStrip({ tips }: { readonly tips: RoutineResponse['data']['tips'] }) {
  const [cycles, setCycles] = useState(0);

  const current = useMemo(() => {
    if (tips.length === 0) return null;
    const now = new Date();
    const { label, offset } = daypartOf(now);
    const index = (dayOfYear(now) + offset + cycles) % tips.length;
    const tip = tips[index];
    return tip === undefined ? null : { tip, label };
  }, [tips, cycles]);

  if (current === null) return null;
  const { tip, label } = current;

  return (
    <section className="home-section" aria-labelledby="tips-title">
      <div className="section-head">
        <div>
          <p className="kicker">Good to know</p>
          <h2 id="tips-title" className="visually-hidden">
            Daily tip
          </h2>
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tip.id}
          variants={stepVariants}
          initial="enter"
          animate="center"
          exit="exit"
          custom={1}
          transition={stepTransition}
        >
          <article className="card tip-ribbon">
            <p className="tip-pin" aria-hidden="true">
              📌
            </p>
            <div className="tip-ribbon-top">
              <p className="tip-mark" aria-hidden="true">
                <Lightbulb size={20} aria-hidden="true" />
              </p>
              <p className="tip-daypart">{label}</p>
              <span className="tip-topic">{tip.topic}</span>
              {tips.length > 1 && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setCycles((value) => value + 1)}
                  aria-label="Show another tip"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="tip-body">{tip.body}</p>
            <details>
              <summary className="muted small">Why this helps</summary>
              <p className="muted small">
                {tip.why} ({tip.inputs.join(', ')})
              </p>
            </details>
          </article>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
