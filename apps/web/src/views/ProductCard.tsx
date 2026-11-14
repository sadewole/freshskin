import { useState } from 'react';
import { ArrowRight, Droplets, Flower2, Heart } from 'lucide-react';
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

  const score = Math.round(item.score);

  return (
    <article className="card product">
      <div className="product-main">
        {/* Neutral placeholder until the catalogue carries product imagery. */}
        <div className="product-thumb" aria-hidden="true">
          {kind === 'perfume' ? (
            <Flower2 size={22} aria-hidden="true" />
          ) : (
            <Droplets size={22} aria-hidden="true" />
          )}
        </div>
        <div className="product-head">
          <div className="card-head">
            <h3>{product.name}</h3>
            {/* `score` is already 0–100 on the wire. */}
            <span
              className={`score-pill${score >= 80 ? ' high' : score >= 60 ? ' mid' : ''}`}
              aria-label={`Match score ${score} out of 100`}
            >
              {score}
            </span>
          </div>
          <p className="muted small product-meta">
            {product.brand} · {kind} · {price(product.price_ngn)}
          </p>
        </div>
      </div>
      <p className="product-reason">{item.reason}</p>
      {item.flags.length > 0 && (
        <p className="small product-flags">
          {item.flags.map((flag) => (
            <span className="flag" key={flag}>
              {flag.replace(/_/g, ' ')}
            </span>
          ))}
        </p>
      )}
      {terms.length > 0 && (
        <details className="breakdown">
          <summary className="muted small">How this was calculated</summary>
          <ul>
            {terms.map(([key, value]) => (
              <li key={key}>
                <span className="breakdown-label">{key.replace(/_/g, ' ')}</span>
                <span className="breakdown-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(value * 100)}%` }} />
                </span>
                <span className="breakdown-value">{Math.round(value * 100)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="row product-actions">
        <button
          className="secondary small with-icon"
          disabled={saveState !== 'idle'}
          onClick={() => void onSave()}
        >
          {saveState === 'saved' ? (
            <>
              <Heart size={14} fill="currentColor" aria-hidden="true" /> Saved
            </>
          ) : saveState === 'saving' ? (
            'Saving…'
          ) : saveState === 'failed' ? (
            'Try again'
          ) : (
            <>
              <Heart size={14} aria-hidden="true" /> Save
            </>
          )}
        </button>
        {kind === 'perfume' && onShowSimilar !== undefined && (
          <button className="ghost small with-icon" onClick={() => onShowSimilar(product.id)}>
            Similar scents <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
