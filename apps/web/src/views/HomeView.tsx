import { useCallback, useMemo, useState } from 'react';
import {
  CalendarCheck2,
  Check,
  Droplets,
  Flame,
  Flower2,
  Heart,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getCreams, getPerfumes, getRoutine, getSimilar } from '../api/client';
import type { ProductKind, RoutineResponse, WireItem } from '../api/types';
import { readCachedRoutine, writeCachedRoutine } from '../data/content-cache';
import { useCheckIns } from '../data/checkins';
import { useAsync } from '../data/useAsync';
import { navigate, useDocumentTitle } from '../router';
import { useSession } from '../session/SessionProvider';
import { BottomSheet } from '../ui/BottomSheet';
import { ErrorNote, Empty, SkeletonList, price } from '../ui/Async';
import { ProductDetail, ProductTile } from './ProductCard';
import { RoutineDetail, RoutinePreview } from './RoutineCard';
import { ScentQuiz } from './ScentQuiz';
import { TipsStrip } from './TipsStrip';

const QUICK_ACTIONS = [
  { kind: 'scan', label: 'Scan a label', hint: 'Photo or paste', Icon: ScanLine },
  { kind: 'cream', label: 'My creams', hint: 'For your skin', Icon: Droplets },
  { kind: 'perfume', label: 'My perfumes', hint: 'For your taste', Icon: Flower2 },
  { kind: 'saved', label: 'Saved', hint: 'Wishlist + owned', Icon: Heart },
] as const;

const GRID_INITIAL = 6;

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home (PRD S7): a hub, not a document. Five tight sections — greeting hero, week
 * overview, quick actions, daily tip ribbon, curated grid, routine preview — with depth in
 * bottom sheets (product detail, similar scents, full routine). The old page rendered all
 * of this at once: every step, every tip, every full-size card. Nothing was removed that
 * matters — reasons, breakdowns, flags, and the check-in all moved into sheets.
 *
 * Phase 3 serves the routine + tips from `GET /routine` with a localStorage fallback for
 * the non-personal payload ("showing saved data" chip); check-ins read the live summary
 * and queue offline entries for the next flush.
 */
export function HomeView() {
  const { me } = useSession();
  useDocumentTitle('Home');

  const [productKind, setProductKind] = useState<ProductKind>('cream');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [selected, setSelected] = useState<WireItem | null>(null);
  const [similarAnchor, setSimilarAnchor] = useState<WireItem | null>(null);
  const [routineOpen, setRoutineOpen] = useState(false);

  const loadRecommendations = useCallback(() => {
    if (productKind === 'cream') return getCreams({ maxPrice, limit: 10 });
    return getPerfumes(10);
  }, [productKind, maxPrice]);

  const recommendations = useAsync(loadRecommendations, [productKind, maxPrice]);

  const anchorId = similarAnchor?.product.id ?? null;
  const loadSimilar = useCallback(
    () => (anchorId === null ? null : getSimilar(anchorId)),
    [anchorId],
  );

  const similar = useAsync(loadSimilar, [anchorId]);

  const loadRoutine = useCallback(async (): Promise<RoutineResponse> => {
    try {
      const response = await getRoutine();
      writeCachedRoutine(response);
      return { data: response.data, meta: response.meta };
    } catch (caught) {
      // Offline or unreachable: render the cached non-personal payload with a chip.
      const cached = readCachedRoutine();
      if (cached === null) throw caught;
      return { data: cached.data, meta: { request_id: 'cache' } };
    }
  }, []);

  const routine = useAsync(loadRoutine, []);
  const checkins = useCheckIns();

  const applyPrice = () => {
    const parsed = Number(maxPriceInput);
    setMaxPrice(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    setShowAll(false);
  };

  const switchKind = (kind: ProductKind) => {
    setProductKind(kind);
    setShowAll(false);
    setSelected(null);
    setSimilarAnchor(null);
    setQuizOpen(false);
  };

  const quizNeeded = productKind === 'perfume' && me?.has_fragrance_profile !== true;

  const items = useMemo(
    () => recommendations.data?.data.items ?? [],
    [recommendations.data],
  );
  const visible = showAll ? items : items.slice(0, GRID_INITIAL);

  const sheetFor = similarAnchor ?? selected;

  return (
    <section aria-labelledby="home-title">
      <header className="home-greet">
        <p className="kicker">FreshSkin · Lagos</p>
        <h2 id="home-title">{greeting(new Date())}.</h2>
        <p className="muted">Know what is inside — scan a label or browse picks for you.</p>
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
            <button
              className="ghost"
              onClick={() => switchKind(productKind === 'cream' ? 'perfume' : 'cream')}
            >
              {productKind === 'cream' ? 'Browse scents' : 'Browse creams'}
            </button>
          )}
        </div>
      </header>

      <OverviewStrip
        loading={checkins.loading}
        loggedToday={checkins.summary?.checked_in_today ?? false}
        streak={checkins.summary?.streak_days ?? 0}
        onOpen={() => setRoutineOpen(true)}
      />

      <nav className="quick-grid" aria-label="Start with">
        {QUICK_ACTIONS.map(({ kind, label, hint, Icon }) => (
          <button
            key={kind}
            type="button"
            className="quick-card"
            aria-pressed={kind === productKind}
            onClick={() => {
              if (kind === 'scan') {
                navigate('scan');
                return;
              }
              if (kind === 'saved') {
                navigate('saved');
                return;
              }
              switchKind(kind);
            }}
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

      {routine.data !== null && (
        <>
          {routine.data.meta.request_id === 'cache' && (
            <p className="muted small sync-note" role="status">
              Showing saved data — connect to refresh.
            </p>
          )}
          <RoutinePreview routine={routine.data.data} onOpen={() => setRoutineOpen(true)} />
          <TipsStrip tips={routine.data.data.tips} />
        </>
      )}
      {routine.loading && <SkeletonList />}
      {routine.error !== null && routine.data === null && (
        <ErrorNote error={routine.error} />
      )}

      <div className="section-head">
        <div>
          <p className="kicker">Curated for you</p>
          <h2>{productKind === 'cream' ? 'Creams that fit your skin' : 'Scents that fit your taste'}</h2>
        </div>
        <div className="segmented" role="group" aria-label="Product kind">
          <button
            className="seg"
            aria-pressed={productKind === 'cream'}
            onClick={() => switchKind('cream')}
          >
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

      {quizNeeded && !quizOpen && (
        <button type="button" className="quiz-banner" onClick={() => setQuizOpen(true)}>
          <Sparkles size={16} aria-hidden="true" />
          <span>
            <strong>Make it personal</strong>
            <span className="muted small"> — 30 seconds tunes picks to you</span>
          </span>
        </button>
      )}

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
        {recommendations.loading ? (
          <SkeletonList />
        ) : recommendations.error !== null ? (
          <ErrorNote error={recommendations.error} />
        ) : recommendations.data === null ? null : (
          <>
            {items.length === 0 ? (
              <Empty title="No matches yet">
                Nothing matched those filters. Try raising the price.
              </Empty>
            ) : (
              <>
                <div className="tile-grid">
                  {visible.map((item, index) => (
                    <ProductTile
                      key={item.recommendation_id}
                      item={item}
                      kind={productKind}
                      index={index}
                      onOpen={() => {
                        setSimilarAnchor(null);
                        setSelected(item);
                      }}
                    />
                  ))}
                </div>
                {items.length > GRID_INITIAL && (
                  <button
                    type="button"
                    className="ghost small show-more"
                    onClick={() => setShowAll((value) => !value)}
                  >
                    {showAll ? 'Show less' : `Show all ${items.length}`}
                  </button>
                )}
              </>
            )}
            <SafetyNote data={recommendations.data.data} />
          </>
        )}
      </div>

      <BottomSheet
        open={selected !== null || similarAnchor !== null}
        title={
          similarAnchor !== null && similar.data !== null
            ? `Like ${similar.data.data.anchor.name}`
            : (sheetFor?.product.name ?? 'Details')
        }
        onClose={() => {
          setSelected(null);
          setSimilarAnchor(null);
        }}
      >
        {similarAnchor !== null ? (
          similar.loading ? (
            <SkeletonList />
          ) : similar.error !== null ? (
            <ErrorNote error={similar.error} />
          ) : similar.data !== null ? (
            <>
              <button
                type="button"
                className="ghost small"
                onClick={() => setSimilarAnchor(null)}
              >
                Back to details
              </button>
              {similar.data.data.results.length === 0 ? (
                <Empty title="Nothing close yet">
                  No close matches in the catalogue yet.
                </Empty>
              ) : (
                similar.data.data.results.map((entry) => (
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
                ))
              )}
            </>
          ) : null
        ) : (
          sheetFor !== null && (
            <ProductDetail
              item={sheetFor}
              kind={productKind}
              onShowSimilar={() => setSimilarAnchor(sheetFor)}
            />
          )
        )}
      </BottomSheet>

      <BottomSheet
        open={routineOpen}
        title={routine.data?.data.routine.title ?? 'Your routine'}
        onClose={() => setRoutineOpen(false)}
      >
        {routine.data !== null && (
          <RoutineDetail routine={routine.data.data} checkins={checkins} />
        )}
      </BottomSheet>
    </section>
  );
}

function OverviewStrip({
  loading,
  loggedToday,
  streak,
  onOpen,
}: {
  readonly loading: boolean;
  readonly loggedToday: boolean;
  readonly streak: number;
  readonly onOpen: () => void;
}) {
  return (
    <button type="button" className="overview" onClick={onOpen} aria-label="Open your routine">
      <span className="overview-icon" aria-hidden="true">
        <CalendarCheck2 size={20} aria-hidden="true" />
      </span>
      <span className="overview-text">
        <strong>
          {loading ? 'Checking your week…' : loggedToday ? 'Week logged' : 'This week: not yet'}
        </strong>
        <span className="muted small">
          {loading ? (
            'One moment'
          ) : loggedToday ? (
            <>
              <Check size={12} aria-hidden="true" /> Keep it up
              {streak > 1 && ` — ${streak} weeks in a row`}
            </>
          ) : (
            'Log your routine to start a streak'
          )}
        </span>
        <span className="progress-line" aria-hidden="true">
          <span style={{ width: loggedToday ? '100%' : streak > 0 ? '40%' : '0%' }} />
        </span>
      </span>
      {streak > 1 && (
        <span className="streak-pill" aria-label={`${streak} week streak`}>
          <Flame size={12} aria-hidden="true" /> {streak}
        </span>
      )}
    </button>
  );
}

function SafetyNote({ data }: { readonly data: { readonly excluded: readonly { readonly product_id: string; readonly name: string; readonly reason: string }[] } }) {
  if (data.excluded.length === 0) return null;
  return (
    <details className="panel excluded">
      <summary>
        <ShieldCheck size={14} aria-hidden="true" /> Hidden for your safety (
        {data.excluded.length})
      </summary>
      {data.excluded.map((entry) => (
        <p className="muted small" key={entry.product_id}>
          {entry.name}: {entry.reason}
        </p>
      ))}
    </details>
  );
}
