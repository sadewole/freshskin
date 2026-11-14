import { useCallback, useState, type ReactNode } from 'react';
import { Droplets, Flower2, Heart, ScanLine, ShieldCheck, Sparkles } from 'lucide-react';
import { getCreams, getPerfumes, getSimilar } from '../api/client';
import type { ProductKind, SimilarResponse } from '../api/types';
import { useAsync } from '../data/useAsync';
import { navigate, useDocumentTitle } from '../router';
import { useSession } from '../session/SessionProvider';
import { ErrorNote, Empty, SkeletonList } from '../ui/Async';
import { ProductCard } from './ProductCard';
import { ScentQuiz } from './ScentQuiz';

type Pane =
  | { readonly kind: 'results' }
  | { readonly kind: 'similar'; readonly productId: string };

const QUICK_ACTIONS = [
  { kind: 'scan', label: 'Scan a label', hint: 'Photo or paste', Icon: ScanLine },
  { kind: 'cream', label: 'My creams', hint: 'For your skin', Icon: Droplets },
  { kind: 'perfume', label: 'My perfumes', hint: 'For your taste', Icon: Flower2 },
  { kind: 'saved', label: 'Saved', hint: 'Wishlist + owned', Icon: Heart },
] as const;

/**
 * Home (PRD S7): orient returning users — profile summary, next actions, recent results.
 *
 * Layout borrows the reference patterns (hero CTA + action grid + curated picks) without
 * their commerce chrome: no cart, no deals carousel, no category shop. Every section maps
 * to a PRD element: hero → "scan a product", grid → creams/perfumes/saved, list → results.
 */
export function HomeView() {
  const { me } = useSession();
  useDocumentTitle('Home');

  const [productKind, setProductKind] = useState<ProductKind>('cream');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [pane, setPane] = useState<Pane>({ kind: 'results' });
  const [quizOpen, setQuizOpen] = useState(false);

  const loadRecommendations = useCallback(() => {
    if (productKind === 'cream') return getCreams({ maxPrice, limit: 10 });
    return getPerfumes(10);
  }, [productKind, maxPrice]);

  const recommendations = useAsync(loadRecommendations, [productKind, maxPrice]);

  const anchorId = pane.kind === 'similar' ? pane.productId : null;
  const loadSimilar = useCallback(
    () => (anchorId === null ? null : getSimilar(anchorId)),
    [anchorId],
  );

  const similar = useAsync(loadSimilar, [anchorId]);

  const switchKind = (kind: ProductKind) => {
    setProductKind(kind);
    setPane({ kind: 'results' });
    setQuizOpen(false);
  };

  const applyPrice = () => {
    const parsed = Number(maxPriceInput);
    setMaxPrice(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    setPane({ kind: 'results' });
  };

  const quizNeeded = productKind === 'perfume' && me?.has_fragrance_profile !== true;

  const runQuickAction = (kind: (typeof QUICK_ACTIONS)[number]['kind']) => {
    if (kind === 'scan') {
      navigate('scan');
      return;
    }
    if (kind === 'saved') {
      navigate('saved');
      return;
    }
    switchKind(kind);
  };

  return (
    <section aria-labelledby="home-title">
      <div className="home-hero">
        <p className="kicker">FreshSkin · Lagos</p>
        <h2 id="home-title">Know what is inside.</h2>
        <p className="muted">
          Scan any ingredient label, or get creams and scents that fit you. Every pick shows
          why it was chosen and what it costs.
        </p>
        <div className="home-hero-cta">
          <button className="primary with-icon" onClick={() => navigate('scan')}>
            <ScanLine size={16} aria-hidden="true" />
            Scan a product
          </button>
          {quizNeeded ? (
            <button className="ghost" onClick={() => setQuizOpen(true)}>
              Take the scent quiz
            </button>
          ) : (
            <button className="ghost" onClick={() => switchKind(productKind === 'cream' ? 'perfume' : 'cream')}>
              {productKind === 'cream' ? 'Browse scents' : 'Browse creams'}
            </button>
          )}
        </div>
        <ul className="trust-row" aria-label="Why FreshSkin">
          <li>
            <ShieldCheck size={14} aria-hidden="true" /> Safety first
          </li>
          <li>
            <Sparkles size={14} aria-hidden="true" /> Every score explained
          </li>
        </ul>
      </div>

      <nav className="quick-grid" aria-label="Start with">
        {QUICK_ACTIONS.map(({ kind, label, hint, Icon }) => (
          <button
            key={kind}
            type="button"
            className="quick-card"
            aria-pressed={kind === productKind}
            onClick={() => runQuickAction(kind)}
          >
            <span className="quick-icon" aria-hidden="true">
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="quick-text">
              <strong>{label}</strong>
              <span className="muted small">{hint}</span>
            </span>
          </button>
        ))}
      </nav>

      {quizOpen && (
        <ScentQuiz
          onSaved={() => {
            setQuizOpen(false);
            recommendations.reload();
          }}
          onCancel={() => setQuizOpen(false)}
        />
      )}

      <div className="section-head">
        <div>
          <p className="kicker">Curated for you</p>
          <h2>{productKind === 'cream' ? 'Creams that fit your skin' : 'Scents that fit your taste'}</h2>
        </div>
        <div className="segmented" role="group" aria-label="Product kind">
          <button className="seg" aria-pressed={productKind === 'cream'} onClick={() => switchKind('cream')}>
            Creams
          </button>
          <button
            className="seg"
            aria-pressed={productKind === 'perfume'}
            onClick={() => switchKind('perfume')}
          >
            Perfumes
          </button>
        </div>
      </div>

      <div className="row filter-row">
        <label className="filter">
          Max price ₦
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            placeholder="any"
            value={maxPriceInput}
            onChange={(event) => setMaxPriceInput(event.target.value)}
            onBlur={applyPrice}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyPrice();
            }}
          />
        </label>
      </div>

      <div aria-live="polite">
        {pane.kind === 'similar' ? (
          <SimilarPane result={similar.data} loading={similar.loading} error={similar.error}>
            <button className="ghost small" onClick={() => setPane({ kind: 'results' })}>
              Back to {productKind === 'cream' ? 'creams' : 'perfumes'}
            </button>
          </SimilarPane>
        ) : (
          <RecommendationPane
            loading={recommendations.loading}
            error={recommendations.error}
            data={recommendations.data}
            productKind={productKind}
            onShowSimilar={(productId) => setPane({ kind: 'similar', productId })}
            showQuizPrompt={quizNeeded && !quizOpen}
            onOpenQuiz={() => setQuizOpen(true)}
          />
        )}
      </div>
    </section>
  );
}

interface RecommendationPaneProps {
  readonly loading: boolean;
  readonly error: unknown;
  readonly data: Awaited<ReturnType<typeof getPerfumes>> | null;
  readonly productKind: ProductKind;
  readonly onShowSimilar: (productId: string) => void;
  readonly showQuizPrompt: boolean;
  readonly onOpenQuiz: () => void;
}

function RecommendationPane({
  loading,
  error,
  data,
  productKind,
  onShowSimilar,
  showQuizPrompt,
  onOpenQuiz,
}: RecommendationPaneProps) {
  if (loading) return <SkeletonList />;
  if (error !== null) return <ErrorNote error={error} />;
  if (data === null) return null;

  const { items, excluded } = data.data;

  return (
    <>
      {items.length === 0 ? (
        <Empty title="No matches yet">
          Nothing matched those filters. Try raising the price.
        </Empty>
      ) : (
        items.map((item) => (
          <ProductCard key={item.recommendation_id} item={item} kind={productKind} onShowSimilar={onShowSimilar} />
        ))
      )}

      {excluded.length > 0 && (
        <details className="panel excluded">
          <summary>
            <ShieldCheck size={14} aria-hidden="true" /> Hidden for your safety ({excluded.length})
          </summary>
          {excluded.map((entry) => (
            <p className="muted small" key={entry.product_id}>
              {entry.name}: {entry.reason}
            </p>
          ))}
        </details>
      )}

      {showQuizPrompt && (
        <div className="card quiz-nudge">
          <h3>Make it personal</h3>
          <p className="muted small">
            A 30-second quiz tunes perfume picks to the families you love.
          </p>
          <button className="primary small" onClick={onOpenQuiz}>
            Take the scent quiz
          </button>
        </div>
      )}
    </>
  );
}

interface SimilarPaneProps {
  readonly result: SimilarResponse | null;
  readonly loading: boolean;
  readonly error: unknown;
  readonly children: ReactNode;
}

function SimilarPane({ result, loading, error, children }: SimilarPaneProps) {
  if (loading) return <SkeletonList />;
  if (error !== null) return <ErrorNote error={error} />;
  if (result === null) return null;

  return (
    <>
      {children}
      <h2>Like {result.data.anchor.name}</h2>
      {result.data.results.length === 0 && (
        <Empty title="Nothing close yet">No close matches in the catalogue yet.</Empty>
      )}
      {result.data.results.map((entry) => (
        <article className="card" key={entry.product_id}>
          <div className="product-main">
            <div className="product-thumb" aria-hidden="true">
              <Flower2 size={22} aria-hidden="true" />
            </div>
            <div className="product-head">
              <h3>{entry.name}</h3>
              <p className="muted small product-meta">
                {entry.label.replace(/_/g, ' ')} · {entry.price_ngn === null ? '—' : `₦${entry.price_ngn.toLocaleString('en-NG')}`}
              </p>
            </div>
          </div>
          <p className="small product-reason">
            Shared notes: {entry.shared_notes.join(', ') || 'none'}
          </p>
        </article>
      ))}
    </>
  );
}
