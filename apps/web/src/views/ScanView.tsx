import { useState } from 'react';
import { ArrowRight, Camera, CircleHelp, Clock, Info, TriangleAlert, Type } from 'lucide-react';
import { motion } from 'motion/react';
import { ApiError, completeScanFromText, createScan } from '../api/client';
import type { ScanResponse, ScanVerdict } from '../api/types';
import { useDocumentTitle } from '../router';
import { ErrorNote } from '../ui/Async';
import { verdictEnter } from '../ui/motion';
import { LabelCapture } from '../scan/LabelCapture';
import type { ProcessedPhoto } from '../scan/capture';

type ScanState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | { readonly kind: 'queued' }
  | { readonly kind: 'result'; readonly result: ScanResponse['data'] }
  | { readonly kind: 'error'; readonly error: unknown };

const VERDICT_COPY: Record<'unknown' | ScanVerdict, string> = {
  good: 'A good match for you',
  okay: 'Worth a look',
  avoid: 'Contains something you should avoid',
  unknown: 'Could not read this label',
};

/**
 * The ingredient-label screen. Typing or pasting the label runs the real matcher through the
 * development completion endpoint; the photo pipeline that will call it in production is not
 * connected yet.
 *
 * The old shell sent `undefined` as the scan id because it guessed at `scanId`/`data.scanId`.
 * The server answers `{ scanId }`; `createScan` is typed to match so the compiler catches a
 * rename rather than the request silently 404ing.
 */
export function ScanView() {
  useDocumentTitle('Scan');

  const [mode, setMode] = useState<'photo' | 'text'>('photo');
  const [text, setText] = useState('');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });

  // Reads a paste through the same matcher the worker will feed. `createScan` registers the
  // row (and its image_processing consent check); the 404 means the dev endpoints are off,
  // which is a normal queued state, not an error.
  const runText = async () => {
    if (text.trim().length < 5) {
      setState({ kind: 'error', error: new Error('Paste the ingredient list first.') });
      return;
    }
    setState({ kind: 'running' });
    try {
      const scan = await createScan('ingredient_label');
      try {
        const response = await completeScanFromText(scan.scanId, text.trim());
        setState({ kind: 'result', result: response.data });
      } catch (caught) {
        if (caught instanceof ApiError && caught.status === 404) {
          setState({ kind: 'queued' });
          return;
        }
        throw caught;
      }
    } catch (caught) {
      setState({ kind: 'error', error: caught });
    }
  };

  // The reading pipeline is not connected yet, so a photo cannot be judged — only registered
  // against the same lifecycle the worker will pick up. Anything but a 404 here is a real
  // failure; the 404 path is the honest one: the scan waits for the worker.
  const usePhoto = async (photo: ProcessedPhoto) => {
    void photo;
    setState({ kind: 'running' });
    try {
      await createScan('ingredient_label');
      setState({ kind: 'queued' });
    } catch (caught) {
      setState({ kind: 'error', error: caught });
    }
  };

  return (
    <section aria-labelledby="scan-title">
      <div className="hero">
        <p className="kicker">Ingredient check</p>
        <h2 id="scan-title">Is this safe for your skin?</h2>
        <p className="muted small">
          Photograph the ingredients list, or paste it exactly as printed. The photo is checked
          on this phone and stays here until the reading pipeline is connected.
        </p>
      </div>
      <div className="segmented scan-mode" role="group" aria-label="How to give the label">
        <button
          className="seg"
          aria-pressed={mode === 'photo'}
          onClick={() => setMode('photo')}
          disabled={state.kind === 'running'}
        >
          <Camera size={16} aria-hidden="true" />
          <span>Photo</span>
        </button>
        <button
          className="seg"
          aria-pressed={mode === 'text'}
          onClick={() => setMode('text')}
          disabled={state.kind === 'running'}
        >
          <Type size={16} aria-hidden="true" />
          <span>Paste text</span>
        </button>
      </div>

      {mode === 'photo' ? (
        <LabelCapture onUsePhoto={(photo) => void usePhoto(photo)} sending={state.kind === 'running'} />
      ) : (
        <div className="card scan-input">
          <textarea
            rows={5}
            placeholder="Ingredients: Aqua, Glycerin, Fragrance, ..."
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-label="Ingredient list"
          />
          <button className="primary with-icon" disabled={state.kind === 'running'} onClick={() => void runText()}>
            {state.kind === 'running' ? 'Reading label…' : 'Check this label'}
            {state.kind === 'running' ? null : <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
      )}

      <div aria-live="polite">
        {state.kind === 'running' && mode === 'photo' && (
          <p className="muted small" role="status">
            Saving your scan…
          </p>
        )}
        {state.kind === 'queued' && (
          <div className="card empty">
            <p className="empty-mark" aria-hidden="true">
              <Clock size={24} aria-hidden="true" />
            </p>
            <h3>Scan saved</h3>
            <p className="muted">
              Your scan is waiting for the reading pipeline, which is not connected yet. The
              photo stays on this phone; nothing was uploaded.
            </p>
          </div>
        )}
        {state.kind === 'error' && <ErrorNote error={state.error} />}
        {state.kind === 'result' && <Verdict result={state.result} />}
      </div>
    </section>
  );
}

const VERDICT_ICON: Record<'unknown' | ScanVerdict, typeof Info> = {
  good: Info,
  okay: Info,
  avoid: TriangleAlert,
  unknown: CircleHelp,
};

function Verdict({ result }: { readonly result: ScanResponse['data'] }) {
  const verdictClass = result.verdict ?? 'unknown';
  const Mark = VERDICT_ICON[verdictClass];
  const matchPct = Math.round(result.match_rate);
  return (
    <motion.article className={`card verdict ${verdictClass}`} {...verdictEnter}>
      <div className="verdict-head">
        <span className="verdict-mark" aria-hidden="true">
          <Mark size={18} aria-hidden="true" />
        </span>
        <h3>{VERDICT_COPY[verdictClass]}</h3>
      </div>
      <p className="verdict-summary">{result.summary}</p>
      <div className="match-meter">
        <div className="match-bar" aria-hidden="true">
          <span style={{ width: `${matchPct}%` }} />
        </div>
        <p className="muted small">
          {matchPct}% recognised ({result.matched_count} ingredients)
        </p>
      </div>
      {result.findings.length > 0 && (
        <ul className="findings">
          {result.findings.map((finding) => (
            <li className={`finding ${finding.severity}`} key={`${finding.label}-${finding.severity}`}>
              <strong>{finding.label}</strong>
              <span>{finding.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {result.retake.needed && result.retake.reason !== null && (
        <p className="muted small retake">
          Try again with the full list in brighter light ({result.retake.reason.replace(/_/g, ' ')}).
        </p>
      )}
    </motion.article>
  );
}
