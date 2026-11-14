import { useCallback, useState, type ReactNode } from 'react';
import { Flower2, ShieldCheck } from 'lucide-react';
import { getCreams, getPerfumes, getSimilar } from '../api/client';
import type { ProductKind, SimilarResponse } from '../api/types';
import { useAsync } from '../data/useAsync';
import { useDocumentTitle } from '../router';
import { useSession } from '../session/SessionProvider';
import { ErrorNote, Empty, SkeletonList, price } from '../ui/Async';
import { ProductCard } from './ProductCard';
import { ScentQuiz } from './ScentQuiz';

type Pane =
  | { readonly kind: 'results' }
  | { readonly kind: 'similar'; readonly productId: string };

/**
 * Home: the recommendation list, the kind toggle, the price filter, and the scent quiz.
 *
 * State that used to be scattered — `state.kind`, `state.maxPrice`, plus whatever `#quiz`
 * was hidden to — is now explicit component state. `pane` replaces the old trick of
 * rewriting `#results` with a totally different screen for "similar scents".
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

  return (
    <section aria-labelledby="home-title">
      <div className="hero">
        <p className="kicker">For you</p>
        <h2 id="home-title">
          {productKind === 'cream' ? 'Creams that fit your skin.' : 'Scents that fit your taste.'}
        </h2>
        <p className="muted small">
          Every pick shows why it was chosen — and what it costs in Lagos.
        </p>
      </div>

      <div className="row">
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

      {quizOpen && (
        <ScentQuiz
          onSaved={() => {
            setQuizOpen(false);
            recommendations.reload();
          }}
          onCancel={() => setQuizOpen(false)}
        />
      )}

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
                {entry.label.replace(/_/g, ' ')} · {price(entry.price_ngn)}
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
