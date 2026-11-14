import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { ApiError } from '../api/client';

/**
 * One place for the loading / error / empty triple that every data view needs. The old shell
 * open-coded this in five places, in three different styles.
 */

export function Loading({ label = 'Loading…' }: { readonly label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  );
}

/** Placeholder cards shown while a list loads — same shape as the content, no layout shift. */
export function SkeletonList({ count = 3 }: { readonly count?: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div className="card skeleton" key={index}>
          <div className="sk-line sk-title" />
          <div className="sk-line" />
          <div className="sk-line sk-short" />
        </div>
      ))}
    </div>
  );
}

export function ErrorNote({ error }: { readonly error: unknown }) {
  const message =
    error instanceof ApiError || error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}

export function Empty({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title?: string;
}) {
  return (
    <div className="card empty">
      <p className="empty-mark" aria-hidden="true">
        <Sparkles size={24} aria-hidden="true" />
      </p>
      {title !== undefined && <h3>{title}</h3>}
      <p className="muted">{children}</p>
    </div>
  );
}

/** ₦ formatting with thousands separators; a missing price reads as a dash, never "₦null". */
export function price(ngn: number | null): string {
  return ngn === null ? '—' : `₦${ngn.toLocaleString('en-NG')}`;
}
