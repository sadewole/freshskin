import { useState } from 'react';
import { ArrowRight, Droplets, Flower2, Heart } from 'lucide-react';
import { motion } from 'motion/react';
import { saveItem } from '../api/client';
import type { ProductKind, WireItem, WireProduct } from '../api/types';
import { price } from '../ui/Async';
import { DUR_MED, EASE } from '../ui/motion';

function KindIcon({ kind }: { readonly kind: ProductKind }) {
  return kind === 'perfume' ? (
    <Flower2 size={24} aria-hidden="true" />
  ) : (
    <Droplets size={24} aria-hidden="true" />
  );
}

/**
 * Forward-compatible thumb: the wire has no image field yet (see the old placeholder
 * comment), so tiles render the kind icon until the catalogue carries `image_url` — then
 * the photo shows, with the icon as the broken/missing fallback via onError.
 */
function Thumb({ kind, product }: { readonly kind: ProductKind; readonly product: WireProduct }) {
  const imageUrl = (product as { readonly image_url?: unknown }).image_url;
  const [imgOk, setImgOk] = useState(typeof imageUrl === 'string' && imageUrl.length > 0);
  return (
    <span className="tile-thumb" aria-hidden="true">
      {imgOk && typeof imageUrl === 'string' ? (
        <img src={imageUrl} alt="" loading="lazy" onError={() => setImgOk(false)} />
      ) : (
        <KindIcon kind={kind} />
      )}
    </span>
  );
}

interface TileProps {
  readonly item: WireItem;
  readonly kind: ProductKind;
  readonly index: number;
  readonly onOpen: () => void;
}

/**
 * Compact grid cell: photo-or-icon, name, price, score pill, top flag. Everything else
 * (reason, breakdown, flags, actions) lives in `ProductDetail` inside the bottom sheet.
 */
export function ProductTile({ item, kind, index, onOpen }: TileProps) {
  const { product } = item;
  const score = Math.round(item.score);

  return (
    <motion.button
      type="button"
      className="tile"
      onClick={onOpen}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR_MED, ease: EASE, delay: Math.min(index * 0.05, 0.3) }}
      whileTap={{ scale: 0.97 }}
      aria-label={`${product.name}, ${price(product.price_ngn)}, match score ${score} out of 100`}
    >
      <Thumb kind={kind} product={product} />
      <span className="tile-name">{product.name}</span>
      <span className="tile-row">
        <span className="muted small">{price(product.price_ngn)}</span>
        <span
          className={`score-pill${score >= 80 ? ' high' : score >= 60 ? ' mid' : ''}`}
          aria-hidden="true"
        >
          {score}
        </span>
      </span>
      {item.flags.length > 0 && (
        <span className="tile-flag">{item.flags[0]?.replace(/_/g, ' ')}</span>
      )}
    </motion.button>
  );
}

interface DetailProps {
  readonly item: WireItem;
  readonly kind: ProductKind;
  readonly onShowSimilar: () => void;
}

/**
 * Full recommendation detail, rendered inside the bottom sheet. Carries the reason, the
 * score breakdown, flags, and actions — the explain-or-omit principle moved off the list,
 * not removed.
 */
export function ProductDetail({ item, kind, onShowSimilar }: DetailProps) {
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
        <div className="product-thumb" aria-hidden="true">
          <KindIcon kind={kind} />
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
        {kind === 'perfume' && (
          <button className="ghost small with-icon" onClick={onShowSimilar}>
            Similar scents <ArrowRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
