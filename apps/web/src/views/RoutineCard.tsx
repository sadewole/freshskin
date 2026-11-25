import { useState } from 'react';
import { ArrowRight, CalendarCheck2, Check } from 'lucide-react';
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
 * Compact routine preview for the Home hub: title, step count, first three steps, and the
 * week streak. The full steps + check-in live in `RoutineDetail` inside the routine bottom
 * sheet. The "Why these steps" list is gone — each step already carries its `why` inline,
 * so the list only repeated them.
 */
export function RoutinePreview({
  routine,
  onOpen,
}: {
  readonly routine: RoutineResponse['data'];
  readonly onOpen: () => void;
}) {
  const preview = routine.routine.steps.slice(0, 3);
  const remaining = routine.routine.steps.length - preview.length;

  return (
    <section className="home-section" aria-labelledby="routine-title">
      <div className="section-head">
        <div>
          <p className="kicker">Your routine</p>
          <h2 id="routine-title">{routine.routine.title}</h2>
        </div>
      </div>
      <button type="button" className="routine-preview" onClick={onOpen}>
        <ol className="routine-mini">
          {preview.map((step) => (
            <li key={step.id}>
              <span className="routine-num" aria-hidden="true">
                {step.position}
              </span>
              <span>{step.title}</span>
            </li>
          ))}
        </ol>
        <span className="routine-preview-more muted small">
          {remaining > 0
            ? `+${remaining} more steps — view full routine`
            : 'View full routine'}{' '}
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </button>
    </section>
  );
}

interface Checkins {
  readonly summary: ReturnType<typeof useCheckIns>['summary'];
  readonly pending_sync: boolean;
  readonly record: ReturnType<typeof useCheckIns>['record'];
}

/**
 * Full routine + weekly check-in (PRD S7, FR-15/FR-16), rendered inside the routine bottom
 * sheet. The check-ins state is lifted to Home so the overview strip and this sheet share
 * one subscription — one `GET /check-ins`, one outbox.
 */
export function RoutineDetail({
  routine,
  checkins,
}: {
  readonly routine: RoutineResponse['data'];
  readonly checkins: Checkins;
}) {
  const { summary, pending_sync, record } = checkins;
  const [completion, setCompletion] = useState<CheckInCompletion | null>(null);
  const [feel, setFeel] = useState<SkinFeel | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    if (completion === null) return;
    void record(completion, feel).then(() => setSaved(true));
  };

  const progress =
    summary !== null && summary.total_check_ins > 0
      ? Math.min(1, summary.streak_days / Math.max(summary.total_check_ins, 1))
      : 0;

  return (
    <div>
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

      <div className="card checkin">
        <div className="checkin-head">
          <CalendarCheck2 size={18} aria-hidden="true" />
          <h3>This week</h3>
        </div>
        {summary !== null && summary.total_check_ins > 0 && (
          <div className="progress-line" role="img" aria-label={`Streak ${summary.streak_days} weeks`}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
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
        {pending_sync && (
          <p className="muted small sync-note">Saved on this phone, will sync.</p>
        )}
      </div>

      <p className="muted small">{routine.disclaimer}</p>
    </div>
  );
}
