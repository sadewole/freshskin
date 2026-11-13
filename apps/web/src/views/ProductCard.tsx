import { useState } from 'react';
import { saveItem } from '../api/client';
import type { ProductKind, WireItem } from '../api/types';
import { price } from '../ui/Async';

interface Props {
  readonly item: WireItem;
  readonly kind: ProductKind;
  readonly onShowSimilar?: (productId: string) => void;
}

/**
 * One recommendation. Every card carries its reason and its score breakdown, per the
 * product principle "explain or omit" — the breakdown is the inputs behind the score, so it
 * is always available rather than only on request.
 */
export function ProductCard({ item, kind, onShowSimilar }: Props) {
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const product = item.product;

  const terms = Object.entries(item.breakdown);

  const onSave = async () => {
    setSaveState('saving');
    try {
      await saveItem(product.id, 'wishlist');
      setSaveState('saved');
    } catch {
      setSaveState('failed');
    }
  };

  return (
    <article className="card">
      <div className="card-head">
        <h3>{product.name}</h3>
        {/* `score` is already 0–100 on the wire. */}
        <span className="score" aria-label={`Match score ${Math.round(item.score)} out of 100`}>
          {Math.round(item.score)}
        </span>
      </div>
      <p className="muted small">
        {product.brand} · {kind} · {price(product.price_ngn)}
      </p>
      <p>{item.reason}</p>
      {item.flags.length > 0 && (
        <p className="small">
          {item.flags.map((flag) => (
            <span className="chip chip-static" key={flag}>
              {flag.replace(/_/g, ' ')}
            </span>
          ))}
        </p>
      )}
      {terms.length > 0 && (
        <details>
          <summary className="muted small">How this was calculated</summary>
          <p className="muted small">
            {terms.map(([key, value]) => `${key.replace(/_/g, ' ')} ${Math.round(value * 100)}`).join(' · ')}
          </p>
        </details>
      )}
      <div className="row">
        <button
          className="secondary small"
          disabled={saveState !== 'idle'}
          onClick={() => void onSave()}
        >
          {saveState === 'saved'
            ? 'Saved'
            : saveState === 'saving'
              ? 'Saving…'
              : saveState === 'failed'
                ? 'Try again'
                : 'Save'}
        </button>
        {kind === 'perfume' && onShowSimilar !== undefined && (
          <button className="ghost small" onClick={() => onShowSimilar(product.id)}>
            Similar scents
          </button>
        )}
      </div>
    </article>
  );
}
