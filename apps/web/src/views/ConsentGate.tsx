import { useState } from 'react';
import type { ConsentKind } from '../api/types';
import { useSession } from '../session/SessionProvider';
import { ErrorNote } from '../ui/Async';

/**
 * The consent screen (§16.3). Terms, privacy and image processing are required before any
 * photo is handled; model training and marketing are optional and default to off.
 *
 * The old shell read the checkboxes at save time and fired one request per changed kind, with
 * no record of which were required. Here the gate is derived from session state, not from the
 * DOM, so it cannot be dismissed by unchecking and moving on.
 */

interface Question {
  readonly kind: ConsentKind;
  readonly label: string;
  readonly required: boolean;
}

const QUESTIONS: readonly Question[] = [
  { kind: 'terms', label: 'I agree to the terms', required: true },
  { kind: 'privacy', label: 'I have read the privacy policy', required: true },
  {
    kind: 'image_processing',
    label: 'I allow my photos to be analysed (deleted within 24 hours)',
    required: true,
  },
  { kind: 'model_training', label: 'Optional: allow my photos to improve the model', required: false },
];

/**
 * Each tick is its own server write. `grant` updates session state on success, so the required
 * ones all being recorded is what closes the gate — there is no separate "Continue" that could
 * dismiss it early. `pending` disables the inputs while a write is in flight so two rapid
 * clicks cannot race to the server in either order.
 */
export function ConsentGate() {
  const { me, grant } = useSession();
  const [pending, setPending] = useState<ConsentKind | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (me === null) return null;

  const missing = QUESTIONS.some((question) => question.required && me.consents[question.kind] !== true);

  const change = async (kind: ConsentKind, granted: boolean) => {
    setPending(kind);
    setError(null);
    try {
      await grant(kind, granted);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="panel" aria-labelledby="consent-title">
      <h2 id="consent-title">Before we start</h2>
      <p className="muted">
        FreshSkin uses a photo of your skin and photographs of product labels. You choose what
        we may process, and you can change this at any time.
      </p>
      {QUESTIONS.map((question) => (
        <label className="check" key={question.kind}>
          <input
            type="checkbox"
            checked={me.consents[question.kind] === true}
            disabled={pending !== null}
            onChange={(event) => void change(question.kind, event.target.checked)}
          />
          <span>{question.label}</span>
        </label>
      ))}
      {error !== null && <ErrorNote error={error} />}
      <p className="muted small" role="status">
        {pending !== null
          ? 'Recording your choice…'
          : missing
            ? 'Tick the first three to continue.'
            : 'All required choices saved.'}
      </p>
      <p className="muted small">FreshSkin is not a medical device and does not diagnose skin conditions.</p>
    </section>
  );
}
