import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

/**
 * One place for the loading / error / empty triple that every data view needs. The old shell
 * open-coded this in five places, in three different styles.
 */

export function Loading({ label = 'Loading…' }: { readonly label?: string }) {
  return (
    <p className="muted" role="status">
      {label}
    </p>
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

export function Empty({ children }: { readonly children: ReactNode }) {
  return <p className="muted">{children}</p>;
}

/** ₦ formatting with thousands separators; a missing price reads as a dash, never "₦null". */
export function price(ngn: number | null): string {
  return ngn === null ? '—' : `₦${ngn.toLocaleString('en-NG')}`;
}
