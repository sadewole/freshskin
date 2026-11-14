import { useState } from 'react';
import { CalendarCheck2, Check } from 'lucide-react';
import type { CheckInCompletion, RoutineResponse, SkinFeel } from '../api/types';
import { useCheckIns } from '../data/checkins';
import { verdictEnter } from '../ui/motion';
import { motion } from 'motion/react';

const COMPLETION_OPTIONS: readonly { value: CheckInCompletion; label: string }[] = [
  { value: 'done', label: 'All of it' },
  { value: 'partly', label: 'Some of it' },
  { value: 'skipped', label: 'Not today' },
];

const FEEL_OPTIONS: readonly { value: SkinFeel; label: string }[] = [
  { value: 'more_comfortable', label: 'Calm' },
  { value: 'about_same', label: 'Same' },
  { value: 'drier', label: 'Dry' },
  { value: 'not_sure', label: 'Not sure' },
];

/**
 * Home routine section (PRD S7, FR-15/FR-16): the generic body routine, reviewed tips via
 * TipsStrip, and the weekly check-in — completion chips, feel chips, streak line, latest
 * two entries, disclaimer. Check-ins read the live `GET /check-ins` summary and queue
 * offline entries for the next flush; the section markup is unchanged from Phase 1.
 */
export function RoutineCard({ routine }: { readonly routine: RoutineResponse['data'] }) {
  const { summary, pending_sync, record } = useCheckIns();
  const [completion, setCompletion] = useState<CheckInCompletion | null>(null);
  const [feel, setFeel] = useState<SkinFeel | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (completion === null) return;
    void record(completion, feel).then(() => setSaved(true));
  };

  return (
    <section className="home-section" aria-labelledby="routine-title">
      <div className="section-head">
        <div>
          <p className="kicker">Your routine</p>
          <h2 id="routine-title">{routine.routine.title}</h2>
        </div>
      </div>

      <ol className="routine-steps">
        {routine.routine.steps.map((step) => (
          <li key={step.id} className="card routine-step">
            <div className="routine-step-head">
              <span className="routine-num" aria-hidden="true">
                {step.position}
              </span>
              <h3>{step.title}</h3>
            </div>
            <p>{step.instruction}</p>
            <p className="muted small step-why">{step.why}</p>
          </li>
        ))}
      </ol>

      <details className="panel excluded">
        <summary>Why these steps</summary>
        <ul className="why-list">
          {routine.routine.steps.map((step) => (
            <li key={step.id} className="muted small">
              <strong>{step.title}:</strong> {step.why} ({step.inputs.join(', ')})
            </li>
          ))}
        </ul>
      </details>

      <div className="card checkin">
        <div className="checkin-head">
          <CalendarCheck2 size={18} aria-hidden="true" />
          <h3>This week</h3>
        </div>
        {summary !== null && summary.checked_in_today ? (
          <motion.p className="muted" {...verdictEnter}>
            <Check size={14} aria-hidden="true" /> Logged for today
            {summary.streak_days > 1 && ` — ${summary.streak_days} weeks in a row`}.
          </motion.p>
        ) : (
          <>
            <p className="muted small">Did you follow the routine this week?</p>
            <div className="chips" role="group" aria-label="How much did you follow">
              {COMPLETION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chip${completion === option.value ? ' on' : ''}`}
                  aria-pressed={completion === option.value}
                  onClick={() => {
                    setCompletion(option.value);
                    setSaved(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="How does your skin feel">
              {FEEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`chip${feel === option.value ? ' on' : ''}`}
                  aria-pressed={feel === option.value}
                  onClick={() => {
                    setFeel(option.value);
                    setSaved(false);
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button className="primary small" disabled={completion === null} onClick={save}>
              {saved ? 'Saved' : 'Log this week'}
            </button>
          </>
        )}
        {summary !== null && summary.total_check_ins > 0 && (
          <p className="muted small checkin-history">
            {summary.latest !== null &&
              `Latest: ${summary.latest.completion.replace(/_/g, ' ')}${summary.latest.feel !== null ? `, feeling ${summary.latest.feel.replace(/_/g, ' ')}` : ''}. `}
            {summary.previous !== null &&
              `Before: ${summary.previous.completion.replace(/_/g, ' ')}${summary.previous.feel !== null ? `, feeling ${summary.previous.feel.replace(/_/g, ' ')}` : ''}.`}
          </p>
        )}
        <p className="muted small">{routine.disclaimer}</p>
        {pending_sync && (
          <p className="muted small sync-note">Saved on this phone, will sync.</p>
        )}
      </div>

      <p className="muted small">{routine.disclaimer}</p>
    </section>
  );
}
