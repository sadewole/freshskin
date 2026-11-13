import { useState } from 'react';
import { ApiError, completeScanFromText, createScan } from '../api/client';
import type { ScanResponse, ScanVerdict } from '../api/types';
import { useDocumentTitle } from '../router';
import { ErrorNote } from '../ui/Async';

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

  const [text, setText] = useState('');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });

  const run = async () => {
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
        // 404 means the dev endpoints are off: the scan is queued for the real worker, which
        // is a normal state, not an error.
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

  return (
    <section aria-labelledby="scan-title">
      <h2 id="scan-title">Scan an ingredient label</h2>
      <p className="muted">
        Type or paste the ingredients exactly as printed. The photo pipeline is not connected
        yet, so this screen feeds the same matcher the worker will use.
      </p>
      <textarea
        rows={6}
        placeholder="Ingredients: Aqua, Glycerin, Fragrance, ..."
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Ingredient list"
      />
      <div className="row">
        <button className="primary" disabled={state.kind === 'running'} onClick={() => void run()}>
          {state.kind === 'running' ? 'Reading label…' : 'Check this label'}
        </button>
      </div>

      <div aria-live="polite">
        {state.kind === 'queued' && (
          <p className="muted small">
            The OCR worker is not connected yet, so this scan stays queued.
          </p>
        )}
        {state.kind === 'error' && <ErrorNote error={state.error} />}
        {state.kind === 'result' && <Verdict result={state.result} />}
      </div>
    </section>
  );
}

function Verdict({ result }: { readonly result: ScanResponse['data'] }) {
  const verdictClass = result.verdict ?? 'unknown';
  return (
    <article className={`verdict ${verdictClass}`}>
      <h3>{VERDICT_COPY[verdictClass]}</h3>
      <p>{result.summary}</p>
      <p className="muted small">
        {Math.round(result.match_rate)}% of the label recognised ({result.matched_count} ingredients)
      </p>
      {result.findings.map((finding) => (
        <p className="finding" key={`${finding.label}-${finding.severity}`}>
          <strong>{finding.label}</strong> — {finding.reason}
        </p>
      ))}
      {result.retake.needed && result.retake.reason !== null && (
        <p className="muted small">
          Try again with the full list in brighter light ({result.retake.reason.replace(/_/g, ' ')}).
        </p>
      )}
    </article>
  );
}
