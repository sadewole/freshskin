import { Check, Heart } from 'lucide-react';
import { getSaved, removeSaved } from '../api/client';
import { useAsync } from '../data/useAsync';
import { useDocumentTitle } from '../router';
import { Empty, ErrorNote, SkeletonList, price } from '../ui/Async';

export function SavedView() {
  useDocumentTitle('Saved');
  const saved = useAsync(getSaved, []);

  const remove = async (productId: string, list: 'wishlist' | 'owned') => {
    await removeSaved(productId, list);
    saved.reload();
  };

  return (
    <section aria-labelledby="saved-title">
      <div className="hero">
        <p className="kicker">Your shelf</p>
        <h2 id="saved-title">Saved for later.</h2>
      </div>
      <div aria-live="polite">
        {saved.loading && <SkeletonList />}
        {saved.error !== null && <ErrorNote error={saved.error} />}
        {saved.data !== null && saved.data.data.items.length === 0 && (
          <Empty title="Nothing saved yet">
            Tap Save on any recommendation and it will wait for you here.
          </Empty>
        )}
        {saved.data?.data.items.map((item) => (
          <article className="card" key={`${item.product_id}-${item.list}`}>
            <div className="product-main">
              <div className="product-thumb" aria-hidden="true">
                {item.list === 'owned' ? (
                  <Check size={22} aria-hidden="true" />
                ) : (
                  <Heart size={22} aria-hidden="true" />
                )}
              </div>
              <div className="product-head">
                <div className="card-head">
                  <h3>{item.name}</h3>
                </div>
                <p className="muted small product-meta">
                  {item.brand} · {item.list} · {price(item.price_ngn)}
                </p>
              </div>
            </div>
            <div className="row product-actions">
              <button
                className="ghost small"
                onClick={() => {
                  void remove(item.product_id, item.list).catch(() => saved.reload());
                }}
              >
                Remove
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
