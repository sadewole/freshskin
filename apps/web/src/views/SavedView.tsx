import { getSaved, removeSaved } from '../api/client';
import { useAsync } from '../data/useAsync';
import { useDocumentTitle } from '../router';
import { Empty, ErrorNote, Loading, price } from '../ui/Async';

export function SavedView() {
  useDocumentTitle('Saved');
  const saved = useAsync(getSaved, []);

  const remove = async (productId: string, list: 'wishlist' | 'owned') => {
    await removeSaved(productId, list);
    saved.reload();
  };

  return (
    <section aria-labelledby="saved-title">
      <h2 id="saved-title">Saved</h2>
      <div aria-live="polite">
        {saved.loading && <Loading />}
        {saved.error !== null && <ErrorNote error={saved.error} />}
        {saved.data !== null && saved.data.data.items.length === 0 && (
          <Empty>Nothing saved yet.</Empty>
        )}
        {saved.data?.data.items.map((item) => (
          <article className="card" key={`${item.product_id}-${item.list}`}>
            <h3>{item.name}</h3>
            <p className="muted small">
              {item.brand} · {item.list} · {price(item.price_ngn)}
            </p>
            <button
              className="ghost small"
              onClick={() => {
                void remove(item.product_id, item.list).catch(() => saved.reload());
              }}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
