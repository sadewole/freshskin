import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, endSession, ensureSession, getSiteMeta, setConsent } from '../api/client';
import type { ConsentKind, Me, SiteMeta } from '../api/types';
import { clearAllCheckInStores } from '../data/checkins';

/**
 * Session and site metadata: the only state that every view shares. Everything else — the
 * selected product kind, a price filter, a scan result — is local to the view that shows it.
 *
 * The previous shell kept all of it in one mutable object plus whatever was in the DOM, which
 * is why the quiz read its answers back out of `textContent`.
 */

type Status = 'loading' | 'ready' | 'failed';

interface SessionValue {
  readonly status: Status;
  readonly me: Me | null;
  readonly meta: SiteMeta | null;
  readonly error: string | null;
  readonly requiredConsentsGranted: boolean;
  readonly reload: () => Promise<void>;
  readonly grant: (kind: ConsentKind, granted: boolean) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly signIn: () => Promise<void>;
}

const REQUIRED_CONSENTS = ['terms', 'privacy', 'image_processing'] as const satisfies readonly ConsentKind[];

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<SiteMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [user, site] = await Promise.all([ensureSession(), getSiteMeta()]);
      setMe(user);
      setMeta(site.data);
      setStatus('ready');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach FreshSkin.');
      setStatus('failed');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grant = useCallback(async (kind: ConsentKind, granted: boolean) => {
    await setConsent(kind, granted);
    setMe((current) =>
      current === null ? current : { ...current, consents: { ...current.consents, [kind]: granted } },
    );
  }, []);

  const signOut = useCallback(async () => {
    clearAllCheckInStores();
    await endSession();
    await load();
  }, [load]);

  const signIn = useCallback(async () => {
    await load();
  }, [load]);

  const requiredConsentsGranted =
    me !== null && REQUIRED_CONSENTS.every((kind) => me.consents[kind] === true);

  const value = useMemo<SessionValue>(
    () => ({ status, me, meta, error, requiredConsentsGranted, reload: load, grant, signOut, signIn }),
    [status, me, meta, error, requiredConsentsGranted, load, grant, signOut, signIn],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (value === null) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
